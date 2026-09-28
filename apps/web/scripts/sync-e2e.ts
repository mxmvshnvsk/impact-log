/**
 * Проверка движка синхронизации против настоящего API: два «устройства» одного аккаунта — два экземпляра
 * SyncEngine с хранилищами в памяти и своими cookie. Криптография настоящая (core/crypto, общий MK).
 *
 *   API: TRUST_PROXY=true DATABASE_URL=… node apps/api/dist/server.js
 *   cd apps/web && ../api/node_modules/.bin/tsx scripts/sync-e2e.ts
 *
 * Переменные: API_URL (по умолчанию http://127.0.0.1:3000), DATABASE_URL (квота: тариф меняется в БД).
 * TRUST_PROXY=true нужен, чтобы «устройства» ходили с разных IP и не упирались в лимиты частоты.
 * Запросы /api/sync/* несут X-Impact-Account (Account ID аккаунта, в который вошёл клиент) — как web-клиент.
 */
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { createImpact, type Impact, type ImpactInput, updateImpact } from '@impact-log/core'
import { generateMasterKey } from '@impact-log/core/crypto'
import {
  type PushChange,
  pullResponseSchema,
  pushResponseSchema,
  type ServerObject,
} from '@impact-log/shared'
import { createCodec, type SyncCodec } from '../src/sync/content'
import { SyncEngine } from '../src/sync/engine'
import { MemorySyncStore } from '../src/sync/memoryStore'
import { SyncRuntime } from '../src/sync/runtime'
import type { SyncTransport } from '../src/sync/types'

const API = process.env.API_URL ?? 'http://127.0.0.1:3000'
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://impact:impact@127.0.0.1:5432/impact'
const RUN = randomBytes(3).toString('hex')

let passed = 0
let failed = 0
function check(name: string, ok: boolean, extra?: unknown) {
  if (ok) {
    passed++
    console.log(`PASS  ${name}`)
  } else {
    failed++
    console.log(`FAIL  ${name}`, extra === undefined ? '' : JSON.stringify(extra)?.slice(0, 600))
  }
}
const section = (title: string) => console.log(`\n== ${title}`)
async function scenario(title: string, run: () => Promise<void>) {
  section(title)
  await run()
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/* ---------------------------------------------------------------- HTTP-клиент с cookie */

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code)
  }
}

const ipBase = `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}`
let nextIp = 1

class Client {
  readonly ip = `${ipBase}.${nextIp++}`
  readonly cookies = new Map<string, { value: string; path: string }>()
  requests = { pull: 0, push: 0 }
  /** Account ID для X-Impact-Account (как vault.account.accountId в web-клиенте); null — без заголовка */
  accountId: string | null = null

  async call(method: string, path: string, body?: unknown) {
    const url = new URL(`/api${path}`, API)
    const headers: Record<string, string> = { 'x-forwarded-for': this.ip }
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (path.startsWith('/sync/') && this.accountId) headers['x-impact-account'] = this.accountId
    const cookie = [...this.cookies]
      .filter(([, c]) => url.pathname.startsWith(c.path))
      .map(([name, c]) => `${name}=${c.value}`)
      .join('; ')
    if (cookie) headers.cookie = cookie
    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new HttpError(0, 'NETWORK_ERROR')
    }
    for (const raw of res.headers.getSetCookie()) {
      const [pair = '', ...attrs] = raw.split(';').map((part) => part.trim())
      const eq = pair.indexOf('=')
      const name = pair.slice(0, eq)
      const value = pair.slice(eq + 1)
      const path = attrs.find((a) => a.toLowerCase().startsWith('path='))?.slice(5) ?? '/'
      const expired = attrs.some((a) => /^max-age=0$/i.test(a))
      if (!value || expired) this.cookies.delete(name)
      else this.cookies.set(name, { value, path })
    }
    const text = await res.text()
    // biome-ignore lint/suspicious/noExplicitAny: ответы API в проверочном скрипте
    let json: any = null
    try {
      json = JSON.parse(text)
    } catch {}
    return { status: res.status, json }
  }

  async ok(method: string, path: string, body?: unknown) {
    const r = await this.call(method, path, body)
    if (r.status < 200 || r.status >= 300) {
      throw new HttpError(r.status, r.json?.error?.code ?? 'UNKNOWN_ERROR')
    }
    return r.json
  }
}

