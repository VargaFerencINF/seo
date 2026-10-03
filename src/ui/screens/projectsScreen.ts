import { h, replaceChildren, svg } from '../dom';
import { icons } from '../icons';
import { lampEl } from '../components/results';
import { confirmDialog, dialog, toast } from '../feedback';
import { editParcelMeta } from '../components/parcelEdit';
import {
  deleteProject,
  loadProject,
  projects,
  refreshProjects,
  saveProject,
  toggleSelected,
} from '../../state/projects';
import { matchesQuery, type ParcelSummary } from '../../storage/repository';
import { settings } from '../../state/settings';
import { rescore } from '../../analysis/rescore';
import { buildComparison } from '../../analysis/compare';
import { OVERALL_TITLE } from '../../analysis/scoring';
import { fmtArea, fmtDate } from '../../util/format';
import type { Parcel } from '../../types';
import type { Screen } from '../shell';

export interface ProjectsHandlers {
  open(p: Parcel): void;
  exportParcel?(p: Parcel): void;
}

export class ProjectsScreen implements Screen {
  readonly id = 'projects' as const;
  readonly el: HTMLElement;
  private listEl: HTMLElement;
  private compareBar: HTMLElement;
  private search: HTMLInputElement;
  handlers: ProjectsHandlers = { open: () => undefined };

  constructor() {
    this.search = h('input', {
      type: 'search',
      placeholder: 'Keresés név, megjegyzés, címke alapján',
      'aria-label': 'Projektek keresése',
      oninput: () => projects.patch({ query: this.search.value }),
    });
    this.listEl = h('div', { 'aria-live': 'polite' });
    this.compareBar = h('div', {
      class: 'hidden',
      style:
        'position:sticky;bottom:0;padding:10px 0 4px;background:linear-gradient(transparent, var(--c-bg) 30%);display:flex;gap:8px',
    });
    this.el = h(
      'section',
      { 'aria-label': 'Projektek' },
      h(
        'div',
        { class: 'screen-scroll' },
        h('div', { class: 'screen-header' }, h('h1', null, 'Projektek')),
        h('div', { class: 'field' }, this.search),
        this.listEl,
        this.compareBar,
      ),
    );
    projects.subscribe(() => this.render());
    this.render();
  }

  onShow(): void {
    void refreshProjects();
  }

  private render(): void {
    const { items, loading, error, query, selected } = projects.get();
    const shown = items.filter((i) => matchesQuery(i, query));
    if (error) {
      replaceChildren(
        this.listEl,
        h('div', { class: 'banner error' }, svg(icons.warn), h('span', null, error)),
      );
    } else if (!items.length) {
      replaceChildren(
        this.listEl,
        h(
          'div',
          { class: 'empty' },
          svg(icons.folder),
          h(
            'p',
            null,
            loading
              ? 'Betöltés…'
              : 'Még nincs mentett telek. Jelölj ki egyet a Térkép képernyőn, és nyomd meg a „Mentés” gombot.',
          ),
        ),
      );
    } else if (!shown.length) {
      replaceChildren(this.listEl, h('p', { class: 'muted' }, `Nincs találat erre: „${query}”.`));
    } else {
      replaceChildren(
        this.listEl,
        h(
          'p',
          { class: 'muted', style: 'font-size:13px;margin:0 0 8px' },
          'Jelölj ki 2–3 telket az összehasonlításhoz.',
        ),
        h(
          'ul',
          { class: 'list' },
          shown.map((s) => this.item(s, selected.includes(s.id))),
        ),
      );
    }
    this.compareBar.classList.toggle('hidden', selected.length === 0);
    replaceChildren(
      this.compareBar,
      h(
        'button',
        {
          class: 'btn btn-primary',
          style: 'flex:1',
          disabled: selected.length < 2,
          onclick: () => void this.compare(),
        },
        svg(icons.compare),
        selected.length < 2
          ? `Még ${2 - selected.length} telek kell`
          : `Összehasonlítás (${selected.length})`,
      ),
      h('button', { class: 'btn', onclick: () => projects.patch({ selected: [] }) }, 'Kijelölés törlése'),
    );
  }

  private item(s: ParcelSummary, selected: boolean): HTMLElement {
    const check = h('input', {
      type: 'checkbox',
      checked: selected,
      'aria-label': `${s.name} kijelölése összehasonlításhoz`,
      style: 'width:24px;height:24px;flex:none;accent-color:var(--c-primary)',
      onchange: () => {
        if (!toggleSelected(s.id)) {
          check.checked = false;
          toast('Legfeljebb 3 telek hasonlítható össze egyszerre.');
        }
      },
    }) as HTMLInputElement;
    return h(
      'li',
      { class: 'list-item' },
      check,
      s.verdict ? lampEl(s.verdict) : h('span', { class: 'lamp na', title: 'nincs elemzés' }),
      h(
        'button',
        {
          class: 'grow',
          style:
            'text-align:left;background:none;border:0;padding:0;color:inherit;font:inherit;cursor:pointer;min-height:44px',
          onclick: () => void this.open(s.id),
        },
        h('div', { class: 'title' }, s.name),
        h(
          'div',
          { class: 'sub' },
          [
            s.areaM2 !== null ? fmtArea(s.areaM2) : 'nincs elemezve',
            fmtDate(s.updatedAt),
            s.photoCount ? `${s.photoCount} fotó` : '',
          ]
            .filter(Boolean)
            .join(' · '),
        ),
        s.tags.length || s.mode === 'demo'
          ? h(
              'div',
              null,
              s.mode === 'demo'
                ? h('span', { class: 'chip', style: 'background:var(--c-demo);color:#fff' }, 'demó')
                : null,
              s.tags.map((t) => h('span', { class: 'chip' }, t)),
            )
          : null,
      ),
      h(
        'button',
        {
          class: 'btn btn-ghost btn-icon',
          'aria-label': `${s.name} műveletek`,
          onclick: () => void this.menu(s),
        },
        svg(icons.menu),
      ),
    );
  }

