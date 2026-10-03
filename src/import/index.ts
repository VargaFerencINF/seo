/** Fájlimport formátum-felismeréssel. */
import { importDxf } from './dxf';
import { importGeoJson } from './geojson';
import { importKml } from './kml';
import { ImportError, type ImportResult } from './types';

export { ImportError, type ImportResult };

export function importText(name: string, text: string): ImportResult {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const head = text.trimStart().slice(0, 200);
  if (ext === 'kml' || head.startsWith('<?xml') || /<kml/i.test(head)) return importKml(text);
  if (ext === 'dxf' || /^0\s*\r?\n\s*SECTION/.test(head)) return importDxf(text);
  if (ext === 'geojson' || ext === 'json' || head.startsWith('{')) return importGeoJson(text);
  if (ext === 'kmz')
    throw new ImportError('A KMZ (tömörített KML) nem támogatott. Mentsd el KML-ként, és azt importáld.');
  throw new ImportError(
    `Ismeretlen fájlformátum (${ext || 'kiterjesztés nélkül'}). Támogatott: GeoJSON, KML, DXF.`,
  );
}
