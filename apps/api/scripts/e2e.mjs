/**
 * E2E-проверка API (local-first + E2EE). Запуск из apps/api при работающем API и Postgres:
 *   TRUST_PROXY=true DATABASE_URL=postgres://… node dist/server.js
 *   node scripts/e2e.mjs
 * TRUST_PROXY=true нужен, чтобы «пользователи» скрипта ходили с разных IP (X-Forwarded-For)
 * и не упирались в лимиты частоты по IP. DATABASE_URL — для проверки квоты (тариф меняется прямо в БД).
 * Клиентская криптография не нужна: authKey/recoveryAuthKey — случайные 32 байта, конверты — любые строки.
 * БД должна быть чистой (логины alice/bob/carol/… свободны).
 * API_LOG_FILE (по умолчанию /tmp/api.log) — лог API этого прогона: проверяется, что в нём нет секретов
 * и параметров SQL. Если в файл ничего не пишется, проверка пропускается (SKIP).
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { decodeBase32IgnorePadding } from '@oslojs/encoding'
import { generateHOTP } from '@oslojs/otp'
import postgres from 'postgres'

const API = process.env.API_URL ?? 'http://127.0.0.1:3000'
const API_LOG_FILE = process.env.API_LOG_FILE ?? '/tmp/api.log'
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://impact:impact@127.0.0.1:5432/impact'
const ORIGIN = new URL(API).origin

let passed = 0
let failed = 0
function check(name, ok, extra) {
  if (ok) {
    passed++
    console.log(`PASS  ${name}`)
  } else {
    failed++
    console.log(`FAIL  ${name}`, extra === undefined ? '' : JSON.stringify(extra)?.slice(0, 800))
  }
}
const section = (title) => console.log(`\n== ${title}`)

/** Всё секретное, что проходит через API в этом прогоне — ничего из этого не должно попасть в лог */
const SECRETS = new Set()
const secret = (value) => {
  SECRETS.add(value)
  return value
}
const b64url = (bytes) => randomBytes(bytes).toString('base64url')
const newKey = () => secret(b64url(32))
const newSalt = () => b64url(16)
const KDF = { id: 'argon2id', memoryKiB: 64 * 1024, iterations: 3, parallelism: 1 }
const envelope = (tag) => JSON.stringify({ v: 1, tag, nonce: b64url(12), ct: secret(b64url(64)) })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const ACCOUNT_ID = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{12}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const DEVICE_SECRET = /^[A-Za-z0-9_-]{43}$/
const MiB = 1024 * 1024
const KiB = 1024
/** PULL_MAX_BYTES из shared */
const PULL_MAX_BYTES = 8 * MiB

/** «Браузер»: свой IP (X-Forwarded-For) и cookie jar с учётом Path */
let nextIp = 0
const freshIp = () => {
  const n = nextIp++
  return `198.51.${100 + Math.floor(n / 250)}.${(n % 250) + 1}`
}
class Client {
  constructor(ip = freshIp()) {
    this.ip = ip
    this.cookies = new Map()
    /** accountId для заголовка X-Impact-Account в /sync/* */
    this.account = null
  }

  clone() {
    const copy = new Client(this.ip)
    for (const [name, cookie] of this.cookies) copy.cookies.set(name, { ...cookie })
    copy.account = this.account
    return copy
  }

  has(name) {
    return this.cookies.has(name)
  }

  async call(method, path, body, headers = {}) {
    const url = new URL(`/api${path}`, API)
    const sendHeaders = { 'x-forwarded-for': this.ip, ...headers }
    if (path.startsWith('/sync/') && this.account && !('x-impact-account' in sendHeaders)) {
      sendHeaders['x-impact-account'] = this.account
    }
    for (const [key, value] of Object.entries(sendHeaders)) {
      if (value === undefined) delete sendHeaders[key]
    }
    const hasType = Object.keys(sendHeaders).some((key) => key.toLowerCase() === 'content-type')
    if (body !== undefined && !hasType) sendHeaders['content-type'] = 'application/json'
    const cookie = [...this.cookies]
      .filter(([, c]) => url.pathname.startsWith(c.path))
      .map(([name, c]) => `${name}=${c.value}`)
      .join('; ')
    if (cookie) sendHeaders.cookie = cookie
    const res = await fetch(url, {
      method,
      headers: sendHeaders,
      body: body === undefined || typeof body === 'string' ? body : JSON.stringify(body),
    })
    const setCookies = res.headers.getSetCookie()
    for (const raw of setCookies) {
      const [pair, ...attrs] = raw.split(';').map((part) => part.trim())
      const eq = pair.indexOf('=')
      const name = pair.slice(0, eq)
      const value = pair.slice(eq + 1)
      const attr = Object.fromEntries(
        attrs.map((a) => {
          const i = a.indexOf('=')
          return i < 0 ? [a.toLowerCase(), true] : [a.slice(0, i).toLowerCase(), a.slice(i + 1)]
        }),
      )
      const expired =
        (attr.expires && new Date(attr.expires) <= new Date()) || attr['max-age'] === '0'
      if (!value || expired) this.cookies.delete(name)
      else this.cookies.set(name, { value, path: attr.path ?? '/', raw })
    }
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}
    return { status: res.status, json, setCookies }
  }

  get(path, headers) {
    return this.call('GET', path, undefined, headers)
  }

  post(path, body = {}, headers) {
    return this.call('POST', path, body, headers)
  }

  push(changes, headers) {
    return this.post('/sync/push', { changes }, headers)
  }

  pull(cursor = 0, limit = 1000, headers) {
    return this.get(`/sync/pull?cursor=${cursor}&limit=${limit}`, headers)
  }
}

/** Коды TOTP: каждый следующий — с шагом больше предыдущего (сервер отклоняет повтор), в окне ±1 */
class Totp {
  constructor(base32) {
    this.key = decodeBase32IgnorePadding(secret(base32.replaceAll(' ', '')))
    SECRETS.add(base32)
    this.last = -1
  }

  /** Код текущего шага без «расходования» (для запросов, где сервер код не проверяет) */
  now() {
    return this.at(Math.floor(Date.now() / 30_000))
  }

  at(step) {
    return generateHOTP(this.key, BigInt(step), 6)
  }

  async next() {
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

  /** Код, который гарантированно не подходит сейчас */
  wrong() {
    const current = Math.floor(Date.now() / 30_000)
    const valid = new Set([-1, 0, 1, 2].map((d) => this.at(current + d)))
    return ['000000', '111111', '222222'].find((c) => !valid.has(c))
  }
}

const code = (r) => r.json?.error?.code
const isError = (r, status, errorCode) => r.status === status && code(r) === errorCode

async function register(client, login, { remember = false } = {}) {
  const creds = {
    login,
    authKey: newKey(),
    kdf: KDF,
    salt: newSalt(),
    passwordEnvelope: envelope('password'),
    recoveryEnvelope: envelope('recovery'),
    recoveryAuthKey: newKey(),
  }
  const started = await client.post('/auth/register', creds)
  if (started.status !== 200) throw new Error(`register ${login}: ${JSON.stringify(started.json)}`)
  const totp = new Totp(started.json.secret)
  const confirmed = await client.post('/auth/register/confirm', {
    code: await totp.next(),
    remember,
  })
  if (confirmed.status !== 200)
    throw new Error(`confirm ${login}: ${JSON.stringify(confirmed.json)}`)
  client.account = confirmed.json.user.accountId
  return {
    ...creds,
    totp,
    user: confirmed.json.user,
    deviceId: confirmed.json.deviceId,
    deviceSecret: secret(confirmed.json.deviceSecret),
  }
}

const impact = (objectId, baseVersion, ciphertext) => ({
  objectId,
  kind: 'impact',
  baseVersion,
  ciphertext,
})

/** Прямой доступ к БД — подготовка данных (тариф, объёмы) и проверка состояния */
const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} })
const userRow = async (login) =>
  (
    await sql`select id, totp_failed_count, totp_locked_until, totp_secret, totp_last_step
      from users where login = ${login}`
  )[0]
/** Сколько минут до конца блокировки TOTP (по часам БД) */
const lockMinutes = async (login) =>
  Number(
    (
      await sql`select extract(epoch from totp_locked_until - now()) / 60 as m
        from users where login = ${login}`
    )[0]?.m ?? Number.NaN,
  )
const unlockTotp = (login) =>
  sql`update users set totp_locked_until = now() - interval '1 second' where login = ${login}`

let r

