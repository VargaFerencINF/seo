/** Terepmetszet SVG-diagram (UI). A PDF saját vektoros rajzot használ ugyanebből az adatból. */
import type { TerrainProfile } from '../../types';
import { fmtNum } from '../../util/format';

const NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export function niceStep(range: number, target = 4): number {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

export function profileChart(p: TerrainProfile): SVGSVGElement {
  const W = 340;
  const H = 160;
  const m = { l: 38, r: 8, t: 10, b: 22 };
  const pts = p.points.filter((x) => x.z !== null) as { d: number; z: number }[];
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'profile-chart', role: 'img' });
  svg.setAttribute('aria-label', `Terepmetszet: ${p.label}`);
  if (pts.length < 2) return svg;
  let zmin = Math.min(...pts.map((x) => x.z));
  let zmax = Math.max(...pts.map((x) => x.z));
  // legalább 4 m függőleges tartomány, hogy a sík terep ne tűnjön meredeknek
  if (zmax - zmin < 4) {
    const c = (zmax + zmin) / 2;
    zmin = c - 2;
    zmax = c + 2;
  }
  const pad = (zmax - zmin) * 0.1;
  zmin -= pad;
  zmax += pad;
  const dmax = p.lengthM || pts[pts.length - 1]!.d;
  const sx = (d: number) => m.l + (d / dmax) * (W - m.l - m.r);
  const sy = (z: number) => m.t + (1 - (z - zmin) / (zmax - zmin)) * (H - m.t - m.b);

  const grid = el('g', { class: 'grid' });
  const axis = el('g', { class: 'axis' });
  const zs = niceStep(zmax - zmin);
  for (let z = Math.ceil(zmin / zs) * zs; z <= zmax; z += zs) {
    grid.append(el('line', { x1: m.l, x2: W - m.r, y1: sy(z), y2: sy(z) }));
    const t = el('text', { x: m.l - 4, y: sy(z) + 3, 'text-anchor': 'end' });
    t.textContent = `${fmtNum(z)} m`;
    axis.append(t);
  }
  const ds = niceStep(dmax);
  for (let d = 0; d <= dmax + 1e-6; d += ds) {
    const t = el('text', { x: sx(d), y: H - 6, 'text-anchor': 'middle' });
    t.textContent = `${fmtNum(d)}`;
    axis.append(t);
  }
  const unit = el('text', { x: W - m.r, y: H - 6, 'text-anchor': 'end' });
  unit.textContent = 'm';
  axis.append(unit);
  const line = pts.map((x, i) => `${i ? 'L' : 'M'}${sx(x.d).toFixed(1)},${sy(x.z).toFixed(1)}`).join('');
  const area = `${line}L${sx(pts[pts.length - 1]!.d).toFixed(1)},${H - m.b}L${sx(pts[0]!.d).toFixed(1)},${H - m.b}Z`;
  svg.append(grid, el('path', { d: area, class: 'area' }), el('path', { d: line, class: 'line' }), axis);
  return svg;
}
