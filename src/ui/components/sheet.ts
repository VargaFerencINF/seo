/** Húzható alsó panel (bottom sheet): peek / half / full / hidden állapotok. */
import { h } from '../dom';

export type SheetState = 'peek' | 'half' | 'full' | 'hidden';

export class BottomSheet {
  readonly el: HTMLElement;
  readonly titleEl: HTMLElement;
  readonly actionsEl: HTMLElement;
  readonly body: HTMLElement;
  private handle: HTMLElement;
  private _state: SheetState = 'peek';
  private listeners: ((s: SheetState) => void)[] = [];

  constructor() {
    this.titleEl = h('div', { class: 'grow' });
    this.actionsEl = h('div', { style: 'display:flex;gap:4px' });
    this.handle = h(
      'div',
      { class: 'sheet-handle', role: 'button', tabindex: '0', 'aria-label': 'Panel méretezése' },
      h('div', { class: 'sheet-title' }, this.titleEl, this.actionsEl),
    );
    this.body = h('div', { class: 'sheet-body' });
    this.el = h(
      'section',
      { class: 'sheet', 'data-state': 'peek', 'aria-label': 'Eredmények' },
      this.handle,
      this.body,
    );
    this.bindDrag();
    this.handle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.cycle();
      }
    });
  }

  get state(): SheetState {
    return this._state;
  }

  setState(s: SheetState): void {
    this._state = s;
    this.el.dataset.state = s;
    this.el.style.height = '';
    for (const fn of this.listeners) fn(s);
  }

  onState(fn: (s: SheetState) => void): void {
    this.listeners.push(fn);
  }

  cycle(): void {
    this.setState(this._state === 'peek' ? 'half' : this._state === 'half' ? 'full' : 'peek');
  }

  private bindDrag(): void {
    let startY = 0;
    let startH = 0;
    let dragging = false;
    let moved = false;
    this.handle.addEventListener('pointerdown', (e) => {
      // a fejléc gombjai (átnevezés, bezárás) ne indítsanak húzást – különben a pointer-capture elnyeli a kattintást
      if ((e.target as Element).closest('button, a, input, select, textarea')) return;
      dragging = true;
      moved = false;
      startY = e.clientY;
      startH = this.el.getBoundingClientRect().height;
      this.handle.setPointerCapture(e.pointerId);
    });
    this.handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dy = e.clientY - startY;
      if (!moved && Math.abs(dy) < 6) return;
      if (!moved) this.el.classList.add('dragging');
      moved = true;
      const max = (this.el.parentElement?.clientHeight ?? window.innerHeight) - 8;
      this.el.style.height = `${Math.max(60, Math.min(max, startH - dy))}px`;
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      this.el.classList.remove('dragging');
      if (!moved) {
        this.cycle();
        return;
      }
      const container = this.el.parentElement?.clientHeight ?? window.innerHeight;
      const frac = this.el.getBoundingClientRect().height / container;
      this.el.style.height = '';
      this.setState(frac > 0.72 ? 'full' : frac > 0.32 ? 'half' : 'peek');
    };
    this.handle.addEventListener('pointerup', end);
    this.handle.addEventListener('pointercancel', end);
  }
}
