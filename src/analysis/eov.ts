/** EOV (EPSG:23700) ↔ WGS84 (EPSG:4326) vetítés proj4-gyel. Minden méteres számítás EOV-ban. */
import proj4 from 'proj4';
import type { Eov, LngLat } from '../types';

export const EPSG_23700 =
  '+proj=somerc +lat_0=47.14439372222222 +lon_0=19.04857177777778 +k_0=0.99993 ' +
  '+x_0=650000 +y_0=200000 +ellps=GRS67 +towgs84=52.17,-71.82,-14.9,0,0,0,0 +units=m +no_defs';

proj4.defs('EPSG:23700', EPSG_23700);
const conv = proj4('EPSG:4326', 'EPSG:23700');

export function toEov(p: LngLat): Eov {
  const [x, y] = conv.forward([p[0], p[1]]);
  return [x!, y!];
}

export function toWgs(p: Eov): LngLat {
  const [lon, lat] = conv.inverse([p[0], p[1]]);
  return [lon!, lat!];
}

export function ringToEov(ring: LngLat[]): Eov[] {
  return ring.map(toEov);
}

export function ringToWgs(ring: Eov[]): LngLat[] {
  return ring.map(toWgs);
}

/** Durva ellenőrzés: EOV-koordináta Magyarország területére esik-e (Y kelet, X észak). */
export function isPlausibleEov([x, y]: Eov): boolean {
  return x > 380000 && x < 960000 && y > 20000 && y < 380000;
}
