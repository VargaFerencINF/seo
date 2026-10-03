/** Élő adatszolgáltató: Copernicus DEM, EEA Natura 2000, JRC árvíz, Overpass, PVGIS. */
import type { DataProvider, AnalysisContext } from '../analysis/provider';
import { SOURCES } from '../config';
import type { OverlayMetrics, ProximityMetrics, PvMetrics, SourceOutcome, TerrainMetrics } from '../types';
import { toEov, toWgs } from '../analysis/eov';
import { bbox as eovBbox } from '../analysis/planar';
import { runInWorker } from '../analysis/workerClient';
import { computeOverlay, type Zone } from '../analysis/overlay';
import { computeProximity } from '../analysis/proximity';
import { runService, type ServiceContext } from './service';
import { demService } from './dem';
import { floodService } from './flood';
import { overpassService } from './overpass';
import { naturaFromBundle, naturaService, type NaturaCollection } from './natura';
import { pvgisService } from './pvgis';
import { aspectToPvgis } from '../demo/provider';
import type { BboxWgs } from './cog';
import { PROXIMITY_RADIUS_M } from '../config';
import { fmtNum } from '../util/format';

function wgsBbox(ctx: AnalysisContext, marginM: number): BboxWgs {
  const pts = [...(ctx.polygonEov[0] ?? []), ...ctx.profiles.flatMap((p) => p.line)];
  const [x0, y0, x1, y1] = eovBbox(pts);
  const corners = [
    toWgs([x0 - marginM, y0 - marginM]),
    toWgs([x1 + marginM, y0 - marginM]),
    toWgs([x1 + marginM, y1 + marginM]),
    toWgs([x0 - marginM, y1 + marginM]),
  ];
  return [
    Math.min(...corners.map((c) => c[0])),
    Math.min(...corners.map((c) => c[1])),
    Math.max(...corners.map((c) => c[0])),
    Math.max(...corners.map((c) => c[1])),
  ];
}

const sctx = (ctx: AnalysisContext): ServiceContext => ({ signal: ctx.signal, online: ctx.online });

function mapOk<A, B>(o: SourceOutcome<A>, fn: (a: A) => B): SourceOutcome<B> {
  if (o.status !== 'ok') return o;
  return { ...o, data: fn(o.data) };
}

async function mapOkAsync<A, B>(o: SourceOutcome<A>, fn: (a: A) => Promise<B>): Promise<SourceOutcome<B>> {
  if (o.status !== 'ok') return o;
  return { ...o, data: await fn(o.data) };
}

function naturaZones(fc: NaturaCollection): Zone[] {
  const zones: Zone[] = [];
  for (const f of fc.features) {
    const label = [f.properties.name, f.properties.code ? `(${f.properties.code})` : '']
      .filter(Boolean)
      .join(' ');
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys)
      zones.push({
        name: label || 'Natura 2000 terület',
        rings: poly.map((r) => r.map((c) => toEov([c[0]!, c[1]!]))),
      });
  }
  return zones;
}

export function createLiveProvider(): DataProvider {
  return {
    mode: 'live',

    async terrain(ctx): Promise<SourceOutcome<TerrainMetrics>> {
      const o = await runService(demService, { bbox: wgsBbox(ctx, 120) }, sctx(ctx));
      return mapOkAsync(o, async (raster) => {
        const res = await runInWorker<'terrain'>({
          type: 'terrain-geo',
          raster,
          polygon: ctx.polygonEov,
          profiles: ctx.profiles,
        });
        return res.data;
      });
    },

    async natura(ctx): Promise<SourceOutcome<OverlayMetrics>> {
      const bbox = wgsBbox(ctx, PROXIMITY_RADIUS_M);
      const bundled = await naturaFromBundle(bbox);
      if (bundled) {
        return {
          status: 'ok',
          data: computeOverlay(
            ctx.polygonEov,
            naturaZones(bundled),
            'Forrás: az appba csomagolt EEA Natura 2000 kivonat',
          ),
          source: SOURCES.natura,
          cached: true,
          fetchedAt: new Date().toISOString(),
        };
      }
      const o = await runService(naturaService, { bbox }, sctx(ctx));
      return mapOk(o, (r) => computeOverlay(ctx.polygonEov, naturaZones(r.collection)));
    },

    async flood(ctx): Promise<SourceOutcome<OverlayMetrics>> {
      const o = await runService(floodService, { bbox: wgsBbox(ctx, 150) }, sctx(ctx));
      return mapOkAsync(o, async (raster) => {
        const r = await runInWorker<'raster-overlap'>({
          type: 'raster-overlap',
          raster,
          polygon: ctx.polygonEov,
          threshold: 0,
        });
        const d = r.data;
        return {
          overlapPct: d.overlapPct,
          overlapAreaM2: d.overlapAreaM2,
          names: d.overlapPct > 0 ? ['JRC 100 éves árvíz – modellezett elöntés'] : [],
          nearestDistanceM: null,
          detail:
            d.maxValue !== null
              ? `Modellezett legnagyobb vízmélység a telken: ${fmtNum(d.maxValue, 1)} m (~90 m-es felbontás).`
              : 'A modell szerint a telken nincs elöntés (~90 m-es felbontás, kis vízfolyások hiányozhatnak).',
        };
      });
    },

    async proximity(ctx): Promise<SourceOutcome<ProximityMetrics>> {
      const o = await runService(overpassService, { bbox: wgsBbox(ctx, 0) }, sctx(ctx));
      return mapOk(o, (f) =>
        computeProximity({
          parcel: ctx.polygonEov,
          radiusM: PROXIMITY_RADIUS_M,
          roads: f.roads.filter((r) => r.kind !== 'track'),
          powerLines: f.powerLines,
          waterways: f.waterways,
          buildings: f.buildings,
        }),
      );
    },

    async pv(ctx, terrain): Promise<SourceOutcome<PvMetrics>> {
      const [lon, lat] = ctx.geometry.centroidWgs;
      const flat = !terrain || terrain.meanAspectDeg === null || terrain.dominantAspect === 'sík';
      const angle = terrain ? Math.min(60, Math.round(terrain.meanSlopeDeg * 10) / 10) : 0;
      const aspect = flat ? 0 : Math.round(aspectToPvgis(terrain!.meanAspectDeg!));
      const o = await runService(
        pvgisService,
        { lat, lon, angleDeg: flat ? 0 : angle, aspectDeg: aspect, lossPct: ctx.pvLossPct },
        sctx(ctx),
      );
      if (o.status === 'ok' && !terrain)
        return {
          ...o,
          data: {
            ...o.data,
            database: `${o.data.database} (domborzat nélkül: vízszintes felülettel számolva)`,
          },
        };
      return o;
    },

    attributions: () => [
      SOURCES.basemap.attribution,
      SOURCES.dem.attribution,
      SOURCES.overpass.attribution,
      SOURCES.natura.attribution,
      SOURCES.flood.attribution,
      SOURCES.pvgis.attribution,
    ],
  };
}