// ---------------------------------------------------------------------------------------------
section('CSRF и prelogin')
const guest = new Client()
r = await guest.post('/auth/prelogin', 'login=ghost', {
  'content-type': 'application/x-www-form-urlencoded',
})
check('form POST → 403 FORBIDDEN', isError(r, 403, 'FORBIDDEN'), r)
r = await guest.post('/auth/prelogin', 'login=ghost', { 'content-type': 'text/plain' })
check('text/plain POST → 403', isError(r, 403, 'FORBIDDEN'), r)
r = await guest.post('/auth/prelogin', { login: 'ghost' }, { origin: 'https://evil.example' })
check('чужой Origin → 403', isError(r, 403, 'FORBIDDEN'), r)
r = await guest.call('DELETE', `/devices/${randomUUID()}`, undefined, {
  origin: 'https://evil.example',
})
check('DELETE с чужим Origin → 403', isError(r, 403, 'FORBIDDEN'), r)
r = await guest.post('/auth/prelogin', { login: 'ghost' }, { origin: ORIGIN })
check('свой Origin → 200', r.status === 200, r)
const ghost1 = r.json
r = await guest.post('/auth/prelogin', { login: '  GHOST ' })
check(
  'prelogin неизвестного логина детерминирован (и логин нормализуется)',
  r.status === 200 &&
    r.json.salt === ghost1.salt &&
    JSON.stringify(r.json.kdf) === JSON.stringify(KDF),
  r.json,
)
check('фальшивая соль — 16 байт base64url', /^[A-Za-z0-9_-]{22}$/.test(ghost1?.salt ?? ''), ghost1)
r = await guest.post('/auth/prelogin', { login: 'ghost2' })
check('у разных логинов — разные соли', r.status === 200 && r.json.salt !== ghost1.salt, r.json)
r = await guest.post('/auth/prelogin', { login: 'A!' })
check('невалидный логин → 400 VALIDATION_ERROR', isError(r, 400, 'VALIDATION_ERROR'), r)
r = await guest.get('/auth/me')
check('me без сессии → 401', isError(r, 401, 'UNAUTHORIZED'), r)

// ---------------------------------------------------------------------------------------------
section('регистрация (alice)')
const a1 = new Client()
const alice = {
  login: 'alice',
  authKey: newKey(),
  kdf: KDF,
  salt: newSalt(),
  passwordEnvelope: envelope('alice-password'),
  recoveryEnvelope: envelope('alice-recovery'),
  recoveryAuthKey: newKey(),
}
r = await a1.post('/auth/register', { ...alice, authKey: 'short' })
check('register с кривым authKey → 400', isError(r, 400, 'VALIDATION_ERROR'), r)
r = await a1.post('/auth/register', { ...alice, login: '  Alice ' })
check(
  'register → otpauth URI и секрет',
  r.status === 200 && r.json.otpauthUri.startsWith('otpauth://totp/') && r.json.secret.length > 20,
  r,
)
check('логин нормализован', r.json?.otpauthUri.includes('alice'), r.json)
const aliceTotp = new Totp(r.json.secret)
r = await a1.get('/auth/me')
check('me с enrollment-сессией → 401', r.status === 401, r)
r = await a1.post('/auth/register/confirm', { code: aliceTotp.wrong() })
check('confirm с неверным кодом → INVALID_CODE', isError(r, 400, 'INVALID_CODE'), r)
r = await a1.post('/auth/register/confirm', { code: await aliceTotp.next(), remember: true })
const aliceRegisterCode = aliceTotp.at(aliceTotp.last)
check(
  'confirm → user (accountId, PILOT) + deviceId + deviceSecret (32 байта base64url)',
  r.status === 200 &&
    r.json.user.login === 'alice' &&
    ACCOUNT_ID.test(r.json.user.accountId) &&
    r.json.user.plan === 'PILOT' &&
    UUID.test(r.json.deviceId) &&
    DEVICE_SECRET.test(r.json.deviceSecret ?? ''),
  r,
)
const aliceDevice = r.json?.deviceId
const aliceDeviceSecret = secret(r.json?.deviceSecret)
const aliceAccount = r.json?.user.accountId
const aliceSessionCookie = r.setCookies.find((c) => c.startsWith('il_session=')) ?? ''
const aliceDeviceCookie = r.setCookies.find((c) => c.startsWith('il_device=')) ?? ''
check(
  'remember: il_session постоянная (Expires), HttpOnly, SameSite=Strict, Path=/api',
  /HttpOnly/i.test(aliceSessionCookie) &&
    /SameSite=Strict/i.test(aliceSessionCookie) &&
    /Path=\/api(;|$)/.test(aliceSessionCookie) &&
    /Expires=/i.test(aliceSessionCookie),
  aliceSessionCookie,
)
check(
  'remember: il_device HttpOnly, Path=/api/auth, со сроком',
  /HttpOnly/i.test(aliceDeviceCookie) &&
    /Path=\/api\/auth/.test(aliceDeviceCookie) &&
    /Expires=/i.test(aliceDeviceCookie),
  aliceDeviceCookie,
)
r = await a1.get('/auth/me')
check(
  'me → user и deviceId этой сессии (без deviceSecret)',
  r.status === 200 &&
    r.json.user.login === 'alice' &&
    r.json.deviceId === aliceDevice &&
    r.json.deviceSecret === undefined,
  r,
)
r = await new Client().post('/auth/register', { ...alice, authKey: newKey() })
check('занятый логин → 409 LOGIN_TAKEN', isError(r, 409, 'LOGIN_TAKEN'), r)
r = await guest.post('/auth/prelogin', { login: 'alice' })
check(
  'prelogin известного логина → сохранённые kdf и соль',
  r.status === 200 &&
    r.json.salt === alice.salt &&
    JSON.stringify(r.json.kdf) === JSON.stringify(KDF),
  r.json,
)
const aliceBeforeLogout = a1.clone()
r = await a1.post('/auth/logout', {})
check('logout → ok, cookie сессии сброшена', r.status === 200 && !a1.has('il_session'), r)
r = await aliceBeforeLogout.get('/auth/me')
check('старый токен после logout → 401', r.status === 401, r)

// ---------------------------------------------------------------------------------------------
section('вход с 2FA (alice)')
const a2 = new Client(a1.ip)
r = await a2.post('/auth/login', { login: 'alice', authKey: newKey() })
check('неверный authKey → 401 INVALID_CREDENTIALS', isError(r, 401, 'INVALID_CREDENTIALS'), r)
r = await a2.post('/auth/login', { login: 'nobody', authKey: newKey() })
check('неизвестный логин → та же ошибка', isError(r, 401, 'INVALID_CREDENTIALS'), r)
r = await a2.post('/auth/login', {
  login: 'ALICE',
  authKey: alice.authKey,
  deviceId: aliceDevice,
  deviceSecret: aliceDeviceSecret,
})
check('login (deviceId + deviceSecret) → second-factor', r.json?.next === 'second-factor', r)
r = await a2.get('/auth/me')
check('me с second-factor-сессией → 401', r.status === 401, r)
r = await a2.post('/auth/login/verify', { code: aliceRegisterCode })
check('повтор уже использованного TOTP-кода → INVALID_CODE', isError(r, 400, 'INVALID_CODE'), r)
r = await a2.post('/auth/login/verify', { code: await aliceTotp.next() })
check(
  'verify → полная сессия на переданном устройстве, новый секрет не выдаётся',
  r.status === 200 &&
    r.json.user.login === 'alice' &&
    r.json.deviceId === aliceDevice &&
    r.json.deviceSecret === undefined,
  r,
)
check(
  'без remember: cookie сессии без срока, il_device не выдаётся',
  !r.setCookies.some((c) => c.startsWith('il_device=')) &&
    !/Expires=/i.test(r.setCookies.find((c) => c.startsWith('il_session=')) ?? 'Expires='),
  r.setCookies,
)
r = await a2.get('/auth/me')
check('me после 2FA → 200', r.status === 200 && r.json.deviceId === aliceDevice, r)

// ---------------------------------------------------------------------------------------------
section('«Запомнить этот компьютер» (alice)')
r = await a1.post('/auth/login', { login: 'alice', authKey: alice.authKey })
check(
  'доверенное устройство (cookie il_device, без deviceSecret) → сразу done без кода',
  r.status === 200 && r.json.next === 'done' && r.json.deviceId === aliceDevice,
  r,
)
r = await a1.get('/auth/me')
check('me после входа без кода → 200', r.status === 200, r)
r = await a1.post('/auth/login', { login: 'alice', authKey: newKey() })
check('доверенному устройству всё равно нужен верный authKey', r.status === 401, r)

