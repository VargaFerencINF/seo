import { h } from '../dom';
import { settings, type ThemePref } from '../../state/settings';
import { APP_NAME, APP_VERSION } from '../../config';
import type { Screen } from '../shell';

export class SettingsScreen implements Screen {
  readonly id = 'settings' as const;
  readonly el: HTMLElement;

  constructor() {
    const s = settings.get();
    const demo = h('input', {
      type: 'checkbox',
      class: 'switch',
      checked: s.demoMode,
      'aria-label': 'Demó mód',
      onchange: (e: Event) => settings.patch({ demoMode: (e.target as HTMLInputElement).checked }),
    });
    const themeBtns = (['system', 'light', 'dark'] as ThemePref[]).map((t) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(s.theme === t),
          onclick: () => settings.patch({ theme: t }),
          dataset: { theme: t },
        },
        { system: 'Rendszer', light: 'Világos', dark: 'Sötét' }[t],
      ),
    );
    settings.subscribe((v) => {
      demo.checked = v.demoMode;
      for (const b of themeBtns) b.setAttribute('aria-pressed', String(b.dataset.theme === v.theme));
    });
    this.el = h(
      'section',
      { 'aria-label': 'Beállítások' },
      h(
        'div',
        { class: 'screen-scroll' },
        h('div', { class: 'screen-header' }, h('h1', null, 'Beállítások')),
        h(
          'div',
          { class: 'card' },
          h('h2', null, 'Működés'),
          h(
            'label',
            { class: 'switch-row' },
            h(
              'span',
              { class: 'switch-text' },
              'Demó mód',
              h('small', null, 'Szimulált terep és rétegek internet nélkül, prezentációhoz.'),
            ),
            demo,
          ),
        ),
        h(
          'div',
          { class: 'card' },
          h('h2', null, 'Megjelenés'),
          h('div', { class: 'segmented', role: 'group', 'aria-label': 'Téma' }, themeBtns),
        ),
        h('p', { class: 'muted' }, `${APP_NAME} ${APP_VERSION}`),
      ),
    );
  }
}
