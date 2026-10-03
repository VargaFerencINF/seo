import { Preferences } from '@capacitor/preferences';
import { createStore } from './store';
import { DEFAULT_RULES, cloneRules } from '../analysis/rules';
import type { RuleSet } from '../types';

export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  theme: ThemePref;
  demoMode: boolean;
  companyName: string;
  /** cég logó data URL (PNG/JPEG), üres = nincs */
  companyLogo: string;
  rules: RuleSet;
  /** GPS-bejárás: automatikus pontrögzítés ennyi méterenként (0 = kikapcsolva) */
  gpsAutoStepM: number;
  /** GPS-bejárás: e fölötti pontosságnál (m) figyelmeztetünk */
  gpsWarnAccuracyM: number;
  /** PVGIS rendszerveszteség % */
  pvLossPct: number;
  /** ortofotó réteg a térképen */
  orthoLayer: boolean;
  /** a felhasználó látta-e már az engedély-magyarázatokat */
  explainedLocation: boolean;
  explainedCamera: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  demoMode: false,
  companyName: '',
  companyLogo: '',
  rules: cloneRules(DEFAULT_RULES),
  gpsAutoStepM: 0,
  gpsWarnAccuracyM: 10,
  pvLossPct: 14,
  orthoLayer: false,
  explainedLocation: false,
  explainedCamera: false,
};

const KEY = 'teleklato.settings.v1';

export const settings = createStore<Settings>(DEFAULT_SETTINGS);

export async function loadSettings(): Promise<void> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (value) {
      const parsed = JSON.parse(value) as Partial<Settings>;
      settings.set({
        ...DEFAULT_SETTINGS,
        ...parsed,
        rules: { ...cloneRules(DEFAULT_RULES), ...(parsed.rules ?? {}) },
      });
    }
  } catch (err) {
    console.warn('Beállítások betöltése sikertelen, alapértékekkel indulunk', err);
  }
  settings.subscribe((value) => {
    void Preferences.set({ key: KEY, value: JSON.stringify(value) });
  });
}

export function applyTheme(pref: ThemePref): void {
  const dark =
    pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function isDarkTheme(): boolean {
  return document.documentElement.dataset.theme === 'dark';
}
