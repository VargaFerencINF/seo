/**
 * Címkeresés Nominatimmal (OSM). Szabályzat: max. 1 kérés/s, azonosító User-Agent (natívon),
 * nincs gépelés közbeni (autocomplete) keresés – csak a keresés gombra/Enterre, eredmény-cache.
 */
import { ENDPOINTS, SOURCES } from '../config';
import { http } from '../native/http';
import { cacheGet, cacheSet } from '../storage/cache';
import { Limiter } from './limiter';
import { describeHttpError } from '../native/http';

const limiter = new Limiter(1, 1100);

export interface GeocodeResult {
  label: string;
  lon: number;
  lat: number;
  /** [nyugat, dél, kelet, észak] */
  bbox: [number, number, number, number] | null;
  kind: string;
}

interface NominatimItem {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: [string, string, string, string];
  type?: string;
  addresstype?: string;
}

export function parseNominatim(items: NominatimItem[]): GeocodeResult[] {
  return items.map((it) => {
    const bb = it.boundingbox?.map(Number);
    return {
      label: it.display_name,
      lon: Number(it.lon),
      lat: Number(it.lat),
      // a Nominatim sorrendje: [dél, észak, nyugat, kelet]
      bbox: bb && bb.length === 4 ? [bb[2]!, bb[0]!, bb[3]!, bb[1]!] : null,
      kind: it.addresstype ?? it.type ?? '',
    };
  });
}

export async function geocode(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const key = `nominatim:${q.toLowerCase()}`;
  const hit = await cacheGet<GeocodeResult[]>(key);
  if (hit && !hit.expired) return hit.value;
  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    countrycodes: 'hu',
    limit: '6',
    'accept-language': 'hu',
  });
  try {
    const res = await limiter.run(() =>
      http<NominatimItem[]>({
        url: `${ENDPOINTS.nominatim}/search?${params.toString()}`,
        responseType: 'json',
        timeoutMs: 15000,
        ...(signal ? { signal } : {}),
      }),
    );
    const out = parseNominatim(res.data);
    await cacheSet(key, out, 30 * 24 * 3600 * 1000);
    return out;
  } catch (err) {
    if (hit) return hit.value;
    const d = describeHttpError(err, SOURCES.nominatim.label);
    throw new Error(`${d.message} ${d.hint}`);
  }
}
