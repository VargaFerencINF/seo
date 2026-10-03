/**
 * JRC európai árvízveszély-térkép (100 éves visszatérési idő, vízmélység, ~90 m).
 * Egyetlen nagy GeoTIFF; a telek ablakát range kérésekkel olvassuk. Ha nem érhető el, a riportban
 * „Nem elérhető adat” jelenik meg – becsült értéket nem adunk.
 */
import { ENDPOINTS, SOURCES } from '../config';
import type { GeoRaster } from '../analysis/terrain';
import { readWindow, type BboxWgs } from './cog';
import type { DataService } from './service';
import { keyNum } from '../storage/cache';

export const floodService: DataService<{ bbox: BboxWgs }, GeoRaster> = {
  info: SOURCES.flood,
  ttlMs: 180 * 24 * 3600 * 1000,
  cacheKey: ({ bbox }) => bbox.map((v) => keyNum(v, 4)).join(','),
  async fetchLive({ bbox }, ctx) {
    return readWindow(ENDPOINTS.jrcFloodRp100, bbox, ctx.signal);
  },
};