// ---------------------------------------------------------------------------------------------
section('ключевые конверты и смена пароля (alice)')
const envelopeOf = (res, type) => res.json?.envelopes?.find((e) => e.type === type)?.envelope
r = await a1.get('/keys')
check(
  'GET /keys → оба конверта как есть',
  r.status === 200 &&
    r.json.envelopes.length === 2 &&
    envelopeOf(r, 'password') === alice.passwordEnvelope &&
    envelopeOf(r, 'recovery') === alice.recoveryEnvelope,
  r,
)
r = await guest.get('/keys')
check('GET /keys без сессии → 401', r.status === 401, r)
const password2 = {
  authKey: newKey(),
  kdf: { ...KDF, iterations: 4 },
  salt: newSalt(),
  passwordEnvelope: envelope('alice-password-2'),
}
r = await a1.post('/account/password', { currentAuthKey: newKey(), ...password2 })
check(
  'смена пароля с неверным currentAuthKey → 403 INVALID_CREDENTIALS',
  isError(r, 403, 'INVALID_CREDENTIALS'),
  r,
)
r = await a2.get('/auth/me')
check('вторая сессия (a2) жива до смены пароля', r.status === 200, r)
r = await a1.post('/account/password', { currentAuthKey: alice.authKey, ...password2 })
check('смена пароля → ok', r.status === 200 && r.json.ok === true, r)
r = await a2.get('/auth/me')
check('другая сессия после смены пароля → 401', r.status === 401, r)
r = await a1.get('/auth/me')
check('текущая сессия жива', r.status === 200, r)
r = await a1.get('/keys')
check('password-конверт обновлён', envelopeOf(r, 'password') === password2.passwordEnvelope, r)
r = await guest.post('/auth/prelogin', { login: 'alice' })
check(
  'prelogin отдаёт новые kdf и соль',
  r.json?.salt === password2.salt && r.json?.kdf.iterations === 4,
  r.json,
)
r = await new Client(a1.ip).post('/auth/login', { login: 'alice', authKey: alice.authKey })
check('старый authKey больше не работает', isError(r, 401, 'INVALID_CREDENTIALS'), r)
r = await a1.post('/auth/login', { login: 'alice', authKey: password2.authKey })
check('новый authKey работает (устройство доверенное → done)', r.json?.next === 'done', r)

// ---------------------------------------------------------------------------------------------
section('Recovery Key (alice)')
const rcOld = new Client(a1.ip)
r = await rcOld.post('/auth/recovery/begin', {
  login: 'alice',
  recoveryAuthKey: alice.recoveryAuthKey,
})
check('recovery/begin действующим ключом → recovery-сессия', r.status === 200, r)
const recovery2 = { recoveryEnvelope: envelope('alice-recovery-2'), recoveryAuthKey: newKey() }
r = await a1.post('/account/recovery-key', { currentAuthKey: newKey(), ...recovery2 })
check('перевыпуск с неверным currentAuthKey → 403', isError(r, 403, 'INVALID_CREDENTIALS'), r)
r = await a1.post('/account/recovery-key', { currentAuthKey: password2.authKey, ...recovery2 })
check('перевыпуск Recovery Key → ok', r.status === 200 && r.json.ok === true, r)
r = await a1.get('/keys')
check('recovery-конверт обновлён', envelopeOf(r, 'recovery') === recovery2.recoveryEnvelope, r)
r = await rcOld.post('/auth/recovery/complete', {
  authKey: newKey(),
  kdf: KDF,
  salt: newSalt(),
  passwordEnvelope: envelope('alice-hijack'),
})
check(
  'recovery-сессия, начатая старым ключом, после перевыпуска мертва → 401 SESSION_EXPIRED',
  isError(r, 401, 'SESSION_EXPIRED'),
  r,
)

const rc = new Client(a1.ip)
r = await rc.post('/auth/recovery/begin', { login: 'nobody', recoveryAuthKey: newKey() })
check('recovery/begin: неизвестный логин → 401', isError(r, 401, 'INVALID_CREDENTIALS'), r)
r = await rc.post('/auth/recovery/begin', {
  login: 'alice',
  recoveryAuthKey: alice.recoveryAuthKey,
})
check(
  'recovery/begin: старый (перевыпущенный) ключ → 401',
  isError(r, 401, 'INVALID_CREDENTIALS'),
  r,
)
r = await rc.post('/auth/recovery/begin', {
  login: 'alice',
  recoveryAuthKey: recovery2.recoveryAuthKey,
})
check(
  'recovery/begin: верный ключ → recovery-конверт',
  r.status === 200 && r.json.recoveryEnvelope === recovery2.recoveryEnvelope,
  r,
)
r = await rc.get('/auth/me')
check('me с recovery-сессией → 401', r.status === 401, r)
r = await rc.get('/keys')
check('keys с recovery-сессией → 401', r.status === 401, r)
const beforeRecovery = a1.clone()
const password3 = {
  authKey: newKey(),
  kdf: KDF,
  salt: newSalt(),
  passwordEnvelope: envelope('alice-password-3'),
}
r = await new Client(a1.ip).post('/auth/recovery/complete', password3)
check('recovery/complete без recovery-сессии → 401', r.status === 401, r)
const recoverySession = rc.clone()
r = await rc.post('/auth/recovery/complete', {
  ...password3,
  deviceId: aliceDevice,
  deviceSecret: aliceDeviceSecret,
})
check(
  'recovery/complete (deviceId + верный секрет) → полная сессия на том же устройстве',
  r.status === 200 &&
    r.json.user.login === 'alice' &&
    r.json.deviceId === aliceDevice &&
    r.json.deviceSecret === undefined,
  r,
)
r = await rc.get('/auth/me')
check('me после восстановления → 200', r.status === 200 && r.json.deviceId === aliceDevice, r)
r = await rc.post('/account/totp/start', { currentAuthKey: password3.authKey })
check(
  'сессия после восстановления: totp/start без кода 2FA → новый секрет',
  r.status === 200 && r.json.otpauthUri.startsWith('otpauth://totp/'),
  r,
)
const aliceTotp2 = r.status === 200 ? new Totp(r.json.secret) : null
r = await rc.post('/account/totp/confirm', { code: await aliceTotp2?.next() })
check('totp/confirm по новому секрету → ok', r.status === 200 && r.json.ok === true, r)
r = await rc.post('/account/totp/start', { currentAuthKey: password3.authKey })
check(
  'после перевыпуска 2FA повторный totp/start без кода → INVALID_CODE (только один раз)',
  isError(r, 400, 'INVALID_CODE'),
  r,
)
r = await recoverySession.post('/auth/recovery/complete', password3)
check('recovery-сессия одноразовая', r.status === 401, r)
r = await beforeRecovery.get('/auth/me')
check('старые сессии мертвы', r.status === 401, r)
r = await new Client(a1.ip).post('/auth/login', { login: 'alice', authKey: password2.authKey })
check('старый authKey не работает', isError(r, 401, 'INVALID_CREDENTIALS'), r)
r = await beforeRecovery.post('/auth/login', { login: 'alice', authKey: password3.authKey })
check(
  'новый authKey работает; «доверие» устройств снято → second-factor',
  r.status === 200 && r.json.next === 'second-factor',
  r,
)
r = await rc.get('/keys')
check(
  'password-конверт после восстановления',
  envelopeOf(r, 'password') === password3.passwordEnvelope &&
    envelopeOf(r, 'recovery') === recovery2.recoveryEnvelope,
  r,
)
r = await rc.post('/auth/logout', { everywhere: true })
check('logout everywhere → ok', r.status === 200 && !rc.has('il_session'), r)
r = await rc.get('/auth/me')
check('после logout everywhere → 401', r.status === 401, r)

