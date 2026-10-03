import type { RuleSet } from '../types';

const r = (green: number, yellow: number, enabled = true) => ({ enabled, green, yellow });

/** Alapértelmezett, általános telek-előszűrő szabályrendszer */
export const DEFAULT_RULES: RuleSet = {
  name: 'Általános (alapértelmezett)',
  slopePct: r(5, 12),
  reliefM: r(3, 10),
  areaM2: r(1000, 600),
  naturaPct: r(0, 10),
  floodPct: r(0, 5),
  roadM: r(50, 300),
  powerM: r(300, 1000),
  powerCrossingLamp: 'yellow',
  waterBufferM: r(50, 20),
  buildingM: r(200, 1000),
  pvYield: r(1250, 1100),
  northAspect: r(5, 12),
};

/** Előre definiált profilok a Beállításokban */
export const RULE_PRESETS: RuleSet[] = [
  DEFAULT_RULES,
  {
    ...DEFAULT_RULES,
    name: 'Napelempark',
    slopePct: r(5, 10),
    reliefM: r(10, 25),
    areaM2: r(20000, 5000),
    roadM: r(300, 1500),
    powerM: r(500, 2000),
    powerCrossingLamp: 'yellow',
    buildingM: r(5000, 10000, false),
    pvYield: r(1300, 1200),
    northAspect: r(3, 8),
  },
  {
    ...DEFAULT_RULES,
    name: 'Lakóépület / családi ház',
    slopePct: r(8, 15),
    reliefM: r(4, 12),
    areaM2: r(700, 400),
    roadM: r(30, 150),
    powerM: r(200, 600),
    powerCrossingLamp: 'red',
    buildingM: r(100, 400),
    pvYield: r(1150, 1000, false),
  },
];

export function cloneRules(rules: RuleSet): RuleSet {
  return JSON.parse(JSON.stringify(rules)) as RuleSet;
}
