/** Rendszersávok stílusa és az Android vissza gomb kezelése. */
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { isNative } from './http';

export async function applySystemBars(dark: boolean, demo: boolean): Promise<void> {
  if (!isNative()) return;
  try {
    // demó módban a felső sáv lila → világos ikonok
    await SystemBars.setStyle({ style: dark || demo ? SystemBarsStyle.Dark : SystemBarsStyle.Light });
  } catch {
    /* régebbi rendszeren nem támogatott */
  }
}

/**
 * Vissza gomb: a kezelők sorban kapják meg; ha egyik sem kezeli (false), az app a háttérbe kerül.
 */
export function onBackButton(handlers: (() => boolean)[]): void {
  if (!isNative()) return;
  void App.addListener('backButton', () => {
    for (const h of handlers) if (h()) return;
    void App.minimizeApp();
  });
}