  private async open(id: string): Promise<void> {
    const p = await loadProject(id);
    if (!p) {
      toast('A telek nem található (lehet, hogy törölték).', 'error');
      void refreshProjects();
      return;
    }
    if (p.analysis) p.analysis = rescore(p.analysis, settings.get().rules);
    this.handlers.open(p);
  }

  private async menu(s: ParcelSummary): Promise<void> {
    const v = await dialog({
      title: s.name,
      body: h(
        'p',
        { class: 'muted' },
        `Létrehozva: ${fmtDate(s.createdAt)} · módosítva: ${fmtDate(s.updatedAt)}`,
      ),
      actions: [
        { label: 'Törlés', value: 'delete', kind: 'danger' },
        ...(this.handlers.exportParcel ? [{ label: 'Exportálás', value: 'export' }] : []),
        { label: 'Szerkesztés', value: 'edit' },
        { label: 'Megnyitás', value: 'open', kind: 'primary' as const },
      ],
    });
    if (v === 'open') return this.open(s.id);
    if (v === 'delete') {
      if (
        await confirmDialog(
          'Telek törlése',
          `Biztosan törlöd: „${s.name}”? A fotók és az elemzés is törlődik.`,
          'Törlés',
          true,
        )
      ) {
        await deleteProject(s.id);
        toast('Telek törölve.');
      }
      return;
    }
    const p = await loadProject(s.id);
    if (!p) return;
    if (v === 'export') this.handlers.exportParcel?.(p);
    if (v === 'edit') {
      const meta = await editParcelMeta({ name: p.name, note: p.note, tags: p.tags });
      if (meta) await saveProject({ ...p, ...meta, updatedAt: new Date().toISOString() });
    }
  }

  private async compare(): Promise<void> {
    const ids = projects.get().selected;
    const parcels = (await Promise.all(ids.map((id) => loadProject(id)))).filter((p): p is Parcel => !!p);
    const rules = settings.get().rules;
    for (const p of parcels) if (p.analysis) p.analysis = rescore(p.analysis, rules);
    const notAnalyzed = parcels.filter((p) => !p.analysis).map((p) => p.name);
    const cmp = buildComparison(parcels);
    const table = h(
      'table',
      { class: 'compare-table' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', null, 'Mutató'),
          cmp.columns.map((c) =>
            h(
              'th',
              null,
              h('div', { style: 'display:flex;gap:6px;align-items:center' }, lampEl(c.verdict), c.name),
              c.demo
                ? h('span', { class: 'chip', style: 'background:var(--c-demo);color:#fff' }, 'demó')
                : null,
            ),
          ),
        ),
      ),
      h(
        'tbody',
        null,
        h(
          'tr',
          null,
          h('td', null, h('b', null, 'Ítélet')),
          cmp.columns.map((c) =>
            h('td', null, h('b', null, OVERALL_TITLE[c.verdict].replace('Előszűrés: ', ''))),
          ),
        ),
        cmp.rows.flatMap((r) => [
          r.section
            ? h('tr', { class: 'section' }, h('th', { colspan: String(cmp.columns.length + 1) }, r.section))
            : null,
          h(
            'tr',
            null,
            h('td', { class: 'muted' }, r.label),
            r.cells.map((c) =>
              h(
                'td',
                { style: c.best ? 'background:var(--c-accent-soft);font-weight:700' : '' },
                c.lamp
                  ? h(
                      'span',
                      { style: 'display:inline-flex;gap:6px;align-items:flex-start' },
                      lampEl(c.lamp),
                      c.text,
                    )
                  : c.text,
              ),
            ),
          ),
        ]),
      ),
    );
    await dialog({
      title: 'Összehasonlítás',
      body: h(
        'div',
        null,
        notAnalyzed.length
          ? h(
              'div',
              { class: 'banner warn' },
              svg(icons.warn),
              h(
                'span',
                null,
                `Elemzés nélkül: ${notAnalyzed.join(', ')} – nyisd meg és futtasd az elemzést.`,
              ),
            )
          : null,
        h(
          'p',
          { class: 'muted', style: 'font-size:13px' },
          `Szabályrendszer: ${rules.name}. Kiemelve a legjobb érték.`,
        ),
        h('div', { class: 'compare-scroll' }, table),
      ),
      actions: [{ label: 'Bezárás', value: 'close', kind: 'primary' }],
      dismissValue: 'close',
    });
  }
}
