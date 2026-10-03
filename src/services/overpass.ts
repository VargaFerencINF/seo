/**
 * Overpass API: utak, légvezetékek, vízfolyások (2 km) és épületek (1 km) a telek környezetében.
 * Használati szabályzat: kevés, sorosított kérés, azonosító User-Agent (natívon), gyorsítótár.
 */
import { ENDPOINTS, PROXIMITY_RADIUS_M, SOURCES } from '../config';
import { http } from '../native/http';
import type { Eov } from '../types';
import { toEov } from '../analysis/eov';
import type { BboxWgs } from './cog';
import { Limiter } from './limiter';
import type { DataService } from './service';
import { keyNum } from '../storage/cache';
import type { LineFeature } from '../analysis/proximity';

/** Overpass: egyszerre egy kérés, legalább 1,5 s szünettel */
const limiter = new Limiter(1, 1500);

export interface OverpassFeatures {
  roads: LineFeature[];
  powerLines: LineFeature[];
  waterways: LineFeature[];
  buildings: { point: Eov; name?: string }[];
  truncatedBuildings: boolean;
}

const EXCLUDED_HIGHWAYS =
  'footway|path|cycleway|steps|bridleway|corridor|proposed|construction|platform|elevator|via_ferrata|raceway|bus_stop';

export function buildQuery(big: BboxWgs, small: BboxWgs, maxBuildings = 3000): string {
  const bb = (b: BboxWgs) => `${b[1].toFixed(6)},${b[0].toFixed(6)},${b[3].toFixed(6)},${b[2].toFixed(6)}`;
  return [
    '[out:json][timeout:40];',
    '(',
    `  way["highway"]["highway"!~"^(${EXCLUDED_HIGHWAYS})$"](${bb(big)});`,
    `  way["power"~"^(line|minor_line|cable)$"](${bb(big)});`,
    `  way["waterway"~"^(river|stream|canal|ditch|drain|brook)$"](${bb(big)});`,
    ')->.lines;',
    '.lines out tags geom;',
    `way["building"](${bb(small)});`,
    `out tags center ${maxBuildings};`,
  ].join('\n');
}

interface OsmElement {
  type: 'way' | 'node' | 'relation';
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  center?: { lat: number; lon: number };
}

const HIGHWAY_HU: Record<string, string> = {
  motorway: 'autópálya',
  trunk: 'autóút',
  primary: 'főút',
  secondary: 'mellékút',
  tertiary: 'összekötő út',
  unclassified: 'egyéb közút',
  residential: 'lakóutca',
  service: 'kiszolgáló út',
  living_street: 'lakó-pihenő övezet',
  track: 'földút',
};

export function parseOverpass(json: { elements?: OsmElement[] }, maxBuildings = 3000): OverpassFeatures {
  const out: OverpassFeatures = {
    roads: [],
    powerLines: [],
    waterways: [],
    buildings: [],
    truncatedBuildings: false,
  };
  for (const el of json.elements ?? []) {
    const t = el.tags ?? {};
    if (el.geometry && el.geometry.length >= 2) {
      const line = el.geometry.map((g) => toEov([g.lon, g.lat]));
      const name = t.name ?? t.ref;
      if (t.highway) {
        const kind = HIGHWAY_HU[t.highway] ?? t.highway;
        out.roads.push({ line, name: name ? `${name} (${kind})` : kind, kind: t.highway });
      } else if (t.power) {
        const v = t.voltage ? ` ${Math.round(Number(t.voltage.split(';')[0]) / 1000)} kV` : '';
        out.powerLines.push({
          line,
          name: `${t.power === 'cable' ? 'földkábel' : 'légvezeték'}${v}${name ? ` – ${name}` : ''}`,
          kind: t.power,
        });
      } else if (t.waterway) {
        out.waterways.push({ line, ...(name ? { name } : {}), kind: t.waterway });
      }
    } else if (el.center && t.building) {
      out.buildings.push({ point: toEov([el.center.lon, el.center.lat]) });
    }
  }
  // a földkábel nem keresztezési kockázat (légvezeték), de csatlakozási pont – a légvezetékek közt marad,
  // a keresztezést a pontozás csak a légvezetékre értelmezi
  out.truncatedBuildings = out.buildings.length >= maxBuildings;
  return out;
}

/** bbox kiterjesztése méterben (WGS84 közelítés) */
export function expandWgs(b: BboxWgs, meters: number): BboxWgs {
  const lat = (b[1] + b[3]) / 2;
  const dLat = meters / 111320;
  const dLon = meters / (111320 * Math.cos((lat * Math.PI) / 180));
  return [b[0] - dLon, b[1] - dLat, b[2] + dLon, b[3] + dLat];
}

export const overpassService: DataService<{ bbox: BboxWgs }, OverpassFeatures> = {
  info: SOURCES.overpass,
  ttlMs: 30 * 24 * 3600 * 1000,
  cacheKey: ({ bbox }) => bbox.map((v) => keyNum(v, 4)).join(','),
  async fetchLive({ bbox }, ctx) {
    const big = expandWgs(bbox, PROXIMITY_RADIUS_M);
    const small = expandWgs(bbox, 1000);
    const query = buildQuery(big, small);
    const res = await limiter.run(() =>
      http<{ elements?: OsmElement[]; remark?: string }>({
        url: ENDPOINTS.overpass,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: `data=${encodeURIComponent(query)}`,
        responseType: 'json',
        timeoutMs: 60000,
        signal: ctx.signal,
      }),
    );
    if (res.data.remark && /runtime error|timed out|out of memory/i.test(res.data.remark))
      throw new Error(
        `Az Overpass szerver nem tudta végrehajtani a lekérdezést (${res.data.remark.slice(0, 120)}).`,
      );
    return parseOverpass(res.data);
  },
};
