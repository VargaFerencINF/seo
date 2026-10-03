/** Elemzési eredmények és folyamatjelző megjelenítése a bottom sheetben. */
import { h, svg } from '../dom';
import { icons } from '../icons';
import type { AnalysisResult, Lamp, SourceOutcome, StepState } from '../../types';
import { OVERALL_TITLE } from '../../analysis/scoring';
import {
  ASPECT_NAMES,
  fmtArea,
  fmtDist,
  fmtEov,
  fmtLen,
  fmtNum,
  fmtPct,
  fmtWgs,
  fmtDate,
} from '../../util/format';
import { profileChart } from './profileChart';

const STEP_ICON: Record<StepState['status'], string> = {
  pending: '○',
  running: '◌',
  ok: '✓',
  skipped: '⤼',
  unavailable: '–',
  error: '✕',
};

export function lampEl(l: Lamp, label?: string): HTMLElement {
  const names: Record<Lamp, string> = { green: 'zöld', yellow: 'sárga', red: 'piros', na: 'nincs adat' };
  return h('span', { class: `lamp ${l}`, role: 'img', 'aria-label': label ?? names[l], title: names[l] });
}

export function renderSteps(steps: StepState[]): HTMLElement {
  return h(
    'ul',
    { class: 'steps' },
    steps.map((s) =>
      h(
        'li',
        null,
        h(
          'span',
          { class: `st st-${s.status} ${s.status === 'running' ? 'spin' : ''}` },
          STEP_ICON[s.status],
        ),
        h(
          'span',
          null,
          s.label,
          s.message ? h('small', { class: 'muted', style: 'display:block' }, s.message) : null,
        ),
      ),
    ),
  );
}

export function renderProgress(steps: StepState[], fraction: number): HTMLElement {
  return h(
    'div',
    { class: 'card', 'aria-live': 'polite' },
    h('h2', null, 'Elemzés folyamatban…'),
    h(
      'div',
      {
        class: 'progress',
        role: 'progressbar',
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuenow': String(Math.round(fraction * 100)),
      },
      h('div', { style: `width:${Math.round(fraction * 100)}%` }),
    ),
    renderSteps(steps),
  );
}

function kv(rows: [string, string | Node][]): HTMLElement {
  return h(
    'dl',
    { class: 'kv' },
    rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]),
  );
}

function outcomeNote(o: SourceOutcome<unknown>): HTMLElement | null {
  if (o.status === 'ok') return null;
  const text = o.status === 'error' ? `${o.message} ${o.hint}` : `Nem elérhető adat. ${o.reason}`;
  return h(
    'div',
    { class: `banner ${o.status === 'error' ? 'error' : 'warn'}` },
    svg(icons.warn),
    h('span', null, text),
  );
}

