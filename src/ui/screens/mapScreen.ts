import { LngLatBounds } from 'maplibre-gl';
import type { Polygon } from 'geojson';
import { h, replaceChildren, svg } from '../dom';
import { icons } from '../icons';
import { MapView } from '../../map/mapView';
import { ParcelEditor } from '../../map/editor';
import { ParcelLayers } from '../../map/parcelLayers';
import { fallbackStyle, loadLiveStyle } from '../../map/styles';
import { settings, isDarkTheme } from '../../state/settings';
import { session, newParcel, updateParcel, type MapMode } from '../../state/session';
import { clearToasts, confirmDialog, dialog, promptDialog, toast } from '../feedback';
import { BottomSheet } from '../components/sheet';
import { DrawToolbar } from '../components/drawToolbar';
import { renderProgress, renderResults, lampEl } from '../components/results';
import { buildDemoStyle, DemoLabels } from '../../demo/layers';
import { DEMO_PARCELS, demoPolygon } from '../../demo/parcels';
import { computeGeometry, validatePolygon } from '../../analysis/geometry';
import { runAnalysis } from '../../analysis/pipeline';
import { getProvider } from '../../analysis/providers';
import { buildReport, reportFileName } from '../../report/pdf';
import { saveAndShare } from '../../native/files';
import { isOnline } from '../../native/network';
import { fmtArea, fmtLen } from '../../util/format';
import { OVERALL_TITLE } from '../../analysis/scoring';
import type { LngLat, Parcel } from '../../types';
import { SearchBox } from '../components/searchBox';
import { geocode, type GeocodeResult } from '../../services/geocode';
import { PLACE_LABELS } from '../../demo/world';
import { toWgs } from '../../analysis/eov';
import { disableOrtho, enableOrtho } from '../../map/ortho';
import { onNetworkChange } from '../../native/network';
import type { Screen } from '../shell';

export interface MapScreenHooks {
  /** további „új telek” műveletek (bejárás, import, koordináta) – a 4. fázis tölti fel */
  extraStartActions: { label: string; icon: string; run: () => void }[];
  /** fotó-bélyegképek a telek paneljén – a 4. fázis tölti fel */
  photoStrip?: () => HTMLElement | null;
  /** telek mentése a projektek közé – az 5. fázis tölti fel */
  saveParcel?: (p: Parcel) => Promise<void>;
  /** ha a felhasználó megnyit egy mentett telket */
  onParcelClosed?: () => void;
}

export class MapScreen implements Screen {
  readonly id = 'map' as const;
  readonly el: HTMLElement;
  view!: MapView;
  editor!: ParcelEditor;
  layers!: ParcelLayers;
  readonly sheet = new BottomSheet();
  readonly hooks: MapScreenHooks = { extraStartActions: [] };
  private mapEl: HTMLElement;
  private demoBadge: HTMLElement;
  private toolbar: DrawToolbar;
  private demoLabels = new DemoLabels();
  private abort: AbortController | null = null;
  private styleToken = 0;
  readonly topBar: HTMLElement;
  private offlineBanner: HTMLElement;
  private search!: SearchBox;
  readonly controls: HTMLElement;

  constructor() {
    this.mapEl = h('div', { id: 'map', role: 'region', 'aria-label': 'Térkép' });
    this.demoBadge = h('div', { class: 'demo-badge hidden' }, 'Demó mód · szimulált adatok');
    this.toolbar = new DrawToolbar({
      onUndo: () => this.editor.undo(),
      onCancel: () => this.cancelEditing(),
      onDone: () => this.finishEditing(),
    });
    this.topBar = h('div', { class: 'map-top' });
    this.offlineBanner = h(
      'div',
      {
        class: 'banner warn hidden',
        style:
          'position:absolute;left:12px;right:12px;top:calc(var(--safe-top) + var(--demo-h) + 62px);z-index:19',
      },
      svg(icons.wifiOff),
      h(
        'span',
        null,
        'Nincs hálózat. A demó mód, a mentett telkek és a gyorsítótárazott adatok elérhetők; az új élő lekérdezések kimaradnak.',
      ),
    );
    this.controls = h(
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
      h(
        'button',
        { class: 'map-fab', 'aria-label': 'Rétegek', onclick: () => void this.showLayerDialog() },
        svg(icons.layers),
      ),
    );
    this.el = h(
      'section',
      { 'aria-label': 'Térkép' },
      h('div', { class: 'map-wrap' }, h('div', { class: 'map-fallback' }), this.mapEl),
      this.demoBadge,
      this.topBar,
      this.offlineBanner,
      this.controls,
      this.toolbar.el,
      this.sheet.el,
    );
    this.sheet.onState(() => this.updatePeek());
  }

