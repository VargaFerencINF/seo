/**
 * PDF riport (jsPDF). Fejléc (cégnév/logó), térképkép, mutatótáblázat, lámpák indoklással,
 * metszetdiagram, fotók, adatforrások és jogi nyilatkozat. A Barlow TTF beágyazva (ő, ű).
 */
import { jsPDF, GState } from 'jspdf';
import barlowRegular from './fonts/Barlow_400Regular.ttf?url';
import barlowSemi from './fonts/Barlow_600SemiBold.ttf?url';
import barlowBold from './fonts/Barlow_700Bold.ttf?url';
import condSemi from './fonts/BarlowSemiCondensed_600SemiBold.ttf?url';
import type { AnalysisResult, Lamp, Parcel, TerrainProfile } from '../types';
import { APP_NAME, APP_VERSION, LEGAL_NOTICE } from '../config';
import { OVERALL_TITLE } from '../analysis/scoring';
import {
  ASPECT_NAMES,
  fmtArea,
  fmtDate,
  fmtDist,
  fmtEov,
  fmtLen,
  fmtNum,
  fmtPct,
  fmtWgs,
} from '../util/format';
import { niceStep } from '../ui/components/profileChart';
import { toEov } from '../analysis/eov';

export interface ReportOptions {
  parcel: Parcel;
  analysis: AnalysisResult;
  mapImage: string | null;
  /** a térképkép szélessége a terepen (m) – méretléchez */
  mapWidthM?: number;
  companyName: string;
  companyLogo: string;
  demo: boolean;
}

const PAGE_W = 210;
const PAGE_H = 297;
const M = 14;
const CW = PAGE_W - 2 * M;

const C = {
  ink: [31, 58, 43] as const,
  ink2: [77, 102, 86] as const,
  line: [195, 207, 189] as const,
  sage: [231, 236, 227] as const,
  accent: [232, 183, 16] as const,
  demo: [142, 68, 173] as const,
};
const LAMP_RGB: Record<Lamp, [number, number, number]> = {
  green: [46, 139, 87],
  yellow: [217, 154, 0],
  red: [192, 57, 43],
  na: [138, 151, 141],
};

let fontCache: Record<string, string> | null = null;

/** Teszteléshez: a betűfájlok base64 tartalmának közvetlen megadása */
export function setFontData(data: Record<string, string>): void {
  fontCache = data;
}