/* ---------------------------------------------------------------- TOTP (RFC 6238) */

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const char of input.replace(/=+$/, '').toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(char)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

class Totp {
  private last = -1
  private readonly key: Buffer
  constructor(secret: string) {
    this.key = base32Decode(secret.replaceAll(' ', ''))
  }
  at(step: number): string {
    const counter = Buffer.alloc(8)
    counter.writeBigUInt64BE(BigInt(step))
    const hash = createHmac('sha1', this.key).update(counter).digest()
    const offset = (hash[hash.length - 1] as number) & 15
    const code = (hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
    return String(code).padStart(6, '0')
  }
  /** Каждый следующий код — с шагом больше предыдущего (сервер отклоняет повтор), в окне ±1 */
  async next(): Promise<string> {
    for (;;) {
      const current = Math.floor(Date.now() / 30_000)
      const step = Math.max(this.last + 1, current)
      if (step <= current + 1) {
        this.last = step
        return this.at(step)
      }
      await sleep((current + 1) * 30_000 - Date.now() + 300)
    }
  }
}

/* ---------------------------------------------------------------- аккаунт и устройства */

const b64 = (bytes: number) => randomBytes(bytes).toString('base64url')
const KDF = { id: 'argon2id', memoryKiB: 64 * 1024, iterations: 3, parallelism: 1 }

type Account = {
  login: string
  authKey: string
  totp: Totp
  userId: string
  accountId: string
  mk: Uint8Array
}

async function registerAccount(client: Client, prefix: string): Promise<Account> {
  const login = `sync-${prefix}-${RUN}`
  const authKey = b64(32)
  const started = await client.ok('POST', '/auth/register', {
    login,
    authKey,
    kdf: KDF,
    salt: b64(16),
    // Конверты серверу непрозрачны; движку нужен только MK, он общий для «устройств»
    passwordEnvelope: JSON.stringify({ v: 1, test: 'password', ct: b64(64) }),
    recoveryEnvelope: JSON.stringify({ v: 1, test: 'recovery', ct: b64(64) }),
    recoveryAuthKey: b64(32),
  })
  const totp = new Totp(started.secret)
  const confirmed = await client.ok('POST', '/auth/register/confirm', {
    code: await totp.next(),
    remember: false,
  })
  client.accountId = confirmed.user.accountId
  return {
    login,
    authKey,
    totp,
    userId: confirmed.user.id,
    accountId: confirmed.user.accountId,
    mk: generateMasterKey(),
  }
}

async function signIn(client: Client, account: Account) {
  client.accountId = account.accountId
  const first = await client.ok('POST', '/auth/login', {
    login: account.login,
    authKey: account.authKey,
  })
  if (first.next === 'done') return
  await client.ok('POST', '/auth/login/verify', {
    code: await account.totp.next(),
    remember: false,
  })
}

type Hooks = {
  beforePush?: (changes: PushChange[]) => Promise<void> | void
  afterPush?: () => Promise<void> | void
}

function transportFor(client: Client, hooks: Hooks = {}): SyncTransport {
  return {
    async pull(cursor, limit) {
      client.requests.pull++
      return pullResponseSchema.parse(
        await client.ok('GET', `/sync/pull?cursor=${cursor}&limit=${limit}`),
      )
    },
    async push(changes) {
      client.requests.push++
      await hooks.beforePush?.(changes)
      const response = pushResponseSchema.parse(await client.ok('POST', '/sync/push', { changes }))
      await hooks.afterPush?.()
      return response
    },
  }
}

class Device {
  readonly store = new MemorySyncStore()
  readonly codec: SyncCodec
  readonly hooks: Hooks = {}
  readonly engine: SyncEngine
  constructor(
    readonly name: string,
    readonly client: Client,
    account: Account,
    options: ConstructorParameters<typeof SyncEngine>[3] = {},
  ) {
    this.codec = createCodec(() => account.mk)
    this.engine = new SyncEngine(this.store, transportFor(client, this.hooks), this.codec, {
      log: () => {},
      ...options,
    })
  }

