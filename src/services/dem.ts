/** Copernicus DEM GLO-30 (AWS Open Data, COG) – a telek bbox-ára kivágott magassági raszter. */
import { ENDPOINTS, SOURCES } from '../config';
import { sampleGeoRaster, type GeoRaster } from '../analysis/terrain';
import { readWindow, type BboxWgs } from './cog';
import type { DataService } from './service';
import { keyNum } from '../storage/cache';

const pad = (n: number, w: number) => String(Math.abs(n)).padStart(w, '0');

/** Csempenév, pl. Copernicus_DSM_COG_10_N47_00_E019_00_DEM */
export function copernicusTileName(latFloor: number, lonFloor: number): string {
  const ns = latFloor >= 0 ? `N${pad(latFloor, 2)}` : `S${pad(-latFloor, 2)}`;
  const ew = lonFloor >= 0 ? `E${pad(lonFloor, 3)}` : `W${pad(-lonFloor, 3)}`;
  return `Copernicus_DSM_COG_10_${ns}_00_${ew}_00_DEM`;
}

export function copernicusTileUrl(latFloor: number, lonFloor: number): string {
  const n = copernicusTileName(latFloor, lonFloor);
  return `${ENDPOINTS.copernicusDem}/${n}/${n}.tif`;
}

export function tilesForBbox(b: BboxWgs): { lat: number; lon: number }[] {
  const out: { lat: number; lon: number }[] = [];
  for (let lat = Math.floor(b[1]); lat <= Math.floor(b[3]); lat++)
    for (let lon = Math.floor(b[0]); lon <= Math.floor(b[2]); lon++) out.push({ lat, lon });
  return out;
}

/** Több csempe összefűzése egyetlen rácsba (legközelebbi pixel) */
export function mosaic(parts: GeoRaster[], b: BboxWgs): GeoRaster {
  if (parts.length === 1) return parts[0]!;
  const dLon = Math.min(...parts.map((p) => p.dLon));
  const dLat = Math.min(...parts.map((p) => p.dLat));
  const width = Math.max(2, Math.ceil((b[2] - b[0]) / dLon - 1e-9));
  const height = Math.max(2, Math.ceil((b[3] - b[1]) / dLat - 1e-9));
  const values = new Float32Array(width * height).fill(NaN);
  const lon0 = b[0] + dLon / 2;
  const lat0 = b[3] - dLat / 2;
  for (let r = 0; r < height; r++)
    for (let c = 0; c < width; c++) {
      const lon = lon0 + c * dLon;
      const lat = lat0 - r * dLat;
      for (const p of parts) {
        const v = sampleGeoRaster(p, lon, lat);
        if (!Number.isNaN(v)) {
          values[r * width + c] = v;
          break;
        }
      }
    }
  return { lon0, lat0, dLon, dLat, width, height, values, noData: null };
}

export const demService: DataService<{ bbox: BboxWgs }, GeoRaster> = {
  info: SOURCES.dem,
  ttlMs: 365 * 24 * 3600 * 1000,
  cacheKey: ({ bbox }) => bbox.map((v) => keyNum(v, 4)).join(','),
  async fetchLive({ bbox }, ctx) {
    const parts: GeoRaster[] = [];
    for (const t of tilesForBbox(bbox)) {
      const tb: BboxWgs = [
        Math.max(bbox[0], t.lon),
        Math.max(bbox[1], t.lat),
        Math.min(bbox[2], t.lon + 1),
        Math.min(bbox[3], t.lat + 1),
      ];
      parts.push(await readWindow(copernicusTileUrl(t.lat, t.lon), tb, ctx.signal));
    }
    return mosaic(parts, bbox);
  },
};
