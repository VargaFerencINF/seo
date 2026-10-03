/** Saját pozíció: pont + pontossági kör a térképen. */
import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl';
import { circle } from '@turf/turf';
import type { Fix } from '../native/geo';
import type { MapView } from './mapView';

const SRC = 'my-position';

export class PositionLayer {
  private data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

  constructor(private view: MapView) {
    view.setOverlay('position', (map) => this.install(map));
  }

  private install(map: MlMap): void {
    if (!map.getSource(SRC)) map.addSource(SRC, { type: 'geojson', data: this.data });
    if (!map.getLayer('pos-acc'))
      map.addLayer({
        id: 'pos-acc',
        type: 'fill',
        source: SRC,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#2f80ed', 'fill-opacity': 0.15, 'fill-outline-color': '#2f80ed' },
      });
    if (!map.getLayer('pos-dot'))
      map.addLayer({
        id: 'pos-dot',
        type: 'circle',
        source: SRC,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 8,
          'circle-color': '#2f80ed',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
        },
      });
  }

  set(fix: Fix | null): void {
    this.data = {
      type: 'FeatureCollection',
      features: fix
        ? [
            circle([fix.lon, fix.lat], Math.max(1, fix.accuracyM) / 1000, { steps: 48, units: 'kilometers' }),
            { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [fix.lon, fix.lat] } },
          ]
        : [],
    };
    (this.view.map.getSource(SRC) as GeoJSONSource | undefined)?.setData(this.data);
  }
}
