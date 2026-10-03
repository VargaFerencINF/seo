import { describe, expect, it } from 'vitest';
import { runAnalysis } from '../src/analysis/pipeline';
import { createDemoProvider } from '../src/demo/provider';
import { DEMO_PARCELS, demoPolygon } from '../src/demo/parcels';
import { DEFAULT_RULES } from '../src/analysis/rules';
import type { Parcel, StepState } from '../src/types';

function parcel(id: string): Parcel {
  const d = DEMO_PARCELS.find((x) => x.id === id)!;
  return {
    id,
    name: d.name,
    note: '',
    tags: [],
    geometry: demoPolygon(d),
    source: 'demo',
    mode: 'demo',
    createdAt: '',
    updatedAt: '',
    analysis: null,
    photos: [],
    profileLine: null,
  };
}

describe('demó elemzési folyamat (offline)', () => {
  it('a három mintatelek ítélete: zöld, piros, sárga', async () => {
    const verdicts: string[] = [];
    for (const id of ['demo-1', 'demo-2', 'demo-3']) {
      const r = await runAnalysis(parcel(id), {
        provider: createDemoProvider(),
        rules: DEFAULT_RULES,
        online: false,
        pvLossPct: 14,
      });
      verdicts.push(r.score.overall);
      expect(r.mode).toBe('demo');
      expect(r.steps.every((s) => s.status === 'ok')).toBe(true);
      expect(r.attributions.join(' ')).toMatch(/DEMÓ/);
    }
    expect(verdicts).toEqual(['green', 'red', 'yellow']);
  });

  it('folyamatjelzés minden lépésről, a végén 100 %', async () => {
    const seen: StepState[][] = [];
    let last = 0;
    await runAnalysis(parcel('demo-1'), {
      provider: createDemoProvider(),
      rules: DEFAULT_RULES,
      online: false,
      pvLossPct: 14,
      onProgress: (s, f) => {
        seen.push(s);
        last = f;
      },
    });
    expect(last).toBe(1);
    expect(seen.some((s) => s.some((x) => x.status === 'running'))).toBe(true);
  });

  it('felhasználói metszetvonal második profilként jelenik meg', async () => {
    const p = parcel('demo-3');
    const ring = p.geometry.coordinates[0]!;
    p.profileLine = { type: 'LineString', coordinates: [ring[0]!, ring[2]!] };
    const r = await runAnalysis(p, {
      provider: createDemoProvider(),
      rules: DEFAULT_RULES,
      online: false,
      pvLossPct: 14,
    });
    expect(r.terrain.status).toBe('ok');
    if (r.terrain.status === 'ok') {
      expect(r.terrain.data.profiles).toHaveLength(2);
      expect(r.terrain.data.profiles[1]!.label).toBe('Felhasználói metszet');
      expect(r.terrain.data.profiles[1]!.points.length).toBeGreaterThan(10);
    }
  });

  it('a hibás lépés nem állítja le a folyamatot', async () => {
    const prov = createDemoProvider();
    prov.natura = async () => {
      throw new Error('szimulált hiba');
    };
    const r = await runAnalysis(parcel('demo-1'), {
      provider: prov,
      rules: DEFAULT_RULES,
      online: false,
      pvLossPct: 14,
    });
    expect(r.natura.status).toBe('error');
    expect(r.steps.find((s) => s.id === 'natura')!.status).toBe('error');
    expect(r.score.criteria.find((c) => c.id === 'natura')!.lamp).toBe('na');
    expect(r.terrain.status).toBe('ok');
  });
});
