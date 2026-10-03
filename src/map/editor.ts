/**
 * Telekhatár- és metszetvonal-szerkesztő érintőképernyőre.
 * - Koppintás: új töréspont (ha a koppintás-hozzáadás engedélyezett)
 * - Töréspont húzása: áthelyezés
 * - Felezőpont (✚) koppintása vagy húzása: új töréspont beszúrása
 * - Visszavonás: minden művelet egy lépés
 * A szerkesztő WGS84-ben tárol, a megjelenítés GeoJSON-rétegekkel történik.
 */
import type { Map as MlMap, MapLayerMouseEvent, MapLayerTouchEvent, GeoJSONSource } from 'maplibre-gl';
import type { LineString, Polygon } from 'geojson';
import type { LngLat } from '../types';
import type { MapView } from './mapView';

export type EditorKind = 'polygon' | 'line';

export interface EditorState {
  active: boolean;
  kind: EditorKind;
  points: LngLat[];
  canUndo: boolean;
  tapToAdd: boolean;
}

const SRC = 'editor';
const L_FILL = 'editor-fill';
const L_LINE = 'editor-line';
const L_CASING = 'editor-casing';
const L_MID = 'editor-mid';
const L_VERTEX = 'editor-vertex';
const L_HIT = 'editor-hit';

export class ParcelEditor {
  private kind: EditorKind = 'polygon';
  private points: LngLat[] = [];
  private history: LngLat[][] = [];
  private active = false;
  private tapToAdd = true;
  private dragIndex: number | null = null;
  private dragMoved = false;
  private dragInserted = false;
  private listeners: ((s: EditorState) => void)[] = [];
  private maxPoints = Infinity;

  constructor(private view: MapView) {
    view.setOverlay('editor', (map) => this.install(map));
    const map = view.map;
    map.on('click', (e) => this.onClick(e));
    map.on('mousedown', L_HIT, (e) => this.onDown(e));
    map.on('touchstart', L_HIT, (e) => this.onDown(e));
    map.on('mousemove', (e) => this.onMove(e));
    map.on('touchmove', (e) => this.onMove(e));
    map.on('mouseup', () => this.onUp());
    map.on('touchend', () => this.onUp());
    map.on('touchcancel', () => this.onUp());
  }

  private install(map: MlMap): void {
    if (!map.getSource(SRC)) map.addSource(SRC, { type: 'geojson', data: this.featureCollection() });
    const accent = '#e8b710';
    const ink = '#1f3a2b';
    const add = (spec: Parameters<MlMap['addLayer']>[0]) => {
      if (!map.getLayer(spec.id)) map.addLayer(spec);
    };
    add({
      id: L_FILL,
      type: 'fill',
      source: SRC,
      filter: ['==', ['get', 'role'], 'area'],
      paint: { 'fill-color': accent, 'fill-opacity': 0.18 },
    });
    add({
      id: L_CASING,
      type: 'line',
      source: SRC,
      filter: ['==', ['get', 'role'], 'path'],
      paint: { 'line-color': ink, 'line-width': 5, 'line-opacity': 0.55 },
    });
    add({
      id: L_LINE,
      type: 'line',
      source: SRC,
      filter: ['==', ['get', 'role'], 'path'],
      paint: { 'line-color': accent, 'line-width': 3, 'line-dasharray': [2, 1] },
    });
    add({
      id: L_MID,
      type: 'circle',
      source: SRC,
      filter: ['==', ['get', 'role'], 'mid'],
      paint: {
        'circle-radius': 6,
        'circle-color': '#ffffff',
        'circle-opacity': 0.85,
        'circle-stroke-color': ink,
        'circle-stroke-width': 1.5,
      },
    });
    add({
      id: L_VERTEX,
      type: 'circle',
      source: SRC,
      filter: ['==', ['get', 'role'], 'vertex'],
      paint: {
        'circle-radius': ['case', ['==', ['get', 'first'], true], 10, 8],
        'circle-color': accent,
        'circle-stroke-color': ink,
        'circle-stroke-width': 2.5,
      },
    });
    // láthatatlan, nagyobb érintési felület (min. 44 px)
    add({
      id: L_HIT,
      type: 'circle',
      source: SRC,
      filter: ['in', ['get', 'role'], ['literal', ['vertex', 'mid']]],
      paint: { 'circle-radius': 22, 'circle-color': '#000000', 'circle-opacity': 0.01 },
    });
  }

