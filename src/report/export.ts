/** Telek exportálása GeoJSON (WGS84 vagy EOV) és KML formátumba – fotópontokkal és metszetvonallal. */
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Parcel } from '../types';
import { toEov } from '../analysis/eov';
import { computeGeometry } from '../analysis/geometry';
import { APP_NAME, APP_VERSION } from '../config';

function summaryProps(p: Parcel): Record<string, unknown> {
  const g = p.analysis?.geometry ?? computeGeometry(p.geometry);
  const a = p.analysis;
  return {
    name: p.name,
    note: p.note,
    tags: p.tags.join(', '),
    source: p.source,
    mode: p.mode === 'demo' ? 'DEMÓ – szimulált adatok' : 'élő adatok',
    area_m2: Math.round(g.areaM2 * 10) / 10,
    perimeter_m: Math.round(g.perimeterM * 10) / 10,
    centroid_eov_y: Math.round(g.centroidEov[0] * 100) / 100,
    centroid_eov_x: Math.round(g.centroidEov[1] * 100) / 100,
    verdict: a?.score.overall ?? null,
    verdict_text: a?.score.summary ?? null,
    rule_set: a?.score.ruleSetName ?? null,
    mean_slope_pct: a?.terrain.status === 'ok' ? Math.round(a.terrain.data.meanSlopePct * 10) / 10 : null,
    dominant_aspect: a?.terrain.status === 'ok' ? a.terrain.data.dominantAspect : null,
    natura_pct: a?.natura.status === 'ok' ? Math.round(a.natura.data.overlapPct * 10) / 10 : null,
    flood_pct: a?.flood.status === 'ok' ? Math.round(a.flood.data.overlapPct * 10) / 10 : null,
    pv_kwh_per_kwp: a?.pv.status === 'ok' ? Math.round(a.pv.data.terrain.yearlyKwhPerKwp) : null,
    analyzed_at: a?.createdAt ?? null,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

function mapCoords(g: Geometry, fn: (c: number[]) => number[]): Geometry {
  switch (g.type) {
    case 'Point':
      return { ...g, coordinates: fn(g.coordinates) };
    case 'LineString':
      return { ...g, coordinates: g.coordinates.map(fn) };
    case 'Polygon':
      return { ...g, coordinates: g.coordinates.map((r) => r.map(fn)) };
    default:
      return g;
  }
}

export function toGeoJson(
  p: Parcel,
  crs: 'wgs84' | 'eov' = 'wgs84',
): FeatureCollection & { crs?: unknown; metadata?: unknown } {
  const features: Feature[] = [
    { type: 'Feature', properties: { kind: 'parcel', ...summaryProps(p) }, geometry: p.geometry },
  ];
  if (p.profileLine)
    features.push({
      type: 'Feature',
      properties: { kind: 'profile_line', name: 'Felhasználói metszetvonal' },
      geometry: p.profileLine,
    });
  for (const ph of p.photos)
    features.push({
      type: 'Feature',
      properties: {
        kind: 'photo',
        id: ph.id,
        created_at: ph.createdAt,
        accuracy_m: ph.accuracyM,
        heading_deg: ph.headingDeg,
        note: ph.note,
      },
      geometry: { type: 'Point', coordinates: [ph.lon, ph.lat] },
    });
  const out: FeatureCollection & { crs?: unknown; metadata?: unknown } = {
    type: 'FeatureCollection',
    metadata: { generator: `${APP_NAME} ${APP_VERSION}`, exported_at: new Date().toISOString() },
    features,
  };
  if (crs === 'eov') {
    out.crs = { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::23700' } };
    out.features = features.map((f) => ({
      ...f,
      geometry: mapCoords(f.geometry, (c) => {
        const [y, x] = toEov([c[0]!, c[1]!]);
        return [Math.round(y * 100) / 100, Math.round(x * 100) / 100];
      }),
    }));
  }
  return out;
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] ?? c,
  );

const LAMP_KML: Record<string, string> = {
  green: 'ff578b2e',
  yellow: 'ff009ad9',
  red: 'ff2b39c0',
  na: 'ff8d978a',
};

export function toKml(p: Parcel): string {
  const props = summaryProps(p);
  const coords = (ring: number[][]) => ring.map((c) => `${c[0]!.toFixed(7)},${c[1]!.toFixed(7)},0`).join(' ');
  const outer = p.geometry.coordinates[0] ?? [];
  const holes = p.geometry.coordinates.slice(1);
  const ext = Object.entries(props)
    .filter(([, v]) => v !== null && v !== '')
    .map(([k, v]) => `<Data name="${esc(k)}"><value>${esc(String(v))}</value></Data>`)
    .join('');
  const color = LAMP_KML[p.analysis?.score.overall ?? 'na'] ?? 'ff8d978a';
  const photos = p.photos
    .map(
      (ph) =>
        `<Placemark><name>Fotó ${esc(ph.createdAt.slice(0, 16).replace('T', ' '))}</name><description>${esc(
          [
            ph.note,
            ph.headingDeg !== null ? `irány: ${ph.headingDeg}°` : '',
            ph.accuracyM !== null ? `±${Math.round(ph.accuracyM)} m` : '',
          ]
            .filter(Boolean)
            .join(' · '),
        )}</description><Point><coordinates>${ph.lon.toFixed(7)},${ph.lat.toFixed(7)},0</coordinates></Point></Placemark>`,
    )
    .join('');
  const profile = p.profileLine
    ? `<Placemark><name>Metszetvonal</name><LineString><coordinates>${coords(p.profileLine.coordinates)}</coordinates></LineString></Placemark>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>${esc(p.name)}</name>
<description>${esc(`${APP_NAME} ${APP_VERSION} export – ${props.mode}`)}</description>
<Style id="parcel"><LineStyle><color>ff10b7e8</color><width>3</width></LineStyle><PolyStyle><color>${color.replace(/^ff/, '55')}</color></PolyStyle></Style>
<Placemark>
<name>${esc(p.name)}</name>
<description>${esc(p.note)}</description>
<styleUrl>#parcel</styleUrl>
<ExtendedData>${ext}</ExtendedData>
<Polygon><outerBoundaryIs><LinearRing><coordinates>${coords(outer)}</coordinates></LinearRing></outerBoundaryIs>${holes
    .map(
      (h) =>
        `<innerBoundaryIs><LinearRing><coordinates>${coords(h)}</coordinates></LinearRing></innerBoundaryIs>`,
    )
    .join('')}</Polygon>
</Placemark>
${profile}${photos}
</Document>
</kml>
`;
}

export function exportFileName(p: Parcel, ext: string): string {
  const safe = p.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  return `teleklato_${safe || 'telek'}.${ext}`;
}
