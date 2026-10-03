/** Demó térképrétegek: domborzatárnyékolás, szintvonalak, patak, utak, falu, légvezeték, Natura, ártér. */
import { Marker, type Map as MlMap } from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import { toWgs } from '../analysis/eov';
import { runInWorker } from '../analysis/workerClient';
import type { Eov } from '../types';
import { SOURCES } from '../config';
import {
  DEMO_BBOX,
  NATURA_ZONE,
  PLACE_LABELS,
  POWER_LINE,
  ROADS,
  floodZone,
  riverLine,
  villageBuildings,
} from './world';

const line = (pts: Eov[]) => pts.map((p) => toWgs(p));
const ring = (pts: Eov[]) => {
  const r = pts.map((p) => toWgs(p));
  return [...r, r[0]!];
};

function feature(geometry: GeoJSON.Geometry, properties: Record<string, unknown> = {}): GeoJSON.Feature {
  return { type: 'Feature', properties, geometry };
}

export function demoVectorData(): Record<string, GeoJSON.FeatureCollection> {
  const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features,
  });
  const pylons: GeoJSON.Feature[] = [];
  for (let i = 1; i < POWER_LINE.length; i++) {
    const a = POWER_LINE[i - 1]!;
    const b = POWER_LINE[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 0; t < len; t += 280)
      pylons.push(
        feature({
          type: 'Point',
          coordinates: toWgs([a[0] + ((b[0] - a[0]) * t) / len, a[1] + ((b[1] - a[1]) * t) / len]),
        }),
      );
  }
  return {
    'demo-flood': fc([feature({ type: 'Polygon', coordinates: [ring(floodZone())] })]),
    'demo-natura': fc([feature({ type: 'Polygon', coordinates: [ring(NATURA_ZONE)] })]),
    'demo-river': fc([feature({ type: 'LineString', coordinates: line(riverLine(25)) })]),
    'demo-roads': fc(
      ROADS.map((r) =>
        feature({ type: 'LineString', coordinates: line(r.line) }, { kind: r.kind, name: r.name }),
      ),
    ),
    'demo-buildings': fc(
      villageBuildings().map((b) => feature({ type: 'Polygon', coordinates: [ring(b.slice(0, -1))] })),
    ),
    'demo-power': fc([feature({ type: 'LineString', coordinates: line(POWER_LINE) })]),
    'demo-pylons': fc(pylons),
  };
}

