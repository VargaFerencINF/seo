/** GeoJSON import: a legnagyobb poligon (EOV-ban megadott koordinátákat is felismer). */
import type { Geometry, Polygon, Position } from 'geojson';
import { toWgs, isPlausibleEov } from '../analysis/eov';
import { polygonArea } from '../analysis/planar';
import { toEov } from '../analysis/eov';
import type { Eov } from '../types';
import { ImportError, type ImportResult } from './types';

interface AnyGeo {
  type?: string;
  features?: AnyGeo[];
  geometry?: Geometry | null;
  geometries?: Geometry[];
  properties?: Record<string, unknown> | null;
  crs?: { properties?: { name?: string } };
  coordinates?: unknown;
}

function collectPolygons(g: AnyGeo, out: { rings: Position[][]; name?: string }[], name?: string): void {
  if (!g) return;
  switch (g.type) {
    case 'FeatureCollection':
      for (const f of g.features ?? []) collectPolygons(f, out);
      break;
    case 'Feature': {
      const n = (g.properties?.name ?? g.properties?.Name ?? g.properties?.NAME ?? g.properties?.hrsz) as
        string | undefined;
      if (g.geometry) collectPolygons(g.geometry as AnyGeo, out, n);
      break;
    }
    case 'GeometryCollection':
      for (const x of g.geometries ?? []) collectPolygons(x as AnyGeo, out, name);
      break;
    case 'Polygon':
      out.push({ rings: g.coordinates as Position[][], ...(name ? { name } : {}) });
      break;
    case 'MultiPolygon':
      for (const p of g.coordinates as Position[][][]) out.push({ rings: p, ...(name ? { name } : {}) });
      break;
    case 'LineString': {
      const c = g.coordinates as Position[];
      const f = c[0];
      const l = c[c.length - 1];
      if (c.length >= 4 && f && l && f[0] === l[0] && f[1] === l[1])
        out.push({ rings: [c], ...(name ? { name } : {}) });
      break;
    }
  }
}

/** Koordináta-rendszer: EPSG:23700 crs vagy méteres értékek → EOV */
function detectEov(g: AnyGeo, sample: Position | undefined): boolean {
  const crs = g.crs?.properties?.name ?? '';
  if (/23700/.test(crs)) return true;
  if (/4326|CRS84/i.test(crs)) return false;
  return !!sample && Math.abs(sample[0]!) > 1000 && Math.abs(sample[1]!) > 1000;
}

export function polygonsToResult(
  polys: { rings: Position[][]; name?: string }[],
  isEov: boolean,
  format: string,
): ImportResult {
  if (!polys.length)
    throw new ImportError(`A(z) ${format} fájlban nem találtam zárt poligont (telekhatárt).`);
  const notes: string[] = [];
  let swapped = false;
  const toWgsRing = (ring: Position[]) =>
    ring.map((c) => {
      if (!isEov) return [c[0]!, c[1]!];
      let p: Eov = [c[0]!, c[1]!];
      if (!isPlausibleEov(p) && isPlausibleEov([p[1], p[0]])) {
        p = [p[1], p[0]];
        swapped = true;
      }
      if (!isPlausibleEov(p))
        throw new ImportError(
          'Az EOV-koordináták nem esnek Magyarország területére – ellenőrizd a fájl vetületét.',
        );
      return toWgs(p);
    });
  const converted = polys.map((p) => ({ ...p, rings: p.rings.map(toWgsRing) }));
  const areaOf = (rings: Position[][]) => polygonArea(rings.map((r) => r.map((c) => toEov([c[0]!, c[1]!]))));
  converted.sort((a, b) => areaOf(b.rings) - areaOf(a.rings));
  const best = converted[0]!;
  if (converted.length > 1) notes.push(`${converted.length} poligonból a legnagyobbat töltöttem be.`);
  if (isEov) notes.push('A koordinátákat EOV-ként (EPSG:23700) értelmeztem.');
  if (swapped) notes.push('Az EOV tengelysorrendet (X, Y → Y, X) javítottam.');
  const polygon: Polygon = { type: 'Polygon', coordinates: best.rings };
  return { polygon, ...(best.name ? { name: best.name } : {}), notes };
}

export function importGeoJson(text: string): ImportResult {
  let g: AnyGeo;
  try {
    g = JSON.parse(text) as AnyGeo;
  } catch {
    throw new ImportError('A fájl nem érvényes JSON / GeoJSON.');
  }
  const polys: { rings: Position[][]; name?: string }[] = [];
  collectPolygons(g, polys);
  const sample = polys[0]?.rings[0]?.[0];
  return polygonsToResult(polys, detectEov(g, sample), 'GeoJSON');
}
