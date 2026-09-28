import { CryptoError, generateMasterKey } from '@impact-log/core/crypto'
import {
  DEFAULT_PLAN,
  type EntitlementsResponse,
  type RegisterStartResponse,
  type SessionResponse,
} from '@impact-log/shared'
import { computed, ref, shallowRef } from 'vue'
import {
  assertKdfWithinLimits,
  compareKdfPin,
  createPasswordMaterial,
  createRecoveryMaterial,
  defaultDeviceLabel,
  deriveLoginKeys,
  encryptDeviceLabel,
  isSignedOutError,
  type KdfChange,
  openPasswordEnvelopeWithKek,
  openRecoveryEnvelopeText,
  type PasswordMaterial,
  pickEnvelope,
  type RecoveryMaterial,
  recoveryAuthKeyFrom,
  sameKey,
  unlockWithPassword,
} from '@/account'
import { accountApi, devicesApi } from '@/api/account'
import { authApi } from '@/api/auth'
import { ApiError } from '@/api/http'
import { i18n } from '@/i18n'
import { broadcast } from '@/utils/vaultChannel'
import { countActive, type KdfPin, masterKeyBytes, type VaultAccount } from '@/vault'
import { useEntitlements } from './useEntitlements'
import { useSession } from './useSession'
import { useSync } from './useSync'
import { useVault } from './useVault'

/*
 * Аккаунт синхронизации поверх локального хранилища (ADR-0006, ADR-0008). Все криптографические
 * флоу — здесь и в src/account: пароль и Master Key (MK) никогда не уходят на сервер,
 * пароль не сохраняется нигде, сырые ключи обнуляются сразу после использования.
 */

/** Этап долгой операции — для индикатора прогресса */
export type AccountStage = 'kdf' | 'verify' | 'server' | 'unlock' | 'vault'
export type StageReporter = (stage: AccountStage) => void

/**
 * Пользователь отказался продолжать (слияние записей с аккаунтом, изменившиеся параметры KDF).
 * Не ошибка: экран просто возвращается к началу, локальные данные не тронуты.
 */
export class AccountFlowCancelledError extends Error {
  constructor() {
    super('CANCELLED')
    this.name = 'AccountFlowCancelledError'
  }
}

/** На устройстве есть записи, а хранилище не принадлежит аккаунту, в который входим */
export type MergeRequest = { count: number; login: string }
export type MergeChoice = 'merge' | 'wipe' | 'cancel'
export type MergeDecider = (request: MergeRequest) => Promise<MergeChoice>
/** Параметры KDF на сервере стали слабее или сменилась соль — продолжать ли вход */
export type KdfChangeConfirm = (change: KdfChange) => Promise<boolean>

export type LoginOptions = {
  onStage?: StageReporter
  /** Без него изменившиеся параметры KDF останавливают вход */
  confirmKdfChange?: KdfChangeConfirm
  /** Без него чужие для аккаунта локальные записи останавливают вход (никакого молчаливого слияния) */
  decideMerge?: MergeDecider
}

/** Как хранилище переходит на MK аккаунта */
type AdoptionPlan = 'create' | 'same' | 'merge' | 'wipe'

/** Вход прошёл пароль, ждём код 2FA. KEK держим в замыкании до ответа, затем обнуляем */
export type PendingSecondFactor = {
  verify(code: string, remember: boolean, onStage?: StageReporter): Promise<void>
  cancel(): void
}

export type PreparedRegistration = {
  /** Новый MK аккаунта — только в памяти до перехода хранилища на него; обнулить через discard */
  masterKey: Uint8Array
  recovery: RecoveryMaterial
  password: PasswordMaterial
}

export type PendingRecovery = {
  /**
   * Новый пароль → recovery/complete. Возвращает authKey нового пароля (для перевыпуска 2FA/ключа).
   * Если на устройстве чужие для аккаунта записи — сначала спрашивает decideMerge (до запроса к серверу).
   */
  complete(
    newPassword: string,
    options?: { onStage?: StageReporter; decideMerge?: MergeDecider },
  ): Promise<{ currentAuthKey: string }>
  cancel(): void
}

