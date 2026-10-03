// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseCoordinates, parseLine } from '../src/import/coords';
import { importText, ImportError } from '../src/import';
import { toEov, toWgs } from '../src/analysis/eov';
import { computeGeometry } from '../src/analysis/geometry';

const O: [number, number] = [650000, 240000];
const sq = [
  [O[0], O[1]],
  [O[0] + 40, O[1]],
  [O[0] + 40, O[1] + 30],
  [O[0], O[1] + 30],
];

describe('koordináta-sorok', () => {
  it('tizedespont, tizedesvessző, pontosvessző, szóköz', () => {
    expect(parseLine('47.5123, 19.0412')).toEqual([47.5123, 19.0412]);
    expect(parseLine('47,5123; 19,0412')).toEqual([47.5123, 19.0412]);
    expect(parseLine('47,5123 19,0412')).toEqual([47.5123, 19.0412]);
    expect(parseLine('650123.4 240456.7')).toEqual([650123.4, 240456.7]);
    expect(parseLine('47,5,19,0')).toEqual([47.5, 19]);
  });
  it('fok-perc-másodperc', () => {
    const [lat, lon] = parseLine(`47°30'15.0"É 19°02'30"K`);
    expect(lat).toBeCloseTo(47.504167, 5);
    expect(lon).toBeCloseTo(19.041667, 5);
  });
});

describe('koordináta-bevitel', () => {
  it('WGS84 szélesség, hosszúság sorrendben', () => {
    const r = parseCoordinates('47.5, 19.05\n47.501, 19.05\n47.501, 19.052');
    expect(r.system).toBe('wgs84');
    expect(r.points[0]).toEqual([19.05, 47.5]);
  });
  it('WGS84 hosszúság, szélesség sorrend felismerése', () => {
    const r = parseCoordinates('19.05 47.5');
    expect(r.points[0]).toEqual([19.05, 47.5]);
    expect(r.notes.join()).toMatch(/hosszúság, szélesség/);
  });
  it('EOV Y X és felcserélt X Y', () => {
    const r = parseCoordinates(sq.map(([y, x]) => `${y} ${x}`).join('\n'));
    expect(r.system).toBe('eov');
    expect(toEov(r.points[1]!)[0]).toBeCloseTo(O[0] + 40, 3);
    const s = parseCoordinates(sq.map(([y, x]) => `${x};${y}`).join('\n'));
    expect(s.notes.join()).toMatch(/felcseréltem/);
    expect(toEov(s.points[1]!)[0]).toBeCloseTo(O[0] + 40, 3);
  });
  it('sorszámozott sorok', () => {
    const r = parseCoordinates('1. 47.5, 19.05\n2) 47.6, 19.06');
    expect(r.points).toHaveLength(2);
  });
  it('értelmetlen bemenet → magyar hibaüzenet', () => {
    expect(() => parseCoordinates('hello')).toThrow(ImportError);
    expect(() => parseCoordinates('999999999 1')).toThrow(/EOV-tartomány/);
  });
});

describe('fájlimport', () => {
  const wgsSq = sq.map((p) => toWgs(p as [number, number]));
  it('GeoJSON FeatureCollection – a legnagyobb poligon, névvel', () => {
    const small = wgsSq.map(([lon, lat]) => [lon + 0.01, lat]);
    const big = sq
      .map(([y, x]) => toWgs([y! + 1000, x!]))
      .map(([lon, lat], i) => (i === 2 ? [lon + 0.01, lat + 0.01] : [lon, lat]));
    const fc = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'kicsi' },
          geometry: { type: 'Polygon', coordinates: [[...small, small[0]]] },
        },
        {
          type: 'Feature',
          properties: { name: 'nagy' },
          geometry: { type: 'Polygon', coordinates: [[...big, big[0]]] },
        },
      ],
    };
    const r = importText('telkek.geojson', JSON.stringify(fc));
    expect(r.name).toBe('nagy');
    expect(r.notes.join()).toMatch(/2 poligonból/);
  });
  it('EOV-koordinátás GeoJSON (crs: EPSG:23700)', () => {
    const g = {
      type: 'Feature',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::23700' } },
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[...sq, sq[0]]] },
    };
    const r = importText('eov.json', JSON.stringify(g));
    expect(computeGeometry(r.polygon).areaM2).toBeCloseTo(1200, 1);
    expect(r.notes.join()).toMatch(/EOV/);
  });
  it('KML Placemark poligon', () => {
    const coords = [...wgsSq, wgsSq[0]!].map(([lon, lat]) => `${lon},${lat},0`).join(' ');
    const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Hrsz 123/4</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;
    const r = importText('telek.kml', kml);
    expect(r.name).toBe('Hrsz 123/4');
    expect(computeGeometry(r.polygon).areaM2).toBeCloseTo(1200, 0);
  });
  it('DXF zárt LWPOLYLINE EOV-ban', () => {
    const verts = sq.map(([y, x]) => `10\n${y}\n20\n${x}`).join('\n');
    const dxf = `0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n8\nTELEKHATAR\n90\n4\n70\n1\n${verts}\n0\nENDSEC\n0\nEOF\n`;
    const r = importText('felmeres.dxf', dxf);
    expect(computeGeometry(r.polygon).areaM2).toBeCloseTo(1200, 1);
    expect(r.name).toBe('DXF réteg: TELEKHATAR');
  });
  it('DXF nyitott vonallánc → érthető hiba', () => {
    const verts = sq.map(([y, x]) => `10\n${y}\n20\n${x}`).join('\n');
    const dxf = `0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n8\n0\n90\n4\n70\n0\n${verts}\n0\nENDSEC\n0\nEOF\n`;
    expect(() => importText('nyitott.dxf', dxf)).toThrow(/nyitott/);
  });
  it('ismeretlen formátum', () => {
    expect(() => importText('kep.png', 'xxxx')).toThrow(/Ismeretlen fájlformátum/);
  });
});

import { averageFixes, describeGeoError } from '../src/native/geo';
import { accuracyClass } from '../src/ui/gpsWalk';

describe('GPS-segédfüggvények', () => {
  it('súlyozott átlag a pontosabb mérés felé húz', () => {
    const a = averageFixes([
      { lon: 19, lat: 47, accuracyM: 2, altitudeM: null, headingDeg: null, time: 0 },
      { lon: 19.001, lat: 47.001, accuracyM: 20, altitudeM: null, headingDeg: null, time: 0 },
    ])!;
    expect(a.lon).toBeLessThan(19.0001);
    expect(a.accuracyM).toBeLessThanOrEqual(2);
  });
  it('pontossági osztály a beállított küszöbhöz', () => {
    expect(accuracyClass(3, 10)).toBe('good');
    expect(accuracyClass(8, 10)).toBe('mid');
    expect(accuracyClass(25, 10)).toBe('bad');
  });
  it('hibakódok magyar üzenete', () => {
    expect(describeGeoError({ code: 1, message: '' })).toMatch(/nincs engedélyezve/);
    expect(describeGeoError({ code: 3, message: '' })).toMatch(/Nem érkezett GPS-jel/);
    expect(describeGeoError({ message: '' })).toMatch(/Ellenőrizd/);
  });
});
