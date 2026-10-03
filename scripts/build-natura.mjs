#!/usr/bin/env node
/**
 * Build-idejű Natura 2000 kivonat Magyarországra (EEA, nyílt adat).
 *
 *   node scripts/build-natura.mjs [--tolerance 0.0001] [--out public/data/natura2000_hu.geojson]
 *
 * 1. Az EEA ArcGIS REST szolgáltatás leírásából kikeresi a Natura 2000 poligonréteget.
 * 2. Magyarország kiterjedését csempékre bontva lekérdezi a területeket (lapozás / felosztás,
 *    ha a szerver korlátozza a találatok számát), a SITECODE „HU” előtagja alapján szűr.
 * 3. Egyszerűsíti a geometriát (Turf simplify), 6 tizedesre kerekít, és GeoJSON-ba írja.
 *
 * Az app a csomagolt fájlt használja elsőként (offline is), ha nincs, élőben kérdez.
 * Licenc: EEA standard re-use policy – a forrás feltüntetésével szabadon felhasználható.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { simplify } from '@turf/turf';

const BASE =
  'https://bio.discomap.eea.europa.eu/arcgis/rest/services/ProtectedSites/Natura2000Sites/MapServer';
const HU_BBOX = [16.0, 45.7, 22.95, 48.6];
const UA = 'Teleklato-build/0.1 (Natura 2000 kivonat)';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce((acc, v, i, a) => (v.startsWith('--') ? [...acc, [v.slice(2), a[i + 1]]] : acc), []),
);
const tolerance = Number(args.tolerance ?? 0.00015);
const out = args.out ?? 'public/data/natura2000_hu.geojson';

async function getJson(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} – ${url}`);
      return await res.json();
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

/** Az összes Natura 2000 területréteg (SCI/SAC, SPA, mindkettő) */
async function findLayers() {
  const root = await getJson(`${BASE}?f=json`);
  const layers = (root.layers ?? []).filter(
    (l) =>
      !l.subLayerIds?.length &&
      /site|natura|spa|sci|sac|directive/i.test(l.name) &&
      !/species|habitat types/i.test(l.name),
  );
  const out = [];
  for (const l of layers) {
    const info = await getJson(`${BASE}/${l.id}?f=json`);
    if (info.geometryType === 'esriGeometryPolygon') {
      console.log(`Réteg: ${l.id} – ${l.name} (max. ${info.maxRecordCount ?? '?'} rekord/kérés)`);
      out.push({
        id: l.id,
        name: l.name,
        max: info.maxRecordCount ?? 1000,
        fields: (info.fields ?? []).map((f) => f.name),
      });
    }
  }
  if (!out.length) throw new Error('Nem található Natura 2000 poligonréteg az EEA szolgáltatásban.');
  return out;
}

const pick = (props, ...names) => {
  for (const [k, v] of Object.entries(props ?? {}))
    if (names.includes(k.toLowerCase()) && v != null) return String(v);
  return '';
};

async function queryTile(layer, bbox, depth = 0) {
  const p = new URLSearchParams({
    where: layer.fields.includes('MS') ? "MS='HU'" : '1=1',
    geometry: bbox.join(','),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'true',
    outSR: '4326',
    maxAllowableOffset: String(tolerance / 2),
    f: 'geojson',
  });
  const fc = await getJson(`${BASE}/${layer.id}/query?${p}`);
  if (fc.error) throw new Error(`EEA hiba: ${fc.error.message}`);
  const feats = fc.features ?? [];
  const exceeded =
    fc.exceededTransferLimit || fc.properties?.exceededTransferLimit || feats.length >= layer.max;
  if (exceeded && depth < 6) {
    const [w, s, e, n] = bbox;
    const mx = (w + e) / 2;
    const my = (s + n) / 2;
    const parts = await Promise.all(
      [
        [w, s, mx, my],
        [mx, s, e, my],
        [w, my, mx, n],
        [mx, my, e, n],
      ].map((b) => queryTile(layer, b, depth + 1)),
    );
    return parts.flat();
  }
  return feats;
}

/** Kerekítés után az ismétlődő pontok és a 4 pontnál rövidebb gyűrűk elhagyása */
function cleanRing(ring) {
  const out = [];
  for (const c of ring) {
    const r = [Math.round(c[0] * 1e6) / 1e6, Math.round(c[1] * 1e6) / 1e6];
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== r[0] || prev[1] !== r[1]) out.push(r);
  }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1]))
    out.push(out[0]);
  return out.length >= 4 ? out : null;
}

function cleanGeometry(g) {
  const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
    .map((poly) => {
      const rings = poly.map(cleanRing);
      return rings[0] ? rings.filter(Boolean) : null;
    })
    .filter(Boolean);
  if (!polys.length) return null;
  return polys.length === 1
    ? { type: 'Polygon', coordinates: polys[0] }
    : { type: 'MultiPolygon', coordinates: polys };
}

function simplified(f) {
  try {
    return cleanGeometry(simplify(f, { tolerance, highQuality: false, mutate: false }).geometry);
  } catch {
    return cleanGeometry(f.geometry); // degenerált egyszerűsítés: az eredeti (szerveroldalon általánosított) geometria
  }
}

async function main() {
  const layers = await findLayers();
  const byCode = new Map();
  for (const layer of layers) {
    const raw = await queryTile(layer, HU_BBOX);
    console.log(`  ${layer.name}: ${raw.length} objektum`);
    for (const f of raw) {
      const code = pick(f.properties, 'sitecode', 'site_code');
      if (!code.startsWith('HU') || !f.geometry) continue;
      if (!byCode.has(code)) byCode.set(code, f);
    }
  }
  let dropped = 0;
  const features = [...byCode.values()]
    .map((f) => {
      const geometry = simplified(f);
      if (!geometry) {
        dropped++;
        return null;
      }
      return {
        type: 'Feature',
        properties: {
          code: pick(f.properties, 'sitecode', 'site_code'),
          name: pick(f.properties, 'sitename', 'site_name'),
          type: pick(f.properties, 'sitetype', 'site_type'),
        },
        geometry,
      };
    })
    .filter(Boolean);
  if (dropped) console.log(`  ${dropped} degenerált geometria kihagyva`);
  const fc = {
    type: 'FeatureCollection',
    metadata: {
      source: BASE,
      generated: new Date().toISOString(),
      tolerance,
      attribution: 'Natura 2000 adatbázis © Európai Környezetvédelmi Ügynökség (EEA)',
    },
    features,
  };
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(fc));
  const size = Buffer.byteLength(JSON.stringify(fc)) / 1e6;
  console.log(`Kész: ${features.length} terület → ${out} (${size.toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error(`Hiba: ${err.message}`);
  console.error(
    'Az app csomagolt adat nélkül is működik (élő EEA lekérdezéssel), ezt a lépést később megismételheted.',
  );
  process.exit(1);
});
