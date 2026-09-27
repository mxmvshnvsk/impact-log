/**
 * Обезличивает IP для логов (ADR-0001): у IPv4 обнуляется последний октет,
 * у IPv6 остаются первые 3 группы (/48).
 */
export function maskIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined
  if (ip.includes('.')) {
    return ip.replace(/\.\d+$/, '.0')
  }
  return `${expandIpv6(ip).slice(0, 3).join(':')}::`
}

/** Разворачивает сокращённую запись IPv6 ("2001:db8::1") в 8 групп */
function expandIpv6(ip: string): string[] {
  const [head = '', tail = ''] = ip.split('::')
  const headGroups = head ? head.split(':') : []
  const tailGroups = tail ? tail.split(':') : []
  const zeros = Array<string>(Math.max(0, 8 - headGroups.length - tailGroups.length)).fill('0')
  return ip.includes('::') ? [...headGroups, ...zeros, ...tailGroups] : headGroups
}
