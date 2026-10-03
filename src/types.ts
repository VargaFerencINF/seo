import type { Polygon, LineString } from 'geojson';

/** WGS84 [hosszúság, szélesség] */
export type LngLat = [number, number];
/** EOV [x = Y (kelet), y = X (észak)] méterben */
export type Eov = [number, number];

export type DataMode = 'live' | 'demo';
export type Lamp = 'green' | 'yellow' | 'red' | 'na';
export type ParcelSource = 'draw' | 'gps' | 'import' | 'coords' | 'demo';

export interface Photo {
  id: string;
  parcelId: string | null;
  createdAt: string;
  lon: number;
  lat: number;
  accuracyM: number | null;
  /** Kamera iránya fokban (0 = észak, óramutató szerint), ha elérhető */
  headingDeg: number | null;
  /** Filesystem URI (natív) vagy data URL (web) */
  uri: string;
  /** Kis előnézet (data URL, JPEG) – térképi jelölőhöz és PDF-hez */
  thumb: string;
  note: string;
}

export interface Parcel {
  id: string;
  name: string;
  note: string;
  tags: string[];
  geometry: Polygon;
  source: ParcelSource;
  mode: DataMode;
  createdAt: string;
  updatedAt: string;
  analysis: AnalysisResult | null;
  photos: Photo[];
  /** Felhasználó által rajzolt metszetvonal (opcionális) */
  profileLine: LineString | null;
}

// ---------------------------------------------------------------- forrás-eredmények

export interface SourceInfo {
  id: string;
  label: string;
  attribution: string;
}

export type SourceOutcome<T> =
  | { status: 'ok'; data: T; source: SourceInfo; cached: boolean; fetchedAt: string }
  | { status: 'unavailable'; reason: string; source: SourceInfo }
  | { status: 'error'; message: string; hint: string; source: SourceInfo }
  | { status: 'skipped'; reason: string; source: SourceInfo };

// ---------------------------------------------------------------- elemzés

export type StepId = 'geometry' | 'dem' | 'natura' | 'flood' | 'proximity' | 'pv' | 'scoring';
export type StepStatus = 'pending' | 'running' | 'ok' | 'skipped' | 'unavailable' | 'error';

export interface StepState {
  id: StepId;
  label: string;
  status: StepStatus;
  message?: string;
}

export interface GeometryMetrics {
  areaM2: number;
  perimeterM: number;
  centroidEov: Eov;
  centroidWgs: LngLat;
  bboxEov: [number, number, number, number];
  vertexCount: number;
  /** A leghosszabb átló (két legtávolabbi csúcs) WGS84-ben */
  longestDiagonal: [LngLat, LngLat];
  longestDiagonalM: number;
}

export type AspectClass = 'É' | 'ÉK' | 'K' | 'DK' | 'D' | 'DNy' | 'Ny' | 'ÉNy' | 'sík';

export interface ProfilePoint {
  /** távolság a metszet elejétől (m) */
  d: number;
  /** magasság (m), null ha nincs adat */
  z: number | null;
}

export interface TerrainProfile {
  label: string;
  line: [LngLat, LngLat] | LngLat[];
  lengthM: number;
  points: ProfilePoint[];
}

export interface TerrainMetrics {
  minElevM: number;
  maxElevM: number;
  meanElevM: number;
  reliefM: number;
  meanSlopeDeg: number;
  maxSlopeDeg: number;
  meanSlopePct: number;
  /** domináns kitettség (sík, ha az átlagos lejtés < 2°) */
  dominantAspect: AspectClass;
  /** átlagos (vektoriális) kitettség fokban, 0 = észak */
  meanAspectDeg: number | null;
  aspectShares: Record<AspectClass, number>;
  sampleCount: number;
  cellSizeM: number;
  profiles: TerrainProfile[];
}

export interface OverlayMetrics {
  overlapPct: number;
  overlapAreaM2: number;
  /** érintett objektumok nevei (pl. Natura területek) */
  names: string[];
  /** a legközelebbi érintett terület távolsága, ha nincs átfedés */
  nearestDistanceM: number | null;
  detail?: string;
}

export interface ProximityItem {
  distanceM: number | null;
  crosses: boolean;
  name?: string;
  kind?: string;
}

export interface ProximityMetrics {
  searchRadiusM: number;
  road: ProximityItem;
  powerLine: ProximityItem;
  waterway: ProximityItem;
  building: ProximityItem & { countInside: number };
}

export interface PvVariant {
  angleDeg: number;
  /** PVGIS konvenció: 0 = dél, 90 = nyugat, −90 = kelet */
  aspectDeg: number;
  yearlyKwhPerKwp: number;
  yearlyIrradiationKwhM2: number | null;
  monthlyKwhPerKwp: number[];
}

export interface PvMetrics {
  terrain: PvVariant;
  optimal: PvVariant | null;
  lossPct: number;
  database: string;
}

export interface CriterionScore {
  id: string;
  label: string;
  lamp: Lamp;
  value: string;
  reason: string;
}

export interface ScoreResult {
  overall: Lamp;
  summary: string;
  criteria: CriterionScore[];
  ruleSetName: string;
}

export interface AnalysisResult {
  version: 1;
  mode: DataMode;
  createdAt: string;
  geometry: GeometryMetrics;
  terrain: SourceOutcome<TerrainMetrics>;
  natura: SourceOutcome<OverlayMetrics>;
  flood: SourceOutcome<OverlayMetrics>;
  proximity: SourceOutcome<ProximityMetrics>;
  pv: SourceOutcome<PvMetrics>;
  score: ScoreResult;
  steps: StepState[];
  attributions: string[];
  offlineSkipped: string[];
}

// ---------------------------------------------------------------- szabályok

export interface RangeRule {
  enabled: boolean;
  /** ennél kisebb/egyenlő (vagy nagyobb – lásd irány) zöld */
  green: number;
  /** ennél kisebb/egyenlő sárga, felette piros */
  yellow: number;
}

export interface RuleSet {
  name: string;
  /** átlagos lejtés % – kisebb a jobb */
  slopePct: RangeRule;
  /** szintkülönbség a telken belül (m) – kisebb a jobb */
  reliefM: RangeRule;
  /** terület m² – nagyobb a jobb (green = min. zöld, yellow = min. sárga) */
  areaM2: RangeRule;
  /** Natura átfedés % – kisebb a jobb */
  naturaPct: RangeRule;
  /** árvízi átfedés % – kisebb a jobb */
  floodPct: RangeRule;
  /** útig mért távolság m – kisebb a jobb */
  roadM: RangeRule;
  /** légvezetékig mért távolság m – kisebb a jobb (csatlakozás) */
  powerM: RangeRule;
  /** légvezeték keresztezi a telket → lámpa */
  powerCrossingLamp: Lamp;
  /** vízfolyás: ennél közelebb sárga (parti sáv), keresztezés piros */
  waterBufferM: RangeRule;
  /** legközelebbi épület m – kisebb a jobb (közmű-közelség) */
  buildingM: RangeRule;
  /** PV éves hozam kWh/kWp – nagyobb a jobb */
  pvYield: RangeRule;
  /** északi kitettség figyelmeztetés, ha az átlagos lejtés % e felett van */
  northAspect: RangeRule;
}
