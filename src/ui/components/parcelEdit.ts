/** Telek adatainak szerkesztése: név, megjegyzés, címkék. */
import { h } from '../dom';
import { dialog } from '../feedback';

export interface ParcelMeta {
  name: string;
  note: string;
  tags: string[];
}

export function parseTags(s: string): string[] {
  return [
    ...new Set(
      s
        .split(/[,;#]/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ].slice(0, 12);
}

export async function editParcelMeta(
  initial: ParcelMeta,
  title = 'Telek adatai',
): Promise<ParcelMeta | null> {
  const name = h('input', { type: 'text', value: initial.name, maxlength: 120 }) as HTMLInputElement;
  const note = h('textarea', { rows: 3, maxlength: 2000 }) as HTMLTextAreaElement;
  note.value = initial.note;
  const tags = h('input', {
    type: 'text',
    value: initial.tags.join(', '),
    placeholder: 'pl. lakópark, ügyfél: Kovács Kft.',
  }) as HTMLInputElement;
  const v = await dialog({
    title,
    body: h(
      'div',
      null,
      h('div', { class: 'field' }, h('label', null, 'Név'), name),
      h('div', { class: 'field' }, h('label', null, 'Megjegyzés'), note),
      h(
        'div',
        { class: 'field' },
        h('label', null, 'Címkék'),
        tags,
        h('span', { class: 'hint' }, 'Vesszővel elválasztva.'),
      ),
    ),
    actions: [
      { label: 'Mégse', value: 'cancel', kind: 'ghost' },
      { label: 'Mentés', value: 'ok', kind: 'primary' },
    ],
  });
  if (v !== 'ok') return null;
  return { name: name.value.trim() || initial.name, note: note.value.trim(), tags: parseTags(tags.value) };
}
