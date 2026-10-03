/** A szerkeszthető szabályok leírása (felülethez és validáláshoz). */
import type { RangeRule, RuleSet } from '../types';
import { DEFAULT_RULES, cloneRules } from './rules';

export type RangeKey = {
  [K in keyof RuleSet]: RuleSet[K] extends RangeRule ? K : never;
}[keyof RuleSet];

export interface RuleMeta {
  key: RangeKey;
  label: string;
  unit: string;
  /** lower: kisebb érték a jobb; higher: nagyobb a jobb */
  better: 'lower' | 'higher';
  help: string;
  step: number;
}

export const RULE_META: RuleMeta[] = [
  {
    key: 'areaM2',
    label: 'Telekméret',
    unit: 'm²',
    better: 'higher',
    help: 'Legalább ekkora telek kell.',
    step: 50,
  },
  {
    key: 'slopePct',
    label: 'Átlagos lejtés',
    unit: '%',
    better: 'lower',
    help: 'A telken belüli átlagos lejtés.',
    step: 0.5,
  },
  {
    key: 'reliefM',
    label: 'Szintkülönbség',
    unit: 'm',
    better: 'lower',
    help: 'Legmagasabb és legalacsonyabb pont különbsége.',
    step: 0.5,
  },
  {
    key: 'northAspect',
    label: 'Északi kitettség',
    unit: '% lejtés',
    better: 'lower',
    help: 'Északi kitettségnél e lejtés felett sárga/piros.',
    step: 0.5,
  },
  {
    key: 'naturaPct',
    label: 'Natura 2000 átfedés',
    unit: '%',
    better: 'lower',
    help: 'A telek mekkora része Natura 2000 terület.',
    step: 1,
  },
  {
    key: 'floodPct',
    label: 'Árvízi átfedés',
    unit: '%',
    better: 'lower',
    help: '100 éves árvízzel modellezetten elöntött rész.',
    step: 1,
  },
  { key: 'roadM', label: 'Út távolsága', unit: 'm', better: 'lower', help: 'Legközelebbi közút.', step: 10 },
  {
    key: 'powerM',
    label: 'Légvezeték távolsága',
    unit: 'm',
    better: 'lower',
    help: 'Csatlakozási lehetőség (OSM-ben jelölt vezeték).',
    step: 50,
  },
  {
    key: 'waterBufferM',
    label: 'Vízfolyás távolsága',
    unit: 'm',
    better: 'higher',
    help: 'Parti sáv: ennél közelebb sárga/piros.',
    step: 5,
  },
  {
    key: 'buildingM',
    label: 'Legközelebbi épület',
    unit: 'm',
    better: 'lower',
    help: 'Közművek valószínűsége (beépített terület közelsége).',
    step: 50,
  },
  {
    key: 'pvYield',
    label: 'Napelem-hozam',
    unit: 'kWh/kWp/év',
    better: 'higher',
    help: 'A terep síkjában számolt PVGIS-hozam.',
    step: 10,
  },
];

/** Szabályrendszer ellenőrzése: hiányzó/hibás értékek pótlása, küszöb-sorrend javítása. */
export function sanitizeRules(input: unknown): { rules: RuleSet; warnings: string[] } {
  const warnings: string[] = [];
  const base = cloneRules(DEFAULT_RULES);
  if (!input || typeof input !== 'object') return { rules: base, warnings: ['Érvénytelen szabályfájl.'] };
  const obj = input as Record<string, unknown>;
  if (typeof obj.name === 'string' && obj.name.trim()) base.name = obj.name.trim().slice(0, 80);
  for (const m of RULE_META) {
    const r = obj[m.key] as Partial<RangeRule> | undefined;
    if (!r || typeof r !== 'object') {
      warnings.push(`${m.label}: hiányzik, az alapértéket használom.`);
      continue;
    }
    const green = Number(r.green);
    const yellow = Number(r.yellow);
    if (!Number.isFinite(green) || !Number.isFinite(yellow)) {
      warnings.push(`${m.label}: hibás szám, az alapértéket használom.`);
      continue;
    }
    let g = green;
    let y = yellow;
    if ((m.better === 'lower' && g > y) || (m.better === 'higher' && g < y)) {
      [g, y] = [y, g];
      warnings.push(`${m.label}: a zöld és sárga küszöböt felcseréltem.`);
    }
    base[m.key] = { enabled: r.enabled !== false, green: g, yellow: y };
  }
  if (
    obj.powerCrossingLamp === 'yellow' ||
    obj.powerCrossingLamp === 'red' ||
    obj.powerCrossingLamp === 'green'
  )
    base.powerCrossingLamp = obj.powerCrossingLamp;
  return { rules: base, warnings };
}