// ---------------------------------------------------------------------------------------------
section('устройства и перевыпуск 2FA (bob)')
const b1 = new Client()
const bob = await register(b1, 'bob')
const b1SessionCookie = b1.cookies.get('il_session')?.raw ?? ''
check(
  'без remember: il_session без срока, HttpOnly, SameSite=Strict, Path=/api',
  /HttpOnly/i.test(b1SessionCookie) &&
    /SameSite=Strict/i.test(b1SessionCookie) &&
    /Path=\/api(;|$)/.test(b1SessionCookie) &&
    !/Expires/i.test(b1SessionCookie) &&
    !b1.has('il_device'),
  b1SessionCookie,
)
const b2 = new Client(b1.ip)
r = await b2.post('/auth/login', { login: 'bob', authKey: bob.authKey })
r = await b2.post('/auth/login/verify', { code: await bob.totp.next(), remember: true })
const bobDevice2 = r.json?.deviceId
check(
  'вход без deviceId → новое устройство со своим секретом; remember → il_device',
  r.status === 200 &&
    UUID.test(bobDevice2) &&
    bobDevice2 !== bob.deviceId &&
    DEVICE_SECRET.test(secret(r.json.deviceSecret) ?? '') &&
    r.json.deviceSecret !== bob.deviceSecret &&
    b2.has('il_device'),
  r,
)
const deviceById = (res, id) => res.json?.devices?.find((d) => d.deviceId === id)
r = await b2.get('/devices')
check(
  'GET /devices → оба устройства, флаги current и trusted',
  r.status === 200 &&
    r.json.devices.length === 2 &&
    deviceById(r, bobDevice2)?.current === true &&
    deviceById(r, bobDevice2)?.trusted === true &&
    deviceById(r, bob.deviceId)?.current === false &&
    deviceById(r, bob.deviceId)?.trusted === false,
  r,
)
r = await b2.call('PATCH', `/devices/${bob.deviceId}`, { encryptedLabel: 'enc:v1:bob-laptop' })
check('PATCH label → ok', r.status === 200 && r.json.ok === true, r)
r = await b2.get('/devices')
check(
  'label сохранён как есть',
  deviceById(r, bob.deviceId)?.encryptedLabel === 'enc:v1:bob-laptop',
  r,
)
r = await b2.call('PATCH', `/devices/${randomUUID()}`, { encryptedLabel: null })
check('PATCH несуществующего → 404', isError(r, 404, 'NOT_FOUND'), r)
r = await b2.call('PATCH', `/devices/${aliceDevice}`, { encryptedLabel: 'x' })
check('PATCH чужого устройства → 404', isError(r, 404, 'NOT_FOUND'), r)
r = await b2.call('PATCH', '/devices/not-a-uuid', { encryptedLabel: 'x' })
check('PATCH с кривым id → 400', isError(r, 400, 'VALIDATION_ERROR'), r)
r = await b1.call('DELETE', `/devices/${bob.deviceId}`)
check('отзыв текущего устройства → 403', isError(r, 403, 'FORBIDDEN'), r)
r = await b1.call('DELETE', `/devices/${aliceDevice}`)
check('отзыв чужого устройства → 404', isError(r, 404, 'NOT_FOUND'), r)
r = await b1.call('DELETE', `/devices/${bobDevice2}`)
check('отзыв другого устройства (DELETE без тела) → ok', r.status === 200 && r.json.ok === true, r)
r = await b2.get('/auth/me')
check('сессия отозванного устройства → 401', r.status === 401, r)
r = await b1.get('/devices')
check(
  'в списке только не отозванные',
  r.status === 200 && r.json.devices.length === 1 && r.json.devices[0].deviceId === bob.deviceId,
  r,
)
r = await b1.call('DELETE', `/devices/${bobDevice2}`, undefined, {
  'content-type': 'application/json',
})
check('повторный отзыв (JSON без тела) → 404', isError(r, 404, 'NOT_FOUND'), r)
r = await b2.post('/auth/login', { login: 'bob', authKey: bob.authKey, deviceId: bobDevice2 })
check(
  '«доверие» отозванного устройства снято → second-factor',
  r.status === 200 && r.json.next === 'second-factor',
  r,
)

r = await b1.post('/account/totp/start', { currentAuthKey: newKey() })
check('totp/start с неверным authKey → 403', isError(r, 403, 'INVALID_CREDENTIALS'), r)
r = await b1.post('/account/totp/confirm', { code: '123456' })
check('totp/confirm без start → INVALID_CODE', isError(r, 400, 'INVALID_CODE'), r)
r = await b1.post('/account/totp/start', { currentAuthKey: bob.authKey })
check(
  'totp/start без текущего кода 2FA (обычная сессия) → INVALID_CODE',
  isError(r, 400, 'INVALID_CODE'),
  r,
)
r = await b1.post('/account/totp/start', { currentAuthKey: bob.authKey, code: bob.totp.wrong() })
check('totp/start с неверным кодом → INVALID_CODE', isError(r, 400, 'INVALID_CODE'), r)
check(
  'неверный код в account/* считается в блокировке перебора',
  (await userRow('bob'))?.totp_failed_count === 1,
  await userRow('bob'),
)
const bobStartCode = await bob.totp.next()
r = await b1.post('/account/totp/start', { currentAuthKey: bob.authKey, code: bobStartCode })
check(
  'totp/start с текущим кодом → новый секрет, счётчик неудач сброшен',
  r.status === 200 &&
    r.json.otpauthUri.startsWith('otpauth://totp/') &&
    r.json.secret.length > 20 &&
    (await userRow('bob'))?.totp_failed_count === 0,
  r,
)
const bobStart = r
r = await b1.post('/account/totp/start', { currentAuthKey: bob.authKey, code: bobStartCode })
check('totp/start повтором того же кода → INVALID_CODE', isError(r, 400, 'INVALID_CODE'), r)
r = bobStart
const bobTotp2 = new Totp(r.json.secret)
r = await b1.post('/account/totp/confirm', { code: bobTotp2.wrong() })
check('totp/confirm с неверным кодом → INVALID_CODE', isError(r, 400, 'INVALID_CODE'), r)
r = await b1.post('/account/totp/confirm', { code: await bobTotp2.next() })
check('totp/confirm → ok', r.status === 200 && r.json.ok === true, r)
r = await b1.get('/auth/me')
check('текущая сессия после перевыпуска 2FA жива', r.status === 200, r)

// ---------------------------------------------------------------------------------------------
section('удаление аккаунта (bob)')
const bobDeleteCode = await bobTotp2.next()
r = await b1.post('/account/delete', { currentAuthKey: newKey(), code: bobDeleteCode })
check('delete с неверным authKey → 403', isError(r, 403, 'INVALID_CREDENTIALS'), r)
r = await b1.post('/account/delete', {
  currentAuthKey: bob.authKey,
  code: bob.totp.at(Math.floor(Date.now() / 30_000) + 1),
})
check('код по старому TOTP-секрету → INVALID_CODE', isError(r, 400, 'INVALID_CODE'), r)
r = await b1.post('/account/delete', { currentAuthKey: bob.authKey, code: bobDeleteCode })
check(
  'delete с кодом нового секрета → ok, cookie сброшена',
  r.status === 200 && !b1.has('il_session'),
  r,
)
r = await b1.get('/auth/me')
check('после удаления → 401', r.status === 401, r)
r = await b2.post('/auth/login', { login: 'bob', authKey: bob.authKey })
check('вход в удалённый аккаунт → INVALID_CREDENTIALS', isError(r, 401, 'INVALID_CREDENTIALS'), r)
r = await guest.post('/auth/prelogin', { login: 'bob' })
check(
  'prelogin удалённого логина → фальшивая соль',
  r.status === 200 &&
    r.json.salt !== bob.salt &&
    JSON.stringify(r.json.kdf) === JSON.stringify(KDF),
  r.json,
)