  async mount(): Promise<void> {
    this.view = new MapView(this.mapEl);
    this.layers = new ParcelLayers(this.view);
    this.editor = new ParcelEditor(this.view);
    this.editor.onChange((s) => {
      if (!s.active) return;
      const hint =
        s.kind === 'line'
          ? 'Koppints a metszetvonal két végpontjára. A pontok húzhatók.'
          : session.get().mode === 'walking'
            ? 'Rögzíts pontot a sarkokon. A pontok húzással javíthatók.'
            : 'Koppints a térképre a töréspontokhoz. Húzd a pontokat, a ✚ jelekkel új pontot szúrhatsz be.';
      this.toolbar.update(s, hint);
    });
    settings.subscribe((s, prev) => {
      if (s.demoMode !== prev.demoMode) {
        this.closeParcel(true);
        void this.refreshBaseStyle(true);
      } else if (s.theme !== prev.theme) void this.refreshBaseStyle(false);
    });
    session.subscribe(() => this.renderSheet());
    this.search = new SearchBox(
      (q) => this.searchPlaces(q),
      (r) => this.flyToResult(r),
    );
    this.topBar.append(this.search.el);
    this.view.map.on('click', () => this.search.close());
    onNetworkChange((online) =>
      this.offlineBanner.classList.toggle('hidden', online || settings.get().demoMode),
    );
    settings.subscribe((s, prev) => {
      if (s.orthoLayer !== prev.orthoLayer || s.demoMode !== prev.demoMode) void this.applyOrtho();
    });
    this.renderSheet();
    await this.refreshBaseStyle(true);
    void this.applyOrtho();
  }

  // ------------------------------------------------------------------ alaptérkép

  async refreshBaseStyle(recenter = false): Promise<void> {
    const token = ++this.styleToken;
    const { demoMode } = settings.get();
    const dark = isDarkTheme();
    this.demoBadge.classList.toggle('hidden', !demoMode);
    this.el.classList.toggle('is-demo', demoMode);
    this.demoLabels.hide();
    if (demoMode) {
      clearToasts();
      try {
        const style = await buildDemoStyle(dark);
        if (token !== this.styleToken) return;
        await this.view.setStyle(style);
        this.demoLabels.show(this.view.map);
        if (recenter) this.fitDemo();
      } catch (err) {
        console.error(err);
        toast('A demó térkép nem állítható elő.', 'error');
      }
      return;
    }
    try {
      const style = await loadLiveStyle(dark);
      if (token !== this.styleToken) return;
      await this.view.setStyle(style);
    } catch (err) {
      console.warn('Háttértérkép nem tölthető', err);
      if (token !== this.styleToken) return;
      await this.view.setStyle(fallbackStyle(dark));
      toast(
        'A háttértérkép nem tölthető be (nincs hálózat vagy a szolgáltatás nem érhető el). Rajzolni így is tudsz, vagy kapcsold be a Demó módot.',
        'error',
        6500,
      );
    }
    if (recenter) this.view.map.jumpTo({ center: [19.5, 47.15], zoom: 6.4 });
  }

  private fitDemo(): void {
    const b = new LngLatBounds();
    for (const d of DEMO_PARCELS)
      for (const c of demoPolygon(d).coordinates[0]!) b.extend(c as [number, number]);
    this.view.map.fitBounds(b, {
      padding: { top: 80, bottom: 140, left: 40, right: 40 },
      duration: 0,
      maxZoom: 15,
    });
  }

  fitParcel(geometry: Polygon, animate = true): void {
    const b = new LngLatBounds();
    for (const c of geometry.coordinates[0]!) b.extend(c as [number, number]);
    const st = this.sheet.state;
    const sheetH = st === 'hidden' ? 0 : st === 'peek' ? 172 : this.el.clientHeight * 0.5;
    this.view.map.fitBounds(b, {
      padding: { top: 80, bottom: Math.min(sheetH + 30, this.el.clientHeight - 220), left: 50, right: 64 },
      maxZoom: 17.5,
      duration: animate ? 600 : 0,
    });
  }

