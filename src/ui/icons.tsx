import type { ReactNode } from 'react';

const P = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

export const Icon = {
  back: P(<path d="M9 6l6 6-6 6" />),
  close: P(<path d="M6 6l12 12M18 6L6 18" />),
  play: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 001.5.86l10.5-6.5a1 1 0 000-1.72L9.5 4.64A1 1 0 008 5.5z" fill="currentColor" /></svg>
  ),
  pause: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" /></svg>
  ),
  undo: P(<><path d="M15 7h-5a5 5 0 000 10h6" /><path d="M18 7l-3-3M18 7l-3 3" /></>),
  redo: P(<><path d="M9 7h5a5 5 0 010 10H8" /><path d="M6 7l3-3M6 7l3 3" /></>),
  text: P(<><path d="M4 6h16M4 12h10M4 18h13" /></>),
  mic: P(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></>),
  captions: P(<><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7 15h4M13 15h4M7 11h10" /></>),
  palette: P(<><path d="M12 3a9 9 0 100 18c1.1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5s.8-1.5 2-1.5H17a4 4 0 004-4c0-4.7-4-8.5-9-8.5z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="14.5" cy="7" r="1" /></>),
  font: P(<><path d="M5 19L11 5h2l6 14M8 14h8" /></>),
  logo: P(<><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M8 15l3-4 2 2.5 2-2.5 2 4" /><circle cx="9" cy="8.5" r="1.3" /></>),
  trim: P(<><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M8.5 7.5L20 18M8.5 16.5L20 6" /></>),
  silence: P(<><path d="M3 12h3l2-5 3 10 2-5h3" /><path d="M18 9l3 6M21 9l-3 6" /></>),
  filler: P(<><path d="M4 7h10M4 12h7M4 17h10" /><path d="M16 10l4 4M20 10l-4 4" /></>),
  aspect: P(<><rect x="6" y="3" width="12" height="18" rx="2" /><rect x="2" y="8" width="20" height="8" rx="2" opacity=".5" /></>),
  export: P(<><path d="M12 15V3M7 8l5-5 5 5" /><path d="M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" /></>),
  brand: P(<><path d="M12 3l2.6 5.6L20 9.3l-4 4 1 5.7-5-2.8-5 2.8 1-5.7-4-4 5.4-.7z" /></>),
  book: P(<><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z" /><path d="M4 21V5M8 7h7" /></>),
  gear: P(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>),
  wand: P(<><path d="M15 4V2M15 10V8M11 6h2M17 6h2M4 20l10-10" /><path d="M18.5 9.5l1 1M18.5 2.5l1-1" /></>),
  music: P(<><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>),
  film: P(<><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4" /></>),
  check: P(<path d="M5 12l5 5 9-10" />),
  trash: P(<><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>),
  plus: P(<path d="M12 5v14M5 12h14" />),
  upload: P(<><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 20h16" /></>),
  star: P(<path d="M12 3l2.6 5.6L20 9.3l-4 4 1 5.7-5-2.8-5 2.8 1-5.7-4-4 5.4-.7z" />),
  restore: P(<><path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8" /><path d="M3 3v5h5" /></>),
  cover: P(<><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 16l5-5 4 4 3-3 6 6" /></>),
};
