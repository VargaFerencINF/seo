import { describe, expect, it } from 'vitest';
import { lampHigherBetter, lampLowerBetter, overallLamp, scoreAnalysis } from '../src/analysis/scoring';
import { DEFAULT_RULES, cloneRules } from '../src/analysis/rules';
import type { AnalysisResult, SourceOutcome, TerrainMetrics } from '../src/types';
import { SOURCES } from '../src/config';

import type { ProximityMetrics } from '../src/types';

function proxData(b: ReturnType<typeof base>): ProximityMetrics {
  if (b.proximity.status !== 'ok') throw new Error('teszt: nincs közelségi adat');
  return b.proximity.data;
}

const okOf = <T>(data: T): SourceOutcome<T> => ({
  status: 'ok',
  data,
  source: SOURCES.demo,
  cached: false,
  fetchedAt: '',
});

const terrain: TerrainMetrics = {
  minElevM: 100,
  maxElevM: 102,
  meanElevM: 101,
  reliefM: 2,
  meanSlopeDeg: 2,
  maxSlopeDeg: 3,
  meanSlopePct: 3.5,
  dominantAspect: 'D',
  meanAspectDeg: 180,
  aspectShares: { É: 0, ÉK: 0, K: 0, DK: 0, D: 1, DNy: 0, Ny: 0, ÉNy: 0, sík: 0 },
  sampleCount: 100,
  cellSizeM: 3,
  profiles: [],
};

function base(): Pick<AnalysisResult, 'geometry' | 'terrain' | 'natura' | 'flood' | 'proximity' | 'pv'> {
  return {
    geometry: {
      areaM2: 1500,
      perimeterM: 160,
      centroidEov: [650000, 240000],
      centroidWgs: [19, 47.5],
      bboxEov: [0, 0, 1, 1],
      vertexCount: 4,
      longestDiagonal: [
        [19, 47.5],
        [19.001, 47.5],
      ],
      longestDiagonalM: 60,
    },
    terrain: okOf(terrain),
    natura: okOf({ overlapPct: 0, overlapAreaM2: 0, names: [], nearestDistanceM: 800 }),
    flood: okOf({ overlapPct: 0, overlapAreaM2: 0, names: [], nearestDistanceM: 900 }),
    proximity: okOf({
      searchRadiusM: 2000,
      road: { distanceM: 20, crosses: false },
      powerLine: { distanceM: 150, crosses: false },
      waterway: { distanceM: 500, crosses: false },
      building: { distanceM: 30, crosses: false, countInside: 0 },
    }),
    pv: okOf({
      terrain: {
        angleDeg: 2,
        aspectDeg: 0,
        yearlyKwhPerKwp: 1200,
        yearlyIrradiationKwhM2: null,
        monthlyKwhPerKwp: [],
      },
      optimal: null,
      lossPct: 14,
      database: 'teszt',
    }),
  };
}

describe('küszöbök', () => {
  it('kisebb a jobb', () => {
    const r = { enabled: true, green: 5, yellow: 12 };
    expect(lampLowerBetter(5, r)).toBe('green');
    expect(lampLowerBetter(5.01, r)).toBe('yellow');
    expect(lampLowerBetter(12.5, r)).toBe('red');
  });
  it('nagyobb a jobb', () => {
    const r = { enabled: true, green: 1000, yellow: 600 };
    expect(lampHigherBetter(1000, r)).toBe('green');
    expect(lampHigherBetter(700, r)).toBe('yellow');
    expect(lampHigherBetter(500, r)).toBe('red');
  });
  it('összesítés: piros > sárga > zöld, a „nincs adat” nem ront', () => {
    const c = (lamp: 'green' | 'yellow' | 'red' | 'na') => ({
      id: '',
      label: '',
      lamp,
      value: '',
      reason: '',
    });
    expect(overallLamp([c('green'), c('na')])).toBe('green');
    expect(overallLamp([c('green'), c('yellow')])).toBe('yellow');
    expect(overallLamp([c('yellow'), c('red')])).toBe('red');
    expect(overallLamp([c('na')])).toBe('na');
  });
});

describe('pontozó szabályok', () => {
  it('kedvező telek → zöld', () => {
    const s = scoreAnalysis(base(), DEFAULT_RULES);
    expect(s.overall).toBe('green');
    expect(s.criteria.every((c) => c.lamp === 'green')).toBe(true);
  });
  it('légvezeték-keresztezés a szabály szerinti lámpát kapja', () => {
    const b = base();
    b.proximity = okOf({
      ...proxData(b),
      powerLine: { distanceM: 0, crosses: true },
    });
    const rules = cloneRules(DEFAULT_RULES);
    rules.powerCrossingLamp = 'red';
    const s = scoreAnalysis(b, rules);
    expect(s.criteria.find((c) => c.id === 'power')!.lamp).toBe('red');
    expect(s.overall).toBe('red');
  });
  it('Natura-átfedés piros, indoklással', () => {
    const b = base();
    b.natura = okOf({ overlapPct: 40, overlapAreaM2: 600, names: ['HUDN20001'], nearestDistanceM: 0 });
    const s = scoreAnalysis(b, DEFAULT_RULES);
    const n = s.criteria.find((c) => c.id === 'natura')!;
    expect(n.lamp).toBe('red');
    expect(n.reason).toContain('HUDN20001');
  });
  it('hiányzó forrás → „nincs adat” lámpa, a többi szempont értékelhető marad', () => {
    const b = base();
    b.flood = { status: 'unavailable', reason: 'A JRC szolgáltatás nem érhető el.', source: SOURCES.flood };
    const s = scoreAnalysis(b, DEFAULT_RULES);
    const f = s.criteria.find((c) => c.id === 'flood')!;
    expect(f.lamp).toBe('na');
    expect(f.value).toBe('Nem elérhető adat');
    expect(s.overall).toBe('green');
    expect(s.summary).toMatch(/nem volt elérhető adat/);
  });
  it('kikapcsolt szempont nem szerepel', () => {
    const rules = cloneRules(DEFAULT_RULES);
    rules.pvYield.enabled = false;
    expect(scoreAnalysis(base(), rules).criteria.some((c) => c.id === 'pv')).toBe(false);
  });
  it('északi kitettség meredek lejtőn sárga/piros', () => {
    const b = base();
    b.terrain = okOf({ ...terrain, dominantAspect: 'É', meanSlopePct: 9 });
    const s = scoreAnalysis(b, DEFAULT_RULES);
    expect(s.criteria.find((c) => c.id === 'aspect')!.lamp).toBe('yellow');
  });
  it('vízfolyás: közel sárga, keresztezés piros', () => {
    const b = base();
    const prox = proxData(b);
    b.proximity = okOf({ ...prox, waterway: { distanceM: 30, crosses: false } });
    expect(scoreAnalysis(b, DEFAULT_RULES).criteria.find((c) => c.id === 'water')!.lamp).toBe('yellow');
    b.proximity = okOf({ ...prox, waterway: { distanceM: 0, crosses: true } });
    expect(scoreAnalysis(b, DEFAULT_RULES).criteria.find((c) => c.id === 'water')!.lamp).toBe('red');
  });
});