  /** Как EncryptedImpactRepository.save */
  async save(impact: Impact) {
    const existing = this.store.objects.get(impact.objectId)
    this.store.objects.set(impact.objectId, {
      objectId: impact.objectId,
      kind: 'impact',
      ciphertext: await this.codec.seal({ objectId: impact.objectId, kind: 'impact' }, impact),
      version: existing?.version ?? 0,
      dirty: 1,
      deleted: 0,
      updatedAt: impact.updatedAt,
    })
  }

  /** Как EncryptedImpactRepository.remove */
  remove(objectId: string) {
    const existing = this.store.objects.get(objectId)
    if (!existing) return
    if (existing.version === 0) {
      this.store.objects.delete(objectId)
      return
    }
    this.store.objects.set(objectId, {
      ...existing,
      ciphertext: null,
      deleted: 1,
      dirty: 1,
      updatedAt: new Date().toISOString(),
    })
  }

  async create(title: string, extra: Partial<ImpactInput> = {}) {
    const impact = createImpact({
      occurredAt: '2026-09-28',
      title,
      impactScore: 3,
      categories: [],
      labels: [],
      ...extra,
    })
    await this.save(impact)
    return impact
  }

  async edit(objectId: string, patch: Partial<ImpactInput>, at = new Date()) {
    const current = await this.get(objectId)
    if (!current) throw new Error(`${this.name}: no ${objectId}`)
    const { objectId: _i, schemaVersion: _s, createdAt: _c, updatedAt: _u, ...input } = current
    const next = updateImpact(current, { ...input, ...patch }, at)
    await this.save(next)
    return next
  }

  async get(objectId: string): Promise<Impact | null> {
    const object = this.store.objects.get(objectId)
    if (!object || object.deleted === 1 || object.ciphertext === null) return null
    return this.codec.open({ objectId, kind: 'impact' }, object.ciphertext)
  }

  async list(): Promise<Impact[]> {
    const all = await Promise.all([...this.store.objects.keys()].map((id) => this.get(id)))
    return all.filter((impact): impact is Impact => impact !== null)
  }

  sync() {
    return this.engine.sync()
  }
}

async function serverObject(client: Client, objectId: string): Promise<ServerObject | undefined> {
  let cursor = 0
  let found: ServerObject | undefined
  for (;;) {
    const page = pullResponseSchema.parse(
      await client.ok('GET', `/sync/pull?cursor=${cursor}&limit=1000`),
    )
    for (const change of page.changes) if (change.objectId === objectId) found = change
    cursor = page.cursor
    if (!page.hasMore) return found
  }
}

async function setPlan(login: string, plan: 'FREE' | 'PILOT' | 'PRO') {
  const require = createRequire(new URL('../../api/package.json', import.meta.url))
  // biome-ignore lint/suspicious/noExplicitAny: postgres из apps/api, без типов в этом пакете
  const postgres = require('postgres') as (url: string, options: object) => any
  const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} })
  await sql`update users set plan = ${plan} where login = ${login}`
  await sql.end()
}

/* ================================================================ сценарии */

section('подготовка: аккаунт и два устройства')
const clientA = new Client()
const account = await registerAccount(clientA, 'main')
const clientB = new Client()
await signIn(clientB, account)
const A = new Device('A', clientA, account)
const B = new Device('B', clientB, account)
check(
  'аккаунт создан, оба устройства вошли',
  clientA.cookies.has('il_session') && clientB.cookies.has('il_session'),
)

