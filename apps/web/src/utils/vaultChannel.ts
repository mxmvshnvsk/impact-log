/*
 * Связь вкладок одного браузера: изменения в хранилище в одной вкладке — перечитать в остальных.
 * Передаются только сигналы, никаких данных.
 */
export type VaultSignal =
  | { type: 'impacts-changed' }
  | { type: 'vault-changed' }
  | { type: 'vault-destroyed' }

const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('impact-log')

export function broadcast(signal: VaultSignal): void {
  channel?.postMessage(signal)
}

export function onVaultSignal(listener: (signal: VaultSignal) => void): () => void {
  if (!channel) return () => {}
  const handler = (event: MessageEvent<VaultSignal>) => listener(event.data)
  channel.addEventListener('message', handler)
  return () => channel.removeEventListener('message', handler)
}
