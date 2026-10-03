import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeArrayBuffer } from 'geotiff';
import { HttpError, setHttpImpl, type HttpRequest, type HttpResult } from '../src/native/http';
import { cacheResetMemory } from '../src/storage/cache';
import { readWindow, resetCogCache } from '../src/services/cog';
import { copernicusTileName, copernicusTileUrl, demService, tilesForBbox, mosaic } from '../src/services/dem';
import { buildQuery, parseOverpass, overpassService } from '../src/services/overpass';
import { parsePvgis, pvgisUrl, pvgisService } from '../src/services/pvgis';
import { esriRingsToGeoJson, normalizeProps, queryArcgis, discoverLayer } from '../src/services/natura';
import { parseNominatim, geocode } from '../src/services/geocode';
import { runService, type DataService } from '../src/services/service';
import { SOURCES } from '../src/config';
import { toEov } from '../src/analysis/eov';

type Handler = (req: HttpRequest) => HttpResult<unknown> | Promise<HttpResult<unknown>>;
let calls: HttpRequest[] = [];

function mockHttp(handler: Handler): void {
  calls = [];
  setHttpImpl(async <T>(req: HttpRequest) => {
    calls.push(req);
    return (await handler(req)) as HttpResult<T>;
  });
}

const ctx = { signal: new AbortController().signal, online: true };

beforeEach(() => {
  cacheResetMemory();
  resetCogCache();
});
afterEach(() => setHttpImpl(null));

/** Range kéréseket kiszolgáló „szerver” egy memóriabeli fájlhoz */
function rangeServer(buf: ArrayBuffer): Handler {
  return (req): HttpResult<unknown> => {
    const range = req.headers?.range ?? req.headers?.Range;
    if (!range) return { status: 200, data: buf, headers: {} };
    const m = /bytes=(\d+)-(\d+)/.exec(range)!;
    const start = Number(m[1]);
    const end = Math.min(Number(m[2]), buf.byteLength - 1);
    return {
      status: 206,
      data: buf.slice(start, end + 1),
      headers: { 'content-range': `bytes ${start}-${end}/${buf.byteLength}`, 'content-type': 'image/tiff' },
    };
  };
}

/** 1°×1° szintetikus „DEM” GeoTIFF: z = 100 + 10·(oszlop) */
function syntheticTiff(lon0: number, lat0: number, n = 60): ArrayBuffer {
  const values = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) values[r * n + c] = 100 + 10 * c;
  return writeArrayBuffer(values, {
    width: n,
    height: n,
    ModelPixelScale: [1 / n, 1 / n, 0],
    ModelTiepoint: [0, 0, 0, lon0, lat0 + 1, 0],
    GeographicTypeGeoKey: 4326,
    GTModelTypeGeoKey: 2,
    GTRasterTypeGeoKey: 1,
    BitsPerSample: [32],
    SampleFormat: [3],
    GDAL_NODATA: '-9999',
  });
}

