#!/usr/bin/env node
/**
 * Adatforrás-ellenőrzés valódi próbahívásokkal (CI-ben fut, ahol nyílt a hálózat).
 *   node scripts/check-sources.mjs
 * Minden forrásnál: elérhetőség, válaszformátum, CORS fejléc (a WebView-hoz), mintaérték.
 * Az eredmény a konzolra és – GitHub Actionsben – a futás összefoglalójába kerül.
 * Kilépési kód mindig 0: a külső szolgáltatás kiesése nem töri el a buildet.
 */
import { appendFile } from 'node:fs/promises';
import { fromUrl } from 'geotiff';

const UA = 'Teleklato-sourcecheck/0.1 (CI; hu.teleklato.app)';
const ORIGIN = 'https://localhost'; // a Capacitor WebView origin-je
const P = { lat: 47.6, lon: 19.35 }; // Gödöllő környéke
const results = [];

async function check(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - t0, detail });
  } catch (err) {
    results.push({ name, ok: false, ms: Date.now() - t0, detail: String(err?.message ?? err) });
  }
}

async function get(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': UA, Origin: ORIGIN, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(60000),
  });
  return res;
}

const cors = (res) => res.headers.get('access-control-allow-origin') ?? 'nincs';

await check('OpenFreeMap stílus', async () => {
  const res = await get('https://tiles.openfreemap.org/styles/liberty');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const src = Object.entries(j.sources ?? {}).map(([k, v]) => `${k}=${v.url ?? v.type}`);
  return `rétegek: ${j.layers?.length}, források: ${src.join(', ')}, glyphs: ${j.glyphs}, CORS: ${cors(res)}`;
});

await check('Copernicus DEM COG (N47 E019)', async () => {
  const name = 'Copernicus_DSM_COG_10_N47_00_E019_00_DEM';
  const url = `https://copernicus-dem-30m.s3.amazonaws.com/${name}/${name}.tif`;
  const head = await get(url, { headers: { Range: 'bytes=0-1023' } });
  const tiff = await fromUrl(url);
  const img = await tiff.getImage();
  const [ox, oy] = img.getOrigin();
  const [rx, ry] = img.getResolution();
  const x = Math.floor((P.lon - ox) / rx);
  const y = Math.floor((P.lat - oy) / ry);
  const r = await img.readRasters({ window: [x, y, x + 2, y + 2], samples: [0], interleave: true });
  return `status ${head.status}, ${img.getWidth()}×${img.getHeight()} px, origó ${ox},${oy}, felbontás ${rx.toExponential(4)}, csempe ${img.getTileWidth()}×${img.getTileHeight()}, nodata ${img.getGDALNoData()}, magasság Gödöllőnél ${Array.from(
    r,
  )
    .map((v) => v.toFixed(1))
    .join('/')} m, CORS: ${cors(head)}`;
});

