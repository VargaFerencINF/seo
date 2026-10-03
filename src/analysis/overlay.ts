/** Átfedés-számítás (Natura, árvíz) EOV-ban, pontos poligonvágással (Turf/polyclip, síkbeli koordinátákon). */
import { intersect, union, polygon as turfPolygon, featureCollection } from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { OverlayMetrics } from '../types';
import {
  bbox,
  closeRing,
  overlapAreaBySampling,
  polygonArea,
  polygonPolygonDistance,
  type Ring,
} from './planar';

export interface Zone {
  name: string;
  /** EOV gyűrűk (külső + lyukak) */
  rings: Ring[];
}

function toFeature(rings: Ring[]): Feature<Polygon> {
  return turfPolygon(rings.map((r) => closeRing(r).map((p) => [p[0], p[1]])));
}

function geomArea(g: Polygon | MultiPolygon): number {
  if (g.type === 'Polygon') return polygonArea(g.coordinates as Ring[]);
  return g.coordinates.reduce((s, p) => s + polygonArea(p as Ring[]), 0);
}

function bboxOverlap(a: number[], b: number[]): boolean {
  return a[0]! <= b[2]! && b[0]! <= a[2]! && a[1]! <= b[3]! && b[1]! <= a[3]!;
}

export function computeOverlay(parcel: Ring[], zones: Zone[], detail?: string): OverlayMetrics {
  const parcelArea = polygonArea(parcel);
  const pb = bbox(parcel[0] ?? []);
  const touching: Zone[] = [];
  let nearest: number | null = null;
  for (const z of zones) {
    const zb = bbox(z.rings[0] ?? []);
    if (bboxOverlap(pb, zb)) touching.push(z);
    const d = polygonPolygonDistance(parcel, z.rings);
    nearest = nearest === null ? d : Math.min(nearest, d);
  }
  let overlapArea = 0;
  const names = new Set<string>();
  if (touching.length) {
    try {
      const pf = toFeature(parcel);
      const parts: Feature<Polygon | MultiPolygon>[] = [];
      for (const z of touching) {
        const inter = intersect(featureCollection([pf, toFeature(z.rings)]));
        if (inter && geomArea(inter.geometry) > 0.01) {
          parts.push(inter);
          names.add(z.name);
        }
      }
      if (parts.length === 1) overlapArea = geomArea(parts[0]!.geometry);
      else if (parts.length > 1) {
        const u = union(featureCollection(parts));
        overlapArea = u ? geomArea(u.geometry) : 0;
      }
    } catch {
      // degenerált geometria esetén rácsos becslés
      const cell = Math.max(1, Math.sqrt(parcelArea) / 60);
      overlapArea = overlapAreaBySampling(
        parcel,
        touching.map((z) => z.rings),
        cell,
      );
      for (const z of touching) if (polygonPolygonDistance(parcel, z.rings) === 0) names.add(z.name);
    }
  }
  overlapArea = Math.min(overlapArea, parcelArea);
  return {
    overlapPct: parcelArea > 0 ? (overlapArea / parcelArea) * 100 : 0,
    overlapAreaM2: overlapArea,
    names: [...names],
    nearestDistanceM: overlapArea > 0 ? 0 : nearest,
    ...(detail ? { detail } : {}),
  };
}
