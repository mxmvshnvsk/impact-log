import { isIPv4, isIPv6 } from 'node:net'

/**
 * Обезличивает IP для логов (ADR-0001): у IPv4 обнуляется последний октет,
 * у IPv6 остаются первые 3 группы (/48).
 */
export function maskIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined
  const v4 = asIpv4(ip)
  if (v4) return v4.replace(/\.\d+$/, '.0')
  if (!isIPv6(ip)) return undefined
  return `${expandIpv6(ip).slice(0, 3).join(':')}::`
}

/**
 * Ключ лимита частоты по IP: IPv4 (и IPv4-mapped IPv6) — адрес целиком; IPv6 — префикс /64.
 * Абоненту обычно выдаётся целая /64, так что перебор адресов внутри неё не должен обходить лимит.
 */
export function rateLimitKey(ip: string): string {
  const v4 = asIpv4(ip)
  if (v4) return v4
  if (!isIPv6(ip)) return ip
  return `${expandIpv6(ip).slice(0, 4).join(':')}::/64`
}

/** IPv4 как есть, `::ffff:a.b.c.d` → `a.b.c.d`, иначе null */
function asIpv4(ip: string): string | null {
  if (isIPv4(ip)) return ip
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)?.[1]
  return mapped && isIPv4(mapped) ? mapped : null
}

/** Разворачивает IPv6 ("2001:db8::1", в т.ч. с IPv4 в хвосте и zone id) в 8 групп без ведущих нулей */
function expandIpv6(ip: string): string[] {
  let address = ip.split('%')[0] ?? ''
  const tailV4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address)
  if (tailV4) {
    const [a, b, c, d] = tailV4.slice(1).map(Number) as [number, number, number, number]
    const hex = `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
    address = address.slice(0, tailV4.index) + hex
  }
  const [head = '', tail = ''] = address.split('::')
  const headGroups = head ? head.split(':') : []
  const tailGroups = tail ? tail.split(':') : []
  const zeros = Array<string>(Math.max(0, 8 - headGroups.length - tailGroups.length)).fill('0')
  const groups = address.includes('::') ? [...headGroups, ...zeros, ...tailGroups] : headGroups
  return groups.map((group) => Number.parseInt(group || '0', 16).toString(16))
}
