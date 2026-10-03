/** Szabályalapú pontozás: zöld / sárga / piros lámpák szempontonként és összesített ítélet. */
import type {
  AnalysisResult,
  CriterionScore,
  Lamp,
  RangeRule,
  RuleSet,
  ScoreResult,
  SourceOutcome,
} from '../types';
import { ASPECT_NAMES, fmtArea, fmtDist, fmtLen, fmtNum, fmtPct } from '../util/format';

/** Kisebb érték a jobb (pl. lejtés): ≤ green → zöld, ≤ yellow → sárga, különben piros */
export function lampLowerBetter(v: number, r: RangeRule): Lamp {
  if (v <= r.green) return 'green';
  if (v <= r.yellow) return 'yellow';
  return 'red';
}

/** Nagyobb érték a jobb (pl. terület, PV): ≥ green → zöld, ≥ yellow → sárga, különben piros */
export function lampHigherBetter(v: number, r: RangeRule): Lamp {
  if (v >= r.green) return 'green';
  if (v >= r.yellow) return 'yellow';
  return 'red';
}

type Input = Pick<AnalysisResult, 'geometry' | 'terrain' | 'natura' | 'flood' | 'proximity' | 'pv'>;

function na(id: string, label: string, o: SourceOutcome<unknown>): CriterionScore {
  const why =
    o.status === 'error'
      ? `${o.message} ${o.hint}`
      : o.status === 'unavailable' || o.status === 'skipped'
        ? o.reason
        : 'Nincs adat.';
  return { id, label, lamp: 'na', value: 'Nem elérhető adat', reason: why };
}

const LAMP_WORD: Record<Lamp, string> = {
  green: 'megfelelő',
  yellow: 'figyelendő',
  red: 'kockázatos',
  na: '–',
};

