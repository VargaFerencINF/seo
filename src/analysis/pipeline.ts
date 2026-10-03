/** Aszinkron elemzési folyamat: lépésenkénti állapot, hibakezelés, folyamatjelzés. */
import type { AnalysisResult, Parcel, RuleSet, SourceInfo, SourceOutcome, StepId, StepState } from '../types';
import { toEov } from './eov';
import { computeGeometry, polygonToEov } from './geometry';
import type { AnalysisContext, DataProvider } from './provider';
import { scoreAnalysis } from './scoring';

export const STEP_LABELS: Record<StepId, string> = {
  geometry: 'Geometria (terület, kerület, EOV)',
  dem: 'Domborzat, lejtés, kitettség, metszet',
  natura: 'Natura 2000 átfedés',
  flood: 'Árvízveszély',
  proximity: 'Közelség (út, áram, víz, épület)',
  pv: 'Napelem-hozam',
  scoring: 'Pontozás',
};

export interface PipelineOptions {
  provider: DataProvider;
  rules: RuleSet;
  online: boolean;
  pvLossPct: number;
  signal?: AbortSignal;
  onProgress?: (steps: StepState[], fraction: number) => void;
}

const ERROR_SOURCE: SourceInfo = { id: 'internal', label: 'Belső számítás', attribution: '' };

async function guard<T>(fn: () => Promise<SourceOutcome<T>>, source: SourceInfo): Promise<SourceOutcome<T>> {
  try {
    return await fn();
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
      hint: 'Próbáld újra; ha ismétlődik, ellenőrizd a telek geometriáját.',
      source,
    };
  }
}

function statusOf(o: SourceOutcome<unknown>): StepState['status'] {
  return o.status === 'ok'
    ? 'ok'
    : o.status === 'skipped'
      ? 'skipped'
      : o.status === 'unavailable'
        ? 'unavailable'
        : 'error';
}

function messageOf(o: SourceOutcome<unknown>): string | undefined {
  if (o.status === 'ok') return o.cached ? 'gyorsítótárból' : undefined;
  if (o.status === 'error') return `${o.message} ${o.hint}`;
  return o.reason;
}

export async function runAnalysis(parcel: Parcel, opts: PipelineOptions): Promise<AnalysisResult> {
  const steps: StepState[] = (Object.keys(STEP_LABELS) as StepId[]).map((id) => ({
    id,
    label: STEP_LABELS[id],
    status: 'pending',
  }));
  const set = (id: StepId, status: StepState['status'], message?: string) => {
    const s = steps.find((x) => x.id === id)!;
    s.status = status;
    if (message) s.message = message;
    else delete s.message;
    const done = steps.filter((x) => x.status !== 'pending' && x.status !== 'running').length;
    opts.onProgress?.(
      steps.map((x) => ({ ...x })),
      done / steps.length,
    );
  };

  // 1. geometria – szinkron, kötelező
  set('geometry', 'running');
  const geometry = computeGeometry(parcel.geometry);
  const polygonEov = polygonToEov(parcel.geometry);
  set('geometry', 'ok');

  const profiles = [
    {
      label: 'Leghosszabb átló',
      line: geometry.longestDiagonal.map((p) => toEov(p)),
    },
  ];
  if (parcel.profileLine && parcel.profileLine.coordinates.length >= 2) {
    profiles.push({
      label: 'Felhasználói metszet',
      line: parcel.profileLine.coordinates.map((p) => toEov([p[0]!, p[1]!])),
    });
  }

  const ctx: AnalysisContext = {
    parcel,
    polygonEov,
    geometry,
    profiles,
    signal: opts.signal ?? new AbortController().signal,
    online: opts.online,
    pvLossPct: opts.pvLossPct,
  };
  const p = opts.provider;

  const track = async <T>(id: StepId, fn: () => Promise<SourceOutcome<T>>) => {
    set(id, 'running');
    const o = await guard(fn, ERROR_SOURCE);
    set(id, statusOf(o), messageOf(o));
    return o;
  };

  // 2. független lépések párhuzamosan; a PV a domborzatra vár
  const terrainP = track('dem', () => p.terrain(ctx));
  const naturaP = track('natura', () => p.natura(ctx));
  const floodP = track('flood', () => p.flood(ctx));
  const proximityP = track('proximity', () => p.proximity(ctx));
  const terrain = await terrainP;
  if (terrain.status === 'ok') {
    // a metszetvonalak WGS-koordinátái a megjelenítéshez
    terrain.data.profiles.forEach((pr, i) => {
      if (i === 0) pr.line = geometry.longestDiagonal;
      else if (parcel.profileLine) pr.line = parcel.profileLine.coordinates.map((c) => [c[0]!, c[1]!]);
    });
  }
  const pv = await track('pv', () => p.pv(ctx, terrain.status === 'ok' ? terrain.data : null));
  const [natura, flood, proximity] = await Promise.all([naturaP, floodP, proximityP]);

  set('scoring', 'running');
  const score = scoreAnalysis({ geometry, terrain, natura, flood, proximity, pv }, opts.rules);
  set('scoring', 'ok');

  const offlineSkipped = steps.filter((s) => s.status === 'skipped').map((s) => s.label);
  return {
    version: 1,
    mode: p.mode,
    createdAt: new Date().toISOString(),
    geometry,
    terrain,
    natura,
    flood,
    proximity,
    pv,
    score,
    steps,
    attributions: p.attributions(),
    offlineSkipped,
  };
}
