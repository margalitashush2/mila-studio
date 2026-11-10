/**
 * Built-in Hebrew font catalog. All fonts are Google Fonts under the SIL Open Font License
 * and are served from /fonts and registered with the FontFace API.
 * `family` is the CSS font-family name used by both the preview and the export renderer.
 */
export type FontCategory = 'modern' | 'rounded' | 'bold' | 'elegant' | 'young' | 'custom';

export interface FontDef {
  id: string;
  family: string;
  label: string;
  category: FontCategory;
}

export const FONT_CATEGORIES: { id: FontCategory; label: string }[] = [
  { id: 'modern', label: 'מודרני' },
  { id: 'rounded', label: 'עגול' },
  { id: 'bold', label: 'עבה' },
  { id: 'elegant', label: 'אלגנטי' },
  { id: 'young', label: 'צעיר ודינמי' },
  { id: 'custom', label: 'הפונטים שלי' },
];

export const BUILTIN_FONTS: FontDef[] = [
  { id: 'heebo-regular', family: 'Heebo-Regular', label: 'חיבו', category: 'modern' },
  { id: 'heebo-bold', family: 'Heebo-Bold', label: 'חיבו מודגש', category: 'modern' },
  { id: 'assistant-bold', family: 'Assistant-Bold', label: 'אסיסטנט', category: 'modern' },
  { id: 'noto-sans-semibold', family: 'NotoSansHebrew-SemiBold', label: 'נוטו סאנס', category: 'modern' },
  { id: 'rubik-medium', family: 'Rubik-Medium', label: 'רוביק', category: 'modern' },
  { id: 'rubik-bold', family: 'Rubik-Bold', label: 'רוביק מודגש', category: 'modern' },
  { id: 'alef-bold', family: 'Alef-Bold', label: 'אלף', category: 'modern' },

  { id: 'varela-round', family: 'VarelaRound-Regular', label: 'ורלה עגול', category: 'rounded' },
  { id: 'fredoka-semibold', family: 'Fredoka-SemiBold', label: 'פרדוקה', category: 'rounded' },
  { id: 'fredoka-bold', family: 'Fredoka-Bold', label: 'פרדוקה מודגש', category: 'rounded' },

  { id: 'heebo-black', family: 'Heebo-Black', label: 'חיבו שחור', category: 'bold' },
  { id: 'rubik-black', family: 'Rubik-Black', label: 'רוביק שחור', category: 'bold' },
  { id: 'assistant-extrabold', family: 'Assistant-ExtraBold', label: 'אסיסטנט עבה', category: 'bold' },
  { id: 'secular-one', family: 'SecularOne-Regular', label: 'סקולר', category: 'bold' },
  { id: 'suez-one', family: 'SuezOne-Regular', label: 'סואץ', category: 'bold' },
  { id: 'karantina-bold', family: 'Karantina-Bold', label: 'קרנטינה', category: 'bold' },

  { id: 'frank-ruhl-bold', family: 'FrankRuhlLibre-Bold', label: 'פרנק ריהל', category: 'elegant' },
  { id: 'frank-ruhl-black', family: 'FrankRuhlLibre-Black', label: 'פרנק ריהל שחור', category: 'elegant' },
  { id: 'david-libre-bold', family: 'DavidLibre-Bold', label: 'דוד', category: 'elegant' },
  { id: 'bellefair', family: 'Bellefair-Regular', label: 'בלפייר', category: 'elegant' },
  { id: 'noto-serif-bold', family: 'NotoSerifHebrew-Bold', label: 'נוטו סריף', category: 'elegant' },
  { id: 'bona-nova-bold', family: 'BonaNova-Bold', label: 'בונה נובה', category: 'elegant' },
  { id: 'miriam-libre-bold', family: 'MiriamLibre-Bold', label: 'מרים', category: 'elegant' },

  { id: 'playpen-bold', family: 'PlaypenSansHebrew-Bold', label: 'פלייפן', category: 'young' },
  { id: 'playpen-extrabold', family: 'PlaypenSansHebrew-ExtraBold', label: 'פלייפן עבה', category: 'young' },
  { id: 'amatic-bold', family: 'AmaticSC-Bold', label: 'אמטיק', category: 'young' },
];

/** PostScript family -> font file in /public/fonts */
export const FONT_FILES: Record<string, string> = {
  'Heebo-Regular': 'Heebo_400Regular.ttf',
  'Heebo-Bold': 'Heebo_700Bold.ttf',
  'Heebo-Black': 'Heebo_900Black.ttf',
  'Assistant-Bold': 'Assistant_700Bold.ttf',
  'Assistant-ExtraBold': 'Assistant_800ExtraBold.ttf',
  'NotoSansHebrew-SemiBold': 'NotoSansHebrew_600SemiBold.ttf',
  'Rubik-Medium': 'Rubik_500Medium.ttf',
  'Rubik-Bold': 'Rubik_700Bold.ttf',
  'Rubik-Black': 'Rubik_900Black.ttf',
  'Alef-Bold': 'Alef_700Bold.ttf',
  'VarelaRound-Regular': 'VarelaRound_400Regular.ttf',
  'Fredoka-SemiBold': 'Fredoka_600SemiBold.ttf',
  'Fredoka-Bold': 'Fredoka_700Bold.ttf',
  'SecularOne-Regular': 'SecularOne_400Regular.ttf',
  'SuezOne-Regular': 'SuezOne_400Regular.ttf',
  'Karantina-Bold': 'Karantina_700Bold.ttf',
  'FrankRuhlLibre-Bold': 'FrankRuhlLibre_700Bold.ttf',
  'FrankRuhlLibre-Black': 'FrankRuhlLibre_900Black.ttf',
  'DavidLibre-Bold': 'DavidLibre_700Bold.ttf',
  'Bellefair-Regular': 'Bellefair_400Regular.ttf',
  'NotoSerifHebrew-Bold': 'NotoSerifHebrew_700Bold.ttf',
  'BonaNova-Bold': 'BonaNova_700Bold.ttf',
  'MiriamLibre-Bold': 'MiriamLibre_700Bold.ttf',
  'PlaypenSansHebrew-Bold': 'PlaypenSansHebrew_700Bold.ttf',
  'PlaypenSansHebrew-ExtraBold': 'PlaypenSansHebrew_800ExtraBold.ttf',
  'AmaticSC-Bold': 'AmaticSC_700Bold.ttf',
};

export const UI_FONT = {
  regular: 'Heebo-Regular',
  bold: 'Heebo-Bold',
  black: 'Heebo-Black',
};

export function findFont(fontId: string, custom: FontDef[] = []): FontDef {
  return (
    BUILTIN_FONTS.find((f) => f.id === fontId) ??
    custom.find((f) => f.id === fontId) ??
    BUILTIN_FONTS[1]
  );
}
