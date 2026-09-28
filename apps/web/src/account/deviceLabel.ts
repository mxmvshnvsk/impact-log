import { decryptJson, encryptJson } from '@impact-log/core/crypto'
import { masterCryptoKey } from '@/vault'

/*
 * Названия устройств шифруются MK (как записи): сервер видит только шифротекст.
 * AAD привязывает шифротекст к deviceId — название одного устройства нельзя подставить другому.
 */
const KIND = 'device-label'
export const DEVICE_LABEL_MAX = 60

export async function encryptDeviceLabel(deviceId: string, label: string): Promise<string> {
  return encryptJson(masterCryptoKey(), { objectId: deviceId, kind: KIND }, { label })
}

/** null — названия нет или его не удалось расшифровать (другой MK, повреждение) */
export async function decryptDeviceLabel(
  deviceId: string,
  encryptedLabel: string | null,
): Promise<string | null> {
  if (!encryptedLabel) return null
  try {
    const value = await decryptJson(
      masterCryptoKey(),
      { objectId: deviceId, kind: KIND },
      encryptedLabel,
    )
    const label = (value as { label?: unknown } | null)?.label
    return typeof label === 'string' ? label : null
  } catch {
    return null
  }
}

const BROWSERS: [RegExp, string][] = [
  [/YaBrowser\//, 'Yandex Browser'],
  [/Edg(A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Vivaldi\//, 'Vivaldi'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
]

const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, 'iOS'],
  [/iPad/, 'iPadOS'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Windows/, 'Windows'],
  [/Linux/, 'Linux'],
]

/** Короткий суффикс из deviceId (последние 4 hex-символа, случайные и в UUIDv4, и в UUIDv7) */
export function deviceSuffix(deviceId: string): string {
  return deviceId
    .replace(/[^0-9a-f]/gi, '')
    .slice(-4)
    .toLowerCase()
}

/**
 * Название по умолчанию: «Chrome · macOS · 7f3a». Суффикс из deviceId различает одинаковые браузеры
 * (два «Chrome · Linux» в списке устройств). Неизвестный userAgent — `fallback` (переведённое «Браузер»).
 * Только локально — на сервер уходит шифротекст.
 */
export function defaultDeviceLabel(
  deviceId: string,
  fallback: string,
  userAgent: string = navigator.userAgent,
): string {
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1]
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1]
  const name = [browser, system].filter(Boolean).join(' · ') || fallback
  const suffix = deviceSuffix(deviceId)
  return suffix ? `${name} · ${suffix}` : name
}
