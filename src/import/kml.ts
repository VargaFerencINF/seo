/** KML import (Google Earth stb.) – @tmcw/togeojson */
import { kml } from '@tmcw/togeojson';
import { ImportError, type ImportResult } from './types';
import { importGeoJson } from './geojson';

export function importKml(text: string, parser: DOMParser = new DOMParser()): ImportResult {
  const doc = parser.parseFromString(text, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length)
    throw new ImportError('A KML fájl nem értelmezhető XML.');
  const fc = kml(doc);
  return importGeoJson(JSON.stringify(fc));
}
