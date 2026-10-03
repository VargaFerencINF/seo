import { describe, expect, it } from 'vitest';
import {
  isSelfIntersecting,
  lineIntersectsPolygon,
  longestDiagonal,
  pointInPolygon,
  pointSegmentDistance,
  polygonArea,
  polygonLineDistance,
  polygonPerimeter,
  polygonPolygonDistance,
  ringCentroid,
  sampleLine,
  segmentsIntersect,
  type Ring,
} from '../src/analysis/planar';
import { computeGeometry, validatePolygon } from '../src/analysis/geometry';
import { toEov, toWgs } from '../src/analysis/eov';
import { computeOverlay } from '../src/analysis/overlay';
import { computeProximity } from '../src/analysis/proximity';
import type { Eov } from '../src/types';

// 100 m × 50 m téglalap EOV-ban, Budapest környékén
const O: Eov = [650000, 240000];
const rect: Ring = [
  [O[0], O[1]],
  [O[0] + 100, O[1]],
  [O[0] + 100, O[1] + 50],
  [O[0], O[1] + 50],
];

describe('terület és kerület EOV-ban', () => {
  it('téglalap: 5000 m², 300 m', () => {
    expect(polygonArea([rect])).toBeCloseTo(5000, 6);
    expect(polygonPerimeter([rect])).toBeCloseTo(300, 6);
  });
  it('a körüljárási irány és a zárópont nem számít', () => {
    const cw = [...rect].reverse();
    expect(polygonArea([[...cw, cw[0]!]])).toBeCloseTo(5000, 6);
  });
  it('lyukas poligon: a lyuk területe levonódik', () => {
    const hole: Ring = [
      [O[0] + 10, O[1] + 10],
      [O[0] + 20, O[1] + 10],
      [O[0] + 20, O[1] + 20],
      [O[0] + 10, O[1] + 20],
    ];
    expect(polygonArea([rect, hole])).toBeCloseTo(4900, 6);
  });
  it('háromszög területe', () => {
    expect(
      polygonArea([
        [
          [0, 0],
          [30, 0],
          [0, 40],
        ],
      ]),
    ).toBeCloseTo(600, 9);
  });
  it('súlypont a téglalap közepén', () => {
    const c = ringCentroid(rect);
    expect(c[0]).toBeCloseTo(O[0] + 50, 6);
    expect(c[1]).toBeCloseTo(O[1] + 25, 6);
  });
  it('WGS84-ben megadott telek területe EOV-ban számolva egyezik', () => {
    const wgs = rect.map((p) => toWgs(p));
    const g = computeGeometry({ type: 'Polygon', coordinates: [[...wgs, wgs[0]!]] });
    expect(g.areaM2).toBeCloseTo(5000, 1);
    expect(g.perimeterM).toBeCloseTo(300, 2);
    expect(g.longestDiagonalM).toBeCloseTo(Math.hypot(100, 50), 2);
    const back = toEov(g.centroidWgs);
    expect(back[0]).toBeCloseTo(O[0] + 50, 2);
  });
});

describe('pont–poligon', () => {
  it('belső, külső és határpont', () => {
    expect(pointInPolygon([O[0] + 50, O[1] + 25], [rect])).toBe(true);
    expect(pointInPolygon([O[0] + 150, O[1] + 25], [rect])).toBe(false);
    expect(pointInPolygon([O[0] + 100, O[1] + 25], [rect])).toBe(true);
  });
  it('konkáv (L alakú) poligon bemélyedése kívül van', () => {
    const L: Ring = [
      [0, 0],
      [20, 0],
      [20, 10],
      [10, 10],
      [10, 20],
      [0, 20],
    ];
    expect(pointInPolygon([15, 15], [L])).toBe(false);
    expect(pointInPolygon([5, 15], [L])).toBe(true);
  });
  it('lyukban lévő pont nincs a poligonban', () => {
    const hole: Ring = [
      [O[0] + 10, O[1] + 10],
      [O[0] + 20, O[1] + 10],
      [O[0] + 20, O[1] + 20],
      [O[0] + 10, O[1] + 20],
    ];
    expect(pointInPolygon([O[0] + 15, O[1] + 15], [rect, hole])).toBe(false);
  });
});