async function toBase64(url: string): Promise<string> {
  const buf = await (await fetch(url)).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function loadFonts(doc: jsPDF): Promise<void> {
  fontCache ??= {
    'Barlow-Regular.ttf': await toBase64(barlowRegular),
    'Barlow-SemiBold.ttf': await toBase64(barlowSemi),
    'Barlow-Bold.ttf': await toBase64(barlowBold),
    'BarlowSC-SemiBold.ttf': await toBase64(condSemi),
  };
  for (const [name, data] of Object.entries(fontCache)) doc.addFileToVFS(name, data);
  doc.addFont('Barlow-Regular.ttf', 'Barlow', 'normal');
  doc.addFont('Barlow-SemiBold.ttf', 'Barlow', 'semibold');
  doc.addFont('Barlow-Bold.ttf', 'Barlow', 'bold');
  doc.addFont('BarlowSC-SemiBold.ttf', 'BarlowSC', 'normal');
}

class Writer {
  y = M;
  constructor(
    public doc: jsPDF,
    private opts: ReportOptions,
  ) {}

  font(kind: 'body' | 'semi' | 'bold' | 'head', size: number, color: readonly number[] = C.ink): void {
    if (kind === 'head') this.doc.setFont('BarlowSC', 'normal');
    else this.doc.setFont('Barlow', kind === 'body' ? 'normal' : kind === 'semi' ? 'semibold' : 'bold');
    this.doc.setFontSize(size);
    this.doc.setTextColor(color[0]!, color[1]!, color[2]!);
  }

  ensure(h: number): void {
    if (this.y + h > PAGE_H - 18) this.newPage();
  }

  newPage(): void {
    this.doc.addPage();
    this.y = M;
    this.pageHeader();
  }

  pageHeader(): void {
    const d = this.doc;
    d.setFillColor(...C.sage);
    d.rect(0, 0, PAGE_W, 10, 'F');
    this.font('semi', 8, C.ink2);
    d.text(
      `${this.opts.companyName ? `${this.opts.companyName} · ` : ''}${APP_NAME} előszűrési riport · ${this.opts.parcel.name}`,
      M,
      6.5,
    );
    if (this.opts.demo) {
      this.font('bold', 8, C.demo);
      d.text('DEMÓ – SZIMULÁLT ADATOK', PAGE_W - M, 6.5, { align: 'right' });
    }
    this.y = 16;
  }

  h1(text: string): void {
    this.ensure(12);
    this.font('head', 18);
    this.doc.text(text, M, this.y + 6);
    this.y += 10;
  }

  h2(text: string): void {
    this.ensure(14);
    this.y += 2;
    this.font('head', 13);
    this.doc.text(text, M, this.y + 5);
    this.doc.setDrawColor(...C.accent);
    this.doc.setLineWidth(0.8);
    this.doc.line(M, this.y + 7, M + 18, this.y + 7);
    this.y += 11;
  }

  para(text: string, size = 9.5, color: readonly number[] = C.ink): void {
    this.font('body', size, color);
    const lines = this.doc.splitTextToSize(text, CW) as string[];
    const lh = size * 0.42;
    for (const l of lines) {
      this.ensure(lh + 1);
      this.doc.text(l, M, this.y + lh);
      this.y += lh;
    }
    this.y += 2;
  }

  /** kétoszlopos kulcs–érték táblázat */
  kv(rows: [string, string][], keyW = 58): void {
    const d = this.doc;
    for (const [k, v] of rows) {
      this.font('body', 9.5);
      const lines = d.splitTextToSize(v, CW - keyW - 4) as string[];
      const rh = Math.max(6, lines.length * 4.2 + 2);
      this.ensure(rh);
      d.setDrawColor(...C.line);
      d.setLineWidth(0.2);
      d.line(M, this.y + rh, M + CW, this.y + rh);
      this.font('body', 9.5, C.ink2);
      d.text(k, M, this.y + 4.3);
      this.font('semi', 9.5);
      d.text(lines, M + keyW, this.y + 4.3);
      this.y += rh;
    }
    this.y += 3;
  }

  lamp(l: Lamp, x: number, y: number, r = 2.2): void {
    this.doc.setFillColor(...LAMP_RGB[l]);
    this.doc.circle(x, y, r, 'F');
  }
}

export async function buildReport(opts: ReportOptions): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  await loadFonts(doc);
  const w = new Writer(doc, opts);
  const a = opts.analysis;
  doc.setProperties({
    title: `${APP_NAME} – ${opts.parcel.name}`,
    subject: 'Telek-előszűrési riport',
    creator: `${APP_NAME} ${APP_VERSION}`,
  });

  // ---------------- 1. oldal: fejléc
  doc.setFillColor(...C.ink);
  doc.rect(0, 0, PAGE_W, 26, 'F');
  let tx = M;
  if (opts.companyLogo) {
    try {
      const fmt = opts.companyLogo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      const props = doc.getImageProperties(opts.companyLogo);
      const lh = 16;
      const lw = Math.min(40, (props.width / props.height) * lh);
      doc.addImage(opts.companyLogo, fmt, M, 5, lw, lh);
      tx = M + lw + 5;
    } catch {
      /* hibás logó: kihagyjuk */
    }
  }
  w.font('head', 17, [246, 248, 243]);
  doc.text(opts.companyName || APP_NAME, tx, 13);
  w.font('body', 9.5, [214, 225, 206]);
  doc.text('Telek-előszűrési riport', tx, 19.5);
  doc.text(fmtDate(a.createdAt), PAGE_W - M, 13, { align: 'right' });
  if (opts.demo) {
    w.font('bold', 9.5, [232, 183, 16]);
    doc.text('DEMÓ MÓD – SZIMULÁLT ADATOK', PAGE_W - M, 19.5, { align: 'right' });
  }
  w.y = 32;
  w.h1(opts.parcel.name);
  if (opts.parcel.note) w.para(opts.parcel.note, 9.5, C.ink2);
  if (opts.parcel.tags.length) w.para(`Címkék: ${opts.parcel.tags.join(', ')}`, 8.5, C.ink2);

  // térképkép
  if (opts.mapImage) {
    try {
      const props = doc.getImageProperties(opts.mapImage);
      const ih = Math.min(105, (props.height / props.width) * CW);
      const iw = (props.width / props.height) * ih;
      w.ensure(ih + 4);
      doc.addImage(opts.mapImage, 'PNG', M + (CW - iw) / 2, w.y, iw, ih);
      doc.setDrawColor(...C.line);
      doc.rect(M + (CW - iw) / 2, w.y, iw, ih);
      if (opts.mapWidthM) drawScaleBar(w, M + (CW - iw) / 2 + 4, w.y + ih - 5, iw, opts.mapWidthM);
      drawNorthArrow(w, M + (CW + iw) / 2 - 8, w.y + 4);
      w.y += ih + 2;
      w.font('body', 7, C.ink2);
      doc.text(
        a.attributions.length
          ? `Térkép: ${opts.demo ? 'demó alaptérkép' : 'OpenFreeMap / OpenStreetMap'}`
          : '',
        M,
        w.y + 3,
      );
      w.y += 6;
    } catch {
      w.para('A térképkép nem illeszthető be.', 8.5, C.ink2);
    }
  }

  // összesített ítélet
  w.ensure(22);
  const vc = LAMP_RGB[a.score.overall];
  doc.setFillColor(vc[0], vc[1], vc[2]);
  doc.setGState(new GState({ opacity: 0.14 }));
  doc.roundedRect(M, w.y, CW, 18, 2, 2, 'F');
  doc.setGState(new GState({ opacity: 1 }));
  w.lamp(a.score.overall, M + 7, w.y + 9, 3.5);
  w.font('head', 13);
  doc.text(OVERALL_TITLE[a.score.overall], M + 14, w.y + 7.5);
  w.font('body', 9);
  doc.text(doc.splitTextToSize(a.score.summary, CW - 18) as string[], M + 14, w.y + 12.5);
  w.y += 22;

  // fő mutatók
  w.h2('Fő mutatók');
  const g = a.geometry;
  const rows: [string, string][] = [
    ['Terület', fmtArea(g.areaM2)],
    ['Kerület', fmtLen(g.perimeterM)],
    ['Középpont (EOV)', fmtEov(g.centroidEov)],
    ['Középpont (WGS84)', fmtWgs(g.centroidWgs)],
  ];
  if (a.terrain.status === 'ok') {
    const t = a.terrain.data;
    rows.push(
      [
        'Magasság (min / átl. / max)',
        `${fmtNum(t.minElevM, 1)} / ${fmtNum(t.meanElevM, 1)} / ${fmtNum(t.maxElevM, 1)} m`,
      ],
      [
        'Átlagos / legnagyobb lejtés',
        `${fmtPct(t.meanSlopePct)} (${fmtNum(t.meanSlopeDeg, 1)}°) / ${fmtNum(t.maxSlopeDeg, 1)}°`,
      ],
      ['Domináns kitettség', ASPECT_NAMES[t.dominantAspect] ?? t.dominantAspect],
    );
  } else rows.push(['Domborzat', 'Nem elérhető adat']);
  rows.push(
    [
      'Natura 2000 átfedés',
      a.natura.status === 'ok' ? fmtPct(a.natura.data.overlapPct) : 'Nem elérhető adat',
    ],
    [
      'Árvízi átfedés (100 éves)',
      a.flood.status === 'ok' ? fmtPct(a.flood.data.overlapPct) : 'Nem elérhető adat',
    ],
  );
  if (a.proximity.status === 'ok') {
    const p = a.proximity.data;
    rows.push(
      ['Legközelebbi út', fmtDist(p.road.distanceM, p.searchRadiusM)],
      [
        'Légvezeték',
        p.powerLine.crosses ? 'KERESZTEZI A TELKET' : fmtDist(p.powerLine.distanceM, p.searchRadiusM),
      ],
      [
        'Vízfolyás',
        p.waterway.crosses ? 'KERESZTEZI A TELKET' : fmtDist(p.waterway.distanceM, p.searchRadiusM),
      ],
      ['Legközelebbi épület', fmtDist(p.building.distanceM, p.searchRadiusM)],
    );
  } else rows.push(['Közelség', 'Nem elérhető adat']);
  rows.push([
    'Napelem-hozam (terep síkjában)',
    a.pv.status === 'ok' ? `${fmtNum(a.pv.data.terrain.yearlyKwhPerKwp)} kWh/kWp/év` : 'Nem elérhető adat',
  ]);
  w.kv(rows);

  // ---------------- szempontok
  w.h2(`Értékelés szempontonként (${a.score.ruleSetName})`);
  for (const c of a.score.criteria) {
    w.font('body', 8.5);
    const reason = doc.splitTextToSize(c.reason, CW - 10) as string[];
    const rh = 6 + reason.length * 3.7 + 2;
    w.ensure(rh);
    w.lamp(c.lamp, M + 2.5, w.y + 3.2);
    w.font('semi', 10);
    doc.text(c.label, M + 7, w.y + 4.3);
    w.font('semi', 9.5, C.ink2);
    doc.text(c.value, M + CW, w.y + 4.3, { align: 'right' });
    w.font('body', 8.5, C.ink2);
    doc.text(reason, M + 7, w.y + 8.6);
    w.y += rh;
    doc.setDrawColor(...C.line);
    doc.setLineWidth(0.2);
    doc.line(M, w.y - 1, M + CW, w.y - 1);
  }
  w.y += 3;

  // ---------------- domborzat, metszet
  if (a.terrain.status === 'ok') {
    w.h2('Terepmetszet');
    for (const p of a.terrain.data.profiles) drawProfile(w, p);
  }

  // ---------------- részletek
  w.h2('Részletek');
  if (a.natura.status === 'ok' && a.natura.data.names.length)
    w.kv([['Érintett Natura 2000 terület', a.natura.data.names.join(', ')]]);
  if (a.flood.status === 'ok' && a.flood.data.detail) w.kv([['Árvíz – megjegyzés', a.flood.data.detail]]);
  if (a.pv.status === 'ok') {
    const pv = a.pv.data;
    w.kv([
      [
        'PV – terep síkjában',
        `${fmtNum(pv.terrain.yearlyKwhPerKwp)} kWh/kWp/év · dőlés ${fmtNum(pv.terrain.angleDeg, 1)}° · azimut ${fmtNum(pv.terrain.aspectDeg)}° (0° = dél)`,
      ],
      ...(pv.optimal
        ? ([
            [
              'PV – optimális dőléssel',
              `${fmtNum(pv.optimal.yearlyKwhPerKwp)} kWh/kWp/év · dőlés ${fmtNum(pv.optimal.angleDeg)}° · azimut ${fmtNum(pv.optimal.aspectDeg)}°`,
            ],
          ] as [string, string][])
        : []),
      ['PV – veszteség, adatbázis', `${fmtNum(pv.lossPct)} % · ${pv.database}`],
    ]);
  }
  const missing = a.steps.filter((s) => s.status !== 'ok');
  if (missing.length) {
    w.kv(missing.map((s) => [s.label, s.message ?? 'Nem elérhető adat'] as [string, string]));
  }

  // ---------------- töréspontok EOV-ban (földmérőknek)
  const ring = opts.parcel.geometry.coordinates[0] ?? [];
  const verts = ring.slice(
    0,
    ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1]
      ? -1
      : undefined,
  );
  if (verts.length && verts.length <= 60) {
    w.h2('Töréspontok (EOV, EPSG:23700)');
    const colW = CW / 2;
    const rowsPerCol = Math.ceil(verts.length / 2);
    w.ensure(Math.min(rowsPerCol, 30) * 4.6 + 6);
    w.font('semi', 8, C.ink2);
    for (const c of [0, 1]) {
      if (c === 1 && verts.length < 2) break;
      doc.text('Pont', M + c * colW, w.y + 3);
      doc.text('Y (kelet) [m]', M + c * colW + 12, w.y + 3);
      doc.text('X (észak) [m]', M + c * colW + 44, w.y + 3);
    }
    w.y += 5;
    const startY = w.y;
    verts.forEach((v, i) => {
      const [y, x] = toEov([v[0]!, v[1]!]);
      const c = i < rowsPerCol ? 0 : 1;
      const r = c === 0 ? i : i - rowsPerCol;
      const yy = startY + r * 4.4;
      w.font('body', 8.5);
      doc.text(String(i + 1), M + c * colW, yy + 3);
      doc.text(fmtNum(y, 2), M + c * colW + 12, yy + 3);
      doc.text(fmtNum(x, 2), M + c * colW + 44, yy + 3);
    });
    w.y = startY + rowsPerCol * 4.4 + 4;
  }

  // ---------------- fotók
  if (opts.parcel.photos.length) {
    w.h2('Terepi fotók');
    const colW = (CW - 6) / 3;
    let col = 0;
    for (const [idx, ph] of opts.parcel.photos.entries()) {
      if (col === 0) w.ensure(colW * 0.75 + 12);
      const x = M + col * (colW + 3);
      try {
        doc.addImage(ph.thumb, 'JPEG', x, w.y, colW, colW * 0.75);
      } catch {
        doc.rect(x, w.y, colW, colW * 0.75);
      }
      w.font('body', 7, C.ink2);
      doc.text(
        doc.splitTextToSize(
          `${idx + 1}. ${fmtDate(ph.createdAt)} · ${ph.lat.toFixed(5)}, ${ph.lon.toFixed(5)}${ph.headingDeg !== null ? ` · irány ${Math.round(ph.headingDeg)}°` : ''}${ph.note ? ` · ${ph.note}` : ''}`,
          colW,
        ) as string[],
        x,
        w.y + colW * 0.75 + 3,
      );
      col++;
      if (col === 3) {
        col = 0;
        w.y += colW * 0.75 + 11;
      }
    }
    if (col) w.y += colW * 0.75 + 11;
  }

  // ---------------- források, jogi nyilatkozat
  w.h2('Adatforrások');
  for (const s of a.attributions) w.para(`• ${s}`, 8, C.ink2);
  w.h2('Jogi nyilatkozat');
  w.para(LEGAL_NOTICE, 8.5);
  if (opts.demo)
    w.para(
      'A riport DEMÓ MÓDBAN készült: minden adat szimulált, valós döntéshez nem használható.',
      8.5,
      C.demo,
    );

  // lábléc minden oldalon
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    w.font('body', 7.5, C.ink2);
    doc.text(
      `${APP_NAME} ${APP_VERSION} · előszűrés, nem helyettesíti a tulajdoni lapot és a helyi építési szabályzatot`,
      M,
      PAGE_H - 8,
    );
    doc.text(`${i} / ${pages}`, PAGE_W - M, PAGE_H - 8, { align: 'right' });
    if (opts.demo) {
      doc.saveGraphicsState();
      doc.setGState(new GState({ opacity: 0.07 }));
      w.font('bold', 70, C.demo);
      doc.text('DEMÓ', PAGE_W / 2, PAGE_H / 2, { align: 'center', angle: 35 });
      doc.restoreGraphicsState();
    }
  }
  return doc;
}