const usage = shallowRef<EntitlementsResponse['usage'] | null>(null)
/** Логин только что удалённого аккаунта: экран настроек предлагает оставить или стереть локальные записи */
const deletedLogin = ref<string | null>(null)
const noop: StageReporter = () => {}

export function useAccount() {
  const vault = useVault()
  const session = useSession()
  const sync = useSync()
  const entitlements = useEntitlements()

  const account = vault.account
  /** Аккаунт привязан, но сессии на сервере нет — нужно «Войти снова» */
  const needsSignIn = computed(
    () =>
      account.value !== null &&
      (session.state.value === 'expired' || sync.status.value === 'signed-out'),
  )
  const mode = computed<'local' | 'signed-in' | 'signed-out'>(() => {
    if (!account.value) return 'local'
    return needsSignIn.value ? 'signed-out' : 'signed-in'
  })

  /** 401 в запросах аккаунта — сессия закончилась */
  function handle(error: unknown): never {
    if (isSignedOutError(error)) session.markExpired()
    throw error
  }

  async function refreshEntitlements(): Promise<EntitlementsResponse | null> {
    try {
      const response = await accountApi.entitlements()
      entitlements.setProfile(response.profile)
      usage.value = response.usage
      return response
    } catch (error) {
      if (isSignedOutError(error)) session.markExpired()
      return null
    }
  }

  /** Первое название устройства — из userAgent (зашифровано MK). Лучшее усилие: ошибки не мешают входу */
  async function labelDeviceIfNeeded(deviceId: string) {
    try {
      const { devices } = await devicesApi.list()
      const current = devices.find((device) => device.deviceId === deviceId)
      if (!current || current.encryptedLabel) return
      const label = defaultDeviceLabel(deviceId, i18n.global.t('account.devices.defaultName'))
      await devicesApi.rename(deviceId, await encryptDeviceLabel(deviceId, label))
    } catch (error) {
      console.warn('[account] cannot label device', error)
    }
  }

  /** Сессия прежнего аккаунта больше не нужна (вход не удался или отменён) — синхронизация как была */
  function resumeSync() {
    if (account.value) void sync.start().catch(() => {})
  }

  /** deviceId и секрет этого устройства — только для того же логина, к которому привязано хранилище */
  function knownDevice(loginName: string): { deviceId?: string; deviceSecret?: string } {
    const current = account.value
    if (!current || current.login !== loginName) return {}
    return current.deviceSecret
      ? { deviceId: current.deviceId, deviceSecret: current.deviceSecret }
      : { deviceId: current.deviceId }
  }

  /** Привязка из ответа сервера; секрет устройства приходит только при создании устройства */
  function accountFrom(response: SessionResponse): VaultAccount {
    const { user, deviceId } = response
    const previous = account.value
    const deviceSecret =
      response.deviceSecret ??
      (previous && previous.userId === user.id && previous.deviceId === deviceId
        ? previous.deviceSecret
        : undefined)
    return {
      userId: user.id,
      accountId: user.accountId,
      login: user.login,
      deviceId,
      ...(deviceSecret ? { deviceSecret } : {}),
    }
  }

  /** Сессия, тариф, название устройства, синхронизация — после того как хранилище привязано */
  async function activateSession(response: SessionResponse) {
    const { user, deviceId } = response
    session.setSession(response)
    entitlements.setPlan(user.plan)
    broadcast({ type: 'vault-changed' })
    await Promise.all([labelDeviceIfNeeded(deviceId), refreshEntitlements()])
    void sync.start().catch((error) => console.warn('[account] sync start failed', error))
  }

  /**
   * MK аккаунта против локального хранилища: нет хранилища — создаём; MK тот же (устройство уже было в
   * этом аккаунте) — только привязка; иначе на устройстве записи другого хранилища. При регистрации они
   * переносятся в новый аккаунт (ради этого её и включают); при входе/восстановлении — только по явному
   * выбору пользователя (decide): добавить в аккаунт, стереть с устройства или отменить вход.
   */
  async function planAdoption(
    masterKey: Uint8Array,
    login: string,
    decide: MergeDecider | 'merge' | undefined,
  ): Promise<AdoptionPlan> {
    if (!vault.hasVault.value) return 'create'
    const local = masterKeyBytes()
    const same = sameKey(local, masterKey)
    local.fill(0)
    if (same) return 'same'
    if (decide === 'merge') return 'merge'
    const count = await countActive('impact').catch(() => 0)
    // Записей нет — сливать нечего (служебные остатки переносит/откладывает в карантин сама смена MK)
    if (count === 0) return 'merge'
    if (!decide) throw new AccountFlowCancelledError()
    const choice = await decide({ count, login })
    if (choice === 'cancel') throw new AccountFlowCancelledError()
    return choice
  }

  /**
   * Хранилище переходит на MK аккаунта и привязывается к нему — одной транзакцией (adoptMasterKey);
   * затем сессия. MK обнуляется в любом случае.
   */
  async function finish(
    masterKey: Uint8Array,
    response: SessionResponse,
    kdfPin: KdfPin,
    plan: AdoptionPlan,
  ) {
    try {
      const binding = accountFrom(response)
      if (plan === 'create') {
        await vault.create(masterKey.slice(), { account: binding, kdfPin })
      } else if (plan === 'same') {
        await vault.bind(binding, kdfPin)
      } else {
        // Смена MK переписывает все объекты — синхронизация в это время не должна работать
        sync.stop()
        const result = await vault.adoptMasterKey(masterKey, {
          account: binding,
          kdfPin,
          discardLocal: plan === 'wipe',
        })
        if (result.quarantined > 0) {
          console.warn('[account] undecryptable objects moved to quarantine', result.quarantined)
        }
      }
    } finally {
      masterKey.fill(0)
    }
    await activateSession(response)
  }

  // ---------- регистрация (включение синхронизации) ----------

  /**
   * Шаг 1 регистрации (до отправки): новый MK, Recovery Key и password-конверт. У нового аккаунта
   * всегда свой MK (даже если хранилище раньше было в другом аккаунте); в хранилище переходим на него
   * только после ответа сервера. Пароль нужен только здесь — дальше храним лишь выведенный материал.
   */
  async function prepareRegistration(
    password: string,
    onStage: StageReporter = noop,
  ): Promise<PreparedRegistration> {
    const masterKey = generateMasterKey()
    onStage('kdf')
    const [recovery, passwordMaterial] = await Promise.all([
      createRecoveryMaterial(masterKey),
      createPasswordMaterial(password, masterKey),
    ])
    return { masterKey, recovery, password: passwordMaterial }
  }

  /**
   * Шаг 2: отправка → TOTP для приложения. Хранилище пока не трогаем: новый MK живёт только в памяти
   * (prepared) до подтверждения кода. Закрыли вкладку на этом шаге — локальные записи целы под прежним MK.
   */
  async function startRegistration(
    login: string,
    prepared: PreparedRegistration,
    onStage: StageReporter = noop,
  ): Promise<RegisterStartResponse> {
    onStage('server')
    return authApi.register({
      login,
      authKey: prepared.password.authKey,
      kdf: prepared.password.kdf,
      salt: prepared.password.salt,
      passwordEnvelope: prepared.password.passwordEnvelope,
      recoveryEnvelope: prepared.recovery.recoveryEnvelope,
      recoveryAuthKey: prepared.recovery.recoveryAuthKey,
    })
  }

  /** Шаг 3: код 2FA → аккаунт активен; только теперь хранилище переходит на MK нового аккаунта */
  async function confirmRegistration(
    code: string,
    remember: boolean,
    prepared: PreparedRegistration,
    onStage: StageReporter = noop,
  ) {
    onStage('server')
    const response = await authApi.confirmRegistration({ code, remember })
    onStage('vault')
    const masterKey = prepared.masterKey.slice()
    const kdfPin: KdfPin = {
      login: response.user.login,
      kdf: prepared.password.kdf,
      salt: prepared.password.salt,
    }
    let plan: AdoptionPlan
    try {
      plan = await planAdoption(masterKey, response.user.login, 'merge')
    } catch (error) {
      masterKey.fill(0)
      throw error
    }
    await finish(masterKey, response, kdfPin, plan)
  }

  // ---------- вход ----------

  async function unlockAfterLogin(
    kek: Uint8Array,
    response: SessionResponse,
    kdfPin: KdfPin,
    options: LoginOptions,
    onStage: StageReporter,
  ) {
    onStage('unlock')
    let masterKey: Uint8Array
    try {
      const { envelopes } = await accountApi.keys()
      masterKey = await openPasswordEnvelopeWithKek(pickEnvelope(envelopes, 'password'), kek)
    } finally {
      kek.fill(0)
    }
    let plan: AdoptionPlan
    try {
      plan = await planAdoption(masterKey, response.user.login, options.decideMerge)
    } catch (error) {
      masterKey.fill(0)
      // Отказались от входа: только что открытую сессию закрываем, хранилище не тронуто
      if (error instanceof AccountFlowCancelledError) await serverLogout({}).catch(() => {})
      throw error
    }
    onStage('vault')
    await finish(masterKey, response, kdfPin, plan)
  }

  /**
   * Логин + пароль → либо сразу вход (доверенное устройство), либо ожидание кода 2FA.
   * TOFU: если параметры KDF этого логина на сервере стали слабее или сменилась соль (а на этом
   * устройстве пароль не меняли), без явного подтверждения (confirmKdfChange) ключи не выводим.
   */
  async function login(
    loginName: string,
    password: string,
    options: LoginOptions = {},
  ): Promise<PendingSecondFactor | null> {
    const onStage = options.onStage ?? noop
    onStage('server')
    const prelogin = await authApi.prelogin(loginName)
    assertKdfWithinLimits(prelogin.kdf)
    const change = compareKdfPin(vault.kdfPin.value, loginName, prelogin)
    if (change && !(await options.confirmKdfChange?.(change))) throw new AccountFlowCancelledError()
    onStage('kdf')
    const { kek, authKey } = await deriveLoginKeys(password, prelogin)
    const kdfPin: KdfPin = { login: loginName, kdf: prelogin.kdf, salt: prelogin.salt }
    // Вход меняет cookie сессии — синхронизация прежней сессии останавливается ДО запроса
    sync.stop()
    try {
      onStage('server')
      const result = await authApi.login({ login: loginName, authKey, ...knownDevice(loginName) })
      if (result.next === 'done') {
        await unlockAfterLogin(
          kek,
          { user: result.user, deviceId: result.deviceId },
          kdfPin,
          options,
          onStage,
        )
        return null
      }
    } catch (error) {
      kek.fill(0)
      resumeSync()
      throw error
    }

    let used = false
    return {
      async verify(code, remember, stage = noop) {
        if (used) throw new ApiError(401, 'SESSION_EXPIRED')
        stage('server')
        const response = await authApi.verifySecondFactor({ code, remember })
        used = true
        try {
          await unlockAfterLogin(kek, response, kdfPin, options, stage)
        } catch (error) {
          resumeSync()
          throw error
        }
      },
      cancel() {
        const pending = !used
        used = true
        kek.fill(0)
        if (pending) resumeSync()
      },
    }
  }

  // ---------- восстановление по Recovery Key ----------

  async function beginRecovery(
    loginName: string,
    recoveryKey: string,
    onStage: StageReporter = noop,
  ): Promise<PendingRecovery> {
    onStage('verify')
    const recoveryAuthKey = await recoveryAuthKeyFrom(recoveryKey)
    onStage('server')
    const { recoveryEnvelope } = await authApi.recoveryBegin({ login: loginName, recoveryAuthKey })
    onStage('unlock')
    const masterKey = await openRecoveryEnvelopeText(recoveryEnvelope, recoveryKey)
    let done = false
    return {
      async complete(newPassword, options = {}) {
        if (done) throw new ApiError(401, 'SESSION_EXPIRED')
        const stage = options.onStage ?? noop
        // Что делать с локальными записями — спрашиваем до запроса к серверу: отмена ничего не меняет
        const plan = await planAdoption(masterKey, loginName, options.decideMerge)
        stage('kdf')
        const password = await createPasswordMaterial(newPassword, masterKey)
        stage('server')
        // Восстановление выдаёт новую cookie сессии — прежняя синхронизация останавливается до запроса
        sync.stop()
        let response: SessionResponse
        try {
          response = await authApi.recoveryComplete({
            authKey: password.authKey,
            kdf: password.kdf,
            salt: password.salt,
            passwordEnvelope: password.passwordEnvelope,
            ...knownDevice(loginName),
          })
        } catch (error) {
          resumeSync()
          throw error
        }
        done = true
        stage('vault')
        await finish(
          masterKey,
          response,
          { login: response.user.login, kdf: password.kdf, salt: password.salt },
          plan,
        )
        return { currentAuthKey: password.authKey }
      },
      cancel() {
        done = true
        masterKey.fill(0)
      },
    }
  }

  // ---------- действия с повторным подтверждением паролем ----------

  /** Текущий пароль → authKey (проверяется на клиенте по password-конверту) и MK аккаунта */
  async function unlock(password: string, onStage: StageReporter = noop) {
    onStage('server')
    const { envelopes } = await accountApi.keys().catch(handle)
    onStage('verify')
    return unlockWithPassword(pickEnvelope(envelopes, 'password'), password)
  }

  async function currentAuthKey(password: string, onStage: StageReporter = noop) {
    const { authKey, masterKey } = await unlock(password, onStage)
    masterKey.fill(0)
    return authKey
  }

  async function changePassword(
    currentPassword: string,
    newPassword: string,
    onStage: StageReporter = noop,
  ) {
    const { authKey, masterKey } = await unlock(currentPassword, onStage)
    try {
      onStage('kdf')
      const next = await createPasswordMaterial(newPassword, masterKey)
      onStage('server')
      await accountApi.changePassword({ currentAuthKey: authKey, ...next }).catch(handle)
      // Новые соль и параметры KDF — это наша смена, при следующем входе предупреждать не о чем
      const current = account.value
      if (current) {
        await vault
          .setKdfPin({ login: current.login, kdf: next.kdf, salt: next.salt })
          .catch((error) => console.warn('[account] cannot store kdf parameters', error))
      }
    } finally {
      masterKey.fill(0)
    }
  }

  /** Новый комплект Recovery Key для MK этого хранилища (показывается до отправки на сервер) */
  async function prepareRecoveryKey(): Promise<RecoveryMaterial> {
    const masterKey = masterKeyBytes()
    try {
      return await createRecoveryMaterial(masterKey)
    } finally {
      masterKey.fill(0)
    }
  }

  /** Отправить новый Recovery Key: подтверждение паролем или authKey, только что выведенным при восстановлении */
  async function rotateRecoveryKey(
    material: RecoveryMaterial,
    confirm: { password: string } | { currentAuthKey: string },
    onStage: StageReporter = noop,
  ) {
    let authKey: string
    if ('password' in confirm) {
      const unlocked = await unlock(confirm.password, onStage)
      const local = masterKeyBytes()
      const same = sameKey(local, unlocked.masterKey)
      local.fill(0)
      unlocked.masterKey.fill(0)
      // Комплект собран для MK хранилища — он обязан совпадать с MK аккаунта
      if (!same) throw new CryptoError('master key mismatch')
      authKey = unlocked.authKey
    } else {
      authKey = confirm.currentAuthKey
    }
    onStage('server')
    await accountApi
      .rotateRecoveryKey({
        currentAuthKey: authKey,
        recoveryEnvelope: material.recoveryEnvelope,
        recoveryAuthKey: material.recoveryAuthKey,
      })
      .catch(handle)
  }

  /**
   * Перевыпуск 2FA: пароль + текущий код; в сессии, созданной восстановлением по Recovery Key, — только
   * authKey нового пароля (старого телефона у пользователя может не быть)
   */
  async function startTotpRotation(
    confirm: { password: string; code: string } | { currentAuthKey: string },
    onStage: StageReporter = noop,
  ): Promise<RegisterStartResponse> {
    if ('password' in confirm) {
      const authKey = await currentAuthKey(confirm.password, onStage)
      onStage('server')
      return accountApi.startTotpRotation(authKey, confirm.code).catch(handle)
    }
    onStage('server')
    return accountApi.startTotpRotation(confirm.currentAuthKey).catch(handle)
  }

  async function confirmTotpRotation(code: string) {
    await accountApi.confirmTotpRotation(code).catch(handle)
  }

  // ---------- выход и удаление ----------

  async function serverLogout(options: { everywhere?: boolean; forgetDevice?: boolean }) {
    try {
      await authApi.logout(options)
    } catch (error) {
      // Сессии уже нет — выходить не из чего; остальные ошибки (сеть) показываем
      if (!(error instanceof ApiError && error.status === 401)) throw error
    }
  }

  /** Выход на этом устройстве: keep — хранилище остаётся локальным; wipe — стираем устройство */
  async function logout(options: { wipe: boolean }) {
    sync.stop()
    try {
      // Стираем устройство — снимаем с него и «Запомнить этот компьютер»
      await serverLogout({ forgetDevice: options.wipe })
    } catch (error) {
      if (account.value) void sync.start().catch(() => {})
      throw error
    }
    session.clear()
    usage.value = null
    entitlements.setPlan(DEFAULT_PLAN)
    if (options.wipe) {
      await vault.destroy()
    } else {
      await vault.setAccount(null)
      broadcast({ type: 'vault-changed' })
    }
  }

  /** «Выйти везде»: все сессии и доверенные устройства сброшены; это устройство остаётся привязанным */
  async function logoutEverywhere() {
    await serverLogout({ everywhere: true })
    sync.stop()
    session.markExpired()
  }

  /** Удаление аккаунта (пароль + код 2FA). Локальные записи остаются на устройстве как локальное хранилище */
  async function deleteAccount(password: string, code: string, onStage: StageReporter = noop) {
    const authKey = await currentAuthKey(password, onStage)
    onStage('server')
    sync.stop()
    try {
      await accountApi.deleteAccount({ currentAuthKey: authKey, code })
    } catch (error) {
      void sync.start().catch(() => {})
      handle(error)
    }
    deletedLogin.value = account.value?.login ?? ''
    session.clear()
    usage.value = null
    entitlements.setPlan(DEFAULT_PLAN)
    await vault.setAccount(null)
    broadcast({ type: 'vault-changed' })
  }

  /** Стереть локальные данные этого устройства (после выхода/удаления аккаунта) */
  async function wipeDevice() {
    sync.stop()
    await vault.destroy()
    deletedLogin.value = null
  }

  return {
    account,
    mode,
    needsSignIn,
    session,
    usage,
    refreshEntitlements,
    prepareRegistration,
    startRegistration,
    confirmRegistration,
    login,
    beginRecovery,
    currentAuthKey,
    changePassword,
    prepareRecoveryKey,
    rotateRecoveryKey,
    startTotpRotation,
    confirmTotpRotation,
    logout,
    logoutEverywhere,
    deleteAccount,
    deletedLogin,
    wipeDevice,
  }
}
