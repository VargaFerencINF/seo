import type { StyleSpecification, LayerSpecification } from 'maplibre-gl';
import { ENDPOINTS, SOURCES } from '../config';
import { http } from '../native/http';
import { recolorDeep, tintDark, tintLight } from './colors';

/** Hálózat nélküli tartalék: üres zsályazöld háttér. */
export function fallbackStyle(dark: boolean): StyleSpecification {
  return {
    version: 8,
    name: 'teleklato-fallback',
    sources: {},
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': dark ? '#121a15' : '#e7ece3' } },
    ],
  };
}

let cachedLiberty: StyleSpecification | null = null;

/**
 * OpenFreeMap „liberty” stílus letöltése és átszínezése a Teleklátó arculatára.
 * A 3D épületeket kihagyjuk (teljesítmény, mobil).
 */
export async function loadLiveStyle(dark: boolean): Promise<StyleSpecification> {
  if (!cachedLiberty) {
    const res = await http<StyleSpecification>({
      url: ENDPOINTS.basemapStyle,
      responseType: 'json',
      timeoutMs: 12000,
    });
    cachedLiberty = res.data;
  }
  const base = cachedLiberty;
  const layers = base.layers.filter((l) => l.type !== 'fill-extrusion').map((l) => adjustLayer(l, dark));
  const style: StyleSpecification = {
    ...base,
    name: `teleklato-${dark ? 'dark' : 'light'}`,
    layers,
  };
  // Saját attribúció a forrásokon
  for (const src of Object.values(style.sources)) {
    if ('attribution' in src || src.type === 'vector' || src.type === 'raster') {
      (src as { attribution?: string }).attribution = SOURCES.basemap.attribution;
    }
  }
  return style;
}

function adjustLayer(layer: LayerSpecification, dark: boolean): LayerSpecification {
  const tint = dark ? tintDark : tintLight;
  const out = { ...layer } as LayerSpecification & { paint?: Record<string, unknown> };
  if (out.paint) out.paint = recolorDeep(out.paint, tint);
  if (layer.id === 'background' && out.paint) {
    out.paint['background-color'] = dark ? '#121a15' : '#e7ece3';
  }
  if (out.type === 'symbol' && out.paint) {
    if ('text-color' in out.paint && !/water|ocean|lake|river|sea/i.test(layer.id)) {
      out.paint['text-color'] = dark ? '#c9d9cc' : '#1f3a2b';
    }
    if ('text-halo-color' in out.paint) {
      out.paint['text-halo-color'] = dark ? 'rgba(18,26,21,0.9)' : 'rgba(246,248,243,0.9)';
    }
  }
  return out;
}

/** Ortofotó WMS rétegnév kiolvasása GetCapabilities-ből (nem találjuk ki). */
export async function discoverWmsLayer(baseUrl: string): Promise<string> {
  const res = await http<string>({
    url: `${baseUrl}?service=WMS&version=1.1.1&request=GetCapabilities`,
    responseType: 'text',
    timeoutMs: 15000,
  });
  const names = parseWmsLayerNames(res.data);
  const pick = names.find((n) => /ortho|orto|OI\./i.test(n) && !/polygon/i.test(n)) ?? names[0];
  if (!pick) throw new Error('A WMS szolgáltatás nem hirdet lekérhető réteget.');
  return pick;
}

/** A GetCapabilities XML-ből a lekérhető (Name elemmel rendelkező) rétegnevek. */
export function parseWmsLayerNames(xml: string): string[] {
  const names: string[] = [];
  const re = /<Layer[^>]*>\s*<Name>([^<]+)<\/Name>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) names.push(m[1]!.trim());
  return names;
}

/**
 * WMS 1.3.0 GetMap csempe-URL. A Lechner GeoServer a 1.1.1-es GetMap-re ServiceExceptiont ad,
 * a 1.3.0 + crs=EPSG:3857 működik (CI próbahívás, 2026-10). EPSG:3857-nél a tengelysorrend x, y.
 */
export function wmsTileUrl(baseUrl: string, layer: string): string {
  return (
    `${baseUrl}?service=WMS&version=1.3.0&request=GetMap&layers=${encodeURIComponent(layer)}` +
    '&styles=&format=image/jpeg&transparent=false&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256'
  );
}