/** Méretléc a térképkép bal alsó sarkában */
function drawScaleBar(w: Writer, x: number, y: number, imgWmm: number, imgWm: number): void {
  const d = w.doc;
  const mPerMm = imgWm / imgWmm;
  const target = imgWmm * 0.25 * mPerMm;
  const step = niceStep(target, 1);
  const lenMm = step / mPerMm;
  d.setFillColor(255, 255, 255);
  d.setGState(new GState({ opacity: 0.8 }));
  d.rect(x - 1.5, y - 4.5, lenMm + 3 + 14, 7, 'F');
  d.setGState(new GState({ opacity: 1 }));
  d.setDrawColor(...C.ink);
  d.setLineWidth(0.5);
  d.line(x, y, x + lenMm, y);
  d.line(x, y - 1.5, x, y + 0.2);
  d.line(x + lenMm, y - 1.5, x + lenMm, y + 0.2);
  w.font('semi', 7.5);
  d.text(step >= 1000 ? `${fmtNum(step / 1000)} km` : `${fmtNum(step)} m`, x + lenMm + 1.5, y + 1);
}

function drawNorthArrow(w: Writer, x: number, y: number): void {
  const d = w.doc;
  d.setFillColor(...C.ink);
  d.triangle(x, y, x - 2.2, y + 6, x + 2.2, y + 6, 'F');
  w.font('bold', 7);
  d.text('É', x, y + 9.5, { align: 'center' });
}

