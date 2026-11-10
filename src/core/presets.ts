import type { CaptionStyle } from './types';

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  presetId: 'professional',
  fontId: 'heebo-bold',
  fontScale: 0.062,
  textColor: '#FFFFFF',
  highlightMode: 'none',
  highlightColor: '#FFD60A',
  highlightTextColor: '#111111',
  emphasisColor: '#FFD60A',
  strokeColor: '#000000',
  strokeWidth: 0,
  shadow: true,
  shadowColor: '#000000',
  background: false,
  backgroundColor: '#000000',
  backgroundOpacity: 0.55,
  positionY: 0.78,
  maxWidth: 0.86,
  lineHeight: 1.18,
  letterSpacing: 0,
  display: 'lines',
  maxCharsPerLine: 28,
  maxLines: 2,
  chunkWords: 3,
  animation: 'fade',
};

export interface CaptionPreset {
  id: string;
  name: string;
  description: string;
  style: Partial<CaptionStyle>;
}

export const CAPTION_PRESETS: CaptionPreset[] = [
  {
    id: 'minimal',
    name: 'מינימליסטי',
    description: 'טקסט לבן נקי עם צל עדין',
    style: {
      fontId: 'heebo-regular', fontScale: 0.052, shadow: true, strokeWidth: 0, background: false,
      highlightMode: 'none', display: 'lines', animation: 'fade', maxCharsPerLine: 32,
    },
  },
  {
    id: 'professional',
    name: 'מקצועי',
    description: 'רקע כהה חצי שקוף, קריא בכל סרטון',
    style: {
      fontId: 'assistant-bold', fontScale: 0.056, shadow: false, strokeWidth: 0, background: true,
      backgroundColor: '#000000', backgroundOpacity: 0.6, highlightMode: 'none', display: 'lines',
      animation: 'fade', textColor: '#FFFFFF',
    },
  },
  {
    id: 'luxury',
    name: 'יוקרתי',
    description: 'פונט סריף אלגנטי בגוון זהב',
    style: {
      fontId: 'frank-ruhl-bold', fontScale: 0.06, textColor: '#F5E6C8', shadow: true, strokeWidth: 0,
      background: false, highlightMode: 'color', highlightColor: '#D4AF37', display: 'lines',
      animation: 'fade', letterSpacing: 0.02,
    },
  },
  {
    id: 'colorful',
    name: 'צבעוני',
    description: 'מילה נוכחית בצבע, קו מתאר עבה',
    style: {
      fontId: 'rubik-black', fontScale: 0.07, textColor: '#FFFFFF', strokeColor: '#000000', strokeWidth: 0.12,
      shadow: false, background: false, highlightMode: 'color', highlightColor: '#3DF2A0', emphasisColor: '#FF5DA2',
      display: 'karaoke', animation: 'pop', maxCharsPerLine: 20,
    },
  },
  {
    id: 'young',
    name: 'צעיר',
    description: 'פונט עגול ושמח עם הדגשה ורודה',
    style: {
      fontId: 'fredoka-bold', fontScale: 0.072, textColor: '#FFFFFF', strokeColor: '#2B0A3D', strokeWidth: 0.1,
      shadow: false, background: false, highlightMode: 'color', highlightColor: '#FF5DA2', display: 'chunks',
      chunkWords: 3, animation: 'pop',
    },
  },
  {
    id: 'viral',
    name: 'ויראלי',
    description: 'מילה אחר מילה, גדול ובולט',
    style: {
      fontId: 'heebo-black', fontScale: 0.095, textColor: '#FFFFFF', strokeColor: '#000000', strokeWidth: 0.14,
      shadow: true, background: false, highlightMode: 'color', highlightColor: '#FFE600', display: 'single',
      animation: 'pop', positionY: 0.62,
    },
  },
  {
    id: 'social',
    name: 'סרטוני רשת',
    description: 'קופסה צבעונית מאחורי המילה הנאמרת',
    style: {
      fontId: 'rubik-bold', fontScale: 0.068, textColor: '#FFFFFF', strokeColor: '#000000', strokeWidth: 0.08,
      shadow: true, background: false, highlightMode: 'box', highlightColor: '#7C5CFF', highlightTextColor: '#FFFFFF',
      display: 'karaoke', animation: 'pop', maxCharsPerLine: 22, positionY: 0.7,
    },
  },
  {
    id: 'news',
    name: 'חדשותי',
    description: 'פס צהוב עם טקסט שחור',
    style: {
      fontId: 'noto-sans-semibold', fontScale: 0.054, textColor: '#111111', shadow: false, strokeWidth: 0,
      background: true, backgroundColor: '#FFD60A', backgroundOpacity: 1, highlightMode: 'none', display: 'lines',
      animation: 'slide', maxLines: 1, maxCharsPerLine: 34, positionY: 0.86,
    },
  },
  {
    id: 'bold-statement',
    name: 'הצהרה',
    description: 'פונט עבה בגזרה דחוסה',
    style: {
      fontId: 'karantina-bold', fontScale: 0.11, textColor: '#FFFFFF', strokeColor: '#000000', strokeWidth: 0.06,
      shadow: true, background: false, highlightMode: 'color', highlightColor: '#FF3B30', display: 'chunks',
      chunkWords: 2, animation: 'pop', positionY: 0.55,
    },
  },
  {
    id: 'handwritten',
    name: 'כתב יד',
    description: 'מראה אישי וקליל',
    style: {
      fontId: 'playpen-bold', fontScale: 0.06, textColor: '#FFFFFF', shadow: true, strokeWidth: 0,
      background: false, highlightMode: 'color', highlightColor: '#7AD7FF', display: 'karaoke', animation: 'fade',
    },
  },
];

export function applyPreset(base: CaptionStyle, presetId: string): CaptionStyle {
  const preset = CAPTION_PRESETS.find((p) => p.id === presetId);
  if (!preset) return base;
  // Start from defaults so a preset fully defines the look, but keep user's position choice.
  return { ...DEFAULT_CAPTION_STYLE, ...preset.style, presetId, positionY: preset.style.positionY ?? base.positionY };
}