  // ------------------------------------------------------------------ telek-életciklus

  setMode(mode: MapMode): void {
    session.patch({ mode });
  }

  openParcel(p: Parcel, saved = false): void {
    if (p.mode === 'demo' && !settings.get().demoMode) settings.patch({ demoMode: true });
    if (p.mode === 'live' && settings.get().demoMode) settings.patch({ demoMode: false });
    this.abort?.abort();
    session.set({ parcel: p, mode: 'ready', steps: [], progress: 0, saved });
    this.layers.setActive(p.geometry);
    this.showProfiles(p);
    this.sheet.setState(p.analysis ? 'half' : 'peek');
    void this.view.whenReady().then(() => this.fitParcel(p.geometry));
  }

  closeParcel(silent = false): void {
    this.abort?.abort();
    if (this.editor?.state.active) this.editor.stop();
    this.toolbar.show(false);
    session.set({ parcel: null, mode: 'idle', steps: [], progress: 0, saved: false });
    this.layers?.setActive(null);
    this.layers?.setProfiles([]);
    if (!silent) this.sheet.setState('peek');
    this.hooks.onParcelClosed?.();
  }

  private showProfiles(p: Parcel): void {
    const lines: { line: LngLat[]; kind: 'diagonal' | 'user' }[] = [];
    if (p.analysis) lines.push({ line: p.analysis.geometry.longestDiagonal, kind: 'diagonal' });
    if (p.profileLine)
      lines.push({ line: p.profileLine.coordinates.map((c) => [c[0]!, c[1]!] as LngLat), kind: 'user' });
    this.layers.setProfiles(lines);
  }

  startDrawing(initial: LngLat[] = []): void {
    this.abort?.abort();
    const cur = session.get().parcel;
    this.setMode('drawing');
    this.layers.setActive(null);
    this.layers.setProfiles([]);
    this.editor.start('polygon', initial.length ? initial : [], { tapToAdd: true });
    this.toolbar.setExtra();
    this.toolbar.show(true);
    this.sheet.setState('hidden');
    if (!initial.length && !cur) toast('Koppints a térképre a telek sarokpontjainál.');
  }

  editBoundary(): void {
    const p = session.get().parcel;
    if (!p) return;
    this.startDrawing(p.geometry.coordinates[0]!.map((c) => [c[0]!, c[1]!] as LngLat));
  }

  startProfileLine(): void {
    const p = session.get().parcel;
    if (!p) return;
    this.setMode('profile');
    const init = p.profileLine ? p.profileLine.coordinates.map((c) => [c[0]!, c[1]!] as LngLat) : [];
    this.editor.start('line', init, { tapToAdd: true, maxPoints: 2 });
    this.toolbar.setExtra();
    this.toolbar.show(true);
    this.sheet.setState('hidden');
  }

  cancelEditing(): void {
    const mode = session.get().mode;
    this.editor.stop();
    this.toolbar.show(false);
    const p = session.get().parcel;
    if (p) {
      this.layers.setActive(p.geometry);
      this.showProfiles(p);
      this.setMode('ready');
    } else this.setMode('idle');
    this.sheet.setState(p?.analysis ? 'half' : 'peek');
    if (mode === 'walking') this.onWalkCancelled?.();
  }

  /** Eszköztár-kiegészítők (GPS-bejárás) */
  toolbarExtra(...nodes: Node[]): void {
    this.toolbar.setExtra(...nodes);
  }

  showToolbar(visible: boolean): void {
    this.toolbar.show(visible);
  }

  /** a 4. fázis GPS-bejárása használja */
  onWalkCancelled?: () => void;
  onWalkFinished?: () => void;

