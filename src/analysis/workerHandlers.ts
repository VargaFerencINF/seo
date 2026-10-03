/** A Web Worker üzenetkezelői – tiszta függvények, tesztben szálon belül is futtathatók. */
import type { Eov, TerrainMetrics } from '../types';
import { toWgs } from './eov';
import { bbox, expandBbox, pointInPolygon, polygonArea, type Ring } from './planar';
import {
  computeTerrain,
  gridFromFunction,
  sampleGeoRaster,
  type ElevationGrid,
  type GeoRaster,
} from './terrain';
import { demoElevation } from '../demo/world';
import { contours, renderHillshade, type ContourSet, type HillshadeImage } from '../demo/basemap';

export type WorkerRequest =
  | {
      type: 'terrain-demo';
      polygon: Ring[];
      profiles: { label: string; line: Eov[] }[];
    }
  | {
      type: 'terrain-geo';
      raster: GeoRaster;
      polygon: Ring[];
      profiles: { label: string; line: Eov[] }[];
    }
  | { type: 'demo-base'; bbox: [number, number, number, number]; cellSize: number; dark: boolean }
  | { type: 'raster-overlap'; raster: GeoRaster; polygon: Ring[]; threshold: number };

export interface RasterOverlapResult {
  overlapPct: number;
  overlapAreaM2: number;
  maxValue: number | null;
  validPct: number;
}

export type WorkerResponse =
  | { type: 'terrain'; data: TerrainMetrics }
  | { type: 'demo-base'; image: HillshadeImage; contours: ContourSet[] }
  | { type: 'raster-overlap'; data: RasterOverlapResult };

/** Cellaméret a telek méretéhez igazítva (kb. 400–2500 minta a telekben) */
export function adaptiveCell(polygon: Ring[], min = 3, max = 30): number {
  const area = polygonArea(polygon);
  return Math.min(max, Math.max(min, Math.sqrt(area) / 25));
}

function analysisBbox(polygon: Ring[], profiles: { line: Eov[] }[], margin: number) {
  const pts = [...(polygon[0] ?? []), ...profiles.flatMap((p) => p.line)];
  return expandBbox(bbox(pts), margin);
}

/** Földrajzi raszter újramintavételezése EOV-rácsra */
export function resampleToEov(
  raster: GeoRaster,
  b: [number, number, number, number],
  cell: number,
): ElevationGrid {
  return gridFromFunction(b, cell, (x, y) => {
    const [lon, lat] = toWgs([x, y]);
    return sampleGeoRaster(raster, lon, lat);
  });
}

export function handle(req: WorkerRequest): WorkerResponse {
  switch (req.type) {
    case 'terrain-demo': {
      const cell = adaptiveCell(req.polygon, 3, 20);
      const grid = gridFromFunction(analysisBbox(req.polygon, req.profiles, cell * 3), cell, demoElevation);
      return {
        type: 'terrain',
        data: computeTerrain({ grid, polygon: req.polygon, profiles: req.profiles }),
      };
    }
    case 'terrain-geo': {
      // a DEM ~30 m-es; ennél sűrűbb rács csak simítja a felületet, de a kis telkeknél kell a mintaszám
      const cell = adaptiveCell(req.polygon, 5, 30);
      const grid = resampleToEov(req.raster, analysisBbox(req.polygon, req.profiles, cell * 3), cell);
      return {
        type: 'terrain',
        data: computeTerrain({
          grid,
          polygon: req.polygon,
          profiles: req.profiles,
          profileStepM: Math.max(5, cell),
        }),
      };
    }
    case 'demo-base': {
      const grid = gridFromFunction(req.bbox, req.cellSize, demoElevation);
      const coarse = gridFromFunction(req.bbox, req.cellSize * 2, demoElevation);
      return { type: 'demo-base', image: renderHillshade(grid, req.dark), contours: contours(coarse, 5, 25) };
    }
    case 'raster-overlap': {
      const area = polygonArea(req.polygon);
      const cell = Math.max(2, Math.sqrt(area) / 40);
      const b = bbox(req.polygon[0] ?? []);
      let inside = 0;
      let hit = 0;
      let valid = 0;
      let maxV: number | null = null;
      for (let y = b[1] + cell / 2; y < b[3]; y += cell)
        for (let x = b[0] + cell / 2; x < b[2]; x += cell) {
          if (!pointInPolygon([x, y], req.polygon)) continue;
          inside++;
          const [lon, lat] = toWgs([x, y]);
          const v = sampleGeoRaster(req.raster, lon, lat);
          if (Number.isNaN(v)) continue;
          valid++;
          if (v > req.threshold) {
            hit++;
            maxV = maxV === null ? v : Math.max(maxV, v);
          }
        }
      const n = Math.max(1, inside);
      return {
        type: 'raster-overlap',
        data: {
          overlapPct: (hit / n) * 100,
          overlapAreaM2: (hit / n) * area,
          maxValue: maxV,
          validPct: (valid / n) * 100,
        },
      };
    }
  }
}
