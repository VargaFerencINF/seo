/**
 * Demó világ: procedurális domborzat és szimulált rétegek EOV-ban.
 * Minden determinisztikus (nincs véletlen), így a demó és a tesztek reprodukálhatók.
 * A nevek kitaláltak – a demó nem valós helyszínt ábrázol.
 */
import type { Eov } from '../types';

export const DEMO_BBOX: [number, number, number, number] = [696500, 252000, 703500, 257800];
export const DEMO_CENTER: Eov = [700000, 255000];

// ---------------------------------------------------------------- folyó

const RIVER_X0 = 697400;
const RIVER_X1 = 702600;

/** A Próba-patak középvonalának y koordinátája x függvényében */
export function riverY(x: number): number {
  const t = x - RIVER_X0;
  return 254300 + 170 * Math.sin(t / 720) + 55 * Math.sin(t / 240 + 0.7);
}

/** Vízszint a patakban (kelet felé esik) */
export function riverLevel(x: number): number {
  return 128 - 0.0024 * (x - RIVER_X0);
}

export function riverLine(step = 50): Eov[] {
  const out: Eov[] = [];
  for (let x = RIVER_X0; x <= RIVER_X1; x += step) out.push([x, riverY(x)]);
  return out;
}

// ---------------------------------------------------------------- domborzat

const softplus = (v: number, k = 40) => k * Math.log1p(Math.exp(v / k));
const gauss = (x: number, y: number, cx: number, cy: number, s: number) =>
  Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s * s));
const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Terepmagasság (m, Balti) az EOV (x, y) pontban */
export function demoElevation(x: number, y: number): number {
  const d = y - riverY(x); // + = a pataktól északra
  const floor = riverLevel(x) + 1.2;
  // völgyprofil: kb. ±150 m-es sík ártér, onnan emelkedő oldalak
  const north = 0.045 * softplus(d - 160);
  const south = 0.034 * softplus(-d - 150);
  // dombok az északi oldalon, egy gerinc délen
  const hills =
    smoothstep(150, 700, d) *
    (62 * gauss(x, y, 701200, 256400, 650) +
      40 * gauss(x, y, 698700, 256200, 520) +
      18 * gauss(x, y, 699900, 256700, 380));
  const ridge = smoothstep(150, 600, -d) * 14 * gauss(x, y, 700600, 253350, 900);
  // finom felszíni hullámzás
  const micro =
    0.8 * Math.sin(x / 97 + y / 151) +
    0.5 * Math.sin(x / 61 - y / 83 + 1.3) +
    0.25 * Math.cos(x / 37 + y / 41);
  return floor + north + south + hills + ridge + micro * smoothstep(60, 220, Math.abs(d));
}

// ---------------------------------------------------------------- vektoros rétegek

/** Ártér (100 éves árvíz, szimulált): a patak körüli sáv, ahol a terep a vízszint +2,5 m alatt van */
export function floodZone(): Eov[] {
  const north: Eov[] = [];
  const south: Eov[] = [];
  for (let x = RIVER_X0; x <= RIVER_X1; x += 50) {
    const yr = riverY(x);
    const lvl = riverLevel(x) + 3.2;
    let dn = 10;
    while (dn < 600 && demoElevation(x, yr + dn) < lvl) dn += 10;
    let ds = 10;
    while (ds < 600 && demoElevation(x, yr - ds) < lvl) ds += 10;
    north.push([x, yr + dn]);
    south.push([x, yr - ds]);
  }
  return [...north, ...south.reverse()];
}

/** Natura 2000 terület (szimulált): a nyugati ártéri erdő és a patak menti sáv */
export const NATURA_ZONE: Eov[] = [
  [697500, 253900],
  [698400, 253820],
  [699150, 253950],
  [699650, 254150],
  [699800, 254500],
  [699500, 254780],
  [698900, 254900],
  [698300, 255050],
  [697700, 255000],
  [697500, 254700],
];

