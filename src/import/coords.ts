/**
 * Koordináták szöveges bevitele: WGS84 (tizedes fok vagy fok-perc-másodperc) vagy EOV (Y, X méterben).
 * Soronként egy pont; a rendszer és a tengelysorrend automatikusan felismerhető.
 */
import type { Eov, LngLat } from '../types';
import { toWgs, isPlausibleEov } from '../analysis/eov';
import { ImportError } from './types';

export type CoordSystem = 'auto' | 'wgs84' | 'eov';

export interface ParsedCoords {
  system: 'wgs84' | 'eov';
  points: LngLat[];
  notes: string[];
}

const DMS =
  /(-?\d+(?:[.,]\d+)?)\s*[°º]\s*(?:(\d+(?:[.,]\d+)?)\s*['′’]\s*)?(?:(\d+(?:[.,]\d+)?)\s*(?:["″”]|'')\s*)?([ÉDKNyNSEWO]{0,2})/giu;

function num(s: string): number {
  return Number(s.replace(',', '.'));
}

/** Egy sor számai (DMS-t is kezel) */
export function parseLine(line: string): number[] {
  const t = line.trim();
  if (!t) return [];
  if (/[°º]/.test(t)) {
    const out: number[] = [];
    for (const m of t.matchAll(DMS)) {
      let v = Math.abs(num(m[1]!)) + (m[2] ? num(m[2]) / 60 : 0) + (m[3] ? num(m[3]) / 3600 : 0);
      const hemi = (m[4] ?? '').toUpperCase();
      if (m[1]!.startsWith('-') || hemi === 'D' || hemi === 'S' || hemi === 'W' || hemi === 'NY') v = -v;
      out.push(v);
    }
    return out;
  }
  let parts: string[];
  if (t.includes(';')) parts = t.split(';');
  else if (/\s/.test(t)) parts = t.replace(/,\s+/g, ' ').split(/\s+/);
  else {
    parts = t.split(',');
    // „47,5,19,0” → tizedesvesszős pár
    if (parts.length === 4) parts = [`${parts[0]}.${parts[1]}`, `${parts[2]}.${parts[3]}`];
  }
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .map(num)
    .filter((v) => !Number.isNaN(v));
}

function looksEov(a: number, b: number): boolean {
  return Math.abs(a) > 1000 || Math.abs(b) > 1000;
}

export function parseCoordinates(text: string, system: CoordSystem = 'auto'): ParsedCoords {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\d+\s*[.)]\s+/, '')) // „1. ” sorszám
    .map(parseLine)
    .filter((r) => r.length >= 2);
  if (!rows.length)
    throw new ImportError(
      'Nem találtam koordinátapárt. Soronként egy pontot adj meg, pl. „47.5123, 19.0412” vagy „650123.4 240456.7”.',
    );
  const notes: string[] = [];
  const sys = system === 'auto' ? (looksEov(rows[0]![0]!, rows[0]![1]!) ? 'eov' : 'wgs84') : system;

  let points: LngLat[];
  if (sys === 'eov') {
    // EOV: Y (kelet, 400–950 ezer) és X (észak, 30–370 ezer) – a sorrendet felismerjük
    let swapped = 0;
    points = rows.map(([a, b]) => {
      let p: Eov = [a!, b!];
      if (!isPlausibleEov(p) && isPlausibleEov([b!, a!])) {
        p = [b!, a!];
        swapped++;
      }
      if (!isPlausibleEov(p))
        throw new ImportError(
          `A(z) „${a} ${b}” pont nem esik Magyarország EOV-tartományába (Y 400–950 ezer, X 30–370 ezer).`,
        );
      return toWgs(p);
    });
    if (swapped) notes.push(`${swapped} pontnál felcseréltem a sorrendet (X, Y → Y, X).`);
  } else {
    let swapped = 0;
    points = rows.map(([a, b]) => {
      // magyar szokás: szélesség, hosszúság (47…, 19…)
      const latFirst = a! >= 44 && a! <= 50 && b! >= 15 && b! <= 24;
      const lonFirst = b! >= 44 && b! <= 50 && a! >= 15 && a! <= 24;
      if (latFirst) return [b!, a!] as LngLat;
      if (lonFirst) {
        swapped++;
        return [a!, b!] as LngLat;
      }
      if (Math.abs(a!) > 90) return [a!, b!] as LngLat;
      return [b!, a!] as LngLat;
    });
    if (swapped) notes.push(`${swapped} pontot hosszúság, szélesség sorrendben értelmeztem.`);
    if (points.some(([lon, lat]) => lon < 16 || lon > 23 || lat < 45.5 || lat > 48.7))
      notes.push('Figyelem: van Magyarországon kívüli pont – ellenőrizd a koordinátákat.');
  }
  return { system: sys, points, notes };
}
