/** Demó alaptérkép: domborzatárnyékolás (hillshade) és szintvonalak a procedurális DEM-ből. */
import type { ElevationGrid } from '../analysis/terrain';
import { gridValue, hornSlopeAspect } from '../analysis/terrain';

export interface HillshadeImage {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

/** Hipszometrikus színezés + árnyékolás a topó-hangulathoz */
export function renderHillshade(
  g: ElevationGrid,
  dark: boolean,
  azimuth = 315,
  altitude = 45,
): HillshadeImage {
  const { cols, rows } = g;
  const rgba = new Uint8ClampedArray(cols * rows * 4);
  let zmin = Infinity;
  let zmax = -Infinity;
  for (const v of g.values) {
    if (v < zmin) zmin = v;
    if (v > zmax) zmax = v;
  }
  const az = ((360 - azimuth + 90) * Math.PI) / 180;
  const zen = ((90 - altitude) * Math.PI) / 180;
  const lowL = dark ? [32, 48, 38] : [222, 232, 214];
  const highL = dark ? [58, 70, 52] : [236, 230, 205];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const sa = hornSlopeAspect(g, c, r);
      const z = gridValue(g, c, r);
      const t = (z - zmin) / Math.max(1, zmax - zmin);
      let shade = 1;
      if (sa) {
        const slope = (sa.slopeDeg * Math.PI) / 180;
        // a kitettség északtól mért, a hillshade-képlet matematikai szöget vár
        const aspect = Number.isNaN(sa.aspectDeg) ? 0 : ((90 - sa.aspectDeg) * Math.PI) / 180;
        shade = Math.cos(zen) * Math.cos(slope) + Math.sin(zen) * Math.sin(slope) * Math.cos(az - aspect);
        shade = Math.max(0, shade);
      }
      const k = dark ? 0.55 + 0.6 * shade : 0.72 + 0.38 * shade;
      const i = (r * cols + c) * 4;
      rgba[i] = (lowL[0]! + (highL[0]! - lowL[0]!) * t) * k;
      rgba[i + 1] = (lowL[1]! + (highL[1]! - lowL[1]!) * t) * k;
      rgba[i + 2] = (lowL[2]! + (highL[2]! - lowL[2]!) * t) * k;
      rgba[i + 3] = 255;
    }
  return { width: cols, height: rows, rgba };
}

export interface ContourSet {
  level: number;
  index: boolean;
  /** szakaszok EOV-ban: [x1, y1, x2, y2] */
  segments: number[];
}

/** Marching squares szintvonalak */
export function contours(g: ElevationGrid, interval: number, indexEvery: number): ContourSet[] {
  let zmin = Infinity;
  let zmax = -Infinity;
  for (const v of g.values) {
    if (v < zmin) zmin = v;
    if (v > zmax) zmax = v;
  }
  const out: ContourSet[] = [];
  const cs = g.cellSize;
  for (let level = Math.ceil(zmin / interval) * interval; level <= zmax; level += interval) {
    const seg: number[] = [];
    for (let r = 0; r < g.rows - 1; r++)
      for (let c = 0; c < g.cols - 1; c++) {
        const tl = gridValue(g, c, r);
        const tr = gridValue(g, c + 1, r);
        const br = gridValue(g, c + 1, r + 1);
        const bl = gridValue(g, c, r + 1);
        const idx =
          (tl >= level ? 8 : 0) | (tr >= level ? 4 : 0) | (br >= level ? 2 : 0) | (bl >= level ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const x = g.x0 + c * cs;
        const y = g.y0 - r * cs;
        const lerp = (a: number, b: number) => (level - a) / (b - a);
        const top = (): [number, number] => [x + lerp(tl, tr) * cs, y];
        const right = (): [number, number] => [x + cs, y - lerp(tr, br) * cs];
        const bottom = (): [number, number] => [x + lerp(bl, br) * cs, y - cs];
        const left = (): [number, number] => [x, y - lerp(tl, bl) * cs];
        const add = (a: [number, number], b: [number, number]) => seg.push(a[0], a[1], b[0], b[1]);
        switch (idx) {
          case 1:
          case 14:
            add(left(), bottom());
            break;
          case 2:
          case 13:
            add(bottom(), right());
            break;
          case 3:
          case 12:
            add(left(), right());
            break;
          case 4:
          case 11:
            add(top(), right());
            break;
          case 5:
            add(left(), top());
            add(bottom(), right());
            break;
          case 6:
          case 9:
            add(top(), bottom());
            break;
          case 7:
          case 8:
            add(left(), top());
            break;
          case 10:
            add(top(), right());
            add(left(), bottom());
            break;
        }
      }
    out.push({ level, index: level % indexEvery === 0, segments: seg });
  }
  return out;
}