section('создание → правка → удаление')
const first = await A.create('Первая запись', { description: 'Описание **markdown**' })
let report = await A.sync()
check(
  'A: создание отправлено (accepted, dirty=0, version=1)',
  report.accepted === 1 &&
    A.store.objects.get(first.objectId)?.dirty === 0 &&
    A.store.objects.get(first.objectId)?.version === 1,
  report,
)
report = await B.sync()
const onB = await B.get(first.objectId)
check(
  'B: запись появилась с тем же содержимым',
  onB?.title === 'Первая запись' &&
    onB.description === 'Описание **markdown**' &&
    report.localChanged,
  { onB, report },
)
check(
  'B: курсор сохранён',
  B.store.state.cursor > 0 && B.store.state.lastSyncAt !== null,
  B.store.state,
)

await B.edit(first.objectId, { title: 'Правка с B', impactScore: 5 })
await B.sync()
await A.sync()
const onA = await A.get(first.objectId)
check(
  'A: получил правку с B',
  onA?.title === 'Правка с B' &&
    onA.impactScore === 5 &&
    A.store.objects.get(first.objectId)?.version === 2,
  onA,
)
report = await A.sync()
check(
  'повторный цикл без изменений — пусто',
  report.accepted === 0 && report.applied === 0 && !report.localChanged,
  report,
)

A.remove(first.objectId)
report = await A.sync()
check(
  'A: tombstone принят, локальная запись удалена',
  report.accepted === 1 && !A.store.objects.has(first.objectId),
  report,
)
report = await B.sync()
check(
  'B: запись удалена по tombstone',
  !B.store.objects.has(first.objectId) && report.localChanged,
  report,
)
const tomb = await serverObject(clientA, first.objectId)
check('сервер: tombstone без шифротекста', tomb?.deleted === true && tomb.ciphertext === null, tomb)

await scenario('новая запись удалена, пока шёл push', async () => {
  const gone = await A.create('Удалю во время отправки')
  A.hooks.afterPush = () => {
    A.remove(gone.objectId) // version 0 → запись удаляется без tombstone
    A.hooks.afterPush = undefined
  }
  await A.sync()
  const local = A.store.objects.get(gone.objectId)
  check(
    'A: вместо «воскрешения» появился tombstone к отправке',
    local?.deleted === 1 && local.dirty === 1 && local.version === 1,
    local,
  )
  await A.sync()
  await B.sync()
  check(
    'A: tombstone отправлен; B записи не видит',
    !A.store.objects.has(gone.objectId) && !B.store.objects.has(gone.objectId),
  )
})

await scenario('правка во время push', async () => {
  const item = await A.create('Версия 1')
  A.hooks.afterPush = async () => {
    A.hooks.afterPush = undefined
    await A.edit(item.objectId, { title: 'Версия 2 (во время запроса)' })
  }
  await A.sync()
  const local = A.store.objects.get(item.objectId)
  check(
    'A: осталась dirty поверх принятой версии',
    local?.dirty === 1 && local.version === 1,
    local,
  )
  report = await A.sync()
  check(
    'A: следующий цикл отправляет без конфликта',
    report.accepted === 1 &&
      report.conflicts === 0 &&
      A.store.objects.get(item.objectId)?.version === 2,
    report,
  )
  await B.sync()
  check(
    'B: получил последнюю версию',
    (await B.get(item.objectId))?.title === 'Версия 2 (во время запроса)',
  )
})

section('одновременная правка: конфликт и разрешения')
const shared = await A.create('Общая запись', { labels: ['x'] })
await A.sync()
await B.sync()

async function diverge(titleA: string, titleB: string) {
  await A.edit(shared.objectId, { title: titleA })
  await B.edit(shared.objectId, { title: titleB, impactScore: 4 })
  await A.sync()
  return B.sync()
}

