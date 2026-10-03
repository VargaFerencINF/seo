import { describe, expect, it } from 'vitest';
import {
  MemoryRepository,
  ROW_COLUMNS,
  SqliteRepository,
  matchesQuery,
  parcelToRow,
  rowToParcel,
  rowToSummary,
  type SqlDb,
} from '../src/storage/repository';
import { buildComparison } from '../src/analysis/compare';
import { sanitizeRules, RULE_META } from '../src/analysis/ruleMeta';
import { rescore } from '../src/analysis/rescore';
import { DEFAULT_RULES, RULE_PRESETS, cloneRules } from '../src/analysis/rules';
import { runAnalysis } from '../src/analysis/pipeline';
import { createDemoProvider } from '../src/demo/provider';
import { DEMO_PARCELS, demoPolygon } from '../src/demo/parcels';
import { parseTags } from '../src/ui/components/parcelEdit';
import type { Parcel } from '../src/types';

async function demoParcel(id: string, analyze = true): Promise<Parcel> {
  const d = DEMO_PARCELS.find((x) => x.id === id)!;
  const p: Parcel = {
    id,
    name: d.name,
    note: d.note,
    tags: d.tags,
    geometry: demoPolygon(d),
    source: 'demo',
    mode: 'demo',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: `2026-10-0${id.slice(-1)}T10:00:00.000Z`,
    analysis: null,
    photos: [],
    profileLine: null,
  };
  if (analyze)
    p.analysis = await runAnalysis(p, {
      provider: createDemoProvider(),
      rules: DEFAULT_RULES,
      online: false,
      pvLossPct: 14,
    });
  return p;
}

describe('tárolás: sor ↔ telek leképezés', () => {
  it('oda-vissza veszteségmentes, összegző mezőkkel', async () => {
    const p = await demoParcel('demo-1');
    p.photos = [
      {
        id: 'f1',
        parcelId: p.id,
        createdAt: '',
        lon: 19,
        lat: 47,
        accuracyM: 3,
        headingDeg: 90,
        uri: 'file://x.jpg',
        thumb: 'data:',
        note: 'kapu',
      },
    ];
    const row = parcelToRow(p);
    expect(row.verdict).toBe('green');
    expect(row.area_m2).toBeCloseTo(p.analysis!.geometry.areaM2);
    expect(row.photo_count).toBe(1);
    expect(rowToParcel(row)).toEqual(p);
    const s = rowToSummary(row);
    expect(s.tags).toEqual(['lakóépület']);
    expect(s.photoCount).toBe(1);
  });
  it('sérült JSON-mezőknél nem omlik össze', () => {
    const p = rowToParcel({
      ...parcelToRow({
        ...({} as Parcel),
        id: 'x',
        name: 'x',
        note: '',
        tags: [],
        geometry: { type: 'Polygon', coordinates: [] },
        source: 'draw',
        mode: 'live',
        createdAt: '',
        updatedAt: '',
        analysis: null,
        photos: [],
        profileLine: null,
      }),
      photos: '{hibás',
      tags: 'nem json',
    });
    expect(p.photos).toEqual([]);
    expect(p.tags).toEqual([]);
  });
});

describe('SQLite repository (mock kapcsolattal)', () => {
  function fakeDb() {
    const rows = new Map<string, Record<string, unknown>>();
    const log: string[] = [];
    const db: SqlDb = {
      async execute(sql) {
        log.push(sql);
        return {};
      },
      async run(sql, values = []) {
        log.push(sql);
        if (sql.startsWith('INSERT OR REPLACE')) {
          const obj = Object.fromEntries(ROW_COLUMNS.map((c, i) => [c, values[i]]));
          rows.set(String(obj.id), obj);
        } else if (sql.startsWith('DELETE')) rows.delete(String(values[0]));
        return {};
      },
      async query(sql, values = []) {
        log.push(sql);
        if (sql.includes('WHERE id = ?'))
          return { values: rows.has(String(values[0])) ? [rows.get(String(values[0]))] : [] };
        return {
          values: [...rows.values()].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))),
        };
      },
    };
    return { db, log, rows };
  }

  it('séma létrehozása, mentés, lista (legújabb elöl), betöltés, törlés', async () => {
    const { db, log } = fakeDb();
    const repo = new SqliteRepository(async () => db);
    await repo.save(await demoParcel('demo-1'));
    await repo.save(await demoParcel('demo-2'));
    expect(log[0]).toContain('CREATE TABLE IF NOT EXISTS parcels');
    const list = await repo.list();
    expect(list.map((x) => x.id)).toEqual(['demo-2', 'demo-1']);
    expect(list[1]!.verdict).toBe('green');
    const p = await repo.get('demo-2');
    expect(p?.analysis?.score.overall).toBe('red');
    await repo.remove('demo-2');
    expect((await repo.list()).map((x) => x.id)).toEqual(['demo-1']);
    expect(log.some((l) => l.includes('INSERT OR REPLACE INTO parcels'))).toBe(true);
  });

  it('memória-repository ugyanazt a szerződést teljesíti', async () => {
    const repo = new MemoryRepository();
    await repo.save(await demoParcel('demo-3', false));
    expect((await repo.list())[0]!.verdict).toBeNull();
    expect(await repo.get('nincs')).toBeNull();
  });
});

