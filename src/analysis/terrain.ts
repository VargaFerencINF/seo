/**
 * Domborzati elemzés szabályos EOV-rácson: magasság-statisztika, lejtés és kitettség (Horn-módszer),
 * terepmetszet. Tiszta függvények – Web Workerben futnak.
 */
import type { AspectClass, Eov, TerrainMetrics, TerrainProfile } from '../types';
import { bbox, pointInPolygon, sampleLine, type Ring } from './planar';

/** Szabályos rács EOV-ban. A sor 0 az ÉSZAKI (legnagyobb y) sor. */
export interface ElevationGrid {
  /** bal felső cella KÖZÉPPONTJA */
  x0: number;
  y0: number;
  cellSize: number;
  cols: number;
  rows: number;
  /** NaN = nincs adat */
  values: Float32Array;
}

export function gridValue(g: ElevationGrid, col: number, row: number): number {
  if (col < 0 || row < 0 || col >= g.cols || row >= g.rows) return NaN;
  return g.values[row * g.cols + col]!;
}

export function cellCenter(g: ElevationGrid, col: number, row: number): Eov {
  return [g.x0 + col * g.cellSize, g.y0 - row * g.cellSize];
}

/** Bilineáris súlyozás; a hiányzó (NaN) szomszédok súlyát a többire osztja szét */
export function bilinear(v00: number, v10: number, v01: number, v11: number, tx: number, ty: number): number {
  const w = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
  const v = [v00, v10, v01, v11];
  let sum = 0;
  let wsum = 0;
  for (let i = 0; i < 4; i++) {
    if (Number.isNaN(v[i]!) || w[i]! <= 0) continue;
    sum += v[i]! * w[i]!;
    wsum += w[i]!;
  }
  return wsum > 1e-9 ? sum / wsum : NaN;
}

/** Bilineáris interpoláció EOV-pontban */
export function sampleGrid(g: ElevationGrid, p: Eov): number {
  const fx = (p[0] - g.x0) / g.cellSize;
  const fy = (g.y0 - p[1]) / g.cellSize;
  const c0 = Math.floor(fx);
  const r0 = Math.floor(fy);
  const tx = fx - c0;
  const ty = fy - r0;
  return bilinear(
    gridValue(g, c0, r0),
    gridValue(g, c0 + 1, r0),
    gridValue(g, c0, r0 + 1),
    gridValue(g, c0 + 1, r0 + 1),
    tx,
    ty,
  );
}

/** Rács létrehozása egy z(x, y) függvényből (demó és tesztek) */
export function gridFromFunction(
  bboxEov: [number, number, number, number],
  cellSize: number,
  z: (x: number, y: number) => number,
): ElevationGrid {
  const cols = Math.max(3, Math.ceil((bboxEov[2] - bboxEov[0]) / cellSize) + 1);
  const rows = Math.max(3, Math.ceil((bboxEov[3] - bboxEov[1]) / cellSize) + 1);
  const x0 = bboxEov[0];
  const y0 = bboxEov[1] + (rows - 1) * cellSize;
  const values = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) values[r * cols + c] = z(x0 + c * cellSize, y0 - r * cellSize);
  return { x0, y0, cellSize, cols, rows, values };
}

export interface SlopeAspect {
  slopeDeg: number;
  /** 0 = észak felé lejt, óramutató szerint; NaN, ha sík */
  aspectDeg: number;
}

/**
 * Horn (1981) 3×3 lejtés/kitettség. A kitettség az a vízszintes irány, amerre a felszín LEJT.
 * Koordináták: x kelet, y észak (EOV), a sorok északról dél felé nőnek.
 */
export function hornSlopeAspect(g: ElevationGrid, col: number, row: number): SlopeAspect | null {
  const z = (dc: number, dr: number) => {
    const v = gridValue(g, col + dc, row + dr);
    return Number.isNaN(v) ? gridValue(g, col, row) : v;
  };
  const center = gridValue(g, col, row);
  if (Number.isNaN(center)) return null;
  const a = z(-1, -1);
  const b = z(0, -1);
  const c = z(1, -1);
  const d = z(-1, 0);
  const f = z(1, 0);
  const gg = z(-1, 1);
  const h = z(0, 1);
  const i = z(1, 1);
  const cs = g.cellSize;
  // dz/dx (kelet felé), dz/dy (észak felé; a sor 0 az északi)
  const dzdx = (c + 2 * f + i - (a + 2 * d + gg)) / (8 * cs);
  const dzdy = (a + 2 * b + c - (gg + 2 * h + i)) / (8 * cs);
  const grad = Math.hypot(dzdx, dzdy);
  const slopeDeg = (Math.atan(grad) * 180) / Math.PI;
  if (grad < 1e-9) return { slopeDeg: 0, aspectDeg: NaN };
  // lejtésirány = −gradiens; azimut északtól óramutató szerint: atan2(kelet, észak)
  let aspect = (Math.atan2(-dzdx, -dzdy) * 180) / Math.PI;
  if (aspect < 0) aspect += 360;
  return { slopeDeg, aspectDeg: aspect };
}

const ASPECT_CLASSES: AspectClass[] = ['É', 'ÉK', 'K', 'DK', 'D', 'DNy', 'Ny', 'ÉNy'];

