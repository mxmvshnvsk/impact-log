// entitlements живут в shared (контракт клиента и сервера), тест оставлен здесь
import { canCreateImpact, PLAN_PROFILES, resolveEntitlements } from '@impact-log/shared'
import { describe, expect, it } from 'vitest'
import {
  buildCaptureUrl,
  createDraft,
  createImpact,
  draftToImpactInput,
  evidenceFromUrl,
  migrateImpact,
  parseLabelInput,
  readDraftFromHash,
  updateImpact,
} from '../src'

const base = {
  title: '  Ускорил сборку  ',
  occurredAt: '2026-03-12',
  impactScore: 4,
  categories: ['Платформа', 'платформа', ' CI '],
  labels: ['#Perf', 'perf', 'build speed'],
}

describe('Impact', () => {
  it('создание нормализует поля и ставит служебные', () => {
    const impact = createImpact(base, new Date('2026-03-12T10:00:00Z'))
    expect(impact.title).toBe('Ускорил сборку')
    expect(impact.categories).toEqual(['Платформа', 'CI'])
    expect(impact.labels).toEqual(['perf', 'build-speed'])
    expect(impact.schemaVersion).toBe(1)
    expect(impact.objectId).toMatch(/^[0-9a-f-]{36}$/)
    expect(impact.createdAt).toBe('2026-03-12T10:00:00.000Z')
  })

  it('обновление сохраняет objectId и createdAt', () => {
    const impact = createImpact(base, new Date('2026-03-12T10:00:00Z'))
    const next = updateImpact(
      impact,
      { ...base, title: 'Ускорил сборку в 3 раза' },
      new Date('2026-03-13T10:00:00Z'),
    )
    expect(next.objectId).toBe(impact.objectId)
    expect(next.createdAt).toBe(impact.createdAt)
    expect(next.updatedAt).toBe('2026-03-13T10:00:00.000Z')
  })

  it('валидация: оценка 1–5, заголовок обязателен', () => {
    expect(() => createImpact({ ...base, impactScore: 6 })).toThrow()
    expect(() => createImpact({ ...base, title: '   ' })).toThrow()
  })

  it('migrateImpact отвергает неизвестные/будущие версии', () => {
    const impact = createImpact(base)
    expect(migrateImpact(JSON.parse(JSON.stringify(impact)))).toEqual(impact)
    expect(() => migrateImpact({ ...impact, schemaVersion: 99 })).toThrow()
    expect(() => migrateImpact('nope')).toThrow()
  })

  it('разбор меток из строки', () => {
    expect(parseLabelInput('perf, #CI  frontend perf')).toEqual(['perf', 'ci', 'frontend'])
  })
})

describe('Evidence', () => {
  it('распознаёт PR, коммит, задачу Jira', () => {
    expect(evidenceFromUrl('https://github.com/org/repo/pull/42')).toMatchObject({
      kind: 'pr',
      ref: '#42',
    })
    expect(evidenceFromUrl('https://gitlab.com/o/r/-/merge_requests/7')).toMatchObject({
      kind: 'pr',
      ref: '#7',
    })
    expect(evidenceFromUrl('https://github.com/o/r/commit/0123456789abcdef')).toMatchObject({
      kind: 'commit',
      ref: '0123456789ab',
    })
    expect(evidenceFromUrl('https://x.atlassian.net/browse/PAY-123')).toMatchObject({
      kind: 'issue',
      ref: 'PAY-123',
    })
    expect(evidenceFromUrl('https://example.com')).toMatchObject({ kind: 'url' })
  })
})

describe('Capture Protocol', () => {
  it('черновик переживает handoff через URL-фрагмент', () => {
    const draft = createDraft({
      title: 'Ревью архитектуры платежей',
      labels: ['review'],
      evidence: [evidenceFromUrl('https://github.com/o/r/pull/1', 'PR #1')],
      source: { type: 'chrome', uri: 'https://github.com/o/r/pull/1' },
    })
    const url = buildCaptureUrl('https://impact-log.com/', draft)
    expect(url.startsWith('https://impact-log.com/capture#draft=')).toBe(true)
    const hash = url.slice(url.indexOf('#'))
    expect(readDraftFromHash(hash)).toEqual(draft)
    expect(readDraftFromHash('#draft=garbage')).toBeNull()
  })

  it('черновик → поля формы с разумными значениями', () => {
    const input = draftToImpactInput(createDraft({ title: 'x' }), new Date('2026-05-01T12:00:00'))
    expect(input).toMatchObject({
      title: 'x',
      impactScore: 3,
      occurredAt: '2026-05-01',
      labels: [],
    })
  })
})

describe('Entitlements', () => {
  it('пилот: без ограничений, через тот же резолвер', () => {
    const profile = resolveEntitlements()
    expect(profile.planId).toBe('PILOT')
    expect(canCreateImpact(profile, 10_000)).toEqual({ allowed: true })
  })

  it('FREE: ограничивает только создание сверх лимита активных записей', () => {
    const free = PLAN_PROFILES.FREE
    expect(canCreateImpact(free, 14)).toEqual({ allowed: true })
    expect(canCreateImpact(free, 15)).toEqual({
      allowed: false,
      reason: 'ACTIVE_IMPACT_LIMIT',
      limit: 15,
    })
  })

  it('безопасность и экспорт не бывают платными: синк и все capture доступны на FREE', () => {
    expect(PLAN_PROFILES.FREE.capabilities.encryptedSync).toBe(true)
    expect(PLAN_PROFILES.FREE.capabilities.reviewBuilder).toBe(true)
  })
})
