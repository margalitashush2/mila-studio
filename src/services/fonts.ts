import { BUILTIN_FONTS, FONT_FILES, findFont, type FontDef } from '../core/fonts';
import type { CustomFont } from '../core/types';
import { db } from './db';

const loaded = new Set<string>();

/** Register all built-in fonts with @font-face (files load lazily when first used). */
export function registerBuiltinFonts() {
  const base = import.meta.env.BASE_URL;
  const css = Object.entries(FONT_FILES)
    .map(([family, file]) => `@font-face{font-family:"${family}";src:url("${base}fonts/${file}") format("truetype");font-display:swap;}`)
    .join('\n');
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

export async function ensureFont(family: string): Promise<void> {
  if (loaded.has(family)) return;
  try {
    await document.fonts.load(`32px "${family}"`, 'אבג abc');
    loaded.add(family);
  } catch {
    /* fall back silently to Heebo */
  }
}

export async function registerCustomFont(f: CustomFont): Promise<boolean> {
  if (loaded.has(f.family)) return true;
  const blob = await db.getBlob(f.blobKey);
  if (!blob) return false;
  try {
    const face = new FontFace(f.family, await blob.arrayBuffer());
    await face.load();
    document.fonts.add(face);
    loaded.add(f.family);
    return true;
  } catch {
    return false;
  }
}

export function customFontDefs(list: CustomFont[]): FontDef[] {
  return list.map((f) => ({ id: f.id, family: f.family, label: f.label, category: 'custom' as const }));
}

export function resolveFamily(fontId: string, custom: CustomFont[]): string {
  return findFont(fontId, customFontDefs(custom)).family;
}

export { BUILTIN_FONTS };
