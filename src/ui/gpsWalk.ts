/**
 * Terepi bejárás GPS-szel: pontrögzítés gombnyomásra (néhány másodperc átlagolásával) vagy
 * automatikusan X méterenként; pontosság kijelzése, gyenge jelnél figyelmeztetés.
 */
import { h, replaceChildren, svg } from './dom';
import { icons } from './icons';
import { averageFixes, describeGeoError, requestLocation, watchFixes, type Fix } from '../native/geo';
import { explainLocation } from './permissions';
import { confirmDialog, toast } from './feedback';
import { settings } from '../state/settings';
import { session } from '../state/session';
import type { MapScreen } from './screens/mapScreen';
import type { PositionLayer } from '../map/positionLayer';
import { toEov } from '../analysis/eov';
import { dist } from '../analysis/planar';
import { fmtNum } from '../util/format';

const AUTO_STEPS = [0, 5, 10, 20, 50];

export function accuracyClass(acc: number, warnAt: number): 'good' | 'mid' | 'bad' {
  if (acc <= warnAt / 2) return 'good';
  if (acc <= warnAt) return 'mid';
  return 'bad';
}

export class GpsWalk {
  private stopWatch: (() => void) | null = null;
  private recent: Fix[] = [];
  private last: Fix | null = null;
  private meter = h('div', { class: 'gps-meter', 'aria-live': 'polite' });
  private autoBtn: HTMLButtonElement;
  private recordBtn: HTMLButtonElement;
  private active = false;

  constructor(
    private screen: MapScreen,
    private position: PositionLayer,
  ) {
    this.recordBtn = h(
      'button',
      { class: 'btn btn-primary', style: 'flex:1 1 100%', onclick: () => void this.record() },
      svg(icons.pin),
      'Pont rögzítése itt',
    );
    this.autoBtn = h('button', { class: 'btn', onclick: () => this.cycleAuto() }, '');
    screen.onWalkCancelled = () => this.stop();
    screen.onWalkFinished = () => this.stop();
  }

  async start(): Promise<void> {
    if (!(await explainLocation())) return;
    const perm = await requestLocation();
    if (perm === 'denied') {
      toast(describeGeoError('permission denied'), 'error', 8000);
      return;
    }
    this.active = true;
    this.recent = [];
    this.last = null;
    session.patch({ mode: 'walking', parcel: null, saved: false });
    this.screen.layers.setActive(null);
    this.screen.layers.setProfiles([]);
    this.screen.editor.start('polygon', [], { tapToAdd: false });
    this.updateAutoLabel();
    this.renderMeter();
    this.screen.toolbarExtra(this.meter, this.autoBtn, this.recordBtn);
    this.screen.showToolbar(true);
    this.screen.sheet.setState('hidden');
    try {
      this.stopWatch = await watchFixes(
        (f) => this.onFix(f),
        (msg) => toast(msg, 'error', 6000),
      );
    } catch (err) {
      toast(describeGeoError(err), 'error', 8000);
    }
  }

  stop(): void {
    this.active = false;
    this.stopWatch?.();
    this.stopWatch = null;
    this.position.set(null);
    this.screen.toolbarExtra();
  }

  private onFix(f: Fix): void {
    if (!this.active) return;
    this.last = f;
    this.recent = [...this.recent.filter((x) => f.time - x.time < 4000), f].slice(-8);
    this.position.set(f);
    if (this.screen.editor.state.points.length === 0)
      this.screen.view.map.easeTo({
        center: [f.lon, f.lat],
        zoom: Math.max(this.screen.view.map.getZoom(), 18),
      });
    this.renderMeter();
    this.autoRecord(f);
  }

  private renderMeter(): void {
    const warnAt = settings.get().gpsWarnAccuracyM;
    if (!this.last) {
      replaceChildren(this.meter, h('span', { class: 'spin' }, '◌'), ' GPS-jel keresése…');
      this.recordBtn.disabled = true;
      return;
    }
    const acc = this.last.accuracyM;
    const cls = accuracyClass(acc, warnAt);
    replaceChildren(
      this.meter,
      h('span', null, 'Pontosság:'),
      h('span', { class: `acc ${cls}` }, `±${fmtNum(acc, acc < 10 ? 1 : 0)} m`),
      cls === 'bad'
        ? h('span', { style: 'color:var(--c-bad)' }, 'gyenge jel – várj, vagy menj szabadabb helyre')
        : null,
    );
    this.recordBtn.disabled = false;
  }

  private async record(): Promise<void> {
    const avg = averageFixes(this.recent.length ? this.recent : this.last ? [this.last] : []);
    if (!avg) return;
    const warnAt = settings.get().gpsWarnAccuracyM;
    if (avg.accuracyM > warnAt) {
      const ok = await confirmDialog(
        'Gyenge GPS-jel',
        `A becsült pontosság ±${fmtNum(avg.accuracyM, 0)} m, ami több a beállított ${warnAt} m-nél. Rögzíted így is? (Később húzással javíthatod.)`,
        'Rögzítés',
      );
      if (!ok) return;
    }
    this.screen.editor.addPoint([avg.lon, avg.lat]);
    if (navigator.vibrate) navigator.vibrate(30);
  }

  private autoRecord(f: Fix): void {
    const step = settings.get().gpsAutoStepM;
    if (!step || f.accuracyM > settings.get().gpsWarnAccuracyM) return;
    const pts = this.screen.editor.state.points;
    const lastPt = pts[pts.length - 1];
    if (!lastPt || dist(toEov(lastPt), toEov([f.lon, f.lat])) >= step)
      this.screen.editor.addPoint([f.lon, f.lat]);
  }

  private cycleAuto(): void {
    const cur = settings.get().gpsAutoStepM;
    const next = AUTO_STEPS[(AUTO_STEPS.indexOf(cur) + 1) % AUTO_STEPS.length] ?? 0;
    settings.patch({ gpsAutoStepM: next });
    this.updateAutoLabel();
  }

  private updateAutoLabel(): void {
    const s = settings.get().gpsAutoStepM;
    replaceChildren(this.autoBtn, svg(icons.walk), s ? `Auto: ${s} m-enként` : 'Auto: ki');
    this.autoBtn.setAttribute('aria-pressed', String(s > 0));
  }
}
