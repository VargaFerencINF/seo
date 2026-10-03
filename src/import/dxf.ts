/** DXF import (földmérői rajz, EOV-koordinátákkal): a legnagyobb zárt (LW)POLYLINE. */
import DxfParser from 'dxf-parser';
import type { Position } from 'geojson';
import { polygonArea } from '../analysis/planar';
import { ImportError, type ImportResult } from './types';
import { polygonsToResult } from './geojson';

interface DxfVertex {
  x: number;
  y: number;
}
interface DxfEntity {
  type: string;
  layer?: string;
  vertices?: DxfVertex[];
  shape?: boolean;
  closed?: boolean;
}

export function importDxf(text: string): ImportResult {
  let parsed: { entities?: DxfEntity[] } | null;
  try {
    parsed = new DxfParser().parseSync(text) as { entities?: DxfEntity[] } | null;
  } catch (err) {
    throw new ImportError(`A DXF fájl nem értelmezhető: ${err instanceof Error ? err.message : String(err)}`);
  }
  const polys: { rings: Position[][]; name?: string }[] = [];
  let openCount = 0;
  for (const e of parsed?.entities ?? []) {
    if ((e.type !== 'LWPOLYLINE' && e.type !== 'POLYLINE') || !e.vertices || e.vertices.length < 3) continue;
    const v = e.vertices.map((p) => [p.x, p.y] as [number, number]);
    const first = v[0]!;
    const last = v[v.length - 1]!;
    const closedByPoints = Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.01;
    if (!(e.shape || e.closed || closedByPoints)) {
      openCount++;
      continue;
    }
    const ring = closedByPoints ? v : [...v, first];
    if (polygonArea([ring]) < 1) continue;
    polys.push({ rings: [ring], ...(e.layer ? { name: `DXF réteg: ${e.layer}` } : {}) });
  }
  if (!polys.length)
    throw new ImportError(
      openCount
        ? 'A DXF-ben csak nyitott vonalláncot találtam. Zárd le a telekhatárt (closed polyline), majd exportáld újra.'
        : 'A DXF-ben nem találtam zárt LWPOLYLINE/POLYLINE telekhatárt.',
    );
  const sample = polys[0]!.rings[0]![0]!;
  if (Math.abs(sample[0]!) < 1000)
    throw new ImportError(
      'A DXF koordinátái nem EOV-méterek (túl kicsik). Az import EOV (EPSG:23700) rajzot vár.',
    );
  return polygonsToResult(polys, true, 'DXF');
}
