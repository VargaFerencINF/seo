import { h, svg } from './dom';
import { icons } from './icons';

let host: HTMLElement | null = null;

export function toast(message: string, kind: 'info' | 'error' = 'info', ms = 3800): void {
  if (!host) {
    host = h('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(host);
  }
  const el = h(
    'div',
    {
      class: `toast ${kind === 'error' ? 'error' : ''}`,
      role: kind === 'error' ? 'alert' : 'status',
      onclick: () => el.remove(),
    },
    message,
  );
  host.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function clearToasts(): void {
  host?.replaceChildren();
}

export interface DialogOptions {
  title: string;
  /** tartalom; függvény esetén a `close` hívásával a törzsből is zárható */
  body?: Node | string | ((close: (value: string) => void) => Node);
  icon?: string;
  actions: { label: string; kind?: 'primary' | 'accent' | 'danger' | 'ghost'; value: string }[];
  dismissValue?: string;
}

/** Modális dialógus; a választott gomb `value`-jával tér vissza. */
export function dialog(opts: DialogOptions): Promise<string> {
  return new Promise((resolve) => {
    const close = (value: string) => {
      scrim.remove();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(opts.dismissValue ?? 'cancel');
    };
    const box = h(
      'div',
      { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title },
      opts.icon ? svg(opts.icon, 'dialog-icon') : null,
      h('h2', null, opts.title),
      typeof opts.body === 'string'
        ? h('p', null, opts.body)
        : typeof opts.body === 'function'
          ? opts.body((v) => close(v))
          : (opts.body ?? null),
      h(
        'div',
        { class: 'dialog-actions' },
        opts.actions.map((a) =>
          h(
            'button',
            { class: `btn ${a.kind ? `btn-${a.kind}` : ''}`, onclick: () => close(a.value) },
            a.label,
          ),
        ),
      ),
    );
    const scrim = h('div', {
      class: 'dialog-scrim',
      onclick: (e: Event) => {
        if (e.target === scrim) close(opts.dismissValue ?? 'cancel');
      },
    });
    scrim.appendChild(box);
    document.body.appendChild(scrim);
    document.addEventListener('keydown', onKey);
    box.querySelector<HTMLButtonElement>('.dialog-actions .btn:last-child')?.focus();
  });
}

export async function confirmDialog(title: string, body: string, okLabel = 'Rendben', danger = false) {
  const v = await dialog({
    title,
    body,
    actions: [
      { label: 'Mégse', value: 'cancel', kind: 'ghost' },
      { label: okLabel, value: 'ok', kind: danger ? 'danger' : 'primary' },
    ],
  });
  return v === 'ok';
}

/** Egyszerű szövegbekérő dialógus */
export async function promptDialog(title: string, label: string, initial = ''): Promise<string | null> {
  const input = h('input', { type: 'text', value: initial, 'aria-label': label });
  const body = h('div', { class: 'field' }, h('label', null, label), input);
  setTimeout(() => input.focus(), 50);
  const v = await dialog({
    title,
    body,
    actions: [
      { label: 'Mégse', value: 'cancel', kind: 'ghost' },
      { label: 'OK', value: 'ok', kind: 'primary' },
    ],
  });
  return v === 'ok' ? input.value.trim() : null;
}

export { icons };