  onChange(fn: (s: EditorState) => void): () => void {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((f) => f !== fn));
  }

  get state(): EditorState {
    return {
      active: this.active,
      kind: this.kind,
      points: this.points.slice(),
      canUndo: this.history.length > 0,
      tapToAdd: this.tapToAdd,
    };
  }

  start(
    kind: EditorKind,
    initial: LngLat[] = [],
    opts: { tapToAdd?: boolean; maxPoints?: number } = {},
  ): void {
    this.kind = kind;
    this.points = initial.slice();
    // zárt gyűrű esetén az ismétlődő végpontot elhagyjuk
    const f = this.points[0];
    const l = this.points[this.points.length - 1];
    if (kind === 'polygon' && this.points.length > 1 && f && l && f[0] === l[0] && f[1] === l[1])
      this.points.pop();
    this.history = [];
    this.active = true;
    this.tapToAdd = opts.tapToAdd ?? true;
    this.maxPoints = opts.maxPoints ?? (kind === 'line' ? 2 : Infinity);
    this.emit();
  }

  setTapToAdd(on: boolean): void {
    this.tapToAdd = on;
    this.emit();
  }

  stop(): void {
    this.active = false;
    this.points = [];
    this.history = [];
    this.dragIndex = null;
    this.emit();
  }

  private snapshot(): void {
    this.history.push(this.points.map((p) => [p[0], p[1]] as LngLat));
    if (this.history.length > 200) this.history.shift();
  }

  addPoint(p: LngLat): void {
    if (!this.active || this.points.length >= this.maxPoints) return;
    this.snapshot();
    this.points.push(p);
    this.emit();
  }

  insertPoint(index: number, p: LngLat): void {
    this.snapshot();
    this.points.splice(index, 0, p);
    this.emit();
  }

  removeLast(): void {
    if (!this.points.length) return;
    this.snapshot();
    this.points.pop();
    this.emit();
  }

  undo(): void {
    const prev = this.history.pop();
    if (!prev) return;
    this.points = prev;
    this.emit();
  }

  toPolygon(): Polygon | null {
    if (this.points.length < 3) return null;
    return { type: 'Polygon', coordinates: [[...this.points, this.points[0]!]] };
  }

  toLine(): LineString | null {
    if (this.points.length < 2) return null;
    return { type: 'LineString', coordinates: this.points.slice() };
  }

  // ------------------------------------------------------------ interakció

  private onClick(
    e: MapLayerMouseEvent | { lngLat: { lng: number; lat: number }; point: { x: number; y: number } },
  ) {
    if (!this.active || this.dragMoved) {
      this.dragMoved = false;
      return;
    }
    const map = this.view.map;
    const hits = map.queryRenderedFeatures([e.point.x, e.point.y] as [number, number], { layers: [L_HIT] });
    const mid = hits.find((h) => h.properties?.role === 'mid');
    if (mid) {
      const i = Number(mid.properties?.index);
      const g = mid.geometry as GeoJSON.Point;
      this.insertPoint(i + 1, [g.coordinates[0]!, g.coordinates[1]!]);
      return;
    }
    if (hits.some((h) => h.properties?.role === 'vertex')) return;
    if (this.tapToAdd) this.addPoint([e.lngLat.lng, e.lngLat.lat]);
  }

  private onDown(e: MapLayerMouseEvent | MapLayerTouchEvent): void {
    if (!this.active) return;
    if ('points' in e && e.points.length > 1) return; // csipetkézmozdulat
    const f = e.features?.[0];
    if (!f) return;
    const role = f.properties?.role;
    let index = Number(f.properties?.index);
    e.preventDefault();
    this.dragInserted = role === 'mid';
    if (role === 'mid') {
      const g = f.geometry as GeoJSON.Point;
      this.insertPoint(index + 1, [g.coordinates[0]!, g.coordinates[1]!]);
      index = index + 1;
    } else {
      this.snapshot();
    }
    this.dragIndex = index;
    this.dragMoved = false;
    this.view.map.dragPan.disable();
  }

  private onMove(
    e: MapLayerMouseEvent | MapLayerTouchEvent | { lngLat: { lng: number; lat: number } },
  ): void {
    if (this.dragIndex === null) return;
    this.points[this.dragIndex] = [e.lngLat.lng, e.lngLat.lat];
    this.dragMoved = true;
    this.render();
  }

  private onUp(): void {
    if (this.dragIndex === null) return;
    this.dragIndex = null;
    this.view.map.dragPan.enable();
    // nem mozdult és nem szúrtunk be: nincs visszavonható lépés
    if (!this.dragMoved && !this.dragInserted) this.history.pop();
    // a beszúrás vagy húzás utáni „click” ne adjon új pontot
    const swallow = this.dragMoved || this.dragInserted;
    this.dragMoved = swallow;
    this.dragInserted = false;
    this.emit();
    setTimeout(() => (this.dragMoved = false), 350);
  }

  // ------------------------------------------------------------ megjelenítés

  private featureCollection(): GeoJSON.FeatureCollection {
    const feats: GeoJSON.Feature[] = [];
    if (!this.active) return { type: 'FeatureCollection', features: feats };
    const pts = this.points;
    const closedPoly = this.kind === 'polygon' && pts.length >= 3;
    if (closedPoly)
      feats.push({
        type: 'Feature',
        properties: { role: 'area' },
        geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]!]] },
      });
    if (pts.length >= 2)
      feats.push({
        type: 'Feature',
        properties: { role: 'path' },
        geometry: { type: 'LineString', coordinates: closedPoly ? [...pts, pts[0]!] : pts },
      });
    const segs = closedPoly ? pts.length : pts.length - 1;
    if (pts.length < this.maxPoints || this.kind === 'polygon')
      for (let i = 0; i < segs; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        feats.push({
          type: 'Feature',
          properties: { role: 'mid', index: i },
          geometry: { type: 'Point', coordinates: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] },
        });
      }
    pts.forEach((p, i) =>
      feats.push({
        type: 'Feature',
        properties: { role: 'vertex', index: i, first: i === 0 },
        geometry: { type: 'Point', coordinates: p },
      }),
    );
    return { type: 'FeatureCollection', features: feats };
  }

  private render(): void {
    const src = this.view.map.getSource(SRC) as GeoJSONSource | undefined;
    src?.setData(this.featureCollection());
  }

  private emit(): void {
    this.render();
    const s = this.state;
    for (const fn of this.listeners) fn(s);
  }
}
