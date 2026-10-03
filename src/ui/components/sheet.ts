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
    this.el.style.transform = '';
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
    let startOffset = 0;
    let dragging = false;
    let moved = false;
    const offsetOf = (): number => {
      const m = new DOMMatrixReadOnly(getComputedStyle(this.el).transform);
      return m.m42;
    };
    this.handle.addEventListener('pointerdown', (e) => {
      dragging = true;
      moved = false;
      startY = e.clientY;
      startOffset = offsetOf();
      this.el.classList.add('dragging');
      this.handle.setPointerCapture(e.pointerId);
    });
    this.handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dy = e.clientY - startY;
      if (Math.abs(dy) > 4) moved = true;
      const y = Math.max(0, startOffset + dy);
      this.el.style.transform = `translateY(${y}px)`;
    });
    const end = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      this.el.classList.remove('dragging');
      if (!moved) {
        this.el.style.transform = '';
        this.cycle();
        return;
      }
      const hgt = this.el.getBoundingClientRect().height;
      const y = Math.max(0, startOffset + (e.clientY - startY));
      const frac = y / hgt; // 0 = teljes, 1 = rejtett
      this.setState(frac < 0.25 ? 'full' : frac < 0.7 ? 'half' : 'peek');
    };
    this.handle.addEventListener('pointerup', end);
    this.handle.addEventListener('pointercancel', end);
  }
}
