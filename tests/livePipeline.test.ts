import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeArrayBuffer } from 'geotiff';
import { HttpError, setHttpImpl, type HttpRequest, type HttpResult } from '../src/native/http';
import { cacheResetMemory } from '../src/storage/cache';
import { resetCogCache } from '../src/services/cog';
import { createLiveProvider } from '../src/services/liveProvider';
import { runAnalysis } from '../src/analysis/pipeline';
import { DEFAULT_RULES } from '../src/analysis/rules';
import { toWgs, toEov } from '../src/analysis/eov';
import type { Parcel } from '../src/types';

const N = 600; // 6"-es rács
function tiff(fn: (lon: number, lat: number) => number, lon0: number, lat0: number): ArrayBuffer {
  const values = new Float32Array(N * N);
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) values[r * N + c] = fn(lon0 + (c + 0.5) / N, lat0 + 1 - (r + 0.5) / N);
  return writeArrayBuffer(values, {
    width: N,
    height: N,
    ModelPixelScale: [1 / N, 1 / N, 0],
    ModelTiepoint: [0, 0, 0, lon0, lat0 + 1, 0],
    GeographicTypeGeoKey: 4326,
    GTModelTypeGeoKey: 2,
    GTRasterTypeGeoKey: 1,
    BitsPerSample: [32],
    SampleFormat: [3],
    GDAL_NODATA: '-9999',
  });
}

function serve(buf: ArrayBuffer, req: HttpRequest): HttpResult<unknown> {
  const m = /bytes=(\d+)-(\d+)/.exec(req.headers?.Range ?? req.headers?.range ?? '');
  if (!m) return { status: 200, data: buf, headers: {} };
  const s = Number(m[1]);
  const e = Math.min(Number(m[2]), buf.byteLength - 1);
  return {
    status: 206,
    data: buf.slice(s, e + 1),
    headers: { 'content-range': `bytes ${s}-${e}/${buf.byteLength}` },
  };
}

// Telek: 100 × 80 m EOV-téglalap a 47°É / 19°K csempében
const c0 = toEov([19.5, 47.5]);
const ringEov: [number, number][] = [
  [c0[0], c0[1]],
  [c0[0] + 100, c0[1]],
  [c0[0] + 100, c0[1] + 80],
  [c0[0], c0[1] + 80],
];
const ring = ringEov.map((p) => toWgs(p));

function parcel(): Parcel {
  return {
    id: 'live-1',
    name: 'Élő teszt',
    note: '',
    tags: [],
    geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]!]] },
    source: 'draw',
    mode: 'live',
    createdAt: '',
    updatedAt: '',
    analysis: null,
    photos: [],
    profileLine: null,
  };
}

// DEM: kelet felé emelkedik ~8 %-kal (→ nyugati kitettség)
const demBuf = tiff((lon) => 150 + (lon - 19) * 111320 * Math.cos((47.5 * Math.PI) / 180) * 0.08, 19, 47);
// Árvíz: a telek nyugati felén 0,6 m mélység
const westHalf = toWgs([c0[0] + 50, c0[1]])[0];
const floodBuf = tiff((lon) => (lon < westHalf ? 0.6 : -9999), 19, 47);

let requests: string[] = [];

beforeEach(() => {
  cacheResetMemory();
  resetCogCache();
  requests = [];
  setHttpImpl(async <T>(req: HttpRequest): Promise<HttpResult<T>> => {
    requests.push(req.url);
    const u = req.url;
    if (u.includes('copernicus-dem-30m')) return serve(demBuf, req) as HttpResult<T>;
    if (u.includes('jeodpp.jrc.ec.europa.eu')) return serve(floodBuf, req) as HttpResult<T>;
    if (u.includes('overpass-api.de'))
      return {
        status: 200,
        headers: {},
        data: {
          elements: [
            {
              type: 'way',
              id: 1,
              tags: { highway: 'tertiary', name: 'Teszt út' },
              geometry: [toWgs([c0[0] - 500, c0[1] - 40]), toWgs([c0[0] + 500, c0[1] - 40])].map(
                ([lon, lat]) => ({ lat, lon }),
              ),
            },
            {
              type: 'way',
              id: 2,
              tags: { power: 'line', voltage: '22000' },
              geometry: [toWgs([c0[0] + 50, c0[1] - 300]), toWgs([c0[0] + 50, c0[1] + 300])].map(
                ([lon, lat]) => ({ lat, lon }),
              ),
            },
          ],
        } as T,
      };
    if (u.includes('Natura2000Sites/MapServer?f=json'))
      return {
        status: 200,
        headers: {},
        data: {
          layers: [
            { id: 0, name: 'Habitats Directive Sites (pSCI, SCI or SAC)' },
            { id: 1, name: 'Birds Directive Sites (SPA)' },
          ],
        } as T,
      };
    if (/Natura2000Sites\/MapServer\/[01]\?f=json/.test(u))
      return { status: 200, headers: {}, data: { id: 0, geometryType: 'esriGeometryPolygon' } as T };
    if (u.includes('/query?') && u.endsWith('f=geojson')) {
      // a telek keleti 25 %-át lefedő Natura terület
      const z = [
        [c0[0] + 75, c0[1] - 50],
        [c0[0] + 300, c0[1] - 50],
        [c0[0] + 300, c0[1] + 200],
        [c0[0] + 75, c0[1] + 200],
        [c0[0] + 75, c0[1] - 50],
      ].map((p) => toWgs(p as [number, number]));
      return {
        status: 200,
        headers: {},
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { SITECODE: 'HUTEST001', SITENAME: 'Tesztrét' },
              geometry: { type: 'Polygon', coordinates: [z] },
            },
          ],
        } as T,
      };
    }
    if (u.includes('re.jrc.ec.europa.eu')) {
      const opt = u.includes('optimalangles=1');
      return {
        status: 200,
        headers: {},
        data: {
          inputs: {
            meteo_data: { radiation_db: 'PVGIS-SARAH3' },
            mounting_system: {
              fixed: { slope: { value: opt ? 37 : 4.6 }, azimuth: { value: opt ? 1 : 90 } },
            },
          },
          outputs: { totals: { fixed: { E_y: opt ? 1350 : 1180, 'H(i)_y': 1500 } }, monthly: { fixed: [] } },
        } as T,
      };
    }
    throw new HttpError('http', 'HTTP 404', 404);
  });
});
afterEach(() => setHttpImpl(null));

