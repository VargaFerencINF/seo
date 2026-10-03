/** Engedélykérés előtti magyarázó képernyők (helymeghatározás, kamera). */
import { dialog } from './feedback';
import { icons } from './icons';
import { settings } from '../state/settings';
import { h } from './dom';

export async function explainLocation(): Promise<boolean> {
  if (settings.get().explainedLocation) return true;
  const v = await dialog({
    title: 'Helymeghatározás',
    icon: icons.locate,
    body: h(
      'div',
      null,
      h('p', null, 'A Teleklátó a telefon GPS-ét használja:'),
      h(
        'ul',
        { style: 'padding-left:18px;margin:0 0 8px' },
        h('li', null, 'a saját pozíciód megjelenítéséhez a térképen,'),
        h('li', null, 'a telek bejárásához (sarokpontok rögzítése),'),
        h('li', null, 'a terepi fotók helyének rögzítéséhez.'),
      ),
      h(
        'p',
        { class: 'muted' },
        'A helyadat csak a telefonon marad, sehová nem küldjük el. Csak akkor kérjük, amikor használod.',
      ),
    ),
    actions: [
      { label: 'Most nem', value: 'no', kind: 'ghost' },
      { label: 'Tovább az engedélyhez', value: 'ok', kind: 'primary' },
    ],
  });
  if (v === 'ok') settings.patch({ explainedLocation: true });
  return v === 'ok';
}

export async function explainCamera(): Promise<boolean> {
  if (settings.get().explainedCamera) return true;
  const v = await dialog({
    title: 'Kamera',
    icon: icons.camera,
    body: h(
      'div',
      null,
      h(
        'p',
        null,
        'Terepi fotókat készíthetsz a telekről; a fotóhoz a GPS-pozíciót és a kamera irányát is elmentjük, és a riportban megjelenik.',
      ),
      h('p', { class: 'muted' }, 'A fotók az app saját tárhelyén maradnak, a galériába nem kerülnek.'),
    ),
    actions: [
      { label: 'Most nem', value: 'no', kind: 'ghost' },
      { label: 'Tovább az engedélyhez', value: 'ok', kind: 'primary' },
    ],
  });
  if (v === 'ok') settings.patch({ explainedCamera: true });
  return v === 'ok';
}
