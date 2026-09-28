/** Ошибка расшифровки/проверки — наружу без подробностей (не раскрываем, что именно не так) */
export class CryptoError extends Error {
  constructor(message = 'decryption failed') {
    super(message)
    this.name = 'CryptoError'
  }
}