describe('Copernicus DEM (COG range request)', () => {
  it('csempenevek és URL', () => {
    expect(copernicusTileName(47, 19)).toBe('Copernicus_DSM_COG_10_N47_00_E019_00_DEM');
    expect(copernicusTileUrl(46, 8)).toMatch(
      /copernicus-dem-30m\.s3\.amazonaws\.com\/Copernicus_DSM_COG_10_N46_00_E008_00_DEM\/Copernicus_DSM_COG_10_N46_00_E008_00_DEM\.tif$/,
    );
    expect(tilesForBbox([18.9, 46.9, 19.1, 47.1])).toHaveLength(4);
  });

  it('ablak beolvasása range kérésekkel, helyes georeferálással', async () => {
    const buf = syntheticTiff(19, 47);
    mockHttp(rangeServer(buf));
    const r = await readWindow('https://example.test/dem.tif', [19.2, 47.4, 19.3, 47.5]);
    expect(calls.every((c) => /bytes=/.test(c.headers?.Range ?? c.headers?.range ?? ''))).toBe(true);
    expect(r.width).toBeGreaterThanOrEqual(6);
    expect(r.dLon).toBeCloseTo(1 / 60, 9);
    // az ablak a kért bbox-ot lefedi, és a pixelközéppontok a rácsra esnek
    expect(r.lon0 - r.dLon / 2).toBeLessThanOrEqual(19.2 + 1e-9);
    expect(r.lon0 + (r.width - 0.5) * r.dLon).toBeGreaterThanOrEqual(19.3 - 1e-9);
    const col = Math.round((r.lon0 - 19) * 60 - 0.5);
    expect(r.lon0).toBeCloseTo(19 + (col + 0.5) / 60, 9);
    expect(r.values[0]).toBe(100 + 10 * col);
    expect(r.lat0 + r.dLat / 2).toBeGreaterThanOrEqual(47.5 - 1e-9);
  });

  it('demService: gyorsítótár – második hívás hálózat nélkül', async () => {
    const buf = syntheticTiff(19, 47);
    mockHttp(rangeServer(buf));
    const a = await runService(demService, { bbox: [19.2, 47.4, 19.21, 47.41] }, ctx);
    expect(a.status).toBe('ok');
    const n = calls.length;
    const b = await runService(demService, { bbox: [19.2, 47.4, 19.21, 47.41] }, { ...ctx, online: false });
    expect(b.status).toBe('ok');
    expect(b.status === 'ok' && b.cached).toBe(true);
    expect(calls.length).toBe(n);
  });

  it('hiányzó csempe (404) → kezelt hibaállapot, nem hamis adat', async () => {
    mockHttp(() => {
      throw new HttpError('http', 'HTTP 404', 404);
    });
    const o = await runService(demService, { bbox: [19.2, 47.4, 19.21, 47.41] }, ctx);
    expect(['unavailable', 'error']).toContain(o.status);
  });

  it('csempék összefűzése', () => {
    const a = {
      lon0: 18.95,
      lat0: 47.05,
      dLon: 0.1,
      dLat: 0.1,
      width: 1,
      height: 1,
      values: new Float32Array([1]),
      noData: null,
    };
    const b = {
      lon0: 19.05,
      lat0: 47.05,
      dLon: 0.1,
      dLat: 0.1,
      width: 1,
      height: 1,
      values: new Float32Array([2]),
      noData: null,
    };
    const m = mosaic([a, b], [18.9, 47.0, 19.1, 47.1]);
    expect(m.width).toBe(2);
    expect(Array.from(m.values.slice(0, 2))).toEqual([1, 2]);
  });
});