describe('élő elemzési folyamat (mockolt szolgáltatásokkal)', () => {
  it('minden forrás bekötve, a számítások az élő adatokból jönnek', async () => {
    const r = await runAnalysis(parcel(), {
      provider: createLiveProvider(),
      rules: DEFAULT_RULES,
      online: true,
      pvLossPct: 14,
    });
    expect(r.steps.filter((s) => s.status !== 'ok')).toEqual([]);

    // domborzat: 8 % lejtés nyugati kitettséggel
    expect(r.terrain.status).toBe('ok');
    if (r.terrain.status === 'ok') {
      expect(r.terrain.data.meanSlopePct).toBeGreaterThan(7);
      expect(r.terrain.data.meanSlopePct).toBeLessThan(9);
      expect(r.terrain.data.dominantAspect).toBe('Ny');
    }
    // árvíz: a nyugati fél (~50 %)
    expect(r.flood.status === 'ok' && r.flood.data.overlapPct).toBeGreaterThan(35);
    expect(r.flood.status === 'ok' && r.flood.data.overlapPct).toBeLessThan(65);
    // Natura: keleti 25 %
    if (r.natura.status === 'ok') {
      expect(r.natura.data.overlapPct).toBeCloseTo(25, 0);
      expect(r.natura.data.names[0]).toContain('HUTEST001');
    }
    // közelség
    if (r.proximity.status === 'ok') {
      expect(r.proximity.data.road.distanceM).toBeCloseTo(40, 0);
      expect(r.proximity.data.powerLine.crosses).toBe(true);
    }
    // PVGIS: a terep szerinti hívás a domborzatból kapott dőlést és tájolást kapja
    const pvCall = requests.find((u) => u.includes('re.jrc') && !u.includes('optimalangles'))!;
    const q = new URL(pvCall).searchParams;
    expect(Number(q.get('angle'))).toBeGreaterThan(4);
    expect(Number(q.get('aspect'))).toBeGreaterThan(60); // nyugat ≈ +90
    expect(r.pv.status === 'ok' && r.pv.data.optimal?.yearlyKwhPerKwp).toBe(1350);
    expect(r.attributions.some((a) => a.includes('Copernicus'))).toBe(true);
    expect(r.score.overall).toBe('red'); // Natura + árvíz
  }, 30000);

  it('offline, cache nélkül: a hálózati lépések kimaradnak, a geometria megvan', async () => {
    const r = await runAnalysis(parcel(), {
      provider: createLiveProvider(),
      rules: DEFAULT_RULES,
      online: false,
      pvLossPct: 14,
    });
    expect(r.offlineSkipped.length).toBeGreaterThanOrEqual(4);
    expect(r.geometry.areaM2).toBeCloseTo(8000, 0);
    expect(requests).toHaveLength(0);
  });

  it('online elemzés után offline is újraelemezhető a gyorsítótárból', async () => {
    await runAnalysis(parcel(), {
      provider: createLiveProvider(),
      rules: DEFAULT_RULES,
      online: true,
      pvLossPct: 14,
    });
    const n = requests.length;
    const r = await runAnalysis(parcel(), {
      provider: createLiveProvider(),
      rules: DEFAULT_RULES,
      online: false,
      pvLossPct: 14,
    });
    expect(requests.length).toBe(n);
    expect(r.offlineSkipped).toEqual([]);
    expect(r.terrain.status === 'ok' && r.terrain.cached).toBe(true);
  }, 30000);
});
