/** Fájlmentés és natív megosztás (Android: Filesystem + Share; böngésző: letöltés). */
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNative } from './http';

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error ?? new Error('Fájl olvasása sikertelen'));
    r.readAsDataURL(blob);
  });
}

export function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export interface SaveResult {
  uri: string;
  shared: boolean;
}

/**
 * Fájl mentése a gyorsítótárba és natív megosztás-lap megnyitása (Android).
 * Böngészőben letöltésként menti.
 */
export async function saveAndShare(
  filename: string,
  data: Blob | string,
  mime: string,
  title: string,
): Promise<SaveResult> {
  if (!isNative()) {
    const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return { uri: url, shared: false };
  }
  const base64 = typeof data === 'string' ? textToBase64(data) : await blobToBase64(data);
  const res = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
  try {
    await Share.share({ title, files: [res.uri], dialogTitle: title });
    return { uri: res.uri, shared: true };
  } catch (err) {
    // a felhasználó bezárta a megosztás-lapot – nem hiba
    if (err instanceof Error && /cancel/i.test(err.message)) return { uri: res.uri, shared: false };
    throw err;
  }
}
