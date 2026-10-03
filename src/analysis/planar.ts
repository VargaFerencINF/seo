/**
 * Síkbeli geometria EOV-koordinátákon (méter). Minden terület-, hossz- és távolságszámítás itt történik.
 * Gyűrűk: nem feltétlenül zártak; a függvények mindkét formát kezelik.
 */
import type { Eov } from '../types';

export type Ring = Eov[];

/** Zárt gyűrűből az ismétlődő utolsó pont elhagyása */
export function openRing(ring: Ring): Ring {
  if (ring.length > 1) {
    const a = ring[0]!;
    const b = ring[ring.length - 1]!;
    if (a[0] === b[0] && a[1] === b[1]) return ring.slice(0, -1);
  }
  return ring;
}

export function closeRing(ring: Ring): Ring {
  const r = openRing(ring);
  return r.length ? [...r, r[0]!] : r;
}

/** Előjeles terület (shoelace) – pozitív, ha az óramutatóval ellentétes */
export function signedArea(ring: Ring): number {
  const r = openRing(ring);
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i]!;
    const [x2, y2] = r[(i + 1) % r.length]!;
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

/** Poligon területe m²-ben (külső gyűrű mínusz lyukak) */
export function polygonArea(rings: Ring[]): number {
  if (!rings.length) return 0;
  let a = Math.abs(signedArea(rings[0]!));
  for (const hole of rings.slice(1)) a -= Math.abs(signedArea(hole));
  return Math.max(0, a);
}

export function ringLength(ring: Ring, closed = true): number {
  const r = closed ? closeRing(ring) : ring;
  let len = 0;
  for (let i = 1; i < r.length; i++) len += dist(r[i - 1]!, r[i]!);
  return len;
}

/** Kerület: a külső gyűrű hossza (a lyukak határát is beleszámítjuk) */
export function polygonPerimeter(rings: Ring[]): number {
  return rings.reduce((s, r) => s + ringLength(r, true), 0);
}

export function dist(a: Eov, b: Eov): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Területi súlypont (külső gyűrű) */
export function ringCentroid(ring: Ring): Eov {
  const r = openRing(ring);
  let cx = 0;
  let cy = 0;
  let a2 = 0;
  // numerikus stabilitás: eltolás az első pontra
  const [ox, oy] = r[0] ?? [0, 0];
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = [r[i]![0] - ox, r[i]![1] - oy];
    const nxt = r[(i + 1) % r.length]!;
    const [x2, y2] = [nxt[0] - ox, nxt[1] - oy];
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
    a2 += f;
  }
  if (Math.abs(a2) < 1e-9) {
    const n = r.length || 1;
    return [r.reduce((s, p) => s + p[0], 0) / n, r.reduce((s, p) => s + p[1], 0) / n];
  }
  return [ox + cx / (3 * a2), oy + cy / (3 * a2)];
}

export function bbox(points: Eov[]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/** Pont a gyűrűben (ray casting); a határon lévő pontot belsőnek tekintjük */
export function pointInRing(p: Eov, ring: Ring): boolean {
  const r = openRing(ring);
  const [x, y] = p;
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i]!;
    const [xj, yj] = r[j]!;
    if (pointSegmentDistance(p, r[j]!, r[i]!) < 1e-9) return true;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(p: Eov, rings: Ring[]): boolean {
  if (!rings.length || !pointInRing(p, rings[0]!)) return false;
  for (const hole of rings.slice(1)) if (pointInRing(p, hole) && !onRingBoundary(p, hole)) return false;
  return true;
}

function onRingBoundary(p: Eov, ring: Ring): boolean {
  const r = closeRing(ring);
  for (let i = 1; i < r.length; i++) if (pointSegmentDistance(p, r[i - 1]!, r[i]!) < 1e-9) return true;
  return false;
}

export function pointSegmentDistance(p: Eov, a: Eov, b: Eov): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function orient(a: Eov, b: Eov, c: Eov): number {
  const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return Math.abs(v) < 1e-12 ? 0 : v > 0 ? 1 : -1;
}

function onSegment(a: Eov, b: Eov, p: Eov): boolean {
  return (
    Math.min(a[0], b[0]) - 1e-12 <= p[0] &&
    p[0] <= Math.max(a[0], b[0]) + 1e-12 &&
    Math.min(a[1], b[1]) - 1e-12 <= p[1] &&
    p[1] <= Math.max(a[1], b[1]) + 1e-12
  );
}

export function segmentsIntersect(p1: Eov, p2: Eov, q1: Eov, q2: Eov): boolean {
  const o1 = orient(p1, p2, q1);
  const o2 = orient(p1, p2, q2);
  const o3 = orient(q1, q2, p1);
  const o4 = orient(q1, q2, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, p2, q2)) return true;
  if (o3 === 0 && onSegment(q1, q2, p1)) return true;
  if (o4 === 0 && onSegment(q1, q2, p2)) return true;
  return false;
}

