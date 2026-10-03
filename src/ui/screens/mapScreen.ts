import { h, svg } from '../dom';
import { icons } from '../icons';
import { MapView } from '../../map/mapView';
import { fallbackStyle, loadLiveStyle } from '../../map/styles';
import { settings, isDarkTheme } from '../../state/settings';
import { toast } from '../feedback';
import type { Screen } from '../shell';

export class MapScreen implements Screen {
  readonly id = 'map' as const;
  readonly el: HTMLElement;
  view!: MapView;
  private mapEl: HTMLElement;
  private demoBadge: HTMLElement;
  private baseBanner: HTMLElement;

  constructor() {
    this.mapEl = h('div', { id: 'map', role: 'region', 'aria-label': 'Térkép' });
    this.demoBadge = h('div', { class: 'demo-badge hidden' }, 'Demó mód – szimulált adatok');
    this.baseBanner = h('div', { class: 'hidden' });
    const controls = h(
      'div',
      { class: 'map-controls' },
      h(
        'div',
        { class: 'map-fab-group' },
        h(
          'button',
          { class: 'map-fab', 'aria-label': 'Nagyítás', onclick: () => this.view.map.zoomIn() },
          svg(icons.plus),
        ),
        h(
          'button',
          { class: 'map-fab', 'aria-label': 'Kicsinyítés', onclick: () => this.view.map.zoomOut() },
          svg(icons.minus),
        ),
      ),
    );
    this.el = h(
      'section',
      { 'aria-label': 'Térkép' },
      h('div', { class: 'map-wrap' }, h('div', { class: 'map-fallback' }), this.mapEl),
      this.demoBadge,
      controls,
      this.baseBanner,
    );
  }

  /** A DOM-ba illesztés után hívandó (a MapLibre méretezéséhez). */
  async mount(): Promise<void> {
    this.view = new MapView(this.mapEl);
    settings.subscribe((s, prev) => {
      if (s.demoMode !== prev.demoMode || s.theme !== prev.theme) void this.refreshBaseStyle();
    });
    await this.refreshBaseStyle();
  }

  async refreshBaseStyle(): Promise<void> {
    const { demoMode } = settings.get();
    const dark = isDarkTheme();
    this.demoBadge.classList.toggle('hidden', !demoMode);
    if (demoMode) {
      await this.view.setStyle(fallbackStyle(dark));
      return;
    }
    try {
      await this.view.setStyle(await loadLiveStyle(dark));
    } catch (err) {
      console.warn('Háttértérkép nem tölthető', err);
      await this.view.setStyle(fallbackStyle(dark));
      toast(
        'A háttértérkép nem tölthető be (nincs hálózat vagy a szolgáltatás nem érhető el). A rajzolás és a demó mód így is működik.',
        'error',
        6000,
      );
    }
  }

  onShow(): void {
    requestAnimationFrame(() => this.view?.map.resize());
  }
}