export function scoreAnalysis(input: Input, rules: RuleSet): ScoreResult {
  const c: CriterionScore[] = [];
  const g = input.geometry;

  if (rules.areaM2.enabled) {
    const lamp = lampHigherBetter(g.areaM2, rules.areaM2);
    c.push({
      id: 'area',
      label: 'Telekméret',
      lamp,
      value: fmtArea(g.areaM2),
      reason:
        lamp === 'green'
          ? `Legalább ${fmtNum(rules.areaM2.green)} m².`
          : lamp === 'yellow'
            ? `${fmtNum(rules.areaM2.yellow)}–${fmtNum(rules.areaM2.green)} m² közötti: szűkös lehet.`
            : `Kisebb, mint ${fmtNum(rules.areaM2.yellow)} m².`,
    });
  }

  const t = input.terrain;
  if (rules.slopePct.enabled) {
    if (t.status !== 'ok') c.push(na('slope', 'Átlagos lejtés', t));
    else {
      const v = t.data.meanSlopePct;
      const lamp = lampLowerBetter(v, rules.slopePct);
      c.push({
        id: 'slope',
        label: 'Átlagos lejtés',
        lamp,
        value: `${fmtPct(v)} (max. ${fmtNum(t.data.maxSlopeDeg, 1)}°)`,
        reason:
          lamp === 'green'
            ? `Legfeljebb ${fmtPct(rules.slopePct.green, 0)}: kedvező, kevés földmunka.`
            : lamp === 'yellow'
              ? `${fmtPct(rules.slopePct.green, 0)}–${fmtPct(rules.slopePct.yellow, 0)}: tereprendezés, támfal szükséges lehet.`
              : `${fmtPct(rules.slopePct.yellow, 0)} felett: meredek, jelentős építési többletköltség.`,
      });
    }
  }
  if (rules.reliefM.enabled) {
    if (t.status !== 'ok') c.push(na('relief', 'Szintkülönbség', t));
    else {
      const v = t.data.reliefM;
      const lamp = lampLowerBetter(v, rules.reliefM);
      c.push({
        id: 'relief',
        label: 'Szintkülönbség a telken',
        lamp,
        value: `${fmtNum(v, 1)} m (${fmtNum(t.data.minElevM, 0)}–${fmtNum(t.data.maxElevM, 0)} m)`,
        reason: `Küszöbök: zöld ≤ ${fmtNum(rules.reliefM.green)} m, sárga ≤ ${fmtNum(rules.reliefM.yellow)} m (${LAMP_WORD[lamp]}).`,
      });
    }
  }
  if (rules.northAspect.enabled) {
    if (t.status !== 'ok') c.push(na('aspect', 'Kitettség', t));
    else {
      const asp = t.data.dominantAspect;
      const north = asp === 'É' || asp === 'ÉK' || asp === 'ÉNy';
      const lamp: Lamp = north ? lampLowerBetter(t.data.meanSlopePct, rules.northAspect) : 'green';
      c.push({
        id: 'aspect',
        label: 'Kitettség',
        lamp,
        value: ASPECT_NAMES[asp] ?? asp,
        reason: north
          ? lamp === 'green'
            ? 'Északi irányú, de enyhe lejtés – a napfény-hozamot alig rontja.'
            : 'Északi kitettségű lejtő: kevesebb napfény, rosszabb napelem-hozam és tájolás.'
          : asp === 'sík'
            ? 'Sík terep, szabad tájolás.'
            : 'Déli, keleti vagy nyugati kitettség: kedvező.',
      });
    }
  }

  const overlayCrit = (
    id: string,
    label: string,
    o: Input['natura'],
    rule: RangeRule,
    good: string,
    bad: string,
  ) => {
    if (!rule.enabled) return;
    if (o.status !== 'ok') {
      c.push(na(id, label, o));
      return;
    }
    const v = o.data.overlapPct;
    const lamp = lampLowerBetter(v, rule);
    c.push({
      id,
      label,
      lamp,
      value:
        v > 0
          ? `${fmtPct(v)} átfedés`
          : `nincs átfedés${o.data.nearestDistanceM !== null ? ` (legközelebb ${fmtLen(o.data.nearestDistanceM)})` : ''}`,
      reason: v > 0 ? `${bad}${o.data.names.length ? ` Érintett: ${o.data.names.join(', ')}.` : ''}` : good,
    });
  };
  overlayCrit(
    'natura',
    'Natura 2000',
    input.natura,
    rules.naturaPct,
    'A telek nem érint Natura 2000 területet.',
    'Natura 2000 területet érint: hatásbecslés / természetvédelmi engedély szükséges lehet.',
  );
  overlayCrit(
    'flood',
    'Árvízveszély (100 éves)',
    input.flood,
    rules.floodPct,
    'A 100 éves visszatérési idejű árvíz modellezett elöntési területén kívül esik.',
    'A modell szerint 100 évente várható árvíz elöntheti: építési korlátozás, biztosítási kockázat.',
  );

  const p = input.proximity;
  const proxCrit = (
    id: string,
    label: string,
    rule: RangeRule,
    pick: (m: Extract<Input['proximity'], { status: 'ok' }>['data']) => {
      d: number | null;
      crosses: boolean;
      name?: string;
    },
    text: (lamp: Lamp, d: number | null) => string,
    custom?: (d: number | null, crosses: boolean) => Lamp | null,
  ) => {
    if (!rule.enabled) return;
    if (p.status !== 'ok') {
      c.push(na(id, label, p));
      return;
    }
    const { d, crosses, name } = pick(p.data);
    const lamp = custom?.(d, crosses) ?? (d === null ? 'red' : lampLowerBetter(d, rule));
    c.push({
      id,
      label,
      lamp,
      value: `${crosses && d === 0 ? 'keresztezi a telket' : fmtDist(d, p.data.searchRadiusM)}${name ? ` – ${name}` : ''}`,
      reason: text(lamp, d),
    });
  };
  proxCrit(
    'road',
    'Úthálózat',
    rules.roadM,
    (m) => ({ d: m.road.distanceM, crosses: false, ...(m.road.name ? { name: m.road.name } : {}) }),
    (lamp) =>
      lamp === 'green'
        ? 'Közúti megközelítés közvetlenül biztosítható.'
        : lamp === 'yellow'
          ? 'Bekötőút építése szükséges lehet.'
          : 'Messze van a legközelebbi út: a megközelítés költséges.',
    (d) => (d === 0 ? 'green' : null),
  );
  if (rules.powerM.enabled) {
    proxCrit(
      'power',
      'Légvezeték / áram',
      rules.powerM,
      (m) => ({ d: m.powerLine.distanceM, crosses: m.powerLine.crosses }),
      (lamp, d) =>
        d === 0
          ? 'Légvezeték keresztezi a telket: biztonsági övezet, beépítési korlát, kiváltás költsége.'
          : lamp === 'green'
            ? 'Elektromos hálózat közel: csatlakozás várhatóan kedvező.'
            : lamp === 'yellow'
              ? 'Közepes távolság a légvezetéktől: csatlakozási költség.'
              : 'Nincs közeli légvezeték az OSM-adatok szerint (földkábel lehet, ellenőrizd a szolgáltatónál).',
      (d, crosses) => (crosses ? rules.powerCrossingLamp : d === null ? 'yellow' : null),
    );
  }
  proxCrit(
    'water',
    'Vízfolyás',
    rules.waterBufferM,
    (m) => ({
      d: m.waterway.distanceM,
      crosses: m.waterway.crosses,
      ...(m.waterway.name ? { name: m.waterway.name } : {}),
    }),
    (lamp) =>
      lamp === 'green'
        ? 'Vízfolyás nincs a közvetlen közelben.'
        : lamp === 'yellow'
          ? 'Vízfolyás közelében: parti sáv (karbantartási sáv) korlátozhatja a beépítést.'
          : 'Vízfolyás érinti vagy nagyon közel van: vízjogi engedély, parti sáv, belvízveszély.',
    (d, crosses) => {
      if (crosses) return 'red';
      if (d === null) return 'green';
      if (d >= rules.waterBufferM.green) return 'green';
      if (d >= rules.waterBufferM.yellow) return 'yellow';
      return 'red';
    },
  );
  proxCrit(
    'building',
    'Beépítettség / közművek közelsége',
    rules.buildingM,
    (m) => ({ d: m.building.distanceM, crosses: false }),
    (lamp) =>
      lamp === 'green'
        ? 'Épületek a közelben: közművek (víz, csatorna) valószínűleg elérhetők.'
        : lamp === 'yellow'
          ? 'Távolabb a beépített területtől: közműfejlesztés szükséges lehet.'
          : 'Nincs épület a közelben: közművek kiépítése költséges lehet.',
  );

  if (rules.pvYield.enabled) {
    const pv = input.pv;
    if (pv.status !== 'ok') c.push(na('pv', 'Napelem-hozam', pv));
    else {
      const v = pv.data.terrain.yearlyKwhPerKwp;
      const lamp = lampHigherBetter(v, rules.pvYield);
      c.push({
        id: 'pv',
        label: 'Napelem-hozam',
        lamp,
        value: `${fmtNum(v)} kWh/kWp/év`,
        reason: `A terep dőlésével és tájolásával számolva${pv.data.optimal ? `; optimális dőléssel ${fmtNum(pv.data.optimal.yearlyKwhPerKwp)} kWh/kWp/év` : ''}. Küszöb: zöld ≥ ${fmtNum(rules.pvYield.green)}, sárga ≥ ${fmtNum(rules.pvYield.yellow)}.`,
      });
    }
  }

  return { overall: overallLamp(c), summary: summaryText(c), criteria: c, ruleSetName: rules.name };
}

