// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { toGeoJson, toKml, exportFileName } from '../src/report/export';
import { importText } from '../src/import';
import { computeGeometry } from '../src/analysis/geometry';
import { runAnalysis } from '../src/analysis/pipeline';
import { createDemoProvider } from '../src/demo/provider';
import { DEMO_PARCELS, demoPolygon } from '../src/demo/parcels';
import { DEFAULT_RULES } from '../src/analysis/rules';
import { buildReport, reportFileName, setFontData } from '../src/report/pdf';
import type { Parcel } from '../src/types';

async function parcel(): Promise<Parcel> {
  const d = DEMO_PARCELS[2]!;
  const p: Parcel = {
    id: 'x',
    name: 'Vezeték alatti északi lejtő (mintatelek 3)',
    note: 'Megjegyzés <&> ékezetekkel: őű',
    tags: ['napelempark'],
    geometry: demoPolygon(d),
    source: 'demo',
    mode: 'demo',
    createdAt: '2026-10-03T10:00:00.000Z',
    updatedAt: '2026-10-03T10:00:00.000Z',
    analysis: null,
    photos: [
      {
        id: 'f1',
        parcelId: 'x',
        createdAt: '2026-10-03T10:05:00.000Z',
        lon: 19.0,
        lat: 47.0,
        accuracyM: 4,
        headingDeg: 135,
        uri: 'data:',
        thumb:
          'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+iiigD//Z',
        note: 'kapu',
      },
    ],
    profileLine: null,
  };
  p.profileLine = {
    type: 'LineString',
    coordinates: [p.geometry.coordinates[0]![0]!, p.geometry.coordinates[0]![2]!],
  };
  p.analysis = await runAnalysis(p, {
    provider: createDemoProvider(),
    rules: DEFAULT_RULES,
    online: false,
    pvLossPct: 14,
  });
  return p;
}

describe('export', () => {
  it('GeoJSON (WGS84): telek + metszetvonal + fotó, elemzési összegzéssel; visszaimportálható', async () => {
    const p = await parcel();
    const gj = toGeoJson(p);
    expect(gj.features.map((f) => f.properties?.kind)).toEqual(['parcel', 'profile_line', 'photo']);
    const props = gj.features[0]!.properties!;
    expect(props.verdict).toBe('yellow');
    expect(props.mode).toMatch(/DEMÓ/);
    expect(props.centroid_eov_y).toBeGreaterThan(600000);
    const back = importText('x.geojson', JSON.stringify(gj));
    expect(computeGeometry(back.polygon).areaM2).toBeCloseTo(p.analysis!.geometry.areaM2, 0);
  });

  it('GeoJSON (EOV): EPSG:23700 crs, méteres koordináták, visszaimportálva azonos terület', async () => {
    const p = await parcel();
    const gj = toGeoJson(p, 'eov');
    expect(JSON.stringify(gj.crs)).toContain('23700');
    const c = (gj.features[0]!.geometry as GeoJSON.Polygon).coordinates[0]![0]!;
    expect(c[0]).toBeGreaterThan(600000);
    const back = importText('x.geojson', JSON.stringify(gj));
    expect(computeGeometry(back.polygon).areaM2).toBeCloseTo(p.analysis!.geometry.areaM2, 0);
  });

  it('KML: érvényes XML, escape-elt szöveg, visszaimportálható', async () => {
    const p = await parcel();
    const kml = toKml(p);
    expect(kml).toContain('&lt;&amp;&gt;');
    const doc = new DOMParser().parseFromString(kml, 'text/xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.getElementsByTagName('Placemark')).toHaveLength(3);
    const back = importText('x.kml', kml);
    expect(computeGeometry(back.polygon).areaM2).toBeCloseTo(p.analysis!.geometry.areaM2, 0);
  });

  it('fájlnevek ékezet nélkül', async () => {
    const p = await parcel();
    expect(exportFileName(p, 'kml')).toBe('teleklato_Vezetek_alatti_eszaki_lejto_mintatelek_3.kml');
    expect(reportFileName(p)).toMatch(
      /^teleklato_Vezetek_alatti_eszaki_lejto_mintatelek_3_\d{4}-\d{2}-\d{2}\.pdf$/,
    );
  });
});

describe('PDF riport', () => {
  it('elkészül beágyazott betűkkel, fotóval, logóval; több oldalas', async () => {
    const f = (n: string) => readFileSync(`${process.cwd()}/src/report/fonts/${n}`).toString('base64');
    setFontData({
      'Barlow-Regular.ttf': f('Barlow_400Regular.ttf'),
      'Barlow-SemiBold.ttf': f('Barlow_600SemiBold.ttf'),
      'Barlow-Bold.ttf': f('Barlow_700Bold.ttf'),
      'BarlowSC-SemiBold.ttf': f('BarlowSemiCondensed_600SemiBold.ttf'),
    });
    const p = await parcel();
    const doc = await buildReport({
      parcel: p,
      analysis: p.analysis!,
      mapImage: null,
      companyName: 'Példa Építész Kft.',
      companyLogo: p.photos[0]!.thumb,
      demo: true,
    });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    const out = doc.output('arraybuffer');
    expect(out.byteLength).toBeGreaterThan(20000);
    const head = new TextDecoder().decode(out.slice(0, 8));
    expect(head).toBe('%PDF-1.3');
    const all = new TextDecoder('latin1').decode(out);
    expect(all).toContain('/FontFile2'); // beágyazott TrueType
  });
});
