import type {
  DataMode,
  Eov,
  GeometryMetrics,
  OverlayMetrics,
  Parcel,
  ProximityMetrics,
  PvMetrics,
  SourceOutcome,
  TerrainMetrics,
} from '../types';
import type { Ring } from './planar';

export interface AnalysisContext {
  parcel: Parcel;
  polygonEov: Ring[];
  geometry: GeometryMetrics;
  profiles: { label: string; line: Eov[] }[];
  signal: AbortSignal;
  online: boolean;
  pvLossPct: number;
}

/** Egy adatforrás-készlet (élő vagy demó) egységes interfésze */
export interface DataProvider {
  mode: DataMode;
  terrain(ctx: AnalysisContext): Promise<SourceOutcome<TerrainMetrics>>;
  natura(ctx: AnalysisContext): Promise<SourceOutcome<OverlayMetrics>>;
  flood(ctx: AnalysisContext): Promise<SourceOutcome<OverlayMetrics>>;
  proximity(ctx: AnalysisContext): Promise<SourceOutcome<ProximityMetrics>>;
  pv(ctx: AnalysisContext, terrain: TerrainMetrics | null): Promise<SourceOutcome<PvMetrics>>;
  attributions(): string[];
}
