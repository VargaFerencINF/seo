/** Hálózati állapot (Capacitor Network plugin, böngészőben navigator.onLine). */
import { Network } from '@capacitor/network';

export async function isOnline(): Promise<boolean> {
  try {
    const s = await Network.getStatus();
    return s.connected;
  } catch {
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  }
}

export function onNetworkChange(fn: (online: boolean) => void): void {
  void Network.addListener('networkStatusChange', (s) => fn(s.connected)).catch(() => {
    window.addEventListener('online', () => fn(true));
    window.addEventListener('offline', () => fn(false));
  });
}
