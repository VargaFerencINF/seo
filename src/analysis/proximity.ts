/** Közelség-számítás EOV-ban: utak, légvezetékek, vízfolyások, épületek. Forrásfüggetlen. */
import type { ProximityItem, ProximityMetrics } from '../types';
import {
  lineIntersectsPolygon,
  pointInPolygon,
  polygonLineDistance,
  polygonPolygonDistance,
  type Ring,
} from './planar';
import type { Eov } from '../types';

export interface LineFeature {
  line: Eov[];
  name?: string;
  kind?: string;
}

export interface AreaFeature {
  rings: Ring[];
  name?: string;
  kind?: string;
}

export interface ProximityInput {
  parcel: Ring[];
  radiusM: number;
  roads: LineFeature[];
  powerLines: LineFeature[];
  waterways: LineFeature[];
  /** épületek: poligon vagy csak középpont (Overpass `out center`) */
  buildings: (AreaFeature | { point: Eov; name?: string })[];
}

function nearestLine(parcel: Ring[], feats: LineFeature[], radius: number): ProximityItem {
  let best: ProximityItem = { distanceM: null, crosses: false };
  for (const f of feats) {
    if (f.line.length < 1) continue;
    const d = polygonLineDistance(parcel, f.line);
    if (d > radius) continue;
    if (best.distanceM === null || d < best.distanceM) {
      best = {
        distanceM: d,
        crosses: false,
        ...(f.name ? { name: f.name } : {}),
        ...(f.kind ? { kind: f.kind } : {}),
      };
    }
  }
  // földkábel nem „keresztező légvezeték”
  best.crosses = feats.some(
    (f) => f.kind !== 'cable' && f.line.length > 1 && lineIntersectsPolygon(f.line, parcel),
  );
  return best;
}

export function computeProximity(input: ProximityInput): ProximityMetrics {
  const { parcel, radiusM } = input;
  let bDist: number | null = null;
  let inside = 0;
  for (const b of input.buildings) {
    let d: number;
    if ('point' in b) {
      d = pointInPolygon(b.point, parcel) ? 0 : polygonLineDistance(parcel, [b.point]);
    } else d = polygonPolygonDistance(parcel, b.rings);
    if (d === 0) inside++;
    if (d <= radiusM && (bDist === null || d < bDist)) bDist = d;
  }
  return {
    searchRadiusM: radiusM,
    road: nearestLine(parcel, input.roads, radiusM),
    powerLine: nearestLine(parcel, input.powerLines, radiusM),
    waterway: nearestLine(parcel, input.waterways, radiusM),
    building: { distanceM: bDist, crosses: inside > 0, countInside: inside },
  };
}
