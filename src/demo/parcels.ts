/** A demó 3 mintatelke (EOV-ban megadva, WGS84-be vetítve). */
import type { Polygon } from 'geojson';
import { toWgs } from '../analysis/eov';
import type { Eov } from '../types';

export interface DemoParcelDef {
  id: string;
  name: string;
  note: string;
  tags: string[];
  ring: Eov[];
}

export const DEMO_PARCELS: DemoParcelDef[] = [
  {
    id: 'demo-1',
    name: 'Napos domboldal (mintatelek 1)',
    note: 'Enyhe déli lejtő a falu szélén, út mellett – várhatóan kedvező.',
    tags: ['demó', 'lakóépület'],
    ring: [
      [699880, 255168],
      [699922, 255166],
      [699926, 255204],
      [699884, 255207],
    ],
  },
  {
    id: 'demo-2',
    name: 'Ártéri rét (mintatelek 2)',
    note: 'A patak menti réten, Natura 2000 és árvízi területen.',
    tags: ['demó', 'mezőgazdasági'],
    ring: [
      [699000, 254300],
      [699250, 254260],
      [699300, 254480],
      [699080, 254560],
      [698980, 254450],
    ],
  },
  {
    id: 'demo-3',
    name: 'Vezeték alatti északi lejtő (mintatelek 3)',
    note: 'A déli gerinc északi oldalán, légvezeték keresztezi.',
    tags: ['demó', 'napelempark'],
    ring: [
      [700760, 253660],
      [700930, 253640],
      [700950, 253800],
      [700780, 253820],
    ],
  },
];

export function demoPolygon(def: DemoParcelDef): Polygon {
  const ring = def.ring.map((p) => toWgs(p));
  return { type: 'Polygon', coordinates: [[...ring, ring[0]!]] };
}
