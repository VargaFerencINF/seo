/**
 * Felhőoptimalizált GeoTIFF (COG) ablakolvasás HTTP range kérésekkel.
 * A kérések a natív HTTP-n mennek (a Copernicus S3 és a JRC nem küld CORS fejlécet).
 * A tömörített csempék kibontása böngészőben a geotiff.js worker-pooljában fut.
 */
import { BaseClient, BaseResponse, Pool, fromCustomClient, type GeoTIFF } from 'geotiff';
import { http, HttpError } from '../native/http';
import type { GeoRaster } from '../analysis/terrain';
import { NoDataError } from './service';

class NativeResponse extends BaseResponse {
  constructor(
    private _status: number,
    private _headers: Record<string, string>,
    private _data: ArrayBuffer,
  ) {
    super();
  }
  override get status(): number {
    return this._status;
  }
  override get ok(): boolean {
    return this._status >= 200 && this._status < 300;
  }
  override getHeader(name: string): string | undefined {
    return this._headers[name.toLowerCase()];
  }
  override async getData(): Promise<ArrayBuffer> {
    return this._data;
  }
}

class NativeRangeClient extends BaseClient {
  override async request(options: RequestInit = {}): Promise<BaseResponse> {
    const headers: Record<string, string> = {};
    new Headers(options.headers).forEach((v, k) => (headers[k] = v));
    try {
      const res = await http<ArrayBuffer>({
        url: this.url,
        headers,
        responseType: 'arraybuffer',
        timeoutMs: 30000,
        ...(options.signal ? { signal: options.signal } : {}),
      });
      return new NativeResponse(res.status, res.headers, res.data);
    } catch (err) {
      if (err instanceof HttpError && err.kind === 'http')
        return new NativeResponse(err.status, {}, new ArrayBuffer(0));
      throw err;
    }
  }
}

const tiffs = new Map<string, Promise<GeoTIFF>>();
let pool: Pool | null = null;

function getPool(): Pool | undefined {
  if (typeof Worker === 'undefined' || typeof window === 'undefined') return undefined;
  try {
    pool ??= new Pool(2);
    return pool;
  } catch {
    return undefined;
  }
}

async function open(url: string, signal?: AbortSignal): Promise<GeoTIFF> {
  let p = tiffs.get(url);
  if (!p) {
    p = fromCustomClient(new NativeRangeClient(url), { allowFullFile: false }, signal);
    tiffs.set(url, p);
    p.catch(() => tiffs.delete(url));
  }
  return p;
}

/** [nyugat, dél, kelet, észak] fokban */
export type BboxWgs = [number, number, number, number];

/** A bbox-ot lefedő ablak beolvasása az első sávból, földrajzi rácsként. */
export async function readWindow(url: string, bbox: BboxWgs, signal?: AbortSignal): Promise<GeoRaster> {
  let tiff: GeoTIFF;
  try {
    tiff = await open(url, signal);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (/404|403|not found/i.test(msg))
      throw new NoDataError('Ehhez a területhez nincs raszteradat (a csempe nem létezik).');
    throw err;
  }
  const image = await tiff.getImage(0);
  const [ox, oy] = image.getOrigin() as [number, number];
  const [rx, ry] = image.getResolution() as [number, number];
  const W = image.getWidth();
  const H = image.getHeight();
  const x0 = Math.max(0, Math.floor((bbox[0] - ox) / rx));
  const x1 = Math.min(W, Math.ceil((bbox[2] - ox) / rx));
  const y0 = Math.max(0, Math.floor((bbox[3] - oy) / ry));
  const y1 = Math.min(H, Math.ceil((bbox[1] - oy) / ry));
  if (x1 <= x0 || y1 <= y0) throw new NoDataError('A telek kívül esik a raszter lefedettségén.');
  const p = getPool();
  const data = await image.readRasters({
    window: [x0, y0, x1, y1],
    samples: [0],
    interleave: true,
    ...(p ? { pool: p } : {}),
    ...(signal ? { signal } : {}),
  });
  const nd = image.getGDALNoData();
  return {
    lon0: ox + (x0 + 0.5) * rx,
    lat0: oy + (y0 + 0.5) * ry,
    dLon: rx,
    dLat: -ry,
    width: x1 - x0,
    height: y1 - y0,
    values: Float32Array.from(data as ArrayLike<number>),
    noData: nd === null || nd === undefined ? null : nd,
  };
}

/** Teszteléshez: a megnyitott fájlok gyorsítótárának ürítése */
export function resetCogCache(): void {
  tiffs.clear();
}
