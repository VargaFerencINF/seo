/**
 * Natura 2000 területek.
 * 1. Csomagolt, egyszerűsített magyarországi GeoJSON (scripts/build-natura.mjs állítja elő) – offline is működik.
 * 2. Ha nincs csomagolt adat: az EEA ArcGIS REST szolgáltatása. A réteg azonosítóját a szolgáltatás
 *    leírásából olvassuk ki (nem találjuk ki), majd bbox-szal kérdezünk le.
 */
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { ENDPOINTS, SOURCES } from '../config';
import { http } from '../native/http';
import type { BboxWgs } from './cog';
import type { DataService } from './service';
import { cacheGet, cacheSet, keyNum } from '../storage/cache';

export interface NaturaProps {
  code: string;
  name: string;
  type: string;
}

export type NaturaCollection = FeatureCollection<Polygon | MultiPolygon, NaturaProps>;

// ------------------------------------------------------------------ csomagolt adat

let bundled: Promise<(NaturaCollection & { bboxes: number[][] }) | null> | null = null;

export function loadBundled(
  url = './data/natura2000_hu.geojson',
): Promise<(NaturaCollection & { bboxes: number[][] }) | null> {
  bundled ??= (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const fc = (await res.json()) as NaturaCollection;
      if (!fc.features?.length) return null;
      return { ...fc, bboxes: fc.features.map((f) => geomBbox(f.geometry)) };
    } catch {
      return null;
    }
  })();
  return bundled;
}

export function geomBbox(g: Polygon | MultiPolygon): number[] {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const poly of polys)
    for (const ring of poly)
      for (const [x, y] of ring) {
        if (x! < w) w = x!;
        if (x! > e) e = x!;
        if (y! < s) s = y!;
        if (y! > n) n = y!;
      }
  return [w, s, e, n];
}

const intersects = (a: number[], b: number[]) =>
  a[0]! <= b[2]! && b[0]! <= a[2]! && a[1]! <= b[3]! && b[1]! <= a[3]!;

// ------------------------------------------------------------------ ArcGIS REST

interface ArcLayerInfo {
  id: number;
  name: string;
  geometryType?: string;
  subLayerIds?: number[] | null;
}

/** A Natura 2000 poligonréteg azonosítójának felderítése a MapServer leírásából */
export async function discoverLayer(base: string, signal?: AbortSignal): Promise<number> {
  const cached = await cacheGet<number>('natura:layer');
  if (cached && !cached.expired) return cached.value;
  const root = await http<{ layers?: ArcLayerInfo[]; error?: { message?: string } }>({
    url: `${base}?f=json`,
    responseType: 'json',
    timeoutMs: 20000,
    ...(signal ? { signal } : {}),
  });
  const layers = (root.data.layers ?? []).filter((l) => !l.subLayerIds?.length);
  const ranked = [...layers].sort((a, b) => score(b.name) - score(a.name));
  for (const l of ranked) {
    const info = await http<ArcLayerInfo>({
      url: `${base}/${l.id}?f=json`,
      responseType: 'json',
      timeoutMs: 20000,
      ...(signal ? { signal } : {}),
    });
    if (info.data.geometryType === 'esriGeometryPolygon') {
      await cacheSet('natura:layer', l.id, 30 * 24 * 3600 * 1000);
      return l.id;
    }
  }
  throw new Error('Az EEA szolgáltatásban nem található Natura 2000 poligonréteg.');
}

function score(name: string): number {
  let s = 0;
  if (/natura/i.test(name)) s += 2;
  if (/site/i.test(name)) s += 1;
  if (/spa|sci|sac|bird|habitat/i.test(name)) s += 0.5;
  return s;
}

function pick(props: Record<string, unknown>, ...names: string[]): string {
  for (const [k, v] of Object.entries(props))
    if (names.includes(k.toLowerCase()) && v !== null && v !== undefined) return String(v);
  return '';
}