// ---------------------------------------------------------------------------------------------
section('entitlements и sync (carol)')
const c1 = new Client()
await register(c1, 'carol')
r = await c1.get('/entitlements')
check(
  'entitlements: PILOT без лимита записей, но с потолком хранилища; 0 записей, 1 устройство',
  r.status === 200 &&
    r.json.plan === 'PILOT' &&
    r.json.profile.planId === 'PILOT' &&
    r.json.profile.limits.maxActiveImpacts === null &&
    r.json.profile.limits.maxStorageBytes === 512 * MiB &&
    r.json.profile.limits.maxObjects === 100_000 &&
    r.json.usage.activeImpacts === 0 &&
    r.json.usage.devices === 1 &&
    r.json.usage.storageBytes === 0 &&
    r.json.usage.objects === 0,
  r,
)
const push = (changes) => c1.push(changes)
const pull = (cursor = 0, limit = 1000) => c1.pull(cursor, limit)
r = await c1.pull(0, 10, { 'x-impact-account': undefined })
check('pull без X-Impact-Account → 400 VALIDATION_ERROR', isError(r, 400, 'VALIDATION_ERROR'), r)
r = await c1.pull(0, 10, { 'x-impact-account': aliceAccount })
check('pull с чужим accountId → 409 ACCOUNT_MISMATCH', isError(r, 409, 'ACCOUNT_MISMATCH'), r)
r = await c1.push([impact(randomUUID(), 0, 'ct:wrong-account')], {
  'x-impact-account': aliceAccount,
})
check('push с чужим accountId → 409 ACCOUNT_MISMATCH', isError(r, 409, 'ACCOUNT_MISMATCH'), r)
r = await c1.push([impact(randomUUID(), 0, 'ct:no-header')], { 'x-impact-account': undefined })
check('push без X-Impact-Account → 400', isError(r, 400, 'VALIDATION_ERROR'), r)
r = await c1.get('/entitlements')
check('отклонённые по заголовку push ничего не записали', r.json?.usage.objects === 0, r.json)
const o1 = randomUUID()
const o2 = randomUUID()
const o3 = randomUUID()
r = await push([impact(o1, 0, 'ct:o1:v1')])
const res0 = r.json?.results?.[0]
check(
  'push: создание → accepted v1',
  r.status === 200 && res0?.status === 'accepted' && res0.version === 1 && res0.seq > 0,
  r,
)
r = await push([impact(o1, 1, 'ct:o1:v2')])
const res1 = r.json?.results?.[0]
check(
  'push: обновление → v2, seq растёт',
  res1?.status === 'accepted' && res1.version === 2 && res1.seq > res0.seq,
  r,
)
r = await push([impact(o1, 1, 'ct:o1:stale')])
const conflict = r.json?.results?.[0]
check(
  'push: устаревший baseVersion → conflict с серверной веткой',
  conflict?.status === 'conflict' &&
    conflict.server.version === 2 &&
    conflict.server.ciphertext === 'ct:o1:v2' &&
    conflict.server.deleted === false &&
    conflict.server.seq === res1.seq,
  r,
)
r = await push([impact(o2, 3, 'ct:o2')])
check(
  'push: baseVersion>0 у несуществующего → rejected INVALID',
  r.json?.results?.[0]?.status === 'rejected' && r.json.results[0].code === 'INVALID',
  r,
)
r = await push([impact(o1, 2, null), impact(o3, 0, null), impact(o2, 0, 'ct:o2:v1')])
const batch = r.json?.results ?? []
check(
  'push пачкой: результаты по порядку (tombstone, tombstone несуществующего → INVALID, создание)',
  batch.length === 3 &&
    batch[0].objectId === o1 &&
    batch[0].status === 'accepted' &&
    batch[0].version === 3 &&
    batch[1].objectId === o3 &&
    batch[1].status === 'rejected' &&
    batch[1].code === 'INVALID' &&
    batch[2].objectId === o2 &&
    batch[2].status === 'accepted' &&
    batch[2].version === 1 &&
    batch[0].seq < batch[2].seq,
  r,
)
r = await pull()
const pulled = r.json?.changes ?? []
check(
  'pull с 0 → последнее состояние каждого объекта по seq (tombstone «из ничего» не создан)',
  r.status === 200 &&
    pulled.map((o) => o.objectId).join() === [o1, o2].join() &&
    pulled[0].deleted === true &&
    pulled[0].ciphertext === null &&
    pulled[0].version === 3 &&
    pulled[1].ciphertext === 'ct:o2:v1' &&
    r.json.hasMore === false &&
    r.json.cursor === batch[2].seq,
  r,
)
const extra = Array.from({ length: 5 }, () => randomUUID())
r = await push(extra.map((objectId) => impact(objectId, 0, `ct:${objectId}`)))
check(
  'push 5 новых → accepted',
  r.json?.results?.every((x) => x.status === 'accepted'),
  r,
)
let cursor = 0
const seen = []
const hasMore = []
for (let page = 0; page < 10; page++) {
  r = await pull(cursor, 3)
  seen.push(...(r.json?.changes ?? []))
  hasMore.push(r.json?.hasMore)
  cursor = r.json?.cursor ?? cursor
  if (!r.json?.hasMore) break
}
check(
  'pull постранично (limit=3): 7 объектов, hasMore true,true,false, seq по возрастанию',
  seen.length === 7 &&
    new Set(seen.map((o) => o.objectId)).size === 7 &&
    hasMore.join() === 'true,true,false' &&
    seen.every((o, i) => i === 0 || o.seq > seen[i - 1].seq) &&
    cursor === seen.at(-1)?.seq,
  { hasMore, count: seen.length },
)
r = await pull(cursor)
check(
  'pull с последнего курсора → пусто, курсор тот же',
  r.status === 200 &&
    r.json.changes.length === 0 &&
    r.json.cursor === cursor &&
    r.json.hasMore === false,
  r,
)
r = await c1.get('/sync/pull?limit=5000', { 'x-impact-account': c1.account })
check('pull c limit > max → 400', isError(r, 400, 'VALIDATION_ERROR'), r)
r = await push([])
check('push без изменений → 400', isError(r, 400, 'VALIDATION_ERROR'), r)
r = await push([{ ...impact(randomUUID(), 0, 'x'), kind: 'note' }])
check('push с неизвестным kind → 400', isError(r, 400, 'VALIDATION_ERROR'), r)
const big = 'a'.repeat(256 * 1024)
r = await push(Array.from({ length: 40 }, () => impact(randomUUID(), 0, big)))
check('push > 8 МиБ → 413 PAYLOAD_TOO_LARGE', isError(r, 413, 'PAYLOAD_TOO_LARGE'), r)
r = await guest.get('/sync/pull')
check('pull без сессии → 401', r.status === 401, r)
r = await c1.get('/entitlements')
check(
  'usage: activeImpacts и objects — только живые объекты (без tombstone); storageBytes — байты',
  r.json?.usage.activeImpacts === 6 &&
    r.json.usage.objects === 6 &&
    r.json.usage.storageBytes ===
      'ct:o2:v1'.length + extra.reduce((sum, id) => sum + `ct:${id}`.length, 0),
  r.json?.usage,
)

// ---------------------------------------------------------------------------------------------
section('квота FREE (carol)')
const live = ((await pull()).json?.changes ?? []).filter((o) => !o.deleted)
r = await push(live.map((o) => impact(o.objectId, o.version, null)))
check(
  'удаление всех живых записей → accepted',
  live.length === 6 && r.json?.results?.every((x) => x.status === 'accepted'),
  r,
)
await sql`update users set plan = 'FREE' where login = 'carol'`
r = await c1.get('/entitlements')
check(
  'entitlements: FREE, лимит 15, 0 активных',
  r.json?.plan === 'FREE' &&
    r.json.profile.limits.maxActiveImpacts === 15 &&
    r.json.usage.activeImpacts === 0,
  r.json,
)
const quota = Array.from({ length: 16 }, () => randomUUID())
r = await push(quota.map((objectId) => impact(objectId, 0, 'q')))
const qres = r.json?.results ?? []
check(
  '15 созданий ok, 16-е → rejected QUOTA_EXCEEDED',
  qres.length === 16 &&
    qres.slice(0, 15).every((x) => x.status === 'accepted') &&
    qres[15].status === 'rejected' &&
    qres[15].code === 'QUOTA_EXCEEDED',
  qres.map((x) => x.status),
)
r = await c1.get('/entitlements')
check('usage.activeImpacts = 15', r.json?.usage.activeImpacts === 15, r.json?.usage)
r = await push([impact(quota[0], 1, 'q2')])
check('на лимите обновление → accepted', r.json?.results?.[0]?.status === 'accepted', r)
r = await push([impact(randomUUID(), 0, 'q')])
check('на лимите создание → QUOTA_EXCEEDED', r.json?.results?.[0]?.code === 'QUOTA_EXCEEDED', r)
r = await push([impact(o1, 3, 'back')])
check(
  '«воскрешение» tombstone на лимите → QUOTA_EXCEEDED',
  r.json?.results?.[0]?.code === 'QUOTA_EXCEEDED',
  r,
)
r = await push([impact(quota[1], 1, null), impact(randomUUID(), 0, 'y')])
check(
  'в одном push: удаление освобождает место для создания',
  r.json?.results?.length === 2 && r.json.results.every((x) => x.status === 'accepted'),
  r,
)
r = await push([impact(quota[2], 1, null)])
check('удаление на лимите → accepted', r.json?.results?.[0]?.status === 'accepted', r)
r = await push([impact(randomUUID(), 0, 'z')])
check('после удаления создание снова ok', r.json?.results?.[0]?.status === 'accepted', r)
r = await c1.get('/entitlements')
check('usage.activeImpacts снова 15', r.json?.usage.activeImpacts === 15, r.json?.usage)

