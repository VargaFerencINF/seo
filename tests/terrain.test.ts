import { describe, expect, it } from 'vitest';
import {
  aspectClass,
  computeTerrain,
  gridFromFunction,
  hornSlopeAspect,
  sampleGeoRaster,
  sampleGrid,
} from '../src/analysis/terrain';
import type { Ring } from '../src/analysis/planar';

const B: [number, number, number, number] = [0, 0, 200, 200];
const square: Ring = [
  [50, 50],
  [150, 50],
  [150, 150],
  [50, 150],
];

describe('lejtés és kitettség ismert mesterséges felületen', () => {
  it('déli irányba 10 %-osan lejtő sík: 5,71°, kitettség D', () => {
    // z nő észak felé → a felszín dél felé lejt
    const g = gridFromFunction(B, 5, (_x, y) => 100 + 0.1 * y);
    const sa = hornSlopeAspect(g, 20, 20)!;
    expect(sa.slopeDeg).toBeCloseTo((Math.atan(0.1) * 180) / Math.PI, 6);
    expect(sa.aspectDeg).toBeCloseTo(180, 6);
    expect(aspectClass(sa.aspectDeg)).toBe('D');
  });
  it('keleti irányba lejtő sík: kitettség K (90°)', () => {
    const g = gridFromFunction(B, 5, (x) => 200 - 0.2 * x);
    const sa = hornSlopeAspect(g, 20, 20)!;
    expect(sa.aspectDeg).toBeCloseTo(90, 6);
    expect(sa.slopeDeg).toBeCloseTo((Math.atan(0.2) * 180) / Math.PI, 6);
  });
  it('északnyugati lejtő: 315°', () => {
    const g = gridFromFunction(B, 5, (x, y) => 100 + 0.05 * x - 0.05 * y);
    expect(hornSlopeAspect(g, 20, 20)!.aspectDeg).toBeCloseTo(315, 6);
    expect(aspectClass(315)).toBe('ÉNy');
  });
  it('vízszintes sík: 0°, kitettség nincs', () => {
    const g = gridFromFunction(B, 5, () => 120);
    const sa = hornSlopeAspect(g, 10, 10)!;
    expect(sa.slopeDeg).toBe(0);
    expect(Number.isNaN(sa.aspectDeg)).toBe(true);
  });
  it('telek-statisztika síkon: átlag, min/max, lejtés %, domináns kitettség', () => {
    const g = gridFromFunction(B, 2, (_x, y) => 100 + 0.08 * y);
    const t = computeTerrain({
      grid: g,
      polygon: [square],
      profiles: [
        {
          label: 'É–D',
          line: [
            [100, 50],
            [100, 150],
          ],
        },
      ],
    });
    expect(t.meanSlopePct).toBeCloseTo(8, 4);
    expect(t.dominantAspect).toBe('D');
    expect(t.minElevM).toBeCloseTo(104, 1);
    expect(t.maxElevM).toBeCloseTo(112, 1);
    expect(t.meanElevM).toBeCloseTo(108, 1);
    expect(t.aspectShares.D).toBeCloseTo(1, 6);
    const prof = t.profiles[0]!;
    expect(prof.lengthM).toBeCloseTo(100);
    expect(prof.points[0]!.z).toBeCloseTo(104, 2);
    expect(prof.points[prof.points.length - 1]!.z).toBeCloseTo(112, 2);
  });
  it('enyhe lejtő (<2°) „sík” kitettségnek számít', () => {
    const g = gridFromFunction(B, 2, (_x, y) => 100 + 0.01 * y);
    expect(computeTerrain({ grid: g, polygon: [square], profiles: [] }).dominantAspect).toBe('sík');
  });
  it('bilineáris interpoláció cellák között', () => {
    const g = gridFromFunction(B, 10, (x, y) => x + 2 * y);
    expect(sampleGrid(g, [55, 33])).toBeCloseTo(55 + 66, 6);
  });
  it('földrajzi raszter mintavétele (nodata → NaN)', () => {
    const r = {
      lon0: 19,
      lat0: 47.1,
      dLon: 0.1,
      dLat: 0.1,
      width: 2,
      height: 2,
      values: new Float32Array([10, 20, 30, -9999]),
      noData: -9999,
    };
    expect(sampleGeoRaster(r, 19.05, 47.1)).toBeCloseTo(15, 6);
    expect(Number.isNaN(sampleGeoRaster(r, 19.1, 47.0))).toBe(true);
  });
});
