import { describe, expect, it } from 'vitest';
import { isPlausibleEov, toEov, toWgs } from '../src/analysis/eov';

describe('EOV vetítés', () => {
  it('a vetület középpontja közel esik a (650000, 200000) hamis kezdőponthoz', () => {
    const [x, y] = toEov([19.04857177777778, 47.14439372222222]);
    // a towgs84 dátumeltolás miatt néhány tíz méter eltérés várható
    expect(Math.abs(x - 650000)).toBeLessThan(150);
    expect(Math.abs(y - 200000)).toBeLessThan(150);
  });

  it('Budapest belváros EOV-ban a várt tartományban van', () => {
    const [x, y] = toEov([19.0402, 47.4979]);
    expect(x).toBeGreaterThan(649000);
    expect(x).toBeLessThan(652000);
    expect(y).toBeGreaterThan(238000);
    expect(y).toBeLessThan(242000);
    expect(isPlausibleEov([x, y])).toBe(true);
  });

  it('oda-vissza vetítés cm-pontos', () => {
    const p: [number, number] = [20.1234, 46.9876];
    const back = toWgs(toEov(p));
    expect(back[0]).toBeCloseTo(p[0], 7);
    expect(back[1]).toBeCloseTo(p[1], 7);
  });
});
