import {
  type Capability,
  DEFAULT_PLAN,
  type EntitlementProfile,
  type PlanId,
  resolveEntitlements,
} from '@impact-log/shared'
import { computed, readonly, shallowRef } from 'vue'

/*
 * Профиль возможностей (ADR-0009). Без аккаунта — профиль по умолчанию (в пилоте PILOT, без лимитов);
 * с аккаунтом — план с сервера (GET /api/entitlements), сервер же и применяет квоты при синхронизации.
 * Экраны не знают про тарифы: только profile.limits / can(capability).
 */
const profile = shallowRef<EntitlementProfile>(resolveEntitlements({ planId: DEFAULT_PLAN }))

export function useEntitlements() {
  function setPlan(planId: PlanId) {
    profile.value = resolveEntitlements({ planId })
  }

  function setProfile(next: EntitlementProfile) {
    profile.value = next
  }

  function can(capability: Capability): boolean {
    return profile.value.capabilities[capability]
  }

  return {
    profile: readonly(profile),
    plan: computed(() => profile.value.planId),
    maxActiveImpacts: computed(() => profile.value.limits.maxActiveImpacts),
    can,
    setPlan,
    setProfile,
  }
}
