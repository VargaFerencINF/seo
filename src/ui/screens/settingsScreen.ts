import { h, replaceChildren, svg } from '../dom';
import { icons } from '../icons';
import { settings, type ThemePref, DEFAULT_SETTINGS } from '../../state/settings';
import { APP_NAME, APP_VERSION, LEGAL_NOTICE, SOURCES } from '../../config';
import { RULE_PRESETS, cloneRules, DEFAULT_RULES } from '../../analysis/rules';
import { RULE_META, sanitizeRules } from '../../analysis/ruleMeta';
import { confirmDialog, toast } from '../feedback';
import { saveAndShare } from '../../native/files';
import { cacheClear, cacheStats } from '../../storage/cache';
import { makeThumb } from '../../native/camera';
import type { Lamp, RuleSet } from '../../types';
import type { Screen } from '../shell';

function card(title: string, ...children: (Node | null)[]): HTMLElement {
  return h('div', { class: 'card' }, h('h2', null, title), ...children);
}

function numberField(
  label: string,
  value: number,
  step: number,
  onChange: (v: number) => void,
  hint?: string,
): HTMLElement {
  const input = h('input', {
    type: 'number',
    value: String(value),
    step: String(step),
    inputmode: 'decimal',
    onchange: () => {
      const v = Number(input.value.replace(',', '.'));
      if (Number.isFinite(v)) onChange(v);
      else input.value = String(value);
    },
  }) as HTMLInputElement;
  return h(
    'div',
    { class: 'field' },
    h('label', null, label),
    input,
    hint ? h('span', { class: 'hint' }, hint) : null,
  );
}

function switchRow(
  label: string,
  sub: string,
  checked: boolean,
  onChange: (v: boolean) => void,
): HTMLElement {
  const input = h('input', {
    type: 'checkbox',
    class: 'switch',
    checked,
    'aria-label': label,
    onchange: () => onChange(input.checked),
  }) as HTMLInputElement;
  return h(
    'label',
    { class: 'switch-row' },
    h('span', { class: 'switch-text' }, label, h('small', null, sub)),
    input,
  );
}

export class SettingsScreen implements Screen {
  readonly id = 'settings' as const;
  readonly el: HTMLElement;
  private body: HTMLElement;
  private rulesBody: HTMLElement;
  private cacheInfo = h('span', { class: 'muted' }, '…');
  private rulesFile: HTMLInputElement;
  private logoFile: HTMLInputElement;

  constructor() {
    this.body = h('div');
    this.rulesBody = h('div');
    this.rulesFile = h('input', {
      type: 'file',
      accept: '.json,application/json',
      class: 'hidden',
      onchange: () => void this.importRules(),
    }) as HTMLInputElement;
    this.logoFile = h('input', {
      type: 'file',
      accept: 'image/png,image/jpeg',
      class: 'hidden',
      onchange: () => void this.importLogo(),
    }) as HTMLInputElement;
    this.el = h(
      'section',
      { 'aria-label': 'Beállítások' },
      h(
        'div',
        { class: 'screen-scroll' },
        h('div', { class: 'screen-header' }, h('h1', null, 'Beállítások')),
        this.body,
      ),
      this.rulesFile,
      this.logoFile,
    );
    this.render();
    settings.subscribe((s, prev) => {
      if (s.rules !== prev.rules) this.renderRules();
      if (s.demoMode !== prev.demoMode || s.theme !== prev.theme || s.companyLogo !== prev.companyLogo)
        this.render();
    });
  }

  onShow(): void {
    void cacheStats().then((s) => (this.cacheInfo.textContent = `${s.count} tárolt lekérdezés`));
  }