await check('Overpass API', async () => {
  const q = `[out:json][timeout:25];way["highway"](around:300,${P.lat},${P.lon});out tags center 5;`;
  const res = await get('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(q)}`,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return `elemek: ${j.elements?.length}, pl. ${j.elements?.[0]?.tags?.highway} ${j.elements?.[0]?.tags?.name ?? ''}, CORS: ${cors(res)}`;
});

await check('PVGIS 5.3 PVcalc', async () => {
  const u = `https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=${P.lat}&lon=${P.lon}&peakpower=1&loss=14&angle=5&aspect=0&mountingplace=free&outputformat=json`;
  const res = await get(u);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const o = await (await get(`${u.replace('&angle=5&aspect=0', '')}&optimalangles=1`)).json();
  return `E_y(5°, dél) = ${j.outputs?.totals?.fixed?.E_y} kWh/kWp, optimális: ${o.outputs?.totals?.fixed?.E_y} (${o.inputs?.mounting_system?.fixed?.slope?.value}°), adatbázis ${j.inputs?.meteo_data?.radiation_db}, CORS: ${cors(res)}`;
});

await check('Nominatim', async () => {
  const res = await get(
    'https://nominatim.openstreetmap.org/search?q=G%C3%B6d%C3%B6ll%C5%91&format=jsonv2&countrycodes=hu&limit=1&accept-language=hu',
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return `${j[0]?.display_name} (${j[0]?.lat}, ${j[0]?.lon}), bbox ${j[0]?.boundingbox}, CORS: ${cors(res)}`;
});

let naturaLayer = null;
await check('EEA Natura 2000 (ArcGIS REST)', async () => {
  const base =
    'https://bio.discomap.eea.europa.eu/arcgis/rest/services/ProtectedSites/Natura2000Sites/MapServer';
  const res = await get(`${base}?f=json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const root = await res.json();
  const layers = (root.layers ?? []).map((l) => `${l.id}:${l.name}`);
  for (const l of root.layers ?? []) {
    const info = await (await get(`${base}/${l.id}?f=json`)).json();
    if (info.geometryType === 'esriGeometryPolygon') {
      naturaLayer = l.id;
      break;
    }
  }
  const q = await get(
    `${base}/${naturaLayer}/query?where=1%3D1&geometry=19.0,47.6,19.2,47.8&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json`,
  );
  const qj = await q.json();
  const f0 = qj.features?.[0]?.attributes ?? {};
  return `rétegek: ${layers.join('; ')} → poligonréteg: ${naturaLayer}; Pilis/Visegrád környékén ${qj.features?.length} terület; mezők: ${Object.keys(f0).join(', ')}; minta: ${JSON.stringify(f0).slice(0, 160)}; CORS: ${cors(q)}`;
});

await check('JRC árvíz RP100 GeoTIFF', async () => {
  const url =
    'https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/CEMS-EFAS/flood_hazard/Europe_RP100_filled_depth.tif';
  const head = await get(url, { headers: { Range: 'bytes=0-1023' } });
  const tiff = await fromUrl(url);
  const img = await tiff.getImage();
  const [ox, oy] = img.getOrigin();
  const [rx, ry] = img.getResolution();
  // Duna, Budapest (Margitsziget környéke)
  const lon = 19.05;
  const lat = 47.53;
  const x = Math.floor((lon - ox) / rx);
  const y = Math.floor((lat - oy) / ry);
  const t0 = Date.now();
  const r = await img.readRasters({ window: [x - 2, y - 2, x + 3, y + 3], samples: [0], interleave: true });
  const tiled = img.isTiled
    ? `csempézett ${img.getTileWidth()}×${img.getTileHeight()}`
    : `sávos (RowsPerStrip ${img.fileDirectory.RowsPerStrip})`;
  return `status ${head.status}, ${img.getWidth()}×${img.getHeight()} px, ${tiled}, tömörítés ${img.fileDirectory.Compression}, nodata ${img.getGDALNoData()}, ablak olvasás ${Date.now() - t0} ms, mélységek: ${Array.from(
    r,
  )
    .slice(0, 10)
    .map((v) => v.toFixed(2))
    .join(' ')}, CORS: ${cors(head)}`;
});

for (const year of ['2018', '2022']) {
  await check(`Lechner ortofotó WMS OI.${year}`, async () => {
    const base = `https://inspire.lechnerkozpont.hu/geoserver/OI.${year}/wms`;
    const res = await get(`${base}?service=WMS&version=1.1.1&request=GetCapabilities`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const names = [...xml.matchAll(/<Layer[^>]*>\s*<Name>([^<]+)<\/Name>/g)].map((m) => m[1]);
    const srs = /EPSG:3857/.test(xml) ? 'EPSG:3857 ✓' : 'EPSG:3857 nincs';
    let tile = '';
    if (names[0]) {
      const t = await get(
        `${base}?service=WMS&version=1.1.1&request=GetMap&layers=${encodeURIComponent(names[0])}&styles=&format=image/jpeg&srs=EPSG:3857&bbox=2153000,6041000,2153500,6041500&width=256&height=256`,
      );
      tile = `GetMap ${t.status} ${t.headers.get('content-type')} ${t.headers.get('content-length') ?? ''} B, CORS: ${cors(t)}`;
    }
    const fees = /<Fees>([^<]*)<\/Fees>/.exec(xml)?.[1] ?? '';
    const access = /<AccessConstraints>([^<]*)<\/AccessConstraints>/.exec(xml)?.[1] ?? '';
    return `rétegek: ${names.join(', ')}; ${srs}; ${tile}; Fees: ${fees}; AccessConstraints: ${access}`;
  });
}

const lines = results.map(
  (r) => `| ${r.ok ? '✅' : '❌'} | ${r.name} | ${r.ms} ms | ${r.detail.replace(/\|/g, '/')} |`,
);
const md = [
  '## Adatforrás-ellenőrzés',
  '',
  '| | Forrás | Idő | Részletek |',
  '|---|---|---|---|',
  ...lines,
  '',
].join('\n');
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md);