describe('Overpass', () => {
  it('lekérdezés: bbox sorrend (dél, nyugat, észak, kelet), kizárt úttípusok', () => {
    const q = buildQuery([19, 47, 19.1, 47.1], [19.04, 47.04, 19.06, 47.06]);
    expect(q).toContain('(47.000000,19.000000,47.100000,19.100000)');
    expect(q).toMatch(/highway"!~"\^\(footway\|path/);
    expect(q).toContain('out tags center 3000;');
  });

  it('válasz feldolgozása: út, légvezeték feszültséggel, földkábel, vízfolyás, épület', () => {
    const f = parseOverpass({
      elements: [
        {
          type: 'way',
          id: 1,
          tags: { highway: 'residential', name: 'Kossuth utca' },
          geometry: [
            { lat: 47, lon: 19 },
            { lat: 47.001, lon: 19 },
          ],
        },
        {
          type: 'way',
          id: 2,
          tags: { power: 'line', voltage: '22000' },
          geometry: [
            { lat: 47, lon: 19 },
            { lat: 47.01, lon: 19.01 },
          ],
        },
        {
          type: 'way',
          id: 3,
          tags: { power: 'cable' },
          geometry: [
            { lat: 47, lon: 19 },
            { lat: 47.01, lon: 19.01 },
          ],
        },
        {
          type: 'way',
          id: 4,
          tags: { waterway: 'stream', name: 'Malom-patak' },
          geometry: [
            { lat: 47, lon: 19 },
            { lat: 47.01, lon: 19 },
          ],
        },
        { type: 'way', id: 5, tags: { building: 'yes' }, center: { lat: 47.0005, lon: 19.0005 } },
      ],
    });
    expect(f.roads[0]!.name).toBe('Kossuth utca (lakóutca)');
    expect(f.powerLines.map((p) => p.name)).toEqual(['légvezeték 22 kV', 'földkábel']);
    expect(f.powerLines[1]!.kind).toBe('cable');
    expect(f.waterways[0]!.name).toBe('Malom-patak');
    expect(f.buildings).toHaveLength(1);
    expect(f.buildings[0]!.point[0]).toBeCloseTo(toEov([19.0005, 47.0005])[0], 3);
  });

  it('POST kérés form-urlencoded törzzsel; 429 után újrapróbál', async () => {
    let n = 0;
    mockHttp(() => {
      n++;
      if (n === 1) throw new HttpError('http', 'HTTP 429', 429);
      return { status: 200, data: { elements: [] }, headers: {} };
    });
    const o = await runService(overpassService, { bbox: [19, 47, 19.001, 47.001] }, ctx);
    expect(o.status).toBe('ok');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toMatch(/^data=/);
  }, 15000);

  it('offline, cache nélkül → kihagyott lépés, magyar indoklással', async () => {
    mockHttp(() => {
      throw new Error('nem hívható');
    });
    const o = await runService(
      overpassService,
      { bbox: [20, 47, 20.001, 47.001] },
      { ...ctx, online: false },
    );
    expect(o.status).toBe('skipped');
    expect(o.status === 'skipped' && o.reason).toMatch(/Nincs hálózati kapcsolat/);
    expect(calls).toHaveLength(0);
  });
});

describe('PVGIS', () => {
  it('URL paraméterek: terep szerinti és optimális változat', () => {
    const r = { lat: 47.5, lon: 19.05, angleDeg: 4.2, aspectDeg: -20, lossPct: 14 };
    const u = new URL(pvgisUrl(r, false));
    expect(u.origin + u.pathname).toBe('https://re.jrc.ec.europa.eu/api/v5_3/PVcalc');
    expect(u.searchParams.get('angle')).toBe('4.2');
    expect(u.searchParams.get('aspect')).toBe('-20');
    expect(u.searchParams.get('outputformat')).toBe('json');
    expect(new URL(pvgisUrl(r, true)).searchParams.get('optimalangles')).toBe('1');
  });

  it('válasz feldolgozása', () => {
    const j = {
      inputs: {
        meteo_data: { radiation_db: 'PVGIS-SARAH3' },
        mounting_system: { fixed: { slope: { value: 36 }, azimuth: { value: 1 } } },
      },
      outputs: {
        monthly: {
          fixed: [
            { month: 2, E_m: 60 },
            { month: 1, E_m: 40 },
          ],
        },
        totals: { fixed: { E_y: 1342.5, 'H(i)_y': 1610.2 } },
      },
    };
    const { v, db } = parsePvgis(j, 0, 0);
    expect(v.yearlyKwhPerKwp).toBe(1342.5);
    expect(v.angleDeg).toBe(36);
    expect(v.monthlyKwhPerKwp).toEqual([40, 60]);
    expect(db).toBe('PVGIS-SARAH3');
  });

  it('a hely kívül esik (400) → „nem elérhető”, nem hiba', async () => {
    mockHttp(() => {
      throw new HttpError('http', 'HTTP 400', 400);
    });
    const o = await runService(
      pvgisService,
      { lat: 0, lon: -30, angleDeg: 0, aspectDeg: 0, lossPct: 14 },
      ctx,
    );
    expect(o.status).toBe('unavailable');
  });
});

describe('Natura 2000 (EEA ArcGIS)', () => {
  it('Esri gyűrűk → GeoJSON: külső (óramutató szerint) + lyuk', () => {
    const outer = [
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0],
      [0, 0],
    ];
    const hole = [
      [2, 2],
      [4, 2],
      [4, 4],
      [2, 4],
      [2, 2],
    ];
    const g = esriRingsToGeoJson([outer, hole]);
    expect(g.type).toBe('Polygon');
    expect(g.type === 'Polygon' && g.coordinates.length).toBe(2);
    const two = esriRingsToGeoJson([outer, outer.map(([x, y]) => [x! + 20, y!])]);
    expect(two.type).toBe('MultiPolygon');
  });

  it('mezőnevek kis-/nagybetűtől függetlenül', () => {
    expect(normalizeProps({ SITECODE: 'HUDI20001', SITENAME: 'Pilis', SITETYPE: 'B' })).toEqual({
      code: 'HUDI20001',
      name: 'Pilis',
      type: 'B',
    });
  });

  it('réteg-felderítés a szolgáltatás leírásából, majd geojson lekérdezés', async () => {
    mockHttp((req) => {
      if (req.url.endsWith('MapServer?f=json'))
        return {
          status: 200,
          headers: {},
          data: {
            layers: [
              { id: 0, name: 'Species' },
              { id: 3, name: 'Natura 2000 Sites' },
            ],
          },
        };
      if (/MapServer\/3\?f=json$/.test(req.url))
        return {
          status: 200,
          headers: {},
          data: { id: 3, name: 'Natura 2000 Sites', geometryType: 'esriGeometryPolygon' },
        };
      if (/MapServer\/0\?f=json$/.test(req.url))
        return {
          status: 200,
          headers: {},
          data: { id: 0, name: 'Species', geometryType: 'esriGeometryPoint' },
        };
      if (/\/3\/query\?.*f=geojson$/.test(req.url))
        return {
          status: 200,
          headers: {},
          data: {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { sitecode: 'HUBN20001', sitename: 'Teszt' },
                geometry: {
                  type: 'Polygon',
                  coordinates: [
                    [
                      [19, 47],
                      [19.1, 47],
                      [19.1, 47.1],
                      [19, 47],
                    ],
                  ],
                },
              },
            ],
          },
        };
      throw new HttpError('http', 'HTTP 404', 404);
    });
    const base = 'https://x.test/arcgis/rest/services/ProtectedSites/Natura2000Sites/MapServer';
    expect(await discoverLayer(base)).toBe(3);
    const fc = await queryArcgis(base, 3, [19, 47, 19.2, 47.2]);
    expect(fc.features[0]!.properties.code).toBe('HUBN20001');
    const q = calls.find((c) => c.url.includes('/query?'))!;
    expect(q.url).toContain('geometryType=esriGeometryEnvelope');
    expect(q.url).toContain('inSR=4326');
  });
});

