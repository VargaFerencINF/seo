/** Import (fájl, megosztott fájl) és koordináta-bevitel felülete. */
import { h } from './dom';
import { dialog, toast } from './feedback';
import { ImportError } from '../import/types';
import { parseCoordinates, type CoordSystem } from '../import/coords';
import { polygonFromPoints } from '../analysis/geometry';
import type { MapScreen } from './screens/mapScreen';

export class ImportUi {
  private input: HTMLInputElement;

  constructor(private screen: MapScreen) {
    this.input = h('input', {
      type: 'file',
      accept:
        '.geojson,.json,.kml,.dxf,application/geo+json,application/json,application/vnd.google-earth.kml+xml,application/dxf,image/vnd.dxf',
      class: 'hidden',
      onchange: () => void this.onFile(),
    });
    document.body.appendChild(this.input);
  }

  pickFile(): void {
    this.input.value = '';
    this.input.click();
  }

  private async onFile(): Promise<void> {
    const f = this.input.files?.[0];
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) {
      toast('A fájl túl nagy (20 MB felett). Exportáld csak a telekhatárt.', 'error', 6000);
      return;
    }
    await this.load(f.name, await f.text());
  }

  /** Szöveges tartalom betöltése (fájlválasztóból vagy Android megosztásból) */
  async load(name: string, text: string): Promise<void> {
    try {
      const { importText } = await import('../import');
      const r = importText(name, text);
      this.screen.loadGeometry(r.polygon, 'import', r.name ?? name.replace(/\.[^.]+$/, ''));
      toast(['Telek importálva.', ...r.notes].join(' '), 'info', 6000);
    } catch (err) {
      const msg =
        err instanceof ImportError
          ? err.message
          : `Az importálás nem sikerült: ${err instanceof Error ? err.message : String(err)}`;
      toast(msg, 'error', 8000);
    }
  }

  async coordinates(): Promise<void> {
    let system: CoordSystem = 'auto';
    const area = h('textarea', {
      rows: 6,
      'aria-label': 'Koordináták',
      placeholder: 'Soronként egy pont, pl.\n47.60152, 19.34770\nvagy EOV:\n665120.5 262410.2',
      style: 'font-family:ui-monospace,monospace;font-size:14px',
    }) as HTMLTextAreaElement;
    const sysBtns = (['auto', 'wgs84', 'eov'] as CoordSystem[]).map((s) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(s === system),
          onclick: () => {
            system = s;
            for (const b of sysBtns) b.setAttribute('aria-pressed', String(b.dataset.sys === s));
          },
          dataset: { sys: s },
        },
        { auto: 'Automatikus', wgs84: 'WGS84', eov: 'EOV' }[s],
      ),
    );
    const v = await dialog({
      title: 'Koordináták megadása',
      body: h(
        'div',
        null,
        h('div', { class: 'segmented', style: 'margin-bottom:10px' }, sysBtns),
        h('div', { class: 'field' }, area),
        h(
          'p',
          { class: 'muted', style: 'font-size:13px' },
          'Egy pont: odaugrik a térkép. Legalább 3 pont: telekhatárként betölti. WGS84: tizedes fok vagy fok-perc-másodperc (szélesség, hosszúság). EOV: Y (kelet) X (észak) méterben – a felcserélt sorrendet felismeri.',
        ),
      ),
      actions: [
        { label: 'Mégse', value: 'cancel', kind: 'ghost' },
        { label: 'Betöltés', value: 'ok', kind: 'primary' },
      ],
    });
    if (v !== 'ok' || !area.value.trim()) return;
    try {
      const r = parseCoordinates(area.value, system);
      if (r.points.length === 1) {
        this.screen.view.map.flyTo({ center: r.points[0]!, zoom: 17.5 });
        toast(['Odaugrottam a megadott pontra.', ...r.notes].join(' '));
        return;
      }
      if (r.points.length === 2) {
        toast('Két pontból nem lesz telek – adj meg legalább hármat, vagy egyet az odaugráshoz.', 'error');
        return;
      }
      this.screen.loadGeometry(
        polygonFromPoints(r.points),
        'coords',
        `Koordinátás telek (${r.system === 'eov' ? 'EOV' : 'WGS84'})`,
      );
      if (r.notes.length) toast(r.notes.join(' '), 'info', 6000);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error', 7000);
    }
  }
}