export function overallLamp(c: CriterionScore[]): Lamp {
  const lamps = c.map((x) => x.lamp);
  if (lamps.includes('red')) return 'red';
  if (lamps.includes('yellow')) return 'yellow';
  if (lamps.includes('green')) return 'green';
  return 'na';
}

function summaryText(c: CriterionScore[]): string {
  const overall = overallLamp(c);
  const reds = c.filter((x) => x.lamp === 'red').map((x) => x.label.toLowerCase());
  const yellows = c.filter((x) => x.lamp === 'yellow').map((x) => x.label.toLowerCase());
  const nas = c.filter((x) => x.lamp === 'na').length;
  let s: string;
  switch (overall) {
    case 'red':
      s = `Kockázatos: ${reds.join(', ')}.`;
      break;
    case 'yellow':
      s = `Feltételesen alkalmas, további vizsgálat javasolt: ${yellows.join(', ')}.`;
      break;
    case 'green':
      s = 'Az előszűrés alapján nem látszik kizáró ok.';
      break;
    default:
      s = 'Nincs elég adat az értékeléshez.';
  }
  if (nas && overall !== 'na') s += ` ${nas} szempontnál nem volt elérhető adat.`;
  return s;
}

export const OVERALL_TITLE: Record<Lamp, string> = {
  green: 'Előszűrés: alkalmas',
  yellow: 'Előszűrés: feltételesen alkalmas',
  red: 'Előszűrés: kockázatos',
  na: 'Előszűrés: nincs elég adat',
};