report = await diverge('Правка A1', 'Правка B1')
let conflicts = await B.engine.listConflicts()
check(
  'B: конфликт при pull, локальная ветка цела',
  report.conflicts === 1 &&
    conflicts.length === 1 &&
    (await B.get(shared.objectId))?.title === 'Правка B1',
  { report, conflicts },
)
check(
  'ConflictView: обе ветки расшифрованы, отличия — title и impactScore',
  conflicts[0]?.server.impact?.title === 'Правка A1' &&
    conflicts[0]?.local.impact?.title === 'Правка B1' &&
    conflicts[0]?.diff.join() === 'impactScore,title' &&
    conflicts[0]?.canKeepBoth === true,
  conflicts[0]?.diff,
)
report = await B.sync()
check(
  'B: конфликтная запись не отправляется повторно',
  report.accepted === 0 && (await B.engine.counts()).conflicts === 1,
  report,
)
check(
  'сервер: по-прежнему версия A',
  (await A.sync()) && (await A.get(shared.objectId))?.title === 'Правка A1',
)

await B.engine.resolve(shared.objectId, 'local')
await B.sync()
await A.sync()
check(
  '«оставить мою»: B перезаписал сервер, A получил',
  (await A.get(shared.objectId))?.title === 'Правка B1' &&
    (await B.engine.counts()).conflicts === 0 &&
    B.store.objects.get(shared.objectId)?.dirty === 0,
)

report = await diverge('Правка A2', 'Правка B2')
check('второй конфликт', report.conflicts === 1, report)
await B.engine.resolve(shared.objectId, 'server')
const afterServer = B.store.objects.get(shared.objectId)
check(
  '«оставить серверную»: у B версия A, не dirty',
  (await B.get(shared.objectId))?.title === 'Правка A2' &&
    afterServer?.dirty === 0 &&
    (await B.engine.counts()).conflicts === 0,
  afterServer,
)
report = await B.sync()
check(
  'после «серверной» отправлять нечего',
  report.accepted === 0 && report.conflicts === 0,
  report,
)

report = await diverge('Правка A3', 'Правка B3')
check('третий конфликт', report.conflicts === 1, report)
const copyId = await B.engine.resolve(shared.objectId, 'both', ' (копия)')
const copy = copyId ? await B.get(copyId) : null
check(
  '«оставить обе»: objectId у серверной, копия — новая запись с пометкой',
  (await B.get(shared.objectId))?.title === 'Правка A3' &&
    copy?.title === 'Правка B3 (копия)' &&
    copy.objectId === copyId &&
    copy.impactScore === 4,
  copy,
)
await B.sync()
await A.sync()
const titlesA = (await A.list()).map((impact) => impact.title)
check(
  'A: обе версии на месте',
  titlesA.includes('Правка A3') && titlesA.includes('Правка B3 (копия)'),
  titlesA,
)

await scenario('одинаковые правки — не конфликт', async () => {
  await A.edit(
    shared.objectId,
    { title: 'Одно и то же', description: 'совпало' },
    new Date(Date.now() - 5_000),
  )
  await B.edit(shared.objectId, { title: 'Одно и то же', description: 'совпало' }, new Date())
  await A.sync()
  report = await B.sync()
  check(
    'B: слияние без конфликта, объект не dirty',
    report.conflicts === 0 &&
      report.merged === 1 &&
      B.store.objects.get(shared.objectId)?.dirty === 0,
    report,
  )
})

await scenario('конфликт в ответе push (A успел между pull и push B)', async () => {
  await B.edit(shared.objectId, { title: 'B перед push' })
  B.hooks.beforePush = async () => {
    B.hooks.beforePush = undefined
    await A.edit(shared.objectId, { title: 'A между pull и push' })
    await A.sync()
  }
  report = await B.sync()
  conflicts = await B.engine.listConflicts()
  check(
    'B: конфликт из push, серверная ветка — версия A',
    report.conflicts >= 1 && conflicts[0]?.server.impact?.title === 'A между pull и push',
    { report, c: conflicts[0]?.server },
  )
  await B.engine.resolve(shared.objectId, 'local')
  await B.sync()
  await A.sync()
  check('разрешено в пользу B', (await A.get(shared.objectId))?.title === 'B перед push')
})

