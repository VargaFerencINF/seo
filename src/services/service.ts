/**
 * Egységes szolgáltatás-interfész: minden külső adatforrás ezt valósítja meg.
 * A futtató kezeli a gyorsítótárat, az offline állapotot és a hibákat (magyar üzenettel).
 */
import type { SourceInfo, SourceOutcome } from '../types';
import { cacheGet, cacheSet } from '../storage/cache';
import { describeHttpError, HttpError } from '../native/http';

export interface ServiceContext {
  signal: AbortSignal;
  online: boolean;
}

export interface DataService<Req, Res> {
  info: SourceInfo;
  /** gyorsítótár-kulcs (forrás + kerekített paraméterek) */
  cacheKey(req: Req): string;
  ttlMs: number;
  fetchLive(req: Req, ctx: ServiceContext): Promise<Res>;
}

/** A szolgáltatás jelzi, hogy az adott helyre nincs adat (nem hiba) */
export class NoDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoDataError';
  }
}

export async function runService<Req, Res>(
  svc: DataService<Req, Res>,
  req: Req,
  ctx: ServiceContext,
): Promise<SourceOutcome<Res>> {
  const key = `${svc.info.id}:${svc.cacheKey(req)}`;
  const hit = await cacheGet<Res>(key);
  if (hit && !hit.expired)
    return {
      status: 'ok',
      data: hit.value,
      source: svc.info,
      cached: true,
      fetchedAt: new Date(hit.storedAt).toISOString(),
    };
  if (!ctx.online) {
    if (hit)
      return {
        status: 'ok',
        data: hit.value,
        source: svc.info,
        cached: true,
        fetchedAt: new Date(hit.storedAt).toISOString(),
      };
    return {
      status: 'skipped',
      reason:
        'Nincs hálózati kapcsolat, és ehhez a telekhez nincs mentett adat. Csatlakozz az internethez, majd elemezz újra.',
      source: svc.info,
    };
  }
  try {
    const data = await svc.fetchLive(req, ctx);
    await cacheSet(key, data, svc.ttlMs);
    return { status: 'ok', data, source: svc.info, cached: false, fetchedAt: new Date().toISOString() };
  } catch (err) {
    if (err instanceof NoDataError) return { status: 'unavailable', reason: err.message, source: svc.info };
    // hálózati hiba esetén a lejárt cache is jobb a semminél
    if (hit && err instanceof HttpError && err.kind !== 'http')
      return {
        status: 'ok',
        data: hit.value,
        source: svc.info,
        cached: true,
        fetchedAt: new Date(hit.storedAt).toISOString(),
      };
    const { message, hint } = describeHttpError(err, svc.info.label);
    return { status: 'error', message, hint, source: svc.info };
  }
}