export function segmentSegmentDistance(a1: Eov, a2: Eov, b1: Eov, b2: Eov): number {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(
    pointSegmentDistance(a1, b1, b2),
    pointSegmentDistance(a2, b1, b2),
    pointSegmentDistance(b1, a1, a2),
    pointSegmentDistance(b2, a1, a2),
  );
}

/** Vonal metszi-e (vagy érinti-e) a poligon határát, vagy fut-e a belsejében */
export function lineIntersectsPolygon(line: Eov[], rings: Ring[]): boolean {
  if (line.some((p) => pointInPolygon(p, rings))) return true;
  for (const ring of rings) {
    const r = closeRing(ring);
    for (let i = 1; i < r.length; i++)
      for (let j = 1; j < line.length; j++)
        if (segmentsIntersect(r[i - 1]!, r[i]!, line[j - 1]!, line[j]!)) return true;
  }
  return false;
}

/** Poligon – vonallánc távolság (0, ha metszi vagy benne fut) */
export function polygonLineDistance(rings: Ring[], line: Eov[]): number {
  if (!line.length) return Infinity;
  if (lineIntersectsPolygon(line, rings)) return 0;
  let best = Infinity;
  const outer = closeRing(rings[0] ?? []);
  if (line.length === 1) {
    for (let i = 1; i < outer.length; i++)
      best = Math.min(best, pointSegmentDistance(line[0]!, outer[i - 1]!, outer[i]!));
    return best;
  }
  for (let i = 1; i < outer.length; i++)
    for (let j = 1; j < line.length; j++)
      best = Math.min(best, segmentSegmentDistance(outer[i - 1]!, outer[i]!, line[j - 1]!, line[j]!));
  return best;
}

/** Poligon – pont távolság (0, ha benne van) */
export function polygonPointDistance(rings: Ring[], p: Eov): number {
  return polygonLineDistance(rings, [p]);
}

/** Poligon – poligon távolság (0, ha átfednek) */
export function polygonPolygonDistance(a: Ring[], b: Ring[]): number {
  const bOuter = closeRing(b[0] ?? []);
  if (!bOuter.length) return Infinity;
  if (pointInPolygon(bOuter[0]!, a) || pointInPolygon(closeRing(a[0] ?? [])[0]!, b)) return 0;
  return polygonLineDistance(a, bOuter);
}

/** Önmetsző-e a gyűrű (nem szomszédos élek metszése) */
export function isSelfIntersecting(ring: Ring): boolean {
  const r = openRing(ring);
  const n = r.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = r[i]!;
    const a2 = r[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      const b1 = r[j]!;
      const b2 = r[(j + 1) % n]!;
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

/** A két egymástól legtávolabbi csúcs (leghosszabb átló) */
export function longestDiagonal(ring: Ring): [Eov, Eov, number] {
  const r = openRing(ring);
  let best: [Eov, Eov, number] = [r[0]!, r[0]!, 0];
  for (let i = 0; i < r.length; i++)
    for (let j = i + 1; j < r.length; j++) {
      const d = dist(r[i]!, r[j]!);
      if (d > best[2]) best = [r[i]!, r[j]!, d];
    }
  return best;
}

/** Egyenletes mintavétel egy vonalláncon (lépésköz m) – a végpontot mindig tartalmazza */
export function sampleLine(line: Eov[], stepM: number): { p: Eov; d: number }[] {
  const out: { p: Eov; d: number }[] = [];
  if (!line.length) return out;
  out.push({ p: line[0]!, d: 0 });
  let carried = 0;
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const seg = dist(a, b);
    let t = stepM - carried;
    while (t <= seg) {
      const f = t / seg;
      out.push({ p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], d: total + t });
      t += stepM;
    }
    carried = seg - (t - stepM);
    total += seg;
  }
  const last = out[out.length - 1]!;
  if (total - last.d > 1e-6) out.push({ p: line[line.length - 1]!, d: total });
  return out;
}

/** Egyszerűsített „pufferelt” kiterjedés (bbox + margó) */
export function expandBbox(b: [number, number, number, number], m: number): [number, number, number, number] {
  return [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
}

/**
 * Poligon vágása egy másik (konvex vagy konkáv) poligon által területarány becsléséhez:
 * rácsos mintavétel – robusztus önmetsző vagy bonyolult geometriákra is.
 */
export function overlapAreaBySampling(target: Ring[], others: Ring[][], cellM: number): number {
  const b = bbox(target[0] ?? []);
  let hit = 0;
  for (let y = b[1] + cellM / 2; y < b[3]; y += cellM)
    for (let x = b[0] + cellM / 2; x < b[2]; x += cellM) {
      const p: Eov = [x, y];
      if (!pointInPolygon(p, target)) continue;
      if (others.some((o) => pointInPolygon(p, o))) hit++;
    }
  return hit * cellM * cellM;
}