// ---------------------------------------------------------------------------------------------
section('выход со стиранием устройства, брошенная регистрация')
const d1 = new Client()
const dora = await register(d1, 'dora', { remember: true })
check('remember → il_device выдан', d1.has('il_device'), [...d1.cookies.keys()])
const doraTrusted = d1.clone()
r = await d1.post('/auth/logout', { forgetDevice: true })
check('logout forgetDevice → ok, il_device сброшен', r.status === 200 && !d1.has('il_device'), r)
r = await doraTrusted.post('/auth/login', { login: 'dora', authKey: dora.authKey })
check(
  'старый il_device после forgetDevice → снова нужен код',
  r.status === 200 && r.json.next === 'second-factor',
  r,
)
const e1 = new Client()
r = await e1.post('/auth/register', {
  login: 'eve',
  authKey: newKey(),
  kdf: KDF,
  salt: newSalt(),
  passwordEnvelope: envelope('password'),
  recoveryEnvelope: envelope('recovery'),
  recoveryAuthKey: newKey(),
})
const eveTotp = new Totp(r.json.secret)
for (let i = 0; i < 5; i++) r = await e1.post('/auth/register/confirm', { code: eveTotp.wrong() })
check('5 неверных кодов регистрации → SESSION_EXPIRED', isError(r, 401, 'SESSION_EXPIRED'), r)
const e2 = new Client()
r = await e2.post('/auth/register', {
  login: 'eve',
  authKey: newKey(),
  kdf: KDF,
  salt: newSalt(),
  passwordEnvelope: envelope('password'),
  recoveryEnvelope: envelope('recovery'),
  recoveryAuthKey: newKey(),
})
check('брошенная регистрация без живой сессии → логин снова свободен', r.status === 200, r)
const f1 = new Client()
r = await f1.post('/auth/register', {
  login: 'eve',
  authKey: newKey(),
  kdf: KDF,
  salt: newSalt(),
  passwordEnvelope: envelope('password'),
  recoveryEnvelope: envelope('recovery'),
  recoveryAuthKey: newKey(),
})
check('идущая регистрация чужого → 409 LOGIN_TAKEN', isError(r, 409, 'LOGIN_TAKEN'), r)

// ---------------------------------------------------------------------------------------------
section('TOTP: блокировка перебора на пользователя (grace)')
const g1 = new Client()
const grace = await register(g1, 'grace')
/** Новая second-factor-сессия с нового IP */
const graceLogin = async () => {
  const client = new Client()
  const res = await client.post('/auth/login', { login: 'grace', authKey: grace.authKey })
  if (res.json?.next !== 'second-factor') throw new Error(`grace login: ${JSON.stringify(res)}`)
  return client
}
const gA = await graceLogin()
const gB = await graceLogin()
const gC = await graceLogin()
const wrongCodes = async (client, n) => {
  const statuses = []
  for (let i = 0; i < n; i++) {
    const res = await client.post('/auth/login/verify', { code: grace.totp.wrong() })
    statuses.push(code(res))
  }
  return statuses
}
const graceFails = [...(await wrongCodes(gA, 3)), ...(await wrongCodes(gB, 4))]
graceFails.push(...(await wrongCodes(gC, 3)))
check(
  '10 неверных кодов из 3 сессий с 3 IP → все INVALID_CODE (лимит сессии 5 не достигнут)',
  graceFails.length === 10 && graceFails.every((c) => c === 'INVALID_CODE'),
  graceFails,
)
let graceRow = await userRow('grace')
let graceLock = await lockMinutes('grace')
check(
  'после 10 неудач подряд: totp_failed_count = 10, блокировка ~15 минут',
  graceRow?.totp_failed_count === 10 && graceLock > 14 && graceLock <= 15.1,
  { count: graceRow?.totp_failed_count, graceLock },
)
r = await gC.post('/auth/login/verify', { code: grace.totp.now() })
check('во время блокировки верный код → 429 RATE_LIMITED', isError(r, 429, 'RATE_LIMITED'), r)
const gD = await graceLogin()
r = await gD.post('/auth/login/verify', { code: grace.totp.now() })
check('новая сессия с нового IP во время блокировки → тоже 429', isError(r, 429, 'RATE_LIMITED'), r)
r = await g1.post('/account/delete', { currentAuthKey: grace.authKey, code: grace.totp.now() })
check('account/delete во время блокировки → 429 (код не проверяется)', r.status === 429, r)
check(
  'запросы во время блокировки не увеличивают счётчик',
  (await userRow('grace'))?.totp_failed_count === 10,
  await userRow('grace'),
)
await unlockTotp('grace')
r = await gA.post('/auth/login/verify', { code: grace.totp.wrong() })
graceLock = await lockMinutes('grace')
check(
  'после блокировки следующая неудача сразу блокирует снова — вдвое дольше (~30 мин)',
  isError(r, 400, 'INVALID_CODE') &&
    (await userRow('grace'))?.totp_failed_count === 11 &&
    graceLock > 29 &&
    graceLock <= 30.1,
  { r, graceLock },
)
r = await gD.post('/auth/login/verify', { code: grace.totp.now() })
check('снова заблокировано → 429', isError(r, 429, 'RATE_LIMITED'), r)
await sql`update users set totp_failed_count = 16, totp_locked_until = now() - interval '1 second'
  where login = 'grace'`
r = await gA.post('/auth/login/verify', { code: grace.totp.wrong() })
graceLock = await lockMinutes('grace')
check(
  'длительность блокировки не больше суток',
  graceLock > 24 * 60 - 1 && graceLock <= 24 * 60 + 0.1,
  { status: r.status, graceLock },
)
await unlockTotp('grace')
r = await gD.post('/auth/login/verify', { code: await grace.totp.next() })
graceRow = await userRow('grace')
check(
  'верный код после блокировки → вход; счётчик и блокировка сброшены',
  r.status === 200 && graceRow?.totp_failed_count === 0 && graceRow?.totp_locked_until === null,
  { r, graceRow },
)

// ---------------------------------------------------------------------------------------------
section('лимиты частоты: логин + IP и IPv6 /64')
const perLogin = []
for (let i = 0; i < 11; i++) {
  perLogin.push(await new Client().post('/auth/login', { login: 'henry', authKey: newKey() }))
}
check(
  'login: нет глобальной блокировки по логину — 11 попыток с разных IP → 401 (владельца не запереть)',
  perLogin.every((x) => isError(x, 401, 'INVALID_CREDENTIALS')),
  perLogin.map((x) => x.status),
)
const henryIp = new Client()
const sameIp = []
for (let i = 0; i < 11; i++) {
  sameIp.push(await henryIp.clone().post('/auth/login', { login: 'henry', authKey: newKey() }))
}
check(
  'login: с одного IP — 10 попыток → 401, 11-я → 429',
  sameIp.slice(0, 10).every((x) => x.status === 401) && isError(sameIp[10], 429, 'RATE_LIMITED'),
  sameIp.map((x) => x.status),
)
r = await new Client().post('/auth/login', { login: 'henry2', authKey: newKey() })
check('другой IP и логин не задеты', isError(r, 401, 'INVALID_CREDENTIALS'), r)
const perLoginRecovery = []
for (let i = 0; i < 6; i++) {
  perLoginRecovery.push(
    await new Client().post('/auth/recovery/begin', { login: 'henry', recoveryAuthKey: newKey() }),
  )
}
check(
  'recovery/begin: лимита по логину нет (160-битный ключ не подобрать) — 6 попыток с разных IP → 401',
  perLoginRecovery.every((x) => x.status === 401),
  perLoginRecovery.map((x) => x.status),
)
const perLoginPrelogin = []
for (let i = 0; i < 21; i++) {
  perLoginPrelogin.push(await new Client().post('/auth/prelogin', { login: 'henry' }))
}
check(
  'prelogin: лимита по логину нет — 21 запрос с разных IP → 200',
  perLoginPrelogin.every((x) => x.status === 200),
  perLoginPrelogin.map((x) => x.status),
)
const v6 = []
for (let i = 0; i < 31; i++) {
  const ip = `2001:db8:77:1:${(i + 1).toString(16)}::${i + 7}`
  v6.push(await new Client(ip).post('/auth/prelogin', { login: `v6-${i}` }))
}
check(
  'IPv6: 31 адрес из одной /64 делят лимит IP (prelogin 30/5 мин) → 31-й 429',
  v6.slice(0, 30).every((x) => x.status === 200) && isError(v6[30], 429, 'RATE_LIMITED'),
  v6.map((x) => x.status),
)
r = await new Client('2001:db8:77:2::1').post('/auth/prelogin', { login: 'v6-other' })
check('IPv6: соседняя /64 — свой счётчик → 200', r.status === 200, r)

