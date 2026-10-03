import { h, svg } from './dom';
import { icons } from './icons';

export type ScreenId = 'map' | 'projects' | 'settings';

export interface Screen {
  id: ScreenId;
  el: HTMLElement;
  onShow?(): void;
  onHide?(): void;
}

const NAV: { id: ScreenId; label: string; icon: string }[] = [
  { id: 'map', label: 'Térkép', icon: icons.map },
  { id: 'projects', label: 'Projektek', icon: icons.folder },
  { id: 'settings', label: 'Beállítások', icon: icons.settings },
];

export class Shell {
  readonly root: HTMLElement;
  private screensEl: HTMLElement;
  private nav: HTMLElement;
  private screens = new Map<ScreenId, Screen>();
  private current: ScreenId | null = null;
  private listeners: ((id: ScreenId) => void)[] = [];

  constructor(root: HTMLElement) {
    this.root = root;
    this.screensEl = h('main', { class: 'screens' });
    this.nav = h(
      'nav',
      { class: 'bottom-nav', 'aria-label': 'Fő navigáció' },
      NAV.map((n) =>
        h(
          'button',
          { type: 'button', dataset: { screen: n.id }, onclick: () => this.show(n.id) },
          svg(n.icon),
          h('span', null, n.label),
        ),
      ),
    );
    root.append(this.screensEl, this.nav);
  }

  register(screen: Screen): void {
    screen.el.classList.add('screen');
    screen.el.dataset.screen = screen.id;
    this.screens.set(screen.id, screen);
    this.screensEl.appendChild(screen.el);
  }

  show(id: ScreenId): void {
    if (this.current === id) return;
    const prev = this.current ? this.screens.get(this.current) : null;
    prev?.el.classList.remove('active');
    prev?.onHide?.();
    const next = this.screens.get(id);
    if (!next) return;
    next.el.classList.add('active');
    this.current = id;
    for (const btn of this.nav.querySelectorAll<HTMLButtonElement>('button')) {
      if (btn.dataset.screen === id) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    }
    next.onShow?.();
    for (const fn of this.listeners) fn(id);
  }

  get active(): ScreenId | null {
    return this.current;
  }

  onChange(fn: (id: ScreenId) => void): void {
    this.listeners.push(fn);
  }
}
