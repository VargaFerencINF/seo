/** Színkezelés a háttértérkép-stílus átszínezéséhez (zsályazöld / sötét téma). */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FN = /^(rgba?|hsla?)\(([^)]+)\)$/i;

export function parseColor(input: string): Rgba | null {
  const s = input.trim();
  const hex = HEX.exec(s);
  if (hex) {
    let v = hex[1]!;
    if (v.length <= 4) v = [...v].map((c) => c + c).join('');
    const n = (i: number) => parseInt(v.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: v.length === 8 ? n(6) / 255 : 1 };
  }
  const fn = FN.exec(s);
  if (!fn) return null;
  const parts = fn[2]!.split(/[\s,/]+/).filter(Boolean);
  const num = (p: string | undefined, scale = 1) =>
    p === undefined ? NaN : p.endsWith('%') ? (parseFloat(p) / 100) * scale : parseFloat(p);
  if (fn[1]!.toLowerCase().startsWith('rgb')) {
    const [r, g, b] = [num(parts[0], 255), num(parts[1], 255), num(parts[2], 255)];
    const a = parts[3] === undefined ? 1 : num(parts[3], 1);
    if ([r, g, b, a].some(Number.isNaN)) return null;
    return { r, g, b, a };
  }
  const hDeg = parseFloat(parts[0] ?? '');
  const sat = num(parts[1], 1);
  const light = num(parts[2], 1);
  const a = parts[3] === undefined ? 1 : num(parts[3], 1);
  if ([hDeg, sat, light, a].some(Number.isNaN)) return null;
  return { ...hslToRgb(hDeg, sat, light), a };
}

export function toCss({ r, g, b, a }: Rgba): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v)));
  return a >= 1 ? `rgb(${c(r)}, ${c(g)}, ${c(b)})` : `rgba(${c(r)}, ${c(g)}, ${c(b)}, ${+a.toFixed(3)})`;
}

export function rgbToHsl({ r, g, b }: Rgba): { h: number; s: number; l: number } {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}

export function mix(a: Rgba, b: Rgba, t: number): Rgba {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t,
  };
}

const SAGE: Rgba = { r: 214, g: 225, b: 206, a: 1 };

/** Világos téma: enyhe zsályazöld tónus minden színre. */
export function tintLight(c: Rgba): Rgba {
  return mix(c, { ...SAGE, a: c.a }, 0.28);
}

/** Sötét téma: világosság megfordítása, telítettség csökkentése, zöldes tónus. */
export function tintDark(c: Rgba): Rgba {
  const { h, s, l } = rgbToHsl(c);
  const nl = 0.08 + (1 - l) * 0.62;
  const rgb = hslToRgb(h, s * 0.55, nl);
  return mix({ ...rgb, a: c.a }, { r: 26, g: 40, b: 31, a: c.a }, 0.2);
}

/** Rekurzívan átszínez minden szín-sztringet egy (stílus)objektumban. */
export function recolorDeep<T>(value: T, fn: (c: Rgba) => Rgba): T {
  if (typeof value === 'string') {
    const c = parseColor(value);
    return (c ? toCss(fn(c)) : value) as T;
  }
  if (Array.isArray(value)) return value.map((v) => recolorDeep(v, fn)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = recolorDeep(v, fn);
    return out as T;
  }
  return value;
}