  private render(): void {
    const s = settings.get();
    const themeBtns = (['system', 'light', 'dark'] as ThemePref[]).map((t) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(s.theme === t),
          onclick: () => settings.patch({ theme: t }),
        },
        { system: 'Rendszer', light: 'Világos', dark: 'Sötét' }[t],
      ),
    );
    this.renderRules();
    replaceChildren(
      this.body,
      card(
        'Működés',
        switchRow(
          'Demó mód',
          'Szimulált terep és rétegek internet nélkül, prezentációhoz. Mindig jelölve a felületen és a riportban.',
          s.demoMode,
          (v) => settings.patch({ demoMode: v }),
        ),
      ),
      card('Megjelenés', h('div', { class: 'segmented', role: 'group', 'aria-label': 'Téma' }, themeBtns)),
      card(
        'Riport fejléce',
        h(
          'div',
          { class: 'field' },
          h('label', null, 'Cégnév'),
          h('input', {
            type: 'text',
            value: s.companyName,
            maxlength: 80,
            placeholder: 'pl. Példa Építész Iroda Kft.',
            onchange: (e: Event) =>
              settings.patch({ companyName: (e.target as HTMLInputElement).value.trim() }),
          }),
        ),
        h(
          'div',
          { class: 'field' },
          h('span', { class: 'label' }, 'Logó (PNG vagy JPEG)'),
          s.companyLogo
            ? h('img', {
                src: s.companyLogo,
                alt: 'Cég logója',
                style:
                  'max-height:56px;max-width:200px;object-fit:contain;background:#fff;border-radius:6px;padding:4px',
              })
            : h('span', { class: 'muted' }, 'Nincs logó.'),
          h(
            'div',
            { class: 'btn-row' },
            h(
              'button',
              { class: 'btn', onclick: () => this.logoFile.click() },
              svg(icons.import),
              'Logó kiválasztása',
            ),
            s.companyLogo
              ? h(
                  'button',
                  { class: 'btn btn-danger', onclick: () => settings.patch({ companyLogo: '' }) },
                  svg(icons.trash),
                  'Törlés',
                )
              : null,
          ),
        ),
      ),
      card('Szabályrendszer (lámpák küszöbei)', this.rulesBody),
      card(
        'Terepi bejárás',
        numberField(
          'Figyelmeztetés e pontosság felett (m)',
          s.gpsWarnAccuracyM,
          1,
          (v) => settings.patch({ gpsWarnAccuracyM: Math.max(1, Math.min(100, v)) }),
          'Gyenge GPS-jelnél megerősítést kér a pontrögzítés előtt.',
        ),
        numberField('Automatikus pontrögzítés (m-enként, 0 = ki)', s.gpsAutoStepM, 5, (v) =>
          settings.patch({ gpsAutoStepM: Math.max(0, Math.min(200, Math.round(v))) }),
        ),
      ),
      card(
        'Napelem-számítás',
        numberField(
          'Rendszerveszteség (%)',
          s.pvLossPct,
          1,
          (v) => settings.patch({ pvLossPct: Math.max(0, Math.min(50, v)) }),
          'PVGIS alapérték: 14 %.',
        ),
      ),
      card(
        'Adatok és gyorsítótár',
        h(
          'p',
          null,
          'A letöltött domborzati, közelségi, Natura és napelem-adatok gyorsítótárban maradnak, így a már elemzett telkek offline is újraelemezhetők. ',
          this.cacheInfo,
        ),
        h(
          'button',
          {
            class: 'btn btn-danger',
            onclick: async () => {
              if (
                await confirmDialog(
                  'Gyorsítótár ürítése',
                  'A mentett telkek megmaradnak, de az offline újraelemzéshez újra le kell tölteni az adatokat.',
                  'Ürítés',
                  true,
                )
              ) {
                await cacheClear();
                this.onShow();
                toast('Gyorsítótár ürítve.');
              }
            },
          },
          svg(icons.trash),
          'Gyorsítótár ürítése',
        ),
      ),
      card(
        'Adatforrások és licencek',
        h(
          'ul',
          { style: 'padding-left:18px;margin:0;font-size:14px' },
          Object.values(SOURCES)
            .filter((x) => x.id !== 'demo')
            .map((x) =>
              h(
                'li',
                { style: 'margin-bottom:6px' },
                h('b', null, x.label),
                h('br'),
                h('span', { class: 'muted' }, x.attribution),
              ),
            ),
          h(
            'li',
            null,
            h('b', null, 'Betűtípus: Barlow'),
            h('br'),
            h('span', { class: 'muted' }, '© The Barlow Project Authors, SIL Open Font License 1.1'),
          ),
        ),
      ),
      card('Jogi nyilatkozat', h('p', { class: 'muted', style: 'font-size:14px' }, LEGAL_NOTICE)),
      h(
        'div',
        { class: 'btn-row', style: 'margin-bottom:12px' },
        h(
          'button',
          {
            class: 'btn',
            onclick: async () => {
              if (
                await confirmDialog(
                  'Alapbeállítások',
                  'Minden beállítás (szabályok, cégadatok) visszaáll. A mentett telkek megmaradnak.',
                  'Visszaállítás',
                  true,
                )
              )
                settings.set({
                  ...DEFAULT_SETTINGS,
                  rules: cloneRules(DEFAULT_RULES),
                  explainedCamera: s.explainedCamera,
                  explainedLocation: s.explainedLocation,
                });
            },
          },
          'Beállítások visszaállítása',
        ),
      ),
      h('p', { class: 'muted' }, `${APP_NAME} ${APP_VERSION}`),
    );
  }

  private setRules(fn: (r: RuleSet) => void): void {
    const r = cloneRules(settings.get().rules);
    fn(r);
    settings.patch({ rules: r });
  }

  private renderRules(): void {
    const r = settings.get().rules;
    const presetSel = h(
      'select',
      {
        'aria-label': 'Előre definiált szabályrendszer',
        onchange: async () => {
          const p = RULE_PRESETS[Number(presetSel.value)];
          presetSel.value = '';
          if (
            p &&
            (await confirmDialog(
              'Szabályrendszer betöltése',
              `A jelenlegi küszöbök helyére a(z) „${p.name}” profil kerül.`,
              'Betöltés',
            ))
          )
            settings.patch({ rules: cloneRules(p) });
        },
      },
      h('option', { value: '' }, 'Profil betöltése…'),
      RULE_PRESETS.map((p, i) => h('option', { value: String(i) }, p.name)),
    ) as HTMLSelectElement;
    presetSel.value = '';

    const rows = RULE_META.map((m) => {
      const rule = r[m.key];
      const num = (which: 'green' | 'yellow') => {
        const input = h('input', {
          type: 'number',
          value: String(rule[which]),
          step: String(m.step),
          inputmode: 'decimal',
          'aria-label': `${m.label} ${which === 'green' ? 'zöld' : 'sárga'} küszöb`,
          disabled: !rule.enabled,
          onchange: () => {
            const v = Number(input.value.replace(',', '.'));
            if (!Number.isFinite(v)) {
              input.value = String(rule[which]);
              return;
            }
            this.setRules((x) => {
              x[m.key][which] = v;
            });
          },
        }) as HTMLInputElement;
        return input;
      };
      const en = h('input', {
        type: 'checkbox',
        class: 'switch',
        checked: rule.enabled,
        'aria-label': `${m.label} figyelembevétele`,
        onchange: () => this.setRules((x) => (x[m.key].enabled = en.checked)),
      }) as HTMLInputElement;
      const sign = m.better === 'lower' ? '≤' : '≥';
      const order =
        (m.better === 'lower' && rule.green > rule.yellow) ||
        (m.better === 'higher' && rule.green < rule.yellow);
      return h(
        'div',
        { style: 'border-bottom:1px solid var(--c-line);padding:10px 0' },
        h(
          'div',
          { class: 'switch-row', style: 'padding:0' },
          h(
            'span',
            { class: 'switch-text' },
            h('b', null, m.label),
            h('small', null, `${m.help} (${m.unit})`),
          ),
          en,
        ),
        h(
          'div',
          { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px' },
          h(
            'label',
            { class: 'field', style: 'margin:0' },
            h('span', { class: 'label' }, h('span', { class: 'lamp green' }), ` zöld, ha ${sign}`),
            num('green'),
          ),
          h(
            'label',
            { class: 'field', style: 'margin:0' },
            h('span', { class: 'label' }, h('span', { class: 'lamp yellow' }), ` sárga, ha ${sign}`),
            num('yellow'),
          ),
        ),
        order
          ? h(
              'div',
              { class: 'banner warn', style: 'margin-top:6px' },
              'A zöld küszöb szigorúbb kell legyen a sárgánál.',
            )
          : null,
      );
    });

    const crossSel = h(
      'select',
      {
        'aria-label': 'Légvezeték-keresztezés lámpája',
        onchange: () => this.setRules((x) => (x.powerCrossingLamp = crossSel.value as Lamp)),
      },
      (['yellow', 'red'] as Lamp[]).map((l) =>
        h('option', { value: l, selected: r.powerCrossingLamp === l }, l === 'yellow' ? 'sárga' : 'piros'),
      ),
    ) as HTMLSelectElement;

    const nameInput = h('input', {
      type: 'text',
      value: r.name,
      maxlength: 80,
      onchange: () => this.setRules((x) => (x.name = nameInput.value.trim() || x.name)),
    }) as HTMLInputElement;

    replaceChildren(
      this.rulesBody,
      h(
        'p',
        { class: 'muted', style: 'font-size:14px' },
        'A cég saját szabályrendszere: a küszöbök minden elemzésre és a mentett telkek újrapontozására is érvényesek. Piros: a sárga küszöbön túl.',
      ),
      h('div', { class: 'field' }, h('label', null, 'Szabályrendszer neve'), nameInput),
      h('div', { class: 'field' }, presetSel),
      rows,
      h(
        'div',
        { class: 'field', style: 'margin-top:10px' },
        h('label', null, 'Ha légvezeték keresztezi a telket'),
        crossSel,
      ),
      h(
        'div',
        { class: 'btn-row' },
        h(
          'button',
          { class: 'btn', onclick: () => void this.exportRules() },
          svg(icons.export),
          'Exportálás',
        ),
        h('button', { class: 'btn', onclick: () => this.rulesFile.click() }, svg(icons.import), 'Importálás'),
        h(
          'button',
          {
            class: 'btn btn-ghost',
            onclick: async () => {
              if (
                await confirmDialog(
                  'Alapértékek',
                  'Az alapértelmezett szabályrendszer kerül vissza.',
                  'Visszaállítás',
                )
              )
                settings.patch({ rules: cloneRules(DEFAULT_RULES) });
            },
          },
          'Alapértékek',
        ),
      ),
    );
  }

  private async exportRules(): Promise<void> {
    const r = settings.get().rules;
    const json = JSON.stringify({ format: 'teleklato-rules', version: 1, ...r }, null, 2);
    try {
      await saveAndShare(
        'teleklato-szabalyrendszer.json',
        json,
        'application/json',
        'Teleklátó szabályrendszer',
      );
    } catch (err) {
      toast(`Az exportálás nem sikerült: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }

  private async importRules(): Promise<void> {
    const f = this.rulesFile.files?.[0];
    this.rulesFile.value = '';
    if (!f) return;
    try {
      const { rules, warnings } = sanitizeRules(JSON.parse(await f.text()));
      settings.patch({ rules });
      toast(['Szabályrendszer betöltve.', ...warnings].join(' '), warnings.length ? 'error' : 'info', 7000);
    } catch {
      toast('A fájl nem érvényes szabályrendszer (JSON).', 'error');
    }
  }

  private async importLogo(): Promise<void> {
    const f = this.logoFile.files?.[0];
    this.logoFile.value = '';
    if (!f) return;
    try {
      const url = await makeThumb(f, 600, 0.9);
      settings.patch({ companyLogo: url });
    } catch {
      toast('A kép nem olvasható. PNG vagy JPEG fájlt válassz.', 'error');
    }
  }
}