export function aspectClass(deg: number): AspectClass {
  if (Number.isNaN(deg)) return 'sík';
  return ASPECT_CLASSES[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;
}

/** Sík terepnek tekintjük, ha a lejtés e foknál kisebb */
export const FLAT_SLOPE_DEG = 2;

export interface TerrainInput {
  grid: ElevationGrid;
  polygon: Ring[];
  profiles: { label: string; line: Eov[] }[];
  profileStepM?: number;
}

export function computeTerrain(input: TerrainInput): TerrainMetrics {
  const { grid, polygon } = input;
  const shares: Record<AspectClass, number> = {
    É: 0,
    ÉK: 0,
    K: 0,
    DK: 0,
    D: 0,
    DNy: 0,
    Ny: 0,
    ÉNy: 0,
    sík: 0,
  };
  let n = 0;
  let sumZ = 0;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let sumSlope = 0;
  let maxSlope = 0;
  let sumTan = 0;
  let vx = 0;
  let vy = 0;

  const b = bbox(polygon[0] ?? []);
  const c0 = Math.max(0, Math.floor((b[0] - grid.x0) / grid.cellSize));
  const c1 = Math.min(grid.cols - 1, Math.ceil((b[2] - grid.x0) / grid.cellSize));
  const r0 = Math.max(0, Math.floor((grid.y0 - b[3]) / grid.cellSize));
  const r1 = Math.min(grid.rows - 1, Math.ceil((grid.y0 - b[1]) / grid.cellSize));

  const visit = (col: number, row: number) => {
    const zv = gridValue(grid, col, row);
    const sa = hornSlopeAspect(grid, col, row);
    if (Number.isNaN(zv) || !sa) return;
    n++;
    sumZ += zv;
    minZ = Math.min(minZ, zv);
    maxZ = Math.max(maxZ, zv);
    sumSlope += sa.slopeDeg;
    sumTan += Math.tan((sa.slopeDeg * Math.PI) / 180);
    maxSlope = Math.max(maxSlope, sa.slopeDeg);
    const cls = sa.slopeDeg < FLAT_SLOPE_DEG ? 'sík' : aspectClass(sa.aspectDeg);
    shares[cls]++;
    if (!Number.isNaN(sa.aspectDeg)) {
      const w = Math.sin((sa.slopeDeg * Math.PI) / 180);
      vx += Math.sin((sa.aspectDeg * Math.PI) / 180) * w;
      vy += Math.cos((sa.aspectDeg * Math.PI) / 180) * w;
    }
  };

  for (let row = r0; row <= r1; row++)
    for (let col = c0; col <= c1; col++)
      if (pointInPolygon(cellCenter(grid, col, row), polygon)) visit(col, row);

  // Kis telek: ha egy cellaközéppont sem esik bele, a súlyponthoz legközelebbi cellát használjuk
  if (n === 0) {
    const cx = (b[0] + b[2]) / 2;
    const cy = (b[1] + b[3]) / 2;
    visit(Math.round((cx - grid.x0) / grid.cellSize), Math.round((grid.y0 - cy) / grid.cellSize));
  }
  if (n === 0) throw new Error('A telek területére nincs érvényes domborzati adat.');

  for (const k of Object.keys(shares) as AspectClass[]) shares[k] = shares[k] / n;
  const meanSlopeDeg = sumSlope / n;
  let meanAspectDeg: number | null = null;
  if (Math.hypot(vx, vy) > 1e-9) {
    meanAspectDeg = (Math.atan2(vx, vy) * 180) / Math.PI;
    if (meanAspectDeg < 0) meanAspectDeg += 360;
  }
  let dominantAspect: AspectClass = 'sík';
  if (meanSlopeDeg >= FLAT_SLOPE_DEG) {
    let best = -1;
    for (const k of ASPECT_CLASSES)
      if (shares[k] > best) {
        best = shares[k];
        dominantAspect = k;
      }
  }

  const step = input.profileStepM ?? Math.max(1, grid.cellSize / 2);
  const profiles: TerrainProfile[] = input.profiles.map((pr) => {
    const samples = sampleLine(pr.line, step);
    const points = samples.map((s) => {
      const z = sampleGrid(grid, s.p);
      return { d: s.d, z: Number.isNaN(z) ? null : Math.round(z * 100) / 100 };
    });
    return { label: pr.label, line: [], lengthM: samples[samples.length - 1]?.d ?? 0, points };
  });

  return {
    minElevM: minZ,
    maxElevM: maxZ,
    meanElevM: sumZ / n,
    reliefM: maxZ - minZ,
    meanSlopeDeg,
    maxSlopeDeg: maxSlope,
    meanSlopePct: (sumTan / n) * 100,
    dominantAspect,
    meanAspectDeg,
    aspectShares: shares,
    sampleCount: n,
    cellSizeM: grid.cellSize,
    profiles,
  };
}

/** Raszter (földrajzi rács) → EOV-rács bilineáris újramintavételezéssel */
export interface GeoRaster {
  /** bal felső pixel KÖZÉPPONTJA (fok) */
  lon0: number;
  lat0: number;
  dLon: number;
  dLat: number;
  width: number;
  height: number;
  values: Float32Array | Int16Array | Float64Array;
  noData: number | null;
}

export function sampleGeoRaster(r: GeoRaster, lon: number, lat: number): number {
  const fx = (lon - r.lon0) / r.dLon;
  const fy = (r.lat0 - lat) / r.dLat;
  const c0 = Math.floor(fx);
  const r0 = Math.floor(fy);
  const tx = fx - c0;
  const ty = fy - r0;
  const at = (c: number, rr: number) => {
    const cc = Math.min(r.width - 1, Math.max(0, c));
    const rc = Math.min(r.height - 1, Math.max(0, rr));
    const v = r.values[rc * r.width + cc]!;
    return r.noData !== null && v === r.noData ? NaN : v;
  };
  if (fx < -0.5 || fy < -0.5 || fx > r.width - 0.5 || fy > r.height - 0.5) return NaN;
  return bilinear(at(c0, r0), at(c0 + 1, r0), at(c0, r0 + 1), at(c0 + 1, r0 + 1), tx, ty);
}