await scenario('удаление на сервере vs локальная правка', async () => {
  const doomed = await A.create('Удалят на A')
  await A.sync()
  await B.sync()
  A.remove(doomed.objectId)
  await A.sync()
  await B.edit(doomed.objectId, { title: 'А я правлю на B' })
  report = await B.sync()
  conflicts = await B.engine.listConflicts()
  const view = conflicts.find((c) => c.objectId === doomed.objectId)
  check(
    'B: конфликт «удалено на сервере»',
    report.conflicts === 1 &&
      view?.server.deleted === true &&
      view.local.impact?.title === 'А я правлю на B' &&
      view.canKeepBoth === false,
    view,
  )
  await B.engine.resolve(doomed.objectId, 'local')
  report = await B.sync()
  await A.sync()
  check(
    '«восстановить мою»: запись вернулась на A',
    report.accepted === 1 && (await A.get(doomed.objectId))?.title === 'А я правлю на B',
    report,
  )

  A.remove(doomed.objectId)
  await A.sync()
  await B.edit(doomed.objectId, { title: 'Снова правлю' })
  await B.sync()
  await B.engine.resolve(doomed.objectId, 'server')
  check(
    '«удалить»: у B запись удалена, конфликтов нет',
    !B.store.objects.has(doomed.objectId) && (await B.engine.counts()).conflicts === 0,
  )
})

await scenario('локальное удаление vs правка на сервере', async () => {
  const item = await A.create('Правят на A, удаляют на B')
  await A.sync()
  await B.sync()
  await A.edit(item.objectId, { title: 'Свежая правка A' })
  await A.sync()
  B.remove(item.objectId)
  report = await B.sync()
  const view = (await B.engine.listConflicts()).find((c) => c.objectId === item.objectId)
  check(
    'B: конфликт «удалено локально»',
    report.conflicts === 1 &&
      view?.local.deleted === true &&
      view.server.impact?.title === 'Свежая правка A',
    view,
  )
  await B.engine.resolve(item.objectId, 'server')
  check(
    '«оставить серверную»: запись восстановлена у B',
    (await B.get(item.objectId))?.title === 'Свежая правка A' &&
      B.store.objects.get(item.objectId)?.dirty === 0,
  )
})

await scenario('схлопывание циклов', async () => {
  const before = clientA.requests.pull
  await Promise.all([A.sync(), A.sync(), A.sync(), A.sync()])
  const cycles = clientA.requests.pull - before
  check('4 одновременных вызова → 2 цикла', cycles === 2, cycles)
})

await scenario('квота FREE', async () => {
  const clientQ = new Client()
  const quotaAccount = await registerAccount(clientQ, 'quota')
  await setPlan(quotaAccount.login, 'FREE')
  const Q = new Device('Q', clientQ, quotaAccount)
  const items: Impact[] = []
  for (let i = 0; i < 17; i++) items.push(await Q.create(`Запись ${i + 1}`))
  report = await Q.sync()
  let counts = await Q.engine.counts()
  check(
    '15 принято, 2 отклонены по квоте',
    report.accepted === 15 &&
      report.quotaRejected === 2 &&
      counts.quotaBlocked === 2 &&
      counts.pending === 2,
    { report, counts },
  )
  const pushesBefore = clientQ.requests.push
  report = await Q.sync()
  check(
    'повторный цикл не долбит сервер отклонёнными',
    clientQ.requests.push === pushesBefore && report.quotaRejected === 0,
    clientQ.requests,
  )
  const blockedLocal = [...Q.store.objects.values()].filter((o) => o.dirty === 1)
  check(
    'отклонённые записи на месте локально',
    blockedLocal.length === 2 && (await Q.list()).length === 17,
  )

  const synced = items.filter((impact) => Q.store.objects.get(impact.objectId)?.version === 1)
  Q.remove((synced[0] as Impact).objectId)
  Q.remove((synced[1] as Impact).objectId)
  report = await Q.sync()
  counts = await Q.engine.counts()
  check(
    'удаление двух освобождает место → отклонённые ушли в том же цикле',
    report.accepted === 4 && counts.quotaBlocked === 0 && counts.pending === 0,
    { report, counts },
  )
  const usage = await clientQ.ok('GET', '/entitlements')
  check('сервер: 15 активных записей', usage.usage.activeImpacts === 15, usage.usage)

  await Q.create('Шестнадцатая')
  report = await Q.sync()
  check(
    'сверх лимита снова отклонено',
    report.quotaRejected === 1 && (await Q.engine.counts()).quotaBlocked === 1,
    report,
  )
  await setPlan(quotaAccount.login, 'PRO')
  Q.engine.releaseQuota() // runtime делает это, когда GET /api/entitlements вернул другой тариф
  report = await Q.sync()
  check(
    'смена тарифа → отправлено',
    report.accepted === 1 && (await Q.engine.counts()).quotaBlocked === 0,
    report,
  )
})

