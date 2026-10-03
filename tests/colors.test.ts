import { describe, expect, it } from 'vitest';
import { parseColor, recolorDeep, toCss } from '../src/map/colors';
import { parseWmsLayerNames, wmsTileUrl } from '../src/map/styles';

describe('színkezelés', () => {
  it('hex, rgb, hsl értelmezése', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    const hsl = parseColor('hsl(0, 100%, 50%)')!;
    expect(Math.round(hsl.r)).toBe(255);
    expect(parseColor('match')).toBeNull();
  });
  it('kifejezésekben csak a színeket cseréli', () => {
    const out = recolorDeep(['match', ['get', 'class'], 'water', '#000000', 'red'], () => ({
      r: 1,
      g: 2,
      b: 3,
      a: 1,
    }));
    expect(out).toEqual(['match', ['get', 'class'], 'water', toCss({ r: 1, g: 2, b: 3, a: 1 }), 'red']);
  });
});

describe('WMS GetCapabilities', () => {
  it('kiolvassa a lekérhető rétegneveket', () => {
    const xml = `<WMT_MS_Capabilities><Capability><Layer><Title>root</Title>
      <Layer queryable="0"><Name>OI.2018:OrthoimageCoverage</Name><Title>Orto</Title></Layer>
      </Layer></Capability></WMT_MS_Capabilities>`;
    expect(parseWmsLayerNames(xml)).toEqual(['OI.2018:OrthoimageCoverage']);
  });
  it('GetMap: WMS 1.3.0, crs=EPSG:3857 (a Lechner szerver 1.1.1-re hibát ad)', () => {
    const u = wmsTileUrl('https://x.test/wms', 'OrthoimageCoverage2022');
    expect(u).toContain('version=1.3.0');
    expect(u).toContain('crs=EPSG:3857');
    expect(u).toContain('bbox={bbox-epsg-3857}');
  });
});