  finishEditing(): void {
    const s = this.editor.state;
    const mode = session.get().mode;
    if (mode === 'profile') {
      const line = this.editor.toLine();
      if (!line) return;
      this.editor.stop();
      this.toolbar.show(false);
      updateParcel({ profileLine: line, analysis: null });
      this.setMode('ready');
      this.showProfiles(session.get().parcel!);
      this.sheet.setState('peek');
      toast('Metszetvonal mentve. Futtasd újra az elemzést.');
      return;
    }
    const poly = this.editor.toPolygon();
    if (!poly) return;
    const v = validatePolygon(poly);
    if (!v.ok) {
      toast(v.message ?? 'Érvénytelen geometria.', 'error', 5000);
      return;
    }
    this.editor.stop();
    this.toolbar.show(false);
    const cur = session.get().parcel;
    const source = mode === 'walking' ? 'gps' : cur?.source === 'gps' ? 'gps' : 'draw';
    if (cur) {
      updateParcel({ geometry: poly, analysis: null });
      this.setMode('ready');
    } else {
      const p = newParcel(poly, source, settings.get().demoMode ? 'demo' : 'live');
      session.set({ parcel: p, mode: 'ready', steps: [], progress: 0, saved: false });
    }
    if (mode === 'walking') this.onWalkFinished?.();
    this.layers.setActive(poly);
    this.showProfiles(session.get().parcel!);
    this.sheet.setState('peek');
    this.fitParcel(poly);
    void s;
  }

  /** Külső forrásból (import, koordináta) érkező geometria */
  loadGeometry(poly: Polygon, source: Parcel['source'], name?: string): void {
    const v = validatePolygon(poly);
    if (!v.ok) {
      toast(v.message ?? 'Érvénytelen geometria.', 'error', 5000);
      return;
    }
    const p = newParcel(poly, source, settings.get().demoMode ? 'demo' : 'live', name);
    this.openParcel(p);
  }

  async analyze(): Promise<void> {
    const p = session.get().parcel;
    if (!p) return;
    this.abort?.abort();
    const ctrl = new AbortController();
    this.abort = ctrl;
    const s = settings.get();
    session.patch({ mode: 'analyzing', steps: [], progress: 0 });
    this.sheet.setState('half');
    this.fitParcel(p.geometry);
    try {
      const online = await isOnline();
      const result = await runAnalysis(p, {
        provider: getProvider(s.demoMode),
        rules: s.rules,
        online,
        pvLossPct: s.pvLossPct,
        signal: ctrl.signal,
        onProgress: (steps, progress) => {
          if (!ctrl.signal.aborted) session.patch({ steps, progress });
        },
      });
      if (ctrl.signal.aborted) return;
      updateParcel({ analysis: result, mode: s.demoMode ? 'demo' : 'live' });
      this.setMode('ready');
      this.showProfiles(session.get().parcel!);
      this.sheet.setState('half');
      this.fitParcel(p.geometry);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      console.error(err);
      this.setMode('ready');
      toast(
        `Az elemzés megszakadt: ${err instanceof Error ? err.message : String(err)}. Próbáld újra.`,
        'error',
        6000,
      );
    }
  }

  async exportPdf(): Promise<void> {
    const p = session.get().parcel;
    if (!p?.analysis) return;
    const s = settings.get();
    toast('PDF riport készül…');
    try {
      const b = new LngLatBounds();
      for (const c of p.geometry.coordinates[0]!) b.extend(c as [number, number]);
      const snap = await this.view.snapshotAround(b);
      this.fitParcel(p.geometry, false);
      const doc = await buildReport({
        parcel: p,
        analysis: p.analysis,
        mapImage: snap.dataUrl,
        mapWidthM: snap.widthM,
        companyName: s.companyName,
        companyLogo: s.companyLogo,
        demo: p.analysis.mode === 'demo',
      });
      await saveAndShare(reportFileName(p), doc.output('blob'), 'application/pdf', 'Teleklátó riport');
    } catch (err) {
      console.error(err);
      toast(
        `A PDF nem készült el: ${err instanceof Error ? err.message : String(err)}. Ellenőrizd a tárhelyet, és próbáld újra.`,
        'error',
        6000,
      );
    }
  }

  private async rename(): Promise<void> {
    const p = session.get().parcel;
    if (!p) return;
    const name = await promptDialog('Telek átnevezése', 'Név', p.name);
    if (name) updateParcel({ name });
  }

  // ------------------------------------------------------------------ keresés, ortofotó

  private async searchPlaces(q: string): Promise<GeocodeResult[]> {
    if (settings.get().demoMode) {
      const needle = q.toLowerCase();
      return PLACE_LABELS.filter((p) => p.text.toLowerCase().includes(needle)).map((p) => {
        const [lon, lat] = toWgs(p.at);
        return { label: `${p.text} (demó)`, lon, lat, bbox: null, kind: p.kind };
      });
    }
    return geocode(q);
  }

