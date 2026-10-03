/** Telek-rétegek: aktív telek (földmérő-sárga), mentett telkek, metszetvonalak. */
import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl';
import type { Polygon } from 'geojson';
import type { LngLat, Parcel } from '../types';
import type { MapView } from './mapView';

const ACTIVE = 'parcel-active';
const SAVED = 'parcels-saved';
const PROFILE = 'parcel-profiles';

const empty = (): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [] });

export class ParcelLayers {
  private activeData = empty();
  private savedData = empty();
  private profileData = empty();

  constructor(private view: MapView) {
    view.setOverlay('parcels', (map) => this.install(map));
  }

  private install(map: MlMap): void {
    const add = (spec: Parameters<MlMap['addLayer']>[0]) => {
      if (!map.getLayer(spec.id)) map.addLayer(spec);
    };
    if (!map.getSource(SAVED)) map.addSource(SAVED, { type: 'geojson', data: this.savedData });
    if (!map.getSource(ACTIVE)) map.addSource(ACTIVE, { type: 'geojson', data: this.activeData });
    if (!map.getSource(PROFILE)) map.addSource(PROFILE, { type: 'geojson', data: this.profileData });
    add({
      id: 'parcels-saved-fill',
      type: 'fill',
      source: SAVED,
      paint: { 'fill-color': '#2f5d43', 'fill-opacity': 0.08 },
    });
    add({
      id: 'parcels-saved-line',
      type: 'line',
      source: SAVED,
      paint: { 'line-color': '#2f5d43', 'line-width': 1.5, 'line-dasharray': [3, 2] },
    });
    add({
      id: 'parcel-active-fill',
      type: 'fill',
      source: ACTIVE,
      paint: { 'fill-color': '#e8b710', 'fill-opacity': 0.22 },
    });
    add({
      id: 'parcel-active-casing',
      type: 'line',
      source: ACTIVE,
      paint: { 'line-color': '#1f3a2b', 'line-width': 6, 'line-opacity': 0.6 },
    });
    add({
      id: 'parcel-active-line',
      type: 'line',
      source: ACTIVE,
      paint: { 'line-color': '#e8b710', 'line-width': 3.5 },
    });
    add({
      id: 'parcel-profile-line',
      type: 'line',
      source: PROFILE,
      paint: {
        'line-color': ['case', ['==', ['get', 'kind'], 'user'], '#2f6f8f', '#1f3a2b'],
        'line-width': 2,
        'line-dasharray': [1.5, 1.5],
      },
    });
    add({
      id: 'parcel-profile-ends',
      type: 'circle',
      source: PROFILE,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 4,
        'circle-color': '#ffffff',
        'circle-stroke-color': '#1f3a2b',
        'circle-stroke-width': 2,
      },
    });
  }

  private update(id: string, data: GeoJSON.FeatureCollection): void {
    (this.view.map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
  }

  setActive(geometry: Polygon | null): void {
    this.activeData = {
      type: 'FeatureCollection',
      features: geometry ? [{ type: 'Feature', properties: {}, geometry }] : [],
    };
    this.update(ACTIVE, this.activeData);
  }

  setProfiles(lines: { line: LngLat[]; kind: 'diagonal' | 'user' }[]): void {
    const features: GeoJSON.Feature[] = [];
    for (const l of lines) {
      features.push({
        type: 'Feature',
        properties: { kind: l.kind },
        geometry: { type: 'LineString', coordinates: l.line },
      });
      for (const p of [l.line[0], l.line[l.line.length - 1]])
        if (p)
          features.push({
            type: 'Feature',
            properties: { kind: l.kind },
            geometry: { type: 'Point', coordinates: p },
          });
    }
    this.profileData = { type: 'FeatureCollection', features };
    this.update(PROFILE, this.profileData);
  }

  setSaved(parcels: Parcel[], exceptId?: string): void {
    this.savedData = {
      type: 'FeatureCollection',
      features: parcels
        .filter((p) => p.id !== exceptId)
        .map((p) => ({ type: 'Feature', properties: { id: p.id, name: p.name }, geometry: p.geometry })),
    };
    this.update(SAVED, this.savedData);
  }
}
