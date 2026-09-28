/**
 * Материал для регистрации тестового аккаунта с НАСТОЯЩИМИ ключами (для браузерной проверки синхронизации:
 * web откроет password-конверт паролем и получит MK). Сеть не нужна — только core/crypto.
 *
 *   cd apps/web && ../api/node_modules/.bin/tsx scripts/sync-account-material.ts <login> > account.json
 *
 * Вывод: { login, password, register: <тело POST /api/auth/register>, recoveryKey }.
 */
import { randomBytes } from 'node:crypto'
import {
  createRecoveryEnvelope,
  derivePasswordKeys,
  generateMasterKey,
  serializeEnvelope,
  toBase64Url,
  wrapMasterKey,
} from '@impact-log/core/crypto'
import { DEFAULT_KDF_PARAMS, KDF_SALT_BYTES } from '@impact-log/shared'

const login = process.argv[2] ?? `sync-${randomBytes(3).toString('hex')}`
const password = `pw-${randomBytes(9).toString('base64url')}`
const masterKey = generateMasterKey()
const salt = new Uint8Array(randomBytes(KDF_SALT_BYTES))
const { kek, authKey } = await derivePasswordKeys(password, salt, DEFAULT_KDF_PARAMS)
const passwordEnvelope = serializeEnvelope(
  await wrapMasterKey(masterKey, kek, { type: 'password', kdf: DEFAULT_KDF_PARAMS, salt }),
)
const recovery = await createRecoveryEnvelope(masterKey)
masterKey.fill(0)
kek.fill(0)

console.log(
  JSON.stringify({
    login,
    password,
    recoveryKey: recovery.recoveryKey,
    register: {
      login,
      authKey,
      kdf: DEFAULT_KDF_PARAMS,
      salt: toBase64Url(salt),
      passwordEnvelope,
      recoveryEnvelope: serializeEnvelope(recovery.envelope),
      recoveryAuthKey: recovery.authKey,
    },
  }),
)
