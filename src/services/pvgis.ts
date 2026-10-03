/**
 * PVGIS 5.3 PVcalc (JRC). Böngészőből (AJAX) tiltott, ezért natív HTTP-n hívjuk.
 * Két számítás: a terep dőlésével/tájolásával, és optimális dőléssel összehasonlításként.
 * Azimut-konvenció: 0 = dél, 90 = nyugat, −90 = kelet.
 */
import { ENDPOINTS, SOURCES } from '../config';
import { http, HttpError } from '../native/http';
import type { PvMetrics, PvVariant } from '../types';
import { Limiter } from './limiter';
import type { DataService } from './service';
import { NoDataError } from './service';

const limiter = new Limiter(2, 300);

export interface PvRequest {
  lat: number;
  lon: number;
  angleDeg: number;
  aspectDeg: number;
  lossPct: number;
}

interface PvgisJson {
  inputs?: {
    meteo_data?: { radiation_db?: string };
    mounting_system?: { fixed?: { slope?: { value?: number }; azimuth?: { value?: number } } };
  };
  outputs?: {
    monthly?: { fixed?: { month: number; E_m: number }[] };
    totals?: { fixed?: { E_y?: number; 'H(i)_y'?: number } };
  };
  message?: string;
}

export function pvgisUrl(r: PvRequest, optimal: boolean): string {
  const p = new URLSearchParams({
    lat: r.lat.toFixed(5),
    lon: r.lon.toFixed(5),
    peakpower: '1',
    loss: String(r.lossPct),
    mountingplace: 'free',
    outputformat: 'json',
  });
  if (optimal) p.set('optimalangles', '1');
  else {
    p.set('angle', r.angleDeg.toFixed(1));
    p.set('aspect', r.aspectDeg.toFixed(0));
  }
  return `${ENDPOINTS.pvgis}?${p.toString()}`;
}

export function parsePvgis(
  j: PvgisJson,
  fallbackAngle: number,
  fallbackAspect: number,
): { v: PvVariant; db: string } {
  const ey = j.outputs?.totals?.fixed?.E_y;
  if (typeof ey !== 'number') throw new Error('A PVGIS válaszából hiányzik az éves hozam (E_y).');
  const ms = j.inputs?.mounting_system?.fixed;
  return {
    v: {
      angleDeg: ms?.slope?.value ?? fallbackAngle,
      aspectDeg: ms?.azimuth?.value ?? fallbackAspect,
      yearlyKwhPerKwp: ey,
      yearlyIrradiationKwhM2: j.outputs?.totals?.fixed?.['H(i)_y'] ?? null,
      monthlyKwhPerKwp: (j.outputs?.monthly?.fixed ?? []).sort((a, b) => a.month - b.month).map((m) => m.E_m),
    },
    db: j.inputs?.meteo_data?.radiation_db ?? 'PVGIS',
  };
}

async function call(url: string, signal: AbortSignal): Promise<PvgisJson> {
  try {
    const res = await limiter.run(() =>
      http<PvgisJson>({ url, responseType: 'json', timeoutMs: 30000, signal }),
    );
    return res.data;
  } catch (err) {
    // a PVGIS 400-zal jelzi, ha a hely kívül esik az adatbázison (pl. tenger)
    if (err instanceof HttpError && err.status === 400)
      throw new NoDataError('A PVGIS erre a helyre nem ad sugárzási adatot.');
    throw err;
  }
}

export const pvgisService: DataService<PvRequest, PvMetrics> = {
  info: SOURCES.pvgis,
  ttlMs: 365 * 24 * 3600 * 1000,
  cacheKey: (r) =>
    `${r.lat.toFixed(3)},${r.lon.toFixed(3)},${r.angleDeg.toFixed(0)},${r.aspectDeg.toFixed(0)},${r.lossPct}`,
  async fetchLive(r, ctx) {
    const terrainJ = await call(pvgisUrl(r, false), ctx.signal);
    const t = parsePvgis(terrainJ, r.angleDeg, r.aspectDeg);
    let optimal: PvVariant | null;
    try {
      optimal = parsePvgis(await call(pvgisUrl(r, true), ctx.signal), 35, 0).v;
    } catch {
      optimal = null; // az összehasonlító érték opcionális
    }
    return { terrain: t.v, optimal, lossPct: r.lossPct, database: t.db };
  },
};
