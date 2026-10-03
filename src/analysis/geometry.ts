import type { Polygon } from 'geojson';
import type { Eov, GeometryMetrics, LngLat } from '../types';
import { toEov, toWgs } from './eov';
import {
  bbox,
  isSelfIntersecting,
  longestDiagonal,
  openRing,
  polygonArea,
  polygonPerimeter,
  ringCentroid,
  type Ring,
} from './planar';

/** GeoJSON (WGS84) poligon → EOV gyűrűk */
export function polygonToEov(poly: Polygon): Ring[] {
  return poly.coordinates.map((ring) => ring.map((p) => toEov([p[0]!, p[1]!])));
}

export function eovRingsToPolygon(rings: Ring[]): Polygon {
  return {
    type: 'Polygon',
    coordinates: rings.map((r) => {
      const o = openRing(r).map((p) => toWgs(p));
      return [...o, o[0]!];
    }),
  };
}

/** Pontlistából zárt GeoJSON poligon (WGS84) */
export function polygonFromPoints(points: LngLat[]): Polygon {
  const pts = points.slice();
  if (pts.length && (pts[0]![0] !== pts[pts.length - 1]![0] || pts[0]![1] !== pts[pts.length - 1]![1]))
    pts.push(pts[0]!);
  return { type: 'Polygon', coordinates: [pts] };
}

export interface GeometryValidation {
  ok: boolean;
  message?: string;
}

export function validatePolygon(poly: Polygon): GeometryValidation {
  const outer = poly.coordinates[0];
  if (!outer || openRing(outer.map((p) => [p[0]!, p[1]!] as Eov)).length < 3)
    return { ok: false, message: 'A telekhez legalább 3 töréspont kell.' };
  const eov = polygonToEov(poly);
  if (isSelfIntersecting(eov[0]!))
    return {
      ok: false,
      message: 'A telekhatár önmagát metszi. Húzd át vagy töröld a hibás töréspontot.',
    };
  const area = polygonArea(eov);
  if (area < 10) return { ok: false, message: 'A telek túl kicsi (10 m² alatt) – ellenőrizd a pontokat.' };
  if (area > 5_000_000)
    return {
      ok: false,
      message: 'A telek túl nagy (500 ha felett) – az előszűrés kisebb területekre készült.',
    };
  return { ok: true };
}

export function computeGeometry(poly: Polygon): GeometryMetrics {
  const rings = polygonToEov(poly);
  const outer = rings[0]!;
  const centroid = ringCentroid(outer);
  const [a, b, len] = longestDiagonal(outer);
  return {
    areaM2: polygonArea(rings),
    perimeterM: polygonPerimeter(rings),
    centroidEov: centroid,
    centroidWgs: toWgs(centroid),
    bboxEov: bbox(outer),
    vertexCount: openRing(outer).length,
    longestDiagonal: [toWgs(a), toWgs(b)],
    longestDiagonalM: len,
  };
}
