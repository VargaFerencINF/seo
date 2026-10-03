import { h, svg } from '../dom';
import { icons } from '../icons';
import type { Screen } from '../shell';

export class ProjectsScreen implements Screen {
  readonly id = 'projects' as const;
  readonly el: HTMLElement;

  constructor() {
    this.el = h(
      'section',
      { 'aria-label': 'Projektek' },
      h(
        'div',
        { class: 'screen-scroll' },
        h('div', { class: 'screen-header' }, h('h1', null, 'Projektek')),
        h(
          'div',
          { class: 'empty' },
          svg(icons.folder),
          h('p', null, 'Még nincs mentett telek. Jelölj ki egyet a Térkép képernyőn.'),
        ),
      ),
    );
  }
}
