/** Helymeghatározás (Capacitor Geolocation – böngészőben a Web API-t használja). */
import { Geolocation, type Position } from '@capacitor/geolocation';

export interface Fix {
  lon: number;
  lat: number;
  accuracyM: number;
  altitudeM: number | null;
  headingDeg: number | null;
  time: number;
}

export function toFix(p: Position): Fix {
  return {
    lon: p.coords.longitude,
    lat: p.coords.latitude,
    accuracyM: p.coords.accuracy,
    altitudeM: p.coords.altitude ?? null,
    headingDeg: p.coords.heading ?? null,
    time: p.timestamp,
  };
}

export type GeoPermission = 'granted' | 'denied' | 'prompt';

export async function locationPermission(): Promise<GeoPermission> {
  try {
    const s = await Geolocation.checkPermissions();
    return s.location === 'granted' ? 'granted' : s.location === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'prompt';
  }
}

export async function requestLocation(): Promise<GeoPermission> {
  try {
    const s = await Geolocation.requestPermissions({ permissions: ['location'] });
    return s.location === 'granted' ? 'granted' : s.location === 'denied' ? 'denied' : 'prompt';
  } catch {
    // böngészőben a requestPermissions nem támogatott – a getCurrentPosition kéri az engedélyt
    return 'prompt';
  }
}

export async function currentFix(timeoutMs = 15000): Promise<Fix> {
  const p = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: timeoutMs,
    maximumAge: 2000,
  });
  return toFix(p);
}

/**
 * Folyamatos helykövetés. Időtúllépésnél (nincs új fix) nem jelez hibát – csak ha 30 s-ig semmi
 * nem jön –, és ugyanazt a hibát legfeljebb 20 s-onként egyszer adja tovább.
 */
export async function watchFixes(
  onFix: (f: Fix) => void,
  onError: (msg: string) => void,
): Promise<() => void> {
  let lastFix = Date.now();
  let lastMsg = '';
  let lastMsgAt = 0;
  const id = await Geolocation.watchPosition(
    { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 },
    (p, err) => {
      if (p) {
        lastFix = Date.now();
        onFix(toFix(p));
        return;
      }
      if (!err) return;
      if (geoErrorCode(err) === 3 && Date.now() - lastFix < 30000) return;
      const msg = describeGeoError(err);
      if (msg === lastMsg && Date.now() - lastMsgAt < 20000) return;
      lastMsg = msg;
      lastMsgAt = Date.now();
      onError(msg);
    },
  );
  return () => void Geolocation.clearWatch({ id });
}

function geoErrorCode(err: unknown): number | null {
  return typeof err === 'object' &&
    err &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'number'
    ? (err as { code: number }).code
    : null;
}

export function describeGeoError(err: unknown): string {
  const code = geoErrorCode(err);
  if (code === 1) return describeGeoError('permission denied');
  if (code === 2) return describeGeoError('location provider unavailable');
  if (code === 3) return describeGeoError('timeout');
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err);
  if (/denied|permission/i.test(msg))
    return 'A helymeghatározás nincs engedélyezve. Engedélyezd a Teleklátó számára: Beállítások → Alkalmazások → Teleklátó → Engedélyek → Hely.';
  if (/disabled|location services|provider/i.test(msg))
    return 'A telefon helymeghatározása ki van kapcsolva. Kapcsold be a gyorsbeállításokban (Hely / GPS).';
  if (/timeout|timed out/i.test(msg))
    return 'Nem érkezett GPS-jel időben. Menj szabad ég alá, várj néhány másodpercet, és próbáld újra.';
  return msg.trim()
    ? `Helymeghatározási hiba: ${msg}`
    : 'Helymeghatározási hiba. Ellenőrizd, hogy a helymeghatározás be van-e kapcsolva, majd próbáld újra.';
}

/** Súlyozott átlag (1/pontosság²) – pontrögzítéshez több fix-ből */
export function averageFixes(fixes: Fix[]): Fix | null {
  if (!fixes.length) return null;
  let w = 0;
  let lon = 0;
  let lat = 0;
  for (const f of fixes) {
    const wi = 1 / Math.max(1, f.accuracyM) ** 2;
    w += wi;
    lon += f.lon * wi;
    lat += f.lat * wi;
  }
  const best = Math.min(...fixes.map((f) => f.accuracyM));
  // n független mérés átlaga: pontosság ~ legjobb / sqrt(n) (alsó korlát a legjobb fele)
  const acc = Math.max(best / 2, best / Math.sqrt(fixes.length));
  return { lon: lon / w, lat: lat / w, accuracyM: acc, altitudeM: null, headingDeg: null, time: Date.now() };
}