export const ROADS: { name: string; kind: 'main' | 'local'; line: Eov[] }[] = [
  {
    name: '4-es demóút',
    kind: 'main',
    line: [
      [697500, 253350],
      [698400, 253600],
      [699300, 253900],
      [700050, 254250],
      [700250, 254650],
      [700500, 255050],
      [701150, 255300],
      [701900, 255700],
      [702500, 256050],
    ],
  },
  {
    name: 'Fő utca',
    kind: 'local',
    line: [
      [700500, 255050],
      [700300, 255300],
      [700050, 255450],
      [699700, 255520],
    ],
  },
  {
    name: 'Szőlőhegyi út',
    kind: 'local',
    line: [
      [700300, 255300],
      [700550, 255650],
      [700900, 255900],
      [701350, 256150],
    ],
  },
  {
    name: 'Kert utca',
    kind: 'local',
    line: [
      [700420, 255190],
      [700100, 255140],
      [699800, 255130],
      [699550, 255170],
    ],
  },
  {
    name: 'Dűlőút',
    kind: 'local',
    line: [
      [700050, 254250],
      [700420, 254020],
      [700800, 253880],
      [701250, 253760],
    ],
  },
  {
    name: 'Rét utca',
    kind: 'local',
    line: [
      [700250, 254650],
      [699800, 254850],
      [699400, 255000],
    ],
  },
];

/** 22 kV-os légvezeték (szimulált) */
export const POWER_LINE: Eov[] = [
  [697500, 256650],
  [698600, 256000],
  [699550, 255250],
  [700300, 254300],
  [700850, 253700],
  [701700, 253150],
  [702050, 253000],
];

export const VILLAGE_CENTER: Eov = [700150, 255300];

/** Beépítetlenül hagyott területek (a mintatelkek helye) – [minX, minY, maxX, maxY] */
export const RESERVED_AREAS: [number, number, number, number][] = [[699860, 255150, 699960, 255230]];

/** Determinisztikus „véletlen” */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Demófalva épületei: téglalapok az utcák mentén */
export function villageBuildings(): Eov[][] {
  const out: Eov[][] = [];
  let k = 0;
  for (const road of ROADS.filter((r) => r.kind === 'local' || r.name === '4-es demóút')) {
    for (let i = 1; i < road.line.length; i++) {
      const a = road.line[i - 1]!;
      const b = road.line[i]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ux = (b[0] - a[0]) / len;
      const uy = (b[1] - a[1]) / len;
      for (let t = 25; t < len - 15; t += 34) {
        for (const side of [-1, 1]) {
          k++;
          const px = a[0] + ux * t;
          const py = a[1] + uy * t;
          // csak a falu közelében építkezünk
          if (Math.hypot(px - VILLAGE_CENTER[0], py - VILLAGE_CENTER[1]) > 650) continue;
          if (hash(k) < 0.22) continue;
          const off = 18 + hash(k + 7) * 8;
          const cx = px - uy * off * side;
          const cy = py + ux * off * side;
          if (
            RESERVED_AREAS.some((b) => cx > b[0] - 15 && cx < b[2] + 15 && cy > b[1] - 15 && cy < b[3] + 15)
          )
            continue;
          const w = 9 + hash(k + 3) * 5;
          const hgt = 11 + hash(k + 5) * 6;
          const corners: Eov[] = [
            [-w / 2, -hgt / 2],
            [w / 2, -hgt / 2],
            [w / 2, hgt / 2],
            [-w / 2, hgt / 2],
          ].map(([dx, dy]) => [cx + dx! * ux - dy! * uy, cy + dx! * uy + dy! * ux] as Eov);
          out.push([...corners, corners[0]!]);
        }
      }
    }
  }
  return out;
}

export const PLACE_LABELS: { text: string; at: Eov; kind: 'place' | 'water' | 'area' }[] = [
  { text: 'Demófalva', at: [700050, 255200], kind: 'place' },
  { text: 'Próba-patak', at: [701500, 254180], kind: 'water' },
  { text: 'Natura 2000 (szimulált)', at: [698500, 254450], kind: 'area' },
  { text: 'Kilátó-domb', at: [701200, 256420], kind: 'area' },
];

/**
 * Szimulált PV-hozam (kWh/kWp/év) dőlés és PVGIS-azimut (0 = dél) alapján.
 * Kalibráció a PVGIS 5.3 (SARAH3, 14 % veszteség) Gödöllő környéki próbahívásaihoz:
 * vízszintes ≈ 1040, déli 5° ≈ 1075, optimális (~37°, dél) ≈ 1230 kWh/kWp.
 */
export function simulatedPvYield(angleDeg: number, aspectPvgis: number): number {
  const base = 1040;
  const a = (aspectPvgis * Math.PI) / 180;
  const gain = 0.009893 * angleDeg * Math.cos(a) - 0.0001337 * angleDeg * angleDeg;
  return base * (1 + gain);
}

/** Havi eloszlás (Közép-Európa, tipikus) */
export const PV_MONTHLY_SHARE = [
  0.035, 0.05, 0.083, 0.105, 0.122, 0.124, 0.13, 0.116, 0.09, 0.07, 0.042, 0.033,
];
