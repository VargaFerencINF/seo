/** Demó adatszolgáltató: minden elemzési lépés a szimulált világból, hálózat nélkül. */
import { SOURCES } from '../config';
import type { DataProvider } from '../analysis/provider';
import { computeOverlay } from '../analysis/overlay';
import { computeProximity } from '../analysis/proximity';
import { runInWorker } from '../analysis/workerClient';
import type { PvVariant, SourceOutcome } from '../types';
import {
  NATURA_ZONE,
  POWER_LINE,
  PV_MONTHLY_SHARE,
  ROADS,
  floodZone,
  riverLine,
  simulatedPvYield,
  villageBuildings,
} from './world';

const now = () => new Date().toISOString();
const ok = <T>(data: T, source = SOURCES.demo): SourceOutcome<T> => ({
  status: 'ok',
  data,
  source,
  cached: false,
  fetchedAt: now(),
});

/** Kitettség (0 = észak, óramutató) → PVGIS azimut (0 = dél, 90 = nyugat, −90 = kelet) */
export function aspectToPvgis(aspectDeg: number): number {
  let a = aspectDeg - 180;
  if (a <= -180) a += 360;
  if (a > 180) a -= 360;
  return a;
}

function pvVariant(angle: number, aspect: number): PvVariant {
  const y = simulatedPvYield(angle, aspect);
  return {
    angleDeg: angle,
    aspectDeg: aspect,
    yearlyKwhPerKwp: y,
    yearlyIrradiationKwhM2: y * 1.17,
    monthlyKwhPerKwp: PV_MONTHLY_SHARE.map((s) => s * y),
  };
}

export function createDemoProvider(): DataProvider {
  let flood: ReturnType<typeof floodZone> | null = null;
  let buildings: ReturnType<typeof villageBuildings> | null = null;
  return {
    mode: 'demo',
    async terrain(ctx) {
      const res = await runInWorker<'terrain'>({
        type: 'terrain-demo',
        polygon: ctx.polygonEov,
        profiles: ctx.profiles,
      });
      return ok(res.data);
    },
    async natura(ctx) {
      return ok(
        computeOverlay(ctx.polygonEov, [
          { name: 'Demó-ártéri erdő (HUDEMO0001, szimulált)', rings: [NATURA_ZONE] },
        ]),
      );
    },
    async flood(ctx) {
      flood ??= floodZone();
      return ok(
        computeOverlay(ctx.polygonEov, [
          { name: 'Próba-patak 100 éves elöntési terület (szimulált)', rings: [flood] },
        ]),
      );
    },
    async proximity(ctx) {
      buildings ??= villageBuildings();
      return ok(
        computeProximity({
          parcel: ctx.polygonEov,
          radiusM: 2000,
          roads: ROADS.map((r) => ({ line: r.line, name: r.name, kind: r.kind })),
          powerLines: [{ line: POWER_LINE, name: '22 kV-os légvezeték (szimulált)' }],
          waterways: [{ line: riverLine(), name: 'Próba-patak' }],
          buildings: buildings.map((rings) => ({ rings: [rings] })),
        }),
      );
    },
    async pv(_ctx, terrain) {
      if (!terrain)
        return {
          status: 'unavailable',
          reason: 'A domborzati adat hiányzik, így a tájolás nem ismert.',
          source: SOURCES.demo,
        };
      const flat = terrain.meanAspectDeg === null || terrain.dominantAspect === 'sík';
      const angle = Math.round(terrain.meanSlopeDeg * 10) / 10;
      const aspect = flat ? 0 : Math.round(aspectToPvgis(terrain.meanAspectDeg!));
      return ok({
        terrain: pvVariant(angle, aspect),
        optimal: pvVariant(35, 0),
        lossPct: 14,
        database: 'szimulált (demó)',
      });
    },
    attributions: () => [SOURCES.demo.attribution],
  };
}