describe('keresés és címkék', () => {
  it('ékezet- és kisbetű-független keresés névben, megjegyzésben, címkében', async () => {
    const s = rowToSummary(parcelToRow(await demoParcel('demo-2', false)));
    expect(matchesQuery(s, 'arteri')).toBe(true);
    expect(matchesQuery(s, 'MEZŐGAZDASÁGI')).toBe(true);
    expect(matchesQuery(s, 'natura')).toBe(true);
    expect(matchesQuery(s, 'sztráda')).toBe(false);
    expect(matchesQuery(s, '  ')).toBe(true);
  });
  it('címkék feldolgozása', () => {
    expect(parseTags('lakópark, ügyfél: Kovács;  lakópark #sürgős')).toEqual([
      'lakópark',
      'ügyfél: Kovács',
      'sürgős',
    ]);
  });
});

describe('összehasonlítás', () => {
  it('három telek: oszlopok, ítéletek, legjobb érték kiemelése', async () => {
    const ps = await Promise.all(['demo-1', 'demo-2', 'demo-3'].map((id) => demoParcel(id)));
    const c = buildComparison(ps);
    expect(c.columns.map((x) => x.verdict)).toEqual(['green', 'red', 'yellow']);
    const slope = c.rows.find((r) => r.label === 'Átlagos lejtés')!;
    // az ártéri rét a legsíkabb
    expect(slope.cells[1]!.best).toBe(true);
    const natura = c.rows.find((r) => r.label === 'Natura 2000 átfedés')!;
    expect(natura.cells[1]!.text).toMatch(/100/);
    expect(c.rows.some((r) => r.section === 'Értékelés szempontonként' && r.cells.every((x) => x.lamp))).toBe(
      true,
    );
  });
  it('elemzés nélküli telek „nincs adat” cellákkal', async () => {
    const c = buildComparison([await demoParcel('demo-1'), await demoParcel('demo-2', false)]);
    expect(c.columns[1]!.verdict).toBe('na');
    expect(c.rows.find((r) => r.label === 'Átlagos lejtés')!.cells[1]!.text).toBe('nincs adat');
    // a terület elemzés nélkül is számolható
    expect(c.rows[0]!.cells[1]!.text).toMatch(/ha|m²/);
  });
});

describe('szerkeszthető szabályrendszer', () => {
  it('a meta minden tartomány-szabályt lefed', () => {
    const rangeKeys = Object.entries(DEFAULT_RULES)
      .filter(([, v]) => typeof v === 'object')
      .map(([k]) => k)
      .sort();
    expect(RULE_META.map((m) => m.key).sort()).toEqual(rangeKeys);
  });
  it('import: hiányzó értékek pótlása, fordított küszöbök javítása', () => {
    const { rules, warnings } = sanitizeRules({
      name: 'Cég X',
      slopePct: { enabled: true, green: 15, yellow: 5 },
      areaM2: { enabled: false, green: 500, yellow: 1000 },
      powerCrossingLamp: 'red',
    });
    expect(rules.name).toBe('Cég X');
    expect(rules.slopePct).toEqual({ enabled: true, green: 5, yellow: 15 });
    expect(rules.areaM2).toEqual({ enabled: false, green: 1000, yellow: 500 });
    expect(rules.powerCrossingLamp).toBe('red');
    expect(rules.reliefM).toEqual(DEFAULT_RULES.reliefM);
    expect(warnings.length).toBeGreaterThan(3);
  });
  it('újrapontozás más profillal hálózat nélkül', async () => {
    const p = await demoParcel('demo-1');
    const solar = cloneRules(RULE_PRESETS.find((r) => r.name === 'Napelempark')!);
    const r = rescore(p.analysis!, solar);
    expect(r.score.ruleSetName).toBe('Napelempark');
    // a napelempark-profilnál a 1627 m² kicsi → piros terület-lámpa
    expect(r.score.criteria.find((c) => c.id === 'area')!.lamp).toBe('red');
    expect(r.terrain).toBe(p.analysis!.terrain);
  });
});