describe('poligon–vonal távolság és metszés', () => {
  it('pont–szakasz távolság', () => {
    expect(pointSegmentDistance([5, 5], [0, 0], [10, 0])).toBeCloseTo(5);
    expect(pointSegmentDistance([15, 0], [0, 0], [10, 0])).toBeCloseTo(5);
  });
  it('szakaszok metszése (keresztező, párhuzamos, érintő)', () => {
    expect(segmentsIntersect([0, 0], [10, 10], [0, 10], [10, 0])).toBe(true);
    expect(segmentsIntersect([0, 0], [10, 0], [0, 1], [10, 1])).toBe(false);
    expect(segmentsIntersect([0, 0], [10, 0], [10, 0], [10, 5])).toBe(true);
  });
  it('párhuzamos út 30 m-re a telektől', () => {
    const road: Eov[] = [
      [O[0] - 50, O[1] - 30],
      [O[0] + 150, O[1] - 30],
    ];
    expect(polygonLineDistance([rect], road)).toBeCloseTo(30, 6);
    expect(lineIntersectsPolygon(road, [rect])).toBe(false);
  });
  it('a telken átmenő légvezeték: távolság 0, keresztezés igaz', () => {
    const line: Eov[] = [
      [O[0] - 20, O[1] + 60],
      [O[0] + 120, O[1] - 10],
    ];
    expect(lineIntersectsPolygon(line, [rect])).toBe(true);
    expect(polygonLineDistance([rect], line)).toBe(0);
  });
  it('teljesen a telken belül futó vonal is metszőnek számít', () => {
    const inner: Eov[] = [
      [O[0] + 10, O[1] + 10],
      [O[0] + 20, O[1] + 20],
    ];
    expect(lineIntersectsPolygon(inner, [rect])).toBe(true);
  });
  it('poligon–poligon távolság átlósan', () => {
    const other: Ring = [
      [O[0] + 130, O[1] + 90],
      [O[0] + 140, O[1] + 90],
      [O[0] + 140, O[1] + 100],
    ];
    expect(polygonPolygonDistance([rect], [other])).toBeCloseTo(50, 6);
  });
});

describe('érvényesség, átló, mintavétel', () => {
  it('önmetsző „csokornyakkendő” felismerése', () => {
    expect(
      isSelfIntersecting([
        [0, 0],
        [10, 10],
        [10, 0],
        [0, 10],
      ]),
    ).toBe(true);
    expect(isSelfIntersecting(rect)).toBe(false);
  });
  it('validálás magyar hibaüzenettel', () => {
    const bow = [
      [0, 0],
      [10, 10],
      [10, 0],
      [0, 10],
    ].map((p) => toWgs([O[0] + p[0]!, O[1] + p[1]!]));
    const v = validatePolygon({ type: 'Polygon', coordinates: [[...bow, bow[0]!]] });
    expect(v.ok).toBe(false);
    expect(v.message).toMatch(/önmagát metszi/);
  });
  it('leghosszabb átló', () => {
    expect(longestDiagonal(rect)[2]).toBeCloseTo(Math.hypot(100, 50));
  });
  it('vonal mintavétele egyenletes, a végpont benne van', () => {
    const s = sampleLine(
      [
        [0, 0],
        [25, 0],
      ],
      10,
    );
    expect(s.map((x) => x.d)).toEqual([0, 10, 20, 25]);
  });
});

describe('átfedés és közelség', () => {
  it('a telek fele esik a zónába → 50 %', () => {
    const zone: Ring = [
      [O[0] + 50, O[1] - 10],
      [O[0] + 200, O[1] - 10],
      [O[0] + 200, O[1] + 100],
      [O[0] + 50, O[1] + 100],
    ];
    const r = computeOverlay([rect], [{ name: 'Z', rings: [zone] }]);
    expect(r.overlapPct).toBeCloseTo(50, 4);
    expect(r.names).toEqual(['Z']);
  });
  it('két átfedő zóna uniója nem számol duplán', () => {
    const a: Ring = [
      [O[0] - 10, O[1] - 10],
      [O[0] + 60, O[1] - 10],
      [O[0] + 60, O[1] + 60],
      [O[0] - 10, O[1] + 60],
    ];
    const b: Ring = [
      [O[0] + 40, O[1] - 10],
      [O[0] + 80, O[1] - 10],
      [O[0] + 80, O[1] + 60],
      [O[0] + 40, O[1] + 60],
    ];
    const r = computeOverlay(
      [rect],
      [
        { name: 'A', rings: [a] },
        { name: 'B', rings: [b] },
      ],
    );
    expect(r.overlapPct).toBeCloseTo(80, 4);
  });
  it('nincs átfedés → legközelebbi távolság', () => {
    const far: Ring = [
      [O[0] + 300, O[1]],
      [O[0] + 400, O[1]],
      [O[0] + 400, O[1] + 50],
    ];
    const r = computeOverlay([rect], [{ name: 'F', rings: [far] }]);
    expect(r.overlapPct).toBe(0);
    expect(r.nearestDistanceM).toBeCloseTo(200, 6);
  });
  it('közelség: út, keresztező légvezeték, épület a telken', () => {
    const r = computeProximity({
      parcel: [rect],
      radiusM: 2000,
      roads: [
        {
          line: [
            [O[0], O[1] - 40],
            [O[0] + 100, O[1] - 40],
          ],
          name: 'Fő út',
        },
      ],
      powerLines: [
        {
          line: [
            [O[0] + 50, O[1] - 100],
            [O[0] + 50, O[1] + 200],
          ],
        },
      ],
      waterways: [],
      buildings: [
        { point: [O[0] + 10, O[1] + 10] },
        {
          rings: [
            [
              [O[0] + 300, O[1]],
              [O[0] + 310, O[1]],
              [O[0] + 310, O[1] + 10],
            ],
          ],
        },
      ],
    });
    expect(r.road.distanceM).toBeCloseTo(40);
    expect(r.road.name).toBe('Fő út');
    expect(r.powerLine.crosses).toBe(true);
    expect(r.powerLine.distanceM).toBe(0);
    expect(r.waterway.distanceM).toBeNull();
    expect(r.building.countInside).toBe(1);
  });
});
