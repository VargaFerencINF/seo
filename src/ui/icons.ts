/** Egyszerű vonalas ikonok (24×24, stroke = currentColor). */
const s = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const icons = {
  map: s('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>'),
  folder: s('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>'),
  settings: s(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  ),
  layers: s('<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>'),
  plus: s('<path d="M12 5v14M5 12h14"/>'),
  minus: s('<path d="M5 12h14"/>'),
  locate: s(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/>',
  ),
  draw: s(
    '<path d="M4 20 8 6l7 3 5-5"/><circle cx="4" cy="20" r="1.5"/><circle cx="8" cy="6" r="1.5"/><circle cx="15" cy="9" r="1.5"/>',
  ),
  walk: s('<circle cx="13" cy="4" r="2"/><path d="m9 21 3-7 3 3v4M7 12l2-4 4 1 3 3M10 8l-1 6"/>'),
  import: s('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>'),
  export: s('<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 21h14"/>'),
  search: s('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  undo: s('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  check: s('<path d="m5 12 5 5 9-10"/>'),
  close: s('<path d="M6 6l12 12M18 6 6 18"/>'),
  trash: s('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  camera: s('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="4"/>'),
  pin: s('<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>'),
  play: s('<path d="M7 4v16l13-8z"/>'),
  stop: s('<rect x="6" y="6" width="12" height="12" rx="1"/>'),
  analyze: s('<path d="M3 20h18"/><path d="M5 16l4-6 4 3 6-8"/>'),
  pdf: s('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 14h6M9 17h4"/>'),
  share: s(
    '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
  ),
  save: s('<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>'),
  compare: s('<path d="M4 4h6v16H4zM14 8h6v12h-6z"/>'),
  edit: s('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  coords: s('<path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="3"/>'),
  info: s('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>'),
  warn: s('<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>'),
  wifiOff: s(
    '<path d="m3 3 18 18"/><path d="M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4.3-2.4M19 12.5a10 10 0 0 0-2.1-1.5M2 8.8a15 15 0 0 1 4.3-2.6M22 8.8A15 15 0 0 0 11 5"/><circle cx="12" cy="20" r="1"/>',
  ),
  profile: s('<path d="M3 18 8 10l4 4 4-7 5 11"/><path d="M3 21h18"/>'),
  sun: s(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  ),
  vertex: s('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>'),
  menu: s(
    '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
  ),
  parcel: s('<path d="M4 7 10 4l10 4-2 11-12 1z"/>'),
} as const;

export type IconName = keyof typeof icons;