  private flyToResult(r: GeocodeResult): void {
    if (r.bbox) {
      const [w, s, e, n] = r.bbox;
      // nagy kiterjedésű találatnál (település) ne zoomoljon túl közel / túl távol
      this.view.map.fitBounds(
        [
          [w, s],
          [e, n],
        ],
        { padding: 60, maxZoom: 17.5, duration: 800 },
      );
    } else this.view.map.flyTo({ center: [r.lon, r.lat], zoom: 16 });
  }

  private async applyOrtho(): Promise<void> {
    const s = settings.get();
    if (!s.orthoLayer || s.demoMode) {
      disableOrtho(this.view);
      return;
    }
    try {
      await enableOrtho(this.view);
    } catch (err) {
      console.warn(err);
      disableOrtho(this.view);
      settings.patch({ orthoLayer: false });
      toast(
        'Az ortofotó-szolgáltatás (Lechner) most nem érhető el, a réteget kikapcsoltam. Próbáld később, vagy használd a térképi alapréteget.',
        'error',
        6500,
      );
    }
  }

  // ------------------------------------------------------------------ rétegek

  private async showLayerDialog(): Promise<void> {
    const s = settings.get();
    const ortho = h('input', {
      type: 'checkbox',
      class: 'switch',
      checked: s.orthoLayer,
      disabled: s.demoMode,
    });
    const body = h(
      'div',
      null,
      h(
        'label',
        { class: 'switch-row' },
        h(
          'span',
          { class: 'switch-text' },
          'Ortofotó (Lechner)',
          h(
            'small',
            null,
            s.demoMode
              ? 'Demó módban nem elérhető.'
              : 'Légifotó a háttértérkép felett, ha a szolgáltatás elérhető.',
          ),
        ),
        ortho,
      ),
    );
    const v = await dialog({
      title: 'Rétegek',
      body,
      actions: [
        { label: 'Mégse', value: 'cancel', kind: 'ghost' },
        { label: 'Alkalmaz', value: 'ok', kind: 'primary' },
      ],
    });
    if (v === 'ok') settings.patch({ orthoLayer: ortho.checked });
  }

  // ------------------------------------------------------------------ bottom sheet

  /** A „peek” állapotban a cím és az első műveletsor mindig látszódjon */
  private updatePeek(): void {
    const st = this.sheet.state;
    const { parcel } = session.get();
    const peek = st === 'hidden' ? 0 : parcel ? 172 : 150;
    this.el.style.setProperty('--sheet-peek', `${peek}px`);
  }

