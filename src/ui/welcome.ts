/** Első indításkori üdvözlés: rövid bemutatás és módválasztás (demó / élő). */
import { h } from './dom';
import { dialog } from './feedback';
import { icons } from './icons';
import { settings } from '../state/settings';

export async function welcome(): Promise<void> {
  if (settings.get().welcomed) return;
  const v = await dialog({
    title: 'Üdvözöl a Teleklátó',
    icon: icons.parcel,
    body: h(
      'div',
      null,
      h(
        'p',
        null,
        'Jelölj ki egy telket – rajzolva, GPS-szel bejárva, fájlból vagy koordinátákkal –, és az app előszűrési riportot készít:',
      ),
      h(
        'ul',
        { style: 'padding-left:18px;margin:0 0 10px' },
        h('li', null, 'domborzat, lejtés, kitettség, terepmetszet'),
        h('li', null, 'Natura 2000 és árvízveszély'),
        h('li', null, 'út, légvezeték, vízfolyás, épületek közelsége'),
        h('li', null, 'napelem-hozam, összesített lámpás értékelés, PDF'),
      ),
      h(
        'p',
        { class: 'muted', style: 'font-size:14px' },
        'A Demó mód internet nélkül, szimulált tájon mutatja be az egészet – prezentációhoz ideális. Később a Beállításokban bármikor válthatsz.',
      ),
    ),
    actions: [
      { label: 'Élő adatokkal', value: 'live', kind: 'ghost' },
      { label: 'Demó kipróbálása', value: 'demo', kind: 'accent' },
    ],
    dismissValue: 'live',
  });
  settings.patch({ welcomed: true, ...(v === 'demo' ? { demoMode: true } : {}) });
}
