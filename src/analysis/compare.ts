/** Telkek összehasonlító táblázata (2–3 telek): mutatók, lámpák, a legjobb érték kiemelése. */
import type { Lamp, Parcel } from '../types';
import { ASPECT_NAMES, fmtArea, fmtDist, fmtNum, fmtPct } from '../util/format';
import { computeGeometry } from './geometry';

export interface CompareCell {
  text: string;
  lamp?: Lamp;
  best?: boolean;
}

export interface CompareRow {
  label: string;
  cells: CompareCell[];
  /** szakaszcím a sor előtt */
  section?: string;
}

export interface Comparison {
  columns: { id: string; name: string; verdict: Lamp; demo: boolean }[];
  rows: CompareRow[];
}

type Num = number | null;

function numericRow(
  label: string,
  values: Num[],
  fmt: (v: number) => string,
  better: 'lower' | 'higher' | null,
): CompareRow {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const bestVal =
    better === null || valid.length < 2 ? null : better === 'lower' ? Math.min(...valid) : Math.max(...valid);
  const unique = valid.filter((v) => v === bestVal).length === 1;
  return {
    label,
    cells: values.map((v) => ({
      text: v === null || !Number.isFinite(v) ? 'nincs adat' : fmt(v),
      ...(bestVal !== null && unique && v === bestVal ? { best: true } : {}),
    })),
  };
}

export function buildComparison(parcels: Parcel[]): Comparison {
  const a = parcels.map((p) => p.analysis);
  const t = a.map((x) => (x?.terrain.status === 'ok' ? x.terrain.data : null));
  const prox = a.map((x) => (x?.proximity.status === 'ok' ? x.proximity.data : null));
  const area = parcels.map((p, i) => a[i]?.geometry.areaM2 ?? computeGeometry(p.geometry).areaM2);

  const rows: CompareRow[] = [
    { ...numericRow('Terület', area, fmtArea, null), section: 'Mutatók' },
    numericRow(
      'Átlagos lejtés',
      t.map((x) => x?.meanSlopePct ?? null),
      (v) => fmtPct(v),
      'lower',
    ),
    numericRow(
      'Szintkülönbség',
      t.map((x) => x?.reliefM ?? null),
      (v) => `${fmtNum(v, 1)} m`,
      'lower',
    ),
    {
      label: 'Domináns kitettség',
      cells: t.map((x) => ({
        text: x ? (ASPECT_NAMES[x.dominantAspect] ?? x.dominantAspect) : 'nincs adat',
      })),
    },
    numericRow(
      'Natura 2000 átfedés',
      a.map((x) => (x?.natura.status === 'ok' ? x.natura.data.overlapPct : null)),
      (v) => fmtPct(v),
      'lower',
    ),
    numericRow(
      'Árvízi átfedés',
      a.map((x) => (x?.flood.status === 'ok' ? x.flood.data.overlapPct : null)),
      (v) => fmtPct(v),
      'lower',
    ),
    numericRow(
      'Legközelebbi út',
      prox.map((x) => x?.road.distanceM ?? null),
      (v) => fmtDist(v),
      'lower',
    ),
    {
      label: 'Légvezeték',
      cells: prox.map((x) => ({
        text: !x
          ? 'nincs adat'
          : x.powerLine.crosses
            ? 'keresztezi'
            : fmtDist(x.powerLine.distanceM, x.searchRadiusM),
      })),
    },
    {
      label: 'Vízfolyás',
      cells: prox.map((x) => ({
        text: !x
          ? 'nincs adat'
          : x.waterway.crosses
            ? 'keresztezi'
            : fmtDist(x.waterway.distanceM, x.searchRadiusM),
      })),
    },
    numericRow(
      'Legközelebbi épület',
      prox.map((x) => x?.building.distanceM ?? null),
      (v) => fmtDist(v),
      'lower',
    ),
    numericRow(
      'Napelem-hozam (terep)',
      a.map((x) => (x?.pv.status === 'ok' ? x.pv.data.terrain.yearlyKwhPerKwp : null)),
      (v) => `${fmtNum(v)} kWh/kWp`,
      'higher',
    ),
    { label: 'Terepi fotók', cells: parcels.map((p) => ({ text: String(p.photos.length) })) },
  ];

  // szempontonkénti lámpák (az összes előforduló szempont)
  const critIds: { id: string; label: string }[] = [];
  for (const x of a)
    for (const c of x?.score.criteria ?? [])
      if (!critIds.some((k) => k.id === c.id)) critIds.push({ id: c.id, label: c.label });
  critIds.forEach((k, i) =>
    rows.push({
      ...(i === 0 ? { section: 'Értékelés szempontonként' } : {}),
      label: k.label,
      cells: a.map((x) => {
        const c = x?.score.criteria.find((cc) => cc.id === k.id);
        return c ? { text: c.value, lamp: c.lamp } : { text: '–', lamp: 'na' };
      }),
    }),
  );

  return {
    columns: parcels.map((p, i) => ({
      id: p.id,
      name: p.name,
      verdict: a[i]?.score.overall ?? 'na',
      demo: p.mode === 'demo',
    })),
    rows,
  };
}
