/** Lechner ortofotó WMS réteg (opcionális). A rétegnevet GetCapabilities-ből olvassuk. */
import type { Map as MlMap } from 'maplibre-gl';
import { ENDPOINTS, SOURCES } from '../config';
import { discoverWmsLayer, wmsTileUrl } from './styles';
import type { MapView } from './mapView';

let layerName: string | null = null;

export async function enableOrtho(view: MapView): Promise<void> {
  layerName ??= await discoverWmsLayer(ENDPOINTS.orthoWms);
  const tiles = [wmsTileUrl(ENDPOINTS.orthoWms, layerName).replace(/^https:/, 'nhttps:')];
  view.setOverlay('ortho', (map: MlMap) => {
    if (!map.getSource('ortho'))
      map.addSource('ortho', {
        type: 'raster',
        tiles,
        tileSize: 256,
        attribution: SOURCES.ortho.attribution,
        maxzoom: 19,
      });
    if (!map.getLayer('ortho')) {
      // a telek- és szerkesztőrétegek alá
      const before = ['parcels-saved-fill', 'parcel-active-fill', 'editor-fill'].find((id) =>
        map.getLayer(id),
      );
      map.addLayer(
        { id: 'ortho', type: 'raster', source: 'ortho', paint: { 'raster-opacity': 0.9 } },
        before,
      );
    }
  });
}

export function disableOrtho(view: MapView): void {
  view.setOverlay('ortho', null);
  view.removeLayers('ortho');
  view.removeSource('ortho');
}
