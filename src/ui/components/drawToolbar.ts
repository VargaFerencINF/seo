/** Rajzolás / metszetvonal / bejárás eszköztár a térkép tetején. */
import { h, svg, replaceChildren } from '../dom';
import { icons } from '../icons';
import type { EditorState } from '../../map/editor';
import { polygonArea, ringLength } from '../../analysis/planar';
import { toEov } from '../../analysis/eov';
import { fmtArea, fmtLen } from '../../util/format';

export interface DrawToolbarHandlers {
  onUndo(): void;
  onCancel(): void;
  onDone(): void;
}

export class DrawToolbar {
  readonly el: HTMLElement;
  private info: HTMLElement;
  private undoBtn: HTMLButtonElement;
  private doneBtn: HTMLButtonElement;
  private extra: HTMLElement;

  constructor(handlers: DrawToolbarHandlers) {
    this.info = h('div', { class: 'info', 'aria-live': 'polite' });
    this.undoBtn = h(
      'button',
      { class: 'btn', onclick: handlers.onUndo, 'aria-label': 'Visszavonás' },
      svg(icons.undo),
      'Vissza',
    );
    this.doneBtn = h(
      'button',
      { class: 'btn btn-accent', onclick: handlers.onDone },
      svg(icons.check),
      'Kész',
    );
    this.extra = h('div', { style: 'display:contents' });
    this.el = h(
      'div',
      { class: 'draw-toolbar hidden', style: 'top: calc(var(--safe-top) + 48px)' },
      this.info,
      this.extra,
      this.undoBtn,
      h('button', { class: 'btn btn-ghost', onclick: handlers.onCancel }, svg(icons.close), 'Mégse'),
      this.doneBtn,
    );
  }

  /** Bejárásnál kiegészítő vezérlők (GPS-mérő, pontrögzítés) */
  setExtra(...nodes: Node[]): void {
    replaceChildren(this.extra, ...nodes);
  }

  show(visible: boolean): void {
    this.el.classList.toggle('hidden', !visible);
    this.el.closest('section')?.classList.toggle('is-editing', visible);
  }

  update(s: EditorState, hint: string): void {
    const n = s.points.length;
    let measure = '';
    if (s.kind === 'polygon' && n >= 3) {
      const ring = s.points.map((p) => toEov(p));
      measure = ` · ${fmtArea(polygonArea([ring]))} · kerület ${fmtLen(ringLength(ring))}`;
    } else if (n >= 2) {
      measure = ` · ${fmtLen(
        ringLength(
          s.points.map((p) => toEov(p)),
          false,
        ),
      )}`;
    }
    replaceChildren(this.info, h('b', null, `${n} pont`), measure, h('br'), hint);
    this.undoBtn.disabled = !s.canUndo;
    this.doneBtn.disabled = s.kind === 'polygon' ? n < 3 : n < 2;
  }
}