export function normalizeProps(p: Record<string, unknown> | null): NaturaProps {
  const props = p ?? {};
  return {
    code: pick(props, 'sitecode', 'site_code', 'code'),
    name: pick(props, 'sitename', 'site_name', 'name'),
    type: pick(props, 'sitetype', 'site_type', 'type'),
  };
}

type EsriRing = number[][];

function ringSignedArea(r: EsriRing): number {
  let s = 0;
  for (let i = 0; i < r.length - 1; i++) s += r[i]![0]! * r[i + 1]![1]! - r[i + 1]![0]! * r[i]![1]!;
  return s / 2;
}

/** Esri JSON gyűrűk → GeoJSON (az Esri-ben a külső gyűrű óramutató szerinti) */
export function esriRingsToGeoJson(rings: EsriRing[]): Polygon | MultiPolygon {
  const polys: number[][][][] = [];
  for (const r of rings) {
    if (ringSignedArea(r) <= 0 || !polys.length) polys.push([r]);
    else polys[polys.length - 1]!.push(r);
  }
  return polys.length === 1
    ? { type: 'Polygon', coordinates: polys[0]! }
    : { type: 'MultiPolygon', coordinates: polys };
}

export async function queryArcgis(
  base: string,
  layer: number,
  b: BboxWgs,
  signal?: AbortSignal,
): Promise<NaturaCollection> {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: b.map((v) => v.toFixed(6)).join(','),
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'true',
    outSR: '4326',
    maxAllowableOffset: '0.00005',
  });
  const url = `${base}/${layer}/query?${params.toString()}`;
  const opts = { responseType: 'json' as const, timeoutMs: 30000, ...(signal ? { signal } : {}) };
  const gj = await http<NaturaCollection & { error?: { message?: string } }>({
    url: `${url}&f=geojson`,
    ...opts,
  }).catch(() => null);
  if (gj && !gj.data.error && Array.isArray(gj.data.features)) {
    return {
      type: 'FeatureCollection',
      features: gj.data.features
        .filter((f) => f.geometry)
        .map((f) => ({
          ...f,
          properties: normalizeProps(f.properties as unknown as Record<string, unknown>),
        })),
    };
  }
  const ej = await http<{
    features?: { attributes: Record<string, unknown>; geometry?: { rings?: EsriRing[] } }[];
    error?: { message?: string };
  }>({ url: `${url}&f=json`, ...opts });
  if (ej.data.error) throw new Error(`EEA szolgáltatás hibája: ${ej.data.error.message ?? 'ismeretlen'}`);
  return {
    type: 'FeatureCollection',
    features: (ej.data.features ?? [])
      .filter((f) => f.geometry?.rings?.length)
      .map((f): Feature<Polygon | MultiPolygon, NaturaProps> => ({
        type: 'Feature',
        properties: normalizeProps(f.attributes),
        geometry: esriRingsToGeoJson(f.geometry!.rings!),
      })),
  };
}

export interface NaturaResult {
  collection: NaturaCollection;
  origin: 'bundled' | 'live';
}

export const naturaService: DataService<{ bbox: BboxWgs }, NaturaResult> = {
  info: SOURCES.natura,
  ttlMs: 90 * 24 * 3600 * 1000,
  cacheKey: ({ bbox }) => bbox.map((v) => keyNum(v, 3)).join(','),
  async fetchLive({ bbox }, ctx) {
    const layer = await discoverLayer(ENDPOINTS.naturaArcgis, ctx.signal);
    return { collection: await queryArcgis(ENDPOINTS.naturaArcgis, layer, bbox, ctx.signal), origin: 'live' };
  },
};

/** Csomagolt adatból (ha van) a bbox-ot érintő területek */
export async function naturaFromBundle(bbox: BboxWgs): Promise<NaturaCollection | null> {
  const b = await loadBundled();
  if (!b) return null;
  return {
    type: 'FeatureCollection',
    features: b.features.filter((_, i) => intersects(b.bboxes[i]!, bbox)),
  };
}