await scenario('пагинация pull и пачки push', async () => {
  const clientP = new Client()
  const pageAccount = await registerAccount(clientP, 'pages')
  const P1 = new Device('P1', clientP, pageAccount, { pushMaxChanges: 100 })
  for (let i = 0; i < 250; i++) await P1.create(`Пакетная ${i}`)
  report = await P1.sync()
  check('250 записей ушли тремя пачками', report.accepted === 250 && clientP.requests.push === 3, {
    report,
    requests: clientP.requests,
  })
  const clientP2 = new Client()
  await signIn(clientP2, pageAccount)
  const P2 = new Device('P2', clientP2, pageAccount, { pullLimit: 7 })
  report = await P2.sync()
  await P1.sync() // P1 забирает свои же изменения — курсоры устройств сходятся
  check(
    'второе устройство: 250 записей страницами по 7',
    (await P2.list()).length === 250 &&
      clientP2.requests.pull === Math.ceil(250 / 7) &&
      P2.store.state.cursor === P1.store.state.cursor &&
      P2.store.state.cursor > 0,
    { pulls: clientP2.requests.pull, cursor: [P2.store.state.cursor, P1.store.state.cursor] },
  )
  check(
    'эхо своих изменений не считается локальной правкой',
    (await P1.engine.counts()).pending === 0 &&
      [...P1.store.objects.values()].every((o) => o.version === 1 && o.dirty === 0),
  )
  const pulls = clientP2.requests.pull
  await P2.sync()
  check('следующий цикл — один пустой pull', clientP2.requests.pull === pulls + 1)
})

await scenario('413: пачка уменьшается', async () => {
  const clientL = new Client()
  const largeAccount = await registerAccount(clientL, 'large')
  const L = new Device('L', clientL, largeAccount, {
    pushMaxChanges: 200,
    pushMaxBytes: 64 * 1024 * 1024,
  })
  const text = 'Длинное описание — '.repeat(1050).slice(0, 19_900)
  for (let i = 0; i < 200; i++) await L.create(`Большая ${i}`, { description: text })
  const size = (L.store.objects.values().next().value?.ciphertext?.length ?? 0) * 200
  report = await L.sync()
  check(
    `тело ~${Math.round(size / 1024 / 1024)} МиБ > 8 МиБ → 413 → уменьшили пачку, всё отправлено`,
    report.accepted === 200 && clientL.requests.push > 1 && (await L.engine.counts()).pending === 0,
    { report, pushes: clientL.requests.push },
  )
})

await scenario('401 после выхода', async () => {
  const runtime = new SyncRuntime(
    {
      engine: A.engine,
      hasAccount: () => true,
      fetchEntitlements: async () => clientA.ok('GET', '/entitlements'),
      currentProfile: () =>
        ({ planId: 'PILOT', revision: 1, limits: { maxActiveImpacts: null } }) as never,
      applyProfile: () => {},
      onRemoteData: () => {},
      watchLocalChanges: () => () => {},
    },
    { channel: null },
  )
  await runtime.start()
  check(
    'runtime: после start — idle',
    runtime.state.status === 'idle' && runtime.state.lastSyncAt !== null,
    runtime.state,
  )
  await A.create('Не успела уйти')
  await clientA.ok('POST', '/auth/logout', {})
  await runtime.syncNow()
  check('runtime: 401 → signed-out', runtime.state.status === 'signed-out', runtime.state)
  check(
    'данные остались локально',
    (await A.list()).some((impact) => impact.title === 'Не успела уйти'),
  )
  await runtime.syncNow()
  check('после signed-out циклы не идут', runtime.state.status === 'signed-out')
  await signIn(clientA, account)
  await runtime.start()
  check(
    'новый вход → start → запись отправлена',
    runtime.state.status === 'idle' && runtime.state.pending === 0,
    runtime.state,
  )
  runtime.dispose()
})