export function renderResults(a: AnalysisResult, opts: { demo: boolean }): HTMLElement {
  const root = h('div', null);
  if (opts.demo || a.mode === 'demo')
    root.append(
      h(
        'div',
        { class: 'banner info' },
        svg(icons.info),
        h(
          'span',
          null,
          'DEMÓ MÓD – az eredmények szimulált adatokon alapulnak, nem valós helyszínt írnak le.',
        ),
      ),
    );
  if (a.offlineSkipped.length)
    root.append(
      h(
        'div',
        { class: 'banner warn' },
        svg(icons.wifiOff),
        h(
          'span',
          null,
          `Hálózat nélkül kimaradt lépések: ${a.offlineSkipped.join(', ')}. Csatlakozz az internethez, és futtasd újra az elemzést.`,
        ),
      ),
    );

  // összesített ítélet
  root.append(
    h(
      'div',
      { class: `verdict ${a.score.overall}` },
      lampEl(a.score.overall),
      h(
        'div',
        null,
        OVERALL_TITLE[a.score.overall],
        h('small', { style: 'display:block;font:400 14px var(--font-body)' }, a.score.summary),
      ),
    ),
  );

  root.append(
    h(
      'div',
      { class: 'card' },
      h('h2', null, 'Szempontok'),
      h('p', { class: 'muted', style: 'font-size:13px' }, `Szabályrendszer: ${a.score.ruleSetName}`),
      a.score.criteria.map((c) =>
        h(
          'div',
          { class: 'rule-row' },
          lampEl(c.lamp),
          h(
            'div',
            { class: 'grow' },
            h('b', null, c.label),
            h('div', { class: 'val num' }, c.value),
            h('div', { class: 'why' }, c.reason),
          ),
        ),
      ),
    ),
  );

  const g = a.geometry;
  root.append(
    h(
      'div',
      { class: 'card' },
      h('h2', null, 'Telek (EOV)'),
      kv([
        ['Terület', fmtArea(g.areaM2)],
        ['Kerület', fmtLen(g.perimeterM)],
        ['Töréspontok', String(g.vertexCount)],
        ['Leghosszabb átló', fmtLen(g.longestDiagonalM)],
        ['Középpont (EOV)', fmtEov(g.centroidEov)],
        ['Középpont (WGS84)', fmtWgs(g.centroidWgs)],
      ]),
    ),
  );

  const t = a.terrain;
  const terrainCard = h('div', { class: 'card' }, h('h2', null, 'Domborzat'));
  const tn = outcomeNote(t);
  if (tn) terrainCard.append(tn);
  if (t.status === 'ok') {
    const d = t.data;
    terrainCard.append(
      kv([
        ['Magasság (min–max)', `${fmtNum(d.minElevM, 1)} – ${fmtNum(d.maxElevM, 1)} m`],
        ['Átlagos magasság', `${fmtNum(d.meanElevM, 1)} m`],
        ['Szintkülönbség', `${fmtNum(d.reliefM, 1)} m`],
        ['Átlagos lejtés', `${fmtPct(d.meanSlopePct)} (${fmtNum(d.meanSlopeDeg, 1)}°)`],
        ['Legnagyobb lejtés', `${fmtNum(d.maxSlopeDeg, 1)}°`],
        ['Domináns kitettség', ASPECT_NAMES[d.dominantAspect] ?? d.dominantAspect],
        ['Mintapontok', `${fmtNum(d.sampleCount)} (${fmtNum(d.cellSizeM, 1)} m rács)`],
      ]),
      aspectBars(d.aspectShares),
    );
    for (const p of d.profiles) {
      terrainCard.append(
        h('h3', { style: 'margin-top:12px' }, `Terepmetszet – ${p.label} (${fmtLen(p.lengthM)})`),
        profileChart(p),
      );
    }
  }
  root.append(terrainCard);

  const overlayCard = h('div', { class: 'card' }, h('h2', null, 'Védett és veszélyeztetett területek'));
  for (const [label, o] of [
    ['Natura 2000', a.natura],
    ['Árvíz (100 éves)', a.flood],
  ] as const) {
    const n = outcomeNote(o);
    if (n) {
      overlayCard.append(h('h3', null, label), n);
      continue;
    }
    if (o.status === 'ok')
      overlayCard.append(
        h('h3', null, label),
        kv([
          ['Átfedés', `${fmtPct(o.data.overlapPct)} (${fmtArea(o.data.overlapAreaM2)})`],
          ['Legközelebbi távolság', o.data.overlapPct > 0 ? 'érinti' : fmtDist(o.data.nearestDistanceM)],
          ...(o.data.names.length ? ([['Érintett', o.data.names.join(', ')]] as [string, string][]) : []),
          ...(o.data.detail ? ([['Megjegyzés', o.data.detail]] as [string, string][]) : []),
        ]),
      );
  }
  root.append(overlayCard);

  const proxCard = h('div', { class: 'card' }, h('h2', null, 'Közelség'));
  const pn = outcomeNote(a.proximity);
  if (pn) proxCard.append(pn);
  if (a.proximity.status === 'ok') {
    const p = a.proximity.data;
    const r = p.searchRadiusM;
    proxCard.append(
      kv([
        ['Út', `${fmtDist(p.road.distanceM, r)}${p.road.name ? ` (${p.road.name})` : ''}`],
        ['Légvezeték', p.powerLine.crosses ? '⚠ keresztezi a telket' : fmtDist(p.powerLine.distanceM, r)],
        [
          'Vízfolyás',
          `${p.waterway.crosses ? '⚠ keresztezi a telket' : fmtDist(p.waterway.distanceM, r)}${p.waterway.name ? ` (${p.waterway.name})` : ''}`,
        ],
        [
          'Legközelebbi épület',
          `${fmtDist(p.building.distanceM, r)}${p.building.countInside ? ` – ${p.building.countInside} épület a telken` : ''}`,
        ],
      ]),
      h('p', { class: 'muted', style: 'font-size:13px;margin-top:8px' }, `Keresési sugár: ${fmtLen(r)}.`),
    );
  }
  root.append(proxCard);

  const pvCard = h('div', { class: 'card' }, h('h2', null, 'Napelem-hozam'));
  const pvn = outcomeNote(a.pv);
  if (pvn) pvCard.append(pvn);
  if (a.pv.status === 'ok') {
    const pv = a.pv.data;
    pvCard.append(
      kv([
        [
          'Terep síkjában',
          `${fmtNum(pv.terrain.yearlyKwhPerKwp)} kWh/kWp/év (${fmtNum(pv.terrain.angleDeg, 1)}°, azimut ${fmtNum(pv.terrain.aspectDeg)}°)`,
        ],
        ...(pv.optimal
          ? ([
              [
                'Optimális dőléssel',
                `${fmtNum(pv.optimal.yearlyKwhPerKwp)} kWh/kWp/év (${fmtNum(pv.optimal.angleDeg)}°, azimut ${fmtNum(pv.optimal.aspectDeg)}°)`,
              ],
            ] as [string, string][])
          : []),
        ['Rendszerveszteség', `${fmtNum(pv.lossPct)} %`],
        ['Sugárzási adatbázis', pv.database],
      ]),
      h(
        'p',
        { class: 'muted', style: 'font-size:13px;margin-top:8px' },
        'Azimut: 0° = dél, −90° = kelet, 90° = nyugat (PVGIS-konvenció).',
      ),
    );
  }
  root.append(pvCard);

  root.append(
    h(
      'div',
      { class: 'card' },
      h('h2', null, 'Elemzési lépések'),
      renderSteps(a.steps),
      h('p', { class: 'muted', style: 'font-size:13px;margin-top:8px' }, `Készült: ${fmtDate(a.createdAt)}`),
    ),
    h(
      'div',
      { class: 'card' },
      h('h2', null, 'Adatforrások'),
      h(
        'ul',
        { style: 'margin:0;padding-left:18px;font-size:13px' },
        a.attributions.map((x) => h('li', null, x)),
      ),
    ),
  );
  return root;
}

function aspectBars(shares: Record<string, number>): HTMLElement {
  const order = ['É', 'ÉK', 'K', 'DK', 'D', 'DNy', 'Ny', 'ÉNy', 'sík'];
  const max = Math.max(...order.map((k) => shares[k] ?? 0), 0.01);
  return h(
    'div',
    {
      style:
        'display:grid;grid-template-columns:repeat(9,1fr);gap:4px;align-items:end;height:70px;margin-top:10px',
      'aria-label': 'Kitettség-eloszlás',
    },
    order.map((k) =>
      h(
        'div',
        {
          style:
            'display:flex;flex-direction:column;align-items:center;gap:2px;height:100%;justify-content:flex-end',
        },
        h('div', {
          style: `width:100%;background:${k === 'sík' ? 'var(--c-na)' : 'var(--c-accent)'};border-radius:3px 3px 0 0;height:${Math.max(2, ((shares[k] ?? 0) / max) * 46)}px`,
          title: `${k}: ${fmtPct((shares[k] ?? 0) * 100, 0)}`,
        }),
        h('small', { style: 'font-size:10px' }, k),
      ),
    ),
  );
}
