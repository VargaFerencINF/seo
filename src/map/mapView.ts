import * as maplibregl from 'maplibre-gl';
import type { Map as MlMap, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { HU_CENTER } from '../config';
import { http, isNative } from '../native/http';
import { fallbackStyle } from './styles';

maplibregl.setWorkerUrl(workerUrl);

/** CORS-korlátos csempeforrásokhoz: „nhttps://…” → natív HTTP-n keresztül. */
let protocolRegistered = false;
function registerNativeProtocol(): void {
  if (protocolRegistered) return;
  protocolRegistered = true;
  maplibregl.addProtocol('nhttps', async (params, abort) => {
    const url = params.url.replace(/^nhttps:/, 'https:');
    if (!isNative()) {
      const res = await fetch(url, { signal: abort.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { data: await res.arrayBuffer() };
    }
    const res = await http<ArrayBuffer>({
      url,
      responseType: 'arraybuffer',
      signal: abort.signal,
      timeoutMs: 20000,
    });
    return { data: res.data };
  });
}

export type OverlayFn = (map: MlMap) => void;

export interface MapSnapshot {
  dataUrl: string;
  /** a kép szélessége a terepen (m) – méretarányhoz */
  widthM: number;
}

export class MapView {
  readonly map: MlMap;
  private overlays = new Map<string, OverlayFn>();
  private readyResolvers: (() => void)[] = [];
  private styleReady = false;

  constructor(container: HTMLElement) {
    registerNativeProtocol();
    this.map = new maplibregl.Map({
      container,
      style: fallbackStyle(document.documentElement.dataset.theme === 'dark'),
      center: HU_CENTER,
      zoom: 6.4,
      attributionControl: { compact: true },
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
      fadeDuration: 150,
    });
    this.map.touchZoomRotate.disableRotation();
    this.map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 110 }), 'bottom-left');
    this.map.on('style.load', () => {
      this.styleReady = true;
      for (const fn of this.overlays.values()) this.safeApply(fn);
      for (const r of this.readyResolvers.splice(0)) r();
    });
  }

  /** Új alapstílus; a regisztrált overlay-rétegeket újra felrakjuk. */
  setStyle(style: StyleSpecification): Promise<void> {
    this.styleReady = false;
    const p = new Promise<void>((resolve) => this.readyResolvers.push(resolve));
    this.map.setStyle(style, { diff: false });
    return p;
  }

  whenReady(): Promise<void> {
    if (this.styleReady) return Promise.resolve();
    return new Promise((resolve) => this.readyResolvers.push(resolve));
  }

  /** Overlay (forrás + rétegek) regisztrálása – stílusváltás után automatikusan újra felkerül. */
  setOverlay(id: string, fn: OverlayFn | null): void {
    if (fn) {
      this.overlays.set(id, fn);
      if (this.styleReady) this.safeApply(fn);
    } else this.overlays.delete(id);
  }

  private safeApply(fn: OverlayFn): void {
    try {
      fn(this.map);
    } catch (err) {
      console.error('Overlay hiba', err);
    }
  }

  /** GeoJSON forrás létrehozása vagy frissítése */
  setGeoJson(id: string, data: GeoJSON.FeatureCollection | GeoJSON.Feature): void {
    const src = this.map.getSource(id) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data);
    else this.map.addSource(id, { type: 'geojson', data });
  }

  removeLayers(...ids: string[]): void {
    for (const id of ids) if (this.map.getLayer(id)) this.map.removeLayer(id);
  }

  removeSource(id: string): void {
    if (this.map.getSource(id)) this.map.removeSource(id);
  }

  /**
   * Fekvő tájolású térképkép a telek köré (riporthoz). A telket egy középre igazított, 16:10-es
   * keretbe illeszti, megvárja a csempéket, majd kivágja a keretet a canvasból.
   */
  async snapshotAround(bounds: maplibregl.LngLatBounds, aspect = 1.6): Promise<MapSnapshot> {
    const map = this.map;
    const canvas = map.getCanvas();
    const cw = map.getContainer().clientWidth;
    const ch = map.getContainer().clientHeight;
    const boxW = cw;
    const boxH = Math.min(ch, cw / aspect);
    const top = (ch - boxH) / 2;
    map.fitBounds(bounds, {
      padding: { top: top + 24, bottom: ch - top - boxH + 24, left: 28, right: 28 },
      maxZoom: 18,
      duration: 0,
    });
    await new Promise<void>((resolve) => {
      if (map.loaded()) map.once('render', () => resolve());
      else map.once('idle', () => resolve());
      map.triggerRepaint();
    });
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 4000);
      map.once('idle', () => {
        clearTimeout(t);
        resolve();
      });
      map.triggerRepaint();
    });
    const ratio = canvas.width / cw;
    const out = document.createElement('canvas');
    out.width = Math.round(boxW * ratio);
    out.height = Math.round(boxH * ratio);
    const ctx = out.getContext('2d')!;
    ctx.drawImage(canvas, 0, Math.round(top * ratio), out.width, out.height, 0, 0, out.width, out.height);
    const center = map.getCenter();
    // MapLibre: 512 px-es csempék
    const mpp = (40075016.686 * Math.cos((center.lat * Math.PI) / 180)) / (512 * 2 ** map.getZoom());
    return { dataUrl: out.toDataURL('image/png'), widthM: boxW * mpp };
  }

  /** Térkép-pillanatkép (PNG data URL) a riporthoz */
  snapshot(): Promise<string> {
    return new Promise((resolve) => {
      this.map.once('render', () => resolve(this.map.getCanvas().toDataURL('image/png')));
      this.map.triggerRepaint();
    });
  }
}