function drawProfile(w: Writer, p: TerrainProfile): void {
  const d = w.doc;
  const pts = p.points.filter((x) => x.z !== null) as { d: number; z: number }[];
  if (pts.length < 2) return;
  const H = 52;
  w.ensure(H + 12);
  w.font('semi', 9.5);
  d.text(`${p.label} – ${fmtLen(p.lengthM)}`, M, w.y + 3);
  w.y += 5;
  const x0 = M + 14;
  const y0 = w.y;
  const pw = CW - 16;
  const ph = H - 10;
  let zmin = Math.min(...pts.map((x) => x.z));
  let zmax = Math.max(...pts.map((x) => x.z));
  if (zmax - zmin < 4) {
    const c = (zmax + zmin) / 2;
    zmin = c - 2;
    zmax = c + 2;
  }
  const pad = (zmax - zmin) * 0.1;
  zmin -= pad;
  zmax += pad;
  const dmax = p.lengthM || pts[pts.length - 1]!.d;
  const sx = (v: number) => x0 + (v / dmax) * pw;
  const sy = (z: number) => y0 + (1 - (z - zmin) / (zmax - zmin)) * ph;
  d.setDrawColor(...C.line);
  d.setLineWidth(0.15);
  w.font('body', 6.5, C.ink2);
  const zs = niceStep(zmax - zmin);
  for (let z = Math.ceil(zmin / zs) * zs; z <= zmax; z += zs) {
    d.line(x0, sy(z), x0 + pw, sy(z));
    d.text(`${fmtNum(z)} m`, x0 - 1.5, sy(z) + 1, { align: 'right' });
  }
  const ds = niceStep(dmax);
  for (let v = 0; v <= dmax + 1e-6; v += ds)
    d.text(`${fmtNum(v)} m`, sx(v), y0 + ph + 4, { align: 'center' });
  // kitöltés
  d.setFillColor(250, 238, 196);
  const poly: [number, number][] = pts.map((x) => [sx(x.d), sy(x.z)]);
  const lines = poly.slice(1).map((pt, i) => [pt[0] - poly[i]![0], pt[1] - poly[i]![1]]);
  lines.push([0, y0 + ph - poly[poly.length - 1]![1]], [poly[0]![0] - poly[poly.length - 1]![0], 0]);
  d.lines(lines, poly[0]![0], poly[0]![1], [1, 1], 'F', true);
  d.setDrawColor(...C.ink);
  d.setLineWidth(0.5);
  for (let i = 1; i < poly.length; i++) d.line(poly[i - 1]![0], poly[i - 1]![1], poly[i]![0], poly[i]![1]);
  w.y += H;
}

export function reportFileName(parcel: Parcel): string {
  const safe = parcel.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  return `teleklato_${safe || 'telek'}_${new Date().toISOString().slice(0, 10)}.pdf`;
}
