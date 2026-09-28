import { z } from 'zod'

/**
 * Entitlements-first, billing-later (ADR-0005 §11.2, ADR-0009). Любая возможность, которая может различаться
 * по тарифу, выражается через профиль. Пилот — просто ещё один профиль, а не `if (pilot)` в коде.
 * Безопасность, восстановление, экспорт и доступ к существующим данным тарифом НЕ ограничиваются никогда.
 */
export const PLAN_IDS = ['PILOT', 'FREE', 'PRO'] as const
export type PlanId = (typeof PLAN_IDS)[number]

/** null — без ограничения */
const limit = z.number().int().nonnegative().nullable()

export const entitlementProfileSchema = z.object({
  planId: z.enum(PLAN_IDS),
  revision: z.number().int().positive(),
  effectiveFrom: z.string(),
  limits: z.object({
    maxActiveImpacts: limit,
    maxAttachmentBytes: limit,
    maxDevices: limit,
    /** Сумма размеров шифротекстов объектов синхронизации на сервере, байт */
    maxStorageBytes: limit,
    /** Живые (не удалённые) объекты синхронизации на сервере; tombstone'ы не считаются */
    maxObjects: limit,
  }),
  capabilities: z.object({
    encryptedSync: z.boolean(),
    multiDevice: z.boolean(),
    attachments: z.boolean(),
    advancedAnalytics: z.boolean(),
    reviewBuilder: z.boolean(),
    localAI: z.boolean(),
    cloudAI: z.boolean(),
    chromeCapture: z.boolean(),
    cliCapture: z.boolean(),
    vscodeCapture: z.boolean(),
  }),
})
export type EntitlementProfile = z.infer<typeof entitlementProfileSchema>
export type Capability = keyof EntitlementProfile['capabilities']

const ALL_ON: EntitlementProfile['capabilities'] = {
  encryptedSync: true,
  multiDevice: true,
  attachments: true,
  advancedAnalytics: true,
  reviewBuilder: true,
  localAI: true,
  cloudAI: false,
  chromeCapture: true,
  cliCapture: true,
  vscodeCapture: true,
}

const MiB = 1024 * 1024
const GiB = 1024 * MiB

/**
 * Конфигурация профилей — данные, а не константы, разбросанные по клиентам.
 * FREE/PRO — черновик для экспериментов (ADR-0009): числа и набор — не архитектурные константы.
 */
export const PLAN_PROFILES: Record<PlanId, EntitlementProfile> = {
  PILOT: {
    planId: 'PILOT',
    revision: 2,
    effectiveFrom: '2026-09-29',
    limits: {
      maxActiveImpacts: null,
      maxAttachmentBytes: null,
      maxDevices: null,
      // Потолок против злоупотреблений есть даже у пилота
      maxStorageBytes: 512 * MiB,
      maxObjects: 100_000,
    },
    capabilities: ALL_ON,
  },
  FREE: {
    planId: 'FREE',
    revision: 2,
    effectiveFrom: '2026-09-29',
    limits: {
      maxActiveImpacts: 15,
      maxAttachmentBytes: 50 * MiB,
      maxDevices: 2,
      maxStorageBytes: 50 * MiB,
      maxObjects: 1_000,
    },
    capabilities: { ...ALL_ON, advancedAnalytics: false, localAI: false },
  },
  PRO: {
    planId: 'PRO',
    revision: 2,
    effectiveFrom: '2026-09-29',
    limits: {
      maxActiveImpacts: null,
      maxAttachmentBytes: 5 * GiB,
      maxDevices: null,
      maxStorageBytes: 5 * GiB,
      maxObjects: 1_000_000,
    },
    capabilities: ALL_ON,
  },
}

/** Тариф, который получают новые аккаунты и локальные хранилища во время пилота */
export const DEFAULT_PLAN: PlanId = 'PILOT'

/** Коммерческое состояние аккаунта (видно серверу, отделено от зашифрованного контента) */
export type CommercialState = { planId: PlanId }

/** Entitlement Resolver: коммерческое состояние → профиль возможностей */
export function resolveEntitlements(state: CommercialState = { planId: DEFAULT_PLAN }) {
  return PLAN_PROFILES[state.planId]
}

export type QuotaDecision =
  | { allowed: true }
  | { allowed: false; reason: 'ACTIVE_IMPACT_LIMIT'; limit: number }

/**
 * Квота ограничивает только СОЗДАНИЕ новых записей. Чтение/редактирование/удаление/экспорт — всегда.
 * Считаем активные (не удалённые) записи, а не «создано за всё время» — удаление освобождает место.
 */
export function canCreateImpact(profile: EntitlementProfile, activeImpacts: number): QuotaDecision {
  const max = profile.limits.maxActiveImpacts
  if (max === null || activeImpacts < max) return { allowed: true }
  return { allowed: false, reason: 'ACTIVE_IMPACT_LIMIT', limit: max }
}

/** Серверное хранилище синхронизации: сколько байт шифротекста и живых объектов (без tombstone'ов) */
export type StorageUsage = { storageBytes: number; objects: number }

export type StorageQuotaDecision =
  | { allowed: true }
  | { allowed: false; reason: 'STORAGE_LIMIT' | 'OBJECT_LIMIT'; limit: number }

/**
 * Можно ли записать изменение, которое добавит `addBytes` байт шифротекста и `addObjects` живых объектов
 * Ограничивается только рост: уменьшение и удаление (addBytes ≤ 0, addObjects ≤ 0) разрешены всегда.
 */
export function canStoreObjects(
  profile: EntitlementProfile,
  usage: StorageUsage,
  delta: { addBytes: number; addObjects: number },
): StorageQuotaDecision {
  const { maxObjects, maxStorageBytes } = profile.limits
  if (
    delta.addObjects > 0 &&
    maxObjects !== null &&
    usage.objects + delta.addObjects > maxObjects
  ) {
    return { allowed: false, reason: 'OBJECT_LIMIT', limit: maxObjects }
  }
  if (
    delta.addBytes > 0 &&
    maxStorageBytes !== null &&
    usage.storageBytes + delta.addBytes > maxStorageBytes
  ) {
    return { allowed: false, reason: 'STORAGE_LIMIT', limit: maxStorageBytes }
  }
  return { allowed: true }
}

export function hasCapability(profile: EntitlementProfile, capability: Capability): boolean {
  return profile.capabilities[capability]
}