/** A demó teljes alapstílusa (offline, külső forrás nélkül). */
export async function buildDemoStyle(dark: boolean): Promise<StyleSpecification> {
  const res = await runInWorker<'demo-base'>({ type: 'demo-base', bbox: DEMO_BBOX, cellSize: 10, dark });
  const canvas = document.createElement('canvas');
  canvas.width = res.image.width;
  canvas.height = res.image.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(res.image.rgba), res.image.width, res.image.height),
    0,
    0,
  );
  const url = canvas.toDataURL('image/png');
  // a kép sarkai: a rács cellaközéppontjai → fél cellával kifelé
  const half = 5;
  const [x0, y0, x1, y1] = [
    DEMO_BBOX[0] - half,
    DEMO_BBOX[1] - half,
    DEMO_BBOX[2] + half,
    DEMO_BBOX[3] + half,
  ];
  const coords: [[number, number], [number, number], [number, number], [number, number]] = [
    toWgs([x0, y1]),
    toWgs([x1, y1]),
    toWgs([x1, y0]),
    toWgs([x0, y0]),
  ];

  const contourFeatures: GeoJSON.Feature[] = res.contours.map((c) => {
    const lines: number[][][] = [];
    for (let i = 0; i < c.segments.length; i += 4)
      lines.push([
        toWgs([c.segments[i]!, c.segments[i + 1]!]),
        toWgs([c.segments[i + 2]!, c.segments[i + 3]!]),
      ]);
    return feature({ type: 'MultiLineString', coordinates: lines }, { level: c.level, index: c.index });
  });

  const v = demoVectorData();
  const ink = dark ? '#c9d9cc' : '#1f3a2b';
  const contourColor = dark ? '#8a7a55' : '#9c7b3c';
  const sources: StyleSpecification['sources'] = {
    'demo-hillshade': { type: 'image', url, coordinates: coords },
    'demo-contours': {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: contourFeatures },
      attribution: SOURCES.demo.attribution,
    },
  };
  for (const [k, data] of Object.entries(v)) sources[k] = { type: 'geojson', data };

  return {
    version: 8,
    name: 'teleklato-demo',
    sources,
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': dark ? '#121a15' : '#e7ece3' } },
      {
        id: 'demo-hillshade',
        type: 'raster',
        source: 'demo-hillshade',
        paint: { 'raster-fade-duration': 0 },
      },
      {
        id: 'demo-contours',
        type: 'line',
        source: 'demo-contours',
        paint: {
          'line-color': contourColor,
          'line-opacity': ['case', ['get', 'index'], 0.75, 0.4],
          'line-width': ['case', ['get', 'index'], 1.2, 0.6],
        },
      },
      {
        id: 'demo-flood',
        type: 'fill',
        source: 'demo-flood',
        paint: { 'fill-color': '#2f80c0', 'fill-opacity': 0.2 },
      },
      {
        id: 'demo-flood-line',
        type: 'line',
        source: 'demo-flood',
        paint: { 'line-color': '#2f80c0', 'line-width': 1, 'line-dasharray': [2, 2] },
      },
      {
        id: 'demo-natura',
        type: 'fill',
        source: 'demo-natura',
        paint: { 'fill-color': '#3f9d4a', 'fill-opacity': 0.18 },
      },
      {
        id: 'demo-natura-line',
        type: 'line',
        source: 'demo-natura',
        paint: { 'line-color': '#2e7d32', 'line-width': 2, 'line-dasharray': [4, 2] },
      },
      {
        id: 'demo-river',
        type: 'line',
        source: 'demo-river',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#4a90c2', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 16, 6] },
      },
      {
        id: 'demo-buildings',
        type: 'fill',
        source: 'demo-buildings',
        paint: {
          'fill-color': dark ? '#5d5a50' : '#b9ab95',
          'fill-outline-color': dark ? '#3a382f' : '#8e7f69',
        },
      },
      {
        id: 'demo-roads-casing',
        type: 'line',
        source: 'demo-roads',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': dark ? '#0d130f' : '#8a8a7a',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12,
            ['case', ['==', ['get', 'kind'], 'main'], 4, 2.5],
            17,
            ['case', ['==', ['get', 'kind'], 'main'], 14, 9],
          ],
        },
      },
      {
        id: 'demo-roads',
        type: 'line',
        source: 'demo-roads',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['case', ['==', ['get', 'kind'], 'main'], '#f3d27a', dark ? '#3b463e' : '#ffffff'],
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12,
            ['case', ['==', ['get', 'kind'], 'main'], 2.5, 1.2],
            17,
            ['case', ['==', ['get', 'kind'], 'main'], 11, 7],
          ],
        },
      },
      {
        id: 'demo-power',
        type: 'line',
        source: 'demo-power',
        paint: { 'line-color': dark ? '#d0d0d0' : '#4b4b4b', 'line-width': 1.4, 'line-dasharray': [6, 3] },
      },
      {
        id: 'demo-pylons',
        type: 'circle',
        source: 'demo-pylons',
        paint: {
          'circle-radius': 3,
          'circle-color': ink,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      },
    ],
  };
}

/** HTML-feliratok (offline is működik, nem kell glyph-szerver) */
export class DemoLabels {
  private markers: Marker[] = [];
  show(map: MlMap): void {
    this.hide();
    for (const l of PLACE_LABELS) {
      const el = document.createElement('div');
      el.className = `map-label ${l.kind === 'water' ? 'water' : l.kind === 'place' ? 'place' : ''}`;
      el.textContent = l.text;
      this.markers.push(new Marker({ element: el }).setLngLat(toWgs(l.at)).addTo(map));
    }
  }
  hide(): void {
    for (const m of this.markers) m.remove();
    this.markers = [];
  }
}
