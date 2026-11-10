import type { BrandKit, Project } from '../core/types';

/** "החל את המיתוג שלי": caption style + default logo in one undoable step. */
export function applyBrand(p: Project, b: BrandKit): Project {
  const next = { ...p };
  if (b.captionStyle) next.captionStyle = { ...b.captionStyle };
  const { logoId, ...placement } = b.defaultLogo;
  if (logoId && b.logos.some((l) => l.id === logoId)) next.logo = { logoId, ...placement };
  return next;
}
