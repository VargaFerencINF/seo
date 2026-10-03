/** Android: megosztott / megnyitott fájl fogadása (SharedFilePlugin, lásd android/…/SharedFilePlugin.java). */
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isNative } from './http';

export interface SharedFile {
  name?: string;
  text?: string;
  error?: string;
}

interface SharedFilePluginApi {
  getPending(): Promise<SharedFile>;
  addListener(event: 'sharedFile', fn: (f: SharedFile) => void): Promise<PluginListenerHandle>;
}

const SharedFilePlugin = registerPlugin<SharedFilePluginApi>('SharedFile');

export async function listenSharedFiles(onFile: (f: SharedFile) => void): Promise<void> {
  if (!isNative()) return;
  try {
    const p = await SharedFilePlugin.getPending();
    if (p.text || p.error) onFile(p);
    await SharedFilePlugin.addListener('sharedFile', onFile);
  } catch (err) {
    console.warn('SharedFile plugin nem elérhető', err);
  }
}
