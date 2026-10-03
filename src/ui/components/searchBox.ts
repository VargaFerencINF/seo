/** Címkereső: csak Enterre / gombra keres (Nominatim-szabályzat: nincs autocomplete). */
import { h, replaceChildren, svg } from '../dom';
import { icons } from '../icons';
import type { GeocodeResult } from '../../services/geocode';

export class SearchBox {
  readonly el: HTMLElement;
  private input: HTMLInputElement;
  private results: HTMLElement;
  private busy = false;

  constructor(
    private search: (q: string) => Promise<GeocodeResult[]>,
    private onPick: (r: GeocodeResult) => void,
  ) {
    this.input = h('input', {
      type: 'search',
      placeholder: 'Cím, település, helyrajzi hely…',
      'aria-label': 'Címkeresés',
      enterkeyhint: 'search',
      onkeydown: (e: KeyboardEvent) => {
        if (e.key === 'Enter') void this.run();
        if (e.key === 'Escape') this.close();
      },
    });
    this.results = h('div', { class: 'search-results hidden', role: 'listbox' });
    this.el = h(
      'div',
      { class: 'searchbox', style: 'position:relative' },
      svg(icons.search),
      this.input,
      h(
        'button',
        { class: 'btn btn-ghost btn-icon', 'aria-label': 'Keresés', onclick: () => void this.run() },
        svg(icons.search),
      ),
      this.results,
    );
  }

  close(): void {
    this.results.classList.add('hidden');
  }

  private async run(): Promise<void> {
    const q = this.input.value.trim();
    if (this.busy || q.length < 3) return;
    this.busy = true;
    replaceChildren(this.results, h('div', { style: 'padding:12px' }, 'Keresés…'));
    this.results.classList.remove('hidden');
    try {
      const res = await this.search(q);
      if (!res.length) {
        replaceChildren(
          this.results,
          h(
            'div',
            { style: 'padding:12px' },
            'Nincs találat. Próbáld pontosabb címmel (település, utca, házszám).',
          ),
        );
        return;
      }
      replaceChildren(
        this.results,
        res.map((r) =>
          h(
            'button',
            {
              role: 'option',
              onclick: () => {
                this.close();
                this.input.blur();
                this.onPick(r);
              },
            },
            r.label,
          ),
        ),
      );
    } catch (err) {
      replaceChildren(
        this.results,
        h(
          'div',
          { style: 'padding:12px;color:var(--c-bad)' },
          err instanceof Error ? err.message : String(err),
        ),
      );
    } finally {
      this.busy = false;
    }
  }
}