describe('Nominatim', () => {
  it('bbox sorrend átalakítása és mezők', () => {
    const r = parseNominatim([
      {
        display_name: 'Gödöllő, Pest',
        lat: '47.6',
        lon: '19.35',
        boundingbox: ['47.5', '47.7', '19.2', '19.5'],
        addresstype: 'town',
      },
    ]);
    expect(r[0]!.bbox).toEqual([19.2, 47.5, 19.5, 47.7]);
    expect(r[0]!.kind).toBe('town');
  });

  it('magyarországra szűkít, max. 1 kérés/s és cache', async () => {
    mockHttp(() => ({ status: 200, headers: {}, data: [] }));
    await geocode('Szentendre Fő tér');
    await geocode('Szentendre Fő tér');
    expect(calls).toHaveLength(1);
    const u = new URL(calls[0]!.url);
    expect(u.searchParams.get('countrycodes')).toBe('hu');
    expect(u.searchParams.get('format')).toBe('jsonv2');
  });
});

describe('szolgáltatás-futtató', () => {
  const svc: DataService<{ k: string }, number> = {
    info: SOURCES.demo,
    ttlMs: -1, // azonnal lejár
    cacheKey: (r) => r.k,
    async fetchLive() {
      throw new HttpError('network', 'nincs kapcsolat');
    },
  };
  it('hálózati hiba esetén a lejárt cache-t adja vissza', async () => {
    const ok: DataService<{ k: string }, number> = { ...svc, fetchLive: async () => 42 };
    await runService(ok, { k: 'a' }, ctx);
    const o = await runService(svc, { k: 'a' }, ctx);
    expect(o.status === 'ok' && o.data).toBe(42);
  });
  it('hiba esetén magyar üzenet és teendő', async () => {
    const o = await runService(svc, { k: 'új' }, ctx);
    expect(o.status).toBe('error');
    if (o.status === 'error') {
      expect(o.message).toContain(SOURCES.demo.label);
      expect(o.hint.length).toBeGreaterThan(10);
    }
  });
});