// ---------------------------------------------------------------------------------------------
section('секрет устройства (ivan)')
const i1 = new Client()
const ivan = await register(i1, 'ivan')
check('register/confirm выдаёт deviceSecret', DEVICE_SECRET.test(ivan.deviceSecret ?? ''), ivan)
const i2 = new Client()
r = await i2.post('/auth/login', { login: 'ivan', authKey: ivan.authKey, deviceId: ivan.deviceId })
r = await i2.post('/auth/login/verify', { code: await ivan.totp.next() })
const ivanDevice2 = r.json?.deviceId
const ivanSecret2 = secret(r.json?.deviceSecret)
check(
  'deviceId без секрета → новое устройство и новый секрет',
  r.status === 200 &&
    UUID.test(ivanDevice2) &&
    ivanDevice2 !== ivan.deviceId &&
    DEVICE_SECRET.test(ivanSecret2 ?? '') &&
    ivanSecret2 !== ivan.deviceSecret,
  r,
)
r = await new Client().post('/auth/login', {
  login: 'ivan',
  authKey: ivan.authKey,
  deviceId: ivan.deviceId,
  deviceSecret: 'short',
})
check('кривой deviceSecret → 400 VALIDATION_ERROR', isError(r, 400, 'VALIDATION_ERROR'), r)
/** Восстановление по Recovery Key с новым паролем; возвращает ответ recovery/complete */
const ivanRecover = async (client, device) => {
  const begun = await client.post('/auth/recovery/begin', {
    login: 'ivan',
    recoveryAuthKey: ivan.recoveryAuthKey,
  })
  if (begun.status !== 200) throw new Error(`ivan recovery: ${JSON.stringify(begun)}`)
  ivan.authKey = newKey()
  return client.post('/auth/recovery/complete', {
    authKey: ivan.authKey,
    kdf: KDF,
    salt: newSalt(),
    passwordEnvelope: envelope('ivan-password'),
    ...device,
  })
}
const i3 = new Client()
r = await ivanRecover(i3, { deviceId: ivan.deviceId, deviceSecret: ivanSecret2 })
check(
  'deviceId с секретом другого устройства → новое устройство и новый секрет',
  r.status === 200 &&
    UUID.test(r.json.deviceId) &&
    r.json.deviceId !== ivan.deviceId &&
    r.json.deviceId !== ivanDevice2 &&
    DEVICE_SECRET.test(secret(r.json.deviceSecret) ?? ''),
  r,
)
const i4 = new Client()
r = await ivanRecover(i4, { deviceId: ivan.deviceId, deviceSecret: ivan.deviceSecret })
check(
  'deviceId с верным секретом → то же устройство, секрет не перевыпускается',
  r.status === 200 && r.json.deviceId === ivan.deviceId && r.json.deviceSecret === undefined,
  r,
)
r = await i4.call('DELETE', `/devices/${ivanDevice2}`)
check('отзыв второго устройства → ok', r.status === 200, r)
r = await ivanRecover(new Client(), { deviceId: ivanDevice2, deviceSecret: ivanSecret2 })
check(
  'отозванное устройство даже с верным секретом не переиспользуется → новое',
  r.status === 200 &&
    r.json.deviceId !== ivanDevice2 &&
    DEVICE_SECRET.test(secret(r.json.deviceSecret) ?? ''),
  r,
)
const ivanRow = await userRow('ivan')
check(
  'TOTP-секрет в БД: формат v2 (iv 12 байт, тег 16 байт, 20 байт шифротекста)',
  /^v2:[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{27}$/.test(ivanRow?.totp_secret ?? ''),
  ivanRow?.totp_secret,
)
check(
  'в БД только SHA-256 секрета устройства',
  (await sql`select secret_hash from devices where id = ${ivan.deviceId}`)[0]?.secret_hash
    ?.length === 64,
)

// ---------------------------------------------------------------------------------------------
section('AAD TOTP-секрета: шифротекст не переносится в чужую строку (ivan → grace)')
const graceSecretBefore = (await userRow('grace'))?.totp_secret
await sql`update users set totp_secret = ${ivanRow.totp_secret} where login = 'grace'`
const gE = await graceLogin()
r = await gE.post('/auth/login/verify', { code: ivan.totp.now() })
check(
  'код по чужому (перенесённому) секрету не принимается — расшифровка с AAD падает',
  r.status !== 200 && isError(r, 500, 'INTERNAL_ERROR'),
  r,
)
await sql`update users set totp_secret = ${graceSecretBefore}, totp_failed_count = 0
  where login = 'grace'`

// ---------------------------------------------------------------------------------------------
section('квота хранилища: число объектов (judy, PILOT)')
const j1 = new Client()
await register(j1, 'judy')
await sql`insert into objects (user_id, object_id, kind, version, ciphertext, deleted, seq)
  select u.id, gen_random_uuid(), 'impact', 1, 'x', false, nextval('object_seq')
  from users u, generate_series(1, 99995) where u.login = 'judy'`
await sql`insert into objects (user_id, object_id, kind, version, ciphertext, deleted, seq)
  select u.id, gen_random_uuid(), 'impact', 2, null, true, nextval('object_seq')
  from users u, generate_series(1, 50) where u.login = 'judy'`
r = await j1.get('/entitlements')
check(
  "PILOT: maxObjects 100000; tombstone'ы в usage.objects не входят",
  r.json?.profile.limits.maxObjects === 100_000 && r.json.usage.objects === 99_995,
  r.json?.usage,
)
const jIds = Array.from({ length: 6 }, () => randomUUID())
r = await j1.push(jIds.map((id) => impact(id, 0, 'j')))
check(
  '5 созданий до 100000 живых объектов ok, 6-е → QUOTA_EXCEEDED',
  r.json?.results?.slice(0, 5).every((x) => x.status === 'accepted') &&
    r.json.results[5].status === 'rejected' &&
    r.json.results[5].code === 'QUOTA_EXCEEDED',
  r.json?.results?.map((x) => x.code ?? x.status),
)
r = await j1.push([impact(jIds[0], 1, 'j-updated'), impact(jIds[1], 1, null)])
check(
  'на лимите: обновление и удаление → accepted',
  r.json?.results?.every((x) => x.status === 'accepted'),
  r.json,
)
r = await j1.push([impact(randomUUID(), 0, 'j')])
check(
  'удаление освободило место: создание → accepted',
  r.json?.results?.[0]?.status === 'accepted',
  r.json,
)
r = await j1.get('/entitlements')
check('usage.objects = 100000', r.json?.usage.objects === 100_000, r.json?.usage)
await sql`delete from objects where user_id = (select id from users where login = 'judy')`

// ---------------------------------------------------------------------------------------------
section("потолок строк с tombstone'ами: 2 × maxObjects (nina, FREE)")
const n1 = new Client()
await register(n1, 'nina')
await sql`update users set plan = 'FREE' where login = 'nina'`
await sql`insert into objects (user_id, object_id, kind, version, ciphertext, deleted, seq)
  select u.id, gen_random_uuid(), 'impact', 2, null, true, nextval('object_seq')
  from users u, generate_series(1, 1995) where u.login = 'nina'`
const nIds = Array.from({ length: 6 }, () => randomUUID())
r = await n1.push(nIds.map((id) => impact(id, 0, 'n')))
check(
  '1995 tombstone + 5 созданий = 2000 строк ok, 6-е → QUOTA_EXCEEDED (циклы «создать → удалить» не раздувают БД)',
  r.json?.results?.slice(0, 5).every((x) => x.status === 'accepted') &&
    r.json.results[5].code === 'QUOTA_EXCEEDED',
  r.json?.results?.map((x) => x.code ?? x.status),
)
r = await n1.push([impact(nIds[0], 1, 'n-updated')])
check('на потолке строк обновление → accepted', r.json?.results?.[0]?.status === 'accepted', r.json)
r = await n1.get('/entitlements')
check("usage.objects = 5 (tombstone'ы не считаются)", r.json?.usage.objects === 5, r.json?.usage)
await sql`delete from objects where user_id = (select id from users where login = 'nina')`

// ---------------------------------------------------------------------------------------------
section('квота хранилища: байты (kate, FREE)')
const k1 = new Client()
await register(k1, 'kate')
await sql`update users set plan = 'FREE' where login = 'kate'`
const bigId = randomUUID()
const bigBytes = 50 * MiB - 300 * KiB
await sql`insert into objects (user_id, object_id, kind, version, ciphertext, deleted, seq)
  select id, ${bigId}, 'impact', 1, repeat('x', ${bigBytes}), false, nextval('object_seq')
  from users where login = 'kate'`
r = await k1.get('/entitlements')
check(
  'usage.storageBytes считает байты шифротекста',
  r.json?.usage.storageBytes === bigBytes && r.json.usage.objects === 1,
  r.json?.usage,
)
const kA = randomUUID()
const kB = randomUUID()
const kC = randomUUID()
r = await k1.push([
  impact(kA, 0, 'a'.repeat(256 * KiB)),
  impact(kB, 0, 'b'.repeat(64 * KiB)),
  impact(kC, 0, 'c'.repeat(40 * KiB)),
])
check(
  'до 50 МиБ: 256 КиБ ok, 64 КиБ сверх лимита → QUOTA_EXCEEDED, 40 КиБ ok',
  r.json?.results?.[0]?.status === 'accepted' &&
    r.json.results[1].code === 'QUOTA_EXCEEDED' &&
    r.json.results[2].status === 'accepted',
  r.json?.results?.map((x) => x.code ?? x.status),
)
r = await k1.push([impact(kC, 1, 'c'.repeat(48 * KiB))])
check(
  'рост объекта сверх лимита при обновлении → QUOTA_EXCEEDED',
  r.json?.results?.[0]?.code === 'QUOTA_EXCEEDED',
  r.json,
)
r = await k1.push([impact(kC, 1, 'c'.repeat(10 * KiB))])
check('уменьшение объекта на лимите → accepted', r.json?.results?.[0]?.status === 'accepted', r)
r = await k1.push([impact(bigId, 1, null), impact(kB, 0, 'b'.repeat(64 * KiB))])
check(
  'удаление освобождает байты — в том же push создание снова ok',
  r.json?.results?.every((x) => x.status === 'accepted'),
  r.json?.results?.map((x) => x.code ?? x.status),
)
r = await k1.get('/entitlements')
check(
  'usage.storageBytes после удаления',
  r.json?.usage.storageBytes === (256 + 10 + 64) * KiB && r.json.usage.objects === 3,
  r.json?.usage,
)

// ---------------------------------------------------------------------------------------------
section('pull ограничен суммой байт (leo)')
const l1 = new Client()
await register(l1, 'leo')
const leoSize = 250_000
for (let batch = 0; batch < 2; batch++) {
  r = await l1.push(Array.from({ length: 20 }, () => impact(randomUUID(), 0, 'l'.repeat(leoSize))))
  check(
    `push 20 объектов по 250 000 байт (${batch + 1}/2) → accepted`,
    r.json?.results?.every((x) => x.status === 'accepted'),
    r.json?.results?.map((x) => x.code ?? x.status),
  )
}
const leoPerPage = Math.floor(PULL_MAX_BYTES / leoSize)
r = await l1.pull(0, 1000)
const leoPage1 = r.json
check(
  `pull (limit 1000) → ${leoPerPage} объектов (≤ 8 МиБ), hasMore true`,
  leoPage1?.changes.length === leoPerPage &&
    leoPage1.hasMore === true &&
    leoPage1.cursor === leoPage1.changes.at(-1).seq,
  { count: leoPage1?.changes.length, hasMore: leoPage1?.hasMore },
)
r = await l1.pull(leoPage1?.cursor ?? 0, 1000)
check(
  'следующая страница → остаток, hasMore false',
  r.json?.changes.length === 40 - leoPerPage && r.json.hasMore === false,
  { count: r.json?.changes.length, hasMore: r.json?.hasMore },
)
r = await l1.pull(0, 10)
check(
  'лимит по числу объектов работает как раньше',
  r.json?.changes.length === 10 && r.json.hasMore === true,
  { count: r.json?.changes.length, hasMore: r.json?.hasMore },
)

// ---------------------------------------------------------------------------------------------
section('лимит частоты синхронизации на пользователя (mia)')
const m1 = new Client()
await register(m1, 'mia')
const miaPulls = await Promise.all(Array.from({ length: 120 }, () => m1.pull(0, 1)))
r = await m1.pull(0, 1)
check(
  '120 запросов /sync/* в минуту → 200, 121-й → 429 RATE_LIMITED',
  miaPulls.every((x) => x.status === 200) && isError(r, 429, 'RATE_LIMITED'),
  { statuses: [...new Set(miaPulls.map((x) => x.status))], last: r.status },
)
r = await l1.pull(0, 1)
check('лимит — на пользователя: другой пользователь синхронизируется', r.status === 200, r)

// ---------------------------------------------------------------------------------------------
section('регион, лимиты, health')
r = await guest.post('/region/resolve', { login: 'carol' })
const known = r.json
r = await guest.post('/region/resolve', { login: 'nobody_at_all' })
check(
  'region/resolve одинаков для любых логинов',
  r.status === 200 &&
    JSON.stringify(r.json) === JSON.stringify(known) &&
    typeof known.region === 'string' &&
    typeof known.apiBaseUrl === 'string' &&
    known.ttlSeconds === 3600,
  { known, other: r.json },
)
r = await c1.call('POST', '/auth/logout', undefined, { 'content-type': 'application/json' })
check('logout с пустым JSON-телом → ok', r.status === 200 && !c1.has('il_session'), r)
const flood = new Client()
let last
for (let i = 0; i < 31; i++) last = await flood.post('/auth/prelogin', { login: `flood-${i}` })
check(
  'prelogin: 31-й запрос за 5 минут с одного IP → 429 RATE_LIMITED',
  isError(last, 429, 'RATE_LIMITED'),
  last,
)
r = await guest.post('/auth/prelogin', { login: 'nul\u0000' })
check('NUL в JSON → 400 VALIDATION_ERROR (а не 500 из БД)', isError(r, 400, 'VALIDATION_ERROR'), r)
r = await new Client().post('/auth/register', {
  login: 'nul-user',
  authKey: newKey(),
  kdf: KDF,
  salt: newSalt(),
  passwordEnvelope: `${envelope('password')}\u0000`,
  recoveryEnvelope: envelope('recovery'),
  recoveryAuthKey: newKey(),
})
check('NUL внутри конверта → 400', isError(r, 400, 'VALIDATION_ERROR'), r)
r = await guest.get('/health')
check('health ok', r.status === 200 && r.json.db === 'ok', r)

// ---------------------------------------------------------------------------------------------
section('логи: без SQL-параметров и секретов')
const logSize = () => (existsSync(API_LOG_FILE) ? statSync(API_LOG_FILE).size : -1)
const logStart = logSize()
const poison = secret(`poison-${b64url(24)}`)
await sql.unsafe(
  `alter table objects add constraint e2e_no_poison check (ciphertext is distinct from '${poison}')`,
)
r = await l1.push([impact(randomUUID(), 0, poison)])
await sql.unsafe('alter table objects drop constraint e2e_no_poison')
check('ошибка БД → 500 INTERNAL_ERROR без подробностей', isError(r, 500, 'INTERNAL_ERROR'), r)
await sleep(300)
if (logStart < 0 || logSize() <= logStart) {
  console.log(`SKIP  лог API (${API_LOG_FILE}) не пишется — проверки логов пропущены`)
} else {
  const log = readFileSync(API_LOG_FILE, 'utf8')
  const tail = log.slice(logStart)
  check(
    'ошибка БД в логе: имя, SQLSTATE и ограничение — без текста запроса и параметров',
    tail.includes('DrizzleQueryError') &&
      tail.includes('23514') &&
      tail.includes('e2e_no_poison') &&
      !tail.includes(poison) &&
      !/insert into|Failed query|params:/i.test(tail),
    tail.slice(0, 1500),
  )
  const leaked = [...SECRETS].filter((value) => value && log.includes(value))
  check(
    `в логе нет ни одного секрета прогона (authKey, конверты, TOTP, секреты устройств): ${SECRETS.size} шт.`,
    leaked.length === 0,
    leaked.slice(0, 3),
  )
}
await sql.end()

console.log(`\n${passed} PASS, ${failed} FAIL`)
process.exit(failed ? 1 : 0)