await scenario('сверка аккаунта: X-Impact-Account', async () => {
  const clientX = new Client()
  const other = await registerAccount(clientX, 'other')
  const clientM = new Client()
  await signIn(clientM, account)

  clientM.accountId = null
  const missing = await clientM.call('GET', '/sync/pull?cursor=0&limit=1')
  check('без заголовка pull отклонён', missing.status >= 400 && missing.status < 500, missing)

  clientM.accountId = other.accountId
  const pull = await clientM.call('GET', '/sync/pull?cursor=0&limit=1')
  check(
    'чужой Account ID → 409 ACCOUNT_MISMATCH (pull)',
    pull.status === 409 && pull.json?.error?.code === 'ACCOUNT_MISMATCH',
    pull,
  )
  const M = new Device('M', clientM, account)
  const lost = await M.create('Не должна попасть в чужой аккаунт')
  let error: unknown = null
  try {
    await M.sync()
  } catch (cause) {
    error = cause
  }
  check(
    'движок: 409 ACCOUNT_MISMATCH — исключение, локальная запись цела',
    error instanceof HttpError &&
      error.status === 409 &&
      error.code === 'ACCOUNT_MISMATCH' &&
      M.store.objects.get(lost.objectId)?.dirty === 1,
    error,
  )
  clientX.accountId = other.accountId
  check(
    'сервер: объект не появился ни в одном аккаунте',
    (await serverObject(clientX, lost.objectId)) === undefined &&
      (await serverObject(clientA, lost.objectId)) === undefined,
  )

  const runtime = new SyncRuntime(
    {
      engine: M.engine,
      hasAccount: () => true,
      fetchEntitlements: async () => clientM.ok('GET', '/entitlements'),
      currentProfile: () =>
        ({ planId: 'PILOT', revision: 1, limits: { maxActiveImpacts: null } }) as never,
      applyProfile: () => {},
      onRemoteData: () => {},
      watchLocalChanges: () => () => {},
    },
    { channel: null },
  )
  await runtime.start()
  check(
    'runtime: ACCOUNT_MISMATCH → error без повтора',
    runtime.state.status === 'error' &&
      runtime.state.lastError === 'ACCOUNT_MISMATCH' &&
      runtime.state.retryAt === null &&
      runtime.state.pending === 1,
    runtime.state,
  )
  clientM.accountId = account.accountId
  await runtime.syncNow()
  check(
    'верный Account ID → «Синхронизировать сейчас» → отправлено',
    runtime.state.status === 'idle' &&
      runtime.state.pending === 0 &&
      M.store.objects.get(lost.objectId)?.version === 1,
    runtime.state,
  )
  runtime.dispose()
})

await scenario('tombstone несуществующего объекта', async () => {
  const ghost = randomUUID()
  A.store.objects.set(ghost, {
    objectId: ghost,
    kind: 'impact',
    ciphertext: null,
    version: 7,
    dirty: 1,
    deleted: 1,
    updatedAt: new Date().toISOString(),
  })
  report = await A.sync()
  check(
    'сервер отклонил (INVALID) — локальный tombstone забыт, ошибок синхронизации нет',
    report.invalid === 1 && !A.store.objects.has(ghost) && A.engine.listIssues().length === 0,
    { report, issues: A.engine.listIssues() },
  )
})

console.log(`\n${failed === 0 ? 'ALL PASS' : 'FAILURES'}: ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
