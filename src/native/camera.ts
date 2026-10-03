/** Terepi fotó készítése (Capacitor Camera 8 takePhoto), mentés az app saját tárhelyére. */
import { Camera } from '@capacitor/camera';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { blobToBase64 } from './files';
import { isNative } from './http';

export interface CapturedImage {
  /** tartós URI (natívon file://, böngészőben data URL) */
  uri: string;
  thumb: string;
}

export async function makeThumb(blob: Blob, max = 480, quality = 0.72): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL('image/jpeg', quality);
}

export async function cameraPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (!isNative()) return 'granted';
  try {
    const s = await Camera.requestPermissions({ permissions: ['camera'] });
    return s.camera === 'granted' || s.camera === 'limited'
      ? 'granted'
      : s.camera === 'denied'
        ? 'denied'
        : 'prompt';
  } catch {
    return 'prompt';
  }
}

export async function capturePhoto(id: string): Promise<CapturedImage | null> {
  const res = await Camera.takePhoto({
    quality: 82,
    targetWidth: 2048,
    targetHeight: 2048,
    correctOrientation: true,
    saveToGallery: false,
    webUseInput: true,
  });
  const src = res.webPath ?? (res.thumbnail ? `data:image/jpeg;base64,${res.thumbnail}` : null);
  if (!src) return null;
  const blob = await (await fetch(src)).blob();
  const thumb = await makeThumb(blob);
  if (!isNative()) {
    // böngészőben kisebb változatot tárolunk
    return { uri: await makeThumb(blob, 1600, 0.8), thumb };
  }
  const path = `photos/${id}.jpg`;
  await Filesystem.writeFile({
    path,
    data: await blobToBase64(blob),
    directory: Directory.Data,
    recursive: true,
  });
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
  return { uri, thumb };
}

/** Megjeleníthető forrás egy tárolt fotó URI-jából */
export function photoSrc(uri: string): string {
  return uri.startsWith('data:') ? uri : Capacitor.convertFileSrc(uri);
}

export async function deletePhotoFile(uri: string): Promise<void> {
  if (!isNative() || uri.startsWith('data:')) return;
  try {
    await Filesystem.deleteFile({ path: uri });
  } catch {
    /* már nincs meg */
  }
}