  renderSheet(): void {
    this.updatePeek();
    const { parcel, mode, steps, progress, saved } = session.get();
    const demo = settings.get().demoMode;
    const title = this.sheet.titleEl;
    const body = this.sheet.body;
    replaceChildren(this.sheet.actionsEl);

    if (mode === 'drawing' || mode === 'profile' || mode === 'walking') return;

    if (!parcel) {
      replaceChildren(title, 'Új telek kijelölése');
      const startBtns = [
        h(
          'button',
          { class: 'btn btn-primary', onclick: () => this.startDrawing() },
          svg(icons.draw),
          'Rajzolás',
        ),
        ...this.hooks.extraStartActions.map((a) =>
          h('button', { class: 'btn', onclick: a.run }, svg(a.icon), a.label),
        ),
      ];
      replaceChildren(
        body,
        h('div', { class: 'btn-row', style: 'margin-bottom:12px' }, startBtns),
        demo
          ? h(
              'div',
              { class: 'card' },
              h('h2', null, 'Mintatelkek (demó)'),
              DEMO_PARCELS.map((d) =>
                h(
                  'button',
                  {
                    class: 'list-item',
                    style: 'width:100%;text-align:left;cursor:pointer;font:inherit;color:inherit',
                    onclick: () => this.openParcel(newDemoParcel(d.id)),
                  },
                  svg(icons.parcel),
                  h(
                    'div',
                    { class: 'grow' },
                    h('div', { class: 'title' }, d.name),
                    h('div', { class: 'sub' }, d.note),
                  ),
                ),
              ),
            )
          : h(
              'p',
              { class: 'muted' },
              'Rajzold meg a telket a térképen, járd be GPS-szel, vagy importáld fájlból. Internet nélkül kapcsold be a Demó módot a Beállításokban.',
            ),
      );
      return;
    }

    replaceChildren(
      title,
      parcel.analysis ? lampEl(parcel.analysis.score.overall) : svg(icons.parcel),
      h('span', { style: 'margin-left:8px' }, parcel.name),
    );
    this.sheet.actionsEl.append(
      h(
        'button',
        {
          class: 'btn btn-ghost btn-icon',
          'aria-label': 'Átnevezés',
          onclick: (e: Event) => (e.stopPropagation(), void this.rename()),
        },
        svg(icons.edit),
      ),
      h(
        'button',
        {
          class: 'btn btn-ghost btn-icon',
          'aria-label': 'Telek bezárása',
          onclick: async (e: Event) => {
            e.stopPropagation();
            if (!saved && parcel.analysis && this.hooks.saveParcel) {
              const ok = await confirmDialog(
                'Bezárod mentés nélkül?',
                'A telek és az elemzés nincs elmentve a Projektek közé.',
                'Bezárás',
              );
              if (!ok) return;
            }
            this.closeParcel();
          },
        },
        svg(icons.close),
      ),
    );

    if (mode === 'analyzing') {
      replaceChildren(body, renderProgress(steps, progress));
      return;
    }

    const g = computeGeometry(parcel.geometry);
    const actions = h(
      'div',
      { class: 'btn-row', style: 'margin-bottom:12px' },
      h(
        'button',
        { class: 'btn btn-accent', onclick: () => void this.analyze() },
        svg(icons.analyze),
        parcel.analysis ? 'Újraelemzés' : 'Elemzés indítása',
      ),
      parcel.analysis
        ? h(
            'button',
            { class: 'btn btn-primary', onclick: () => void this.exportPdf() },
            svg(icons.pdf),
            'PDF riport',
          )
        : null,
      this.hooks.saveParcel
        ? h(
            'button',
            {
              class: 'btn',
              disabled: saved,
              onclick: () => void this.hooks.saveParcel?.(session.get().parcel!),
            },
            svg(icons.save),
            saved ? 'Mentve' : 'Mentés',
          )
        : null,
    );
    const secondary = h(
      'div',
      { class: 'btn-row', style: 'margin-bottom:12px' },
      h(
        'button',
        { class: 'btn', onclick: () => this.editBoundary() },
        svg(icons.vertex),
        'Határ szerkesztése',
      ),
      h(
        'button',
        { class: 'btn', onclick: () => this.startProfileLine() },
        svg(icons.profile),
        parcel.profileLine ? 'Metszetvonal módosítása' : 'Metszetvonal',
      ),
      ...this.parcelExtraActions.map((a) =>
        h('button', { class: 'btn', onclick: a.run }, svg(a.icon), a.label),
      ),
    );

    replaceChildren(
      body,
      h(
        'p',
        { class: 'muted', style: 'margin:0 0 10px' },
        `${fmtArea(g.areaM2)} · kerület ${fmtLen(g.perimeterM)} · ${g.vertexCount} töréspont`,
        parcel.analysis ? ` · ${OVERALL_TITLE[parcel.analysis.score.overall]}` : '',
      ),
      actions,
      secondary,
      this.hooks.photoStrip?.() ?? null,
      parcel.analysis
        ? renderResults(parcel.analysis, { demo })
        : h(
            'p',
            { class: 'muted' },
            demo
              ? 'Indítsd el az elemzést: a demó minden lépést szimulált adatokon, internet nélkül futtat.'
              : 'Az elemzés letölti a domborzati, közelségi, védett területi és napelem-adatokat.',
          ),
    );
  }

  /** telekhez kötött további műveletek (fotó, export) – későbbi fázisok töltik fel */
  readonly parcelExtraActions: { label: string; icon: string; run: () => void }[] = [];

  onShow(): void {
    requestAnimationFrame(() => this.view?.map.resize());
  }
}

export function newDemoParcel(id: string): Parcel {
  const d = DEMO_PARCELS.find((x) => x.id === id)!;
  const p = newParcel(demoPolygon(d), 'demo', 'demo', d.name);
  p.note = d.note;
  p.tags = d.tags.slice();
  return p;
}
