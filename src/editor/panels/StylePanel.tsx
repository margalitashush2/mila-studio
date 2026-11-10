import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../state/store';
import { ColorPicker, Segmented, Sheet, Slider, Toggle } from '../../ui/controls';
import { CAPTION_PRESETS, applyPreset } from '../../core/presets';
import { BUILTIN_FONTS, FONT_CATEGORIES, type FontCategory } from '../../core/fonts';
import type { CaptionStyle } from '../../core/types';
import type { Cue } from '../../core/captions';
import { drawCaption } from '../../render/renderer';
import { customFontDefs, ensureFont, registerCustomFont, resolveFamily } from '../../services/fonts';
import { uid } from '../../services/db';

type Tab = 'presets' | 'fonts' | 'colors' | 'layout' | 'effects';

const SAMPLE: Cue = {
  id: 's',
  start: 0,
  end: 2,
  lines: [[
    { id: 'a', text: 'ככה', start: 0, end: 0.3, emphasis: false },
    { id: 'b', text: 'נראות', start: 0.3, end: 0.6, emphasis: false },
    { id: 'c', text: 'הכתוביות', start: 0.6, end: 1, emphasis: true },
  ]],
};

function PresetThumb({ style }: { style: CaptionStyle }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const custom = useApp((s) => s.brand?.customFonts ?? []);
  useEffect(() => {
    const family = resolveFamily(style.fontId, custom);
    void ensureFont(family).then(() => {
      const c = ref.current;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, c.width, c.height);
      const g = ctx.createLinearGradient(0, 0, c.width, c.height);
      g.addColorStop(0, '#3a3550');
      g.addColorStop(1, '#1d2a33');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.width, c.height);
      drawCaption(ctx, c.width, c.height, { cue: SAMPLE, time: 0.4, style: { ...style, positionY: 0.55, animation: 'none', fontScale: style.fontScale * 2.4, maxWidth: 0.92 }, fontFamily: family });
    });
  }, [style, custom]);
  return <canvas ref={ref} width={320} height={180} />;
}

export function StylePanel({ onClose }: { onClose: () => void }) {
  const p = useApp((s) => s.current)!;
  const { edit, brand, setBrand, showToast } = useApp();
  const [tab, setTab] = useState<Tab>('presets');
  const [cat, setCat] = useState<FontCategory>('modern');
  const st = p.captionStyle;
  const set = (patch: Partial<CaptionStyle>, undoable = true) => edit((x) => ({ ...x, captionStyle: { ...x.captionStyle, ...patch, presetId: patch.presetId ?? null } }), undoable);
  const brandColors = brand?.colors ?? [];
  const customFonts = customFontDefs(brand?.customFonts ?? []);
  const fonts = cat === 'custom' ? customFonts : BUILTIN_FONTS.filter((f) => f.category === cat);

  useEffect(() => {
    if (tab === 'fonts') {
      fonts.forEach((f) => {
        const cf = brand?.customFonts.find((x) => x.id === f.id);
        if (cf) void registerCustomFont(cf);
        else void ensureFont(f.family);
      });
    }
  }, [tab, cat]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveToBrand = async () => {
    if (!brand) return;
    await setBrand({ ...brand, captionStyle: st, savedStyles: [...brand.savedStyles, { id: uid('st_'), name: `עיצוב ${brand.savedStyles.length + 1}`, style: st }] });
    showToast('העיצוב נשמר במיתוג שלך');
  };

  return (
    <Sheet title="עיצוב כתוביות" onClose={onClose} tall actions={<button className="btn small" onClick={saveToBrand}>שמירה למיתוג</button>}>
      <div className="tabs" role="tablist">
        {([
          ['presets', 'תבניות'],
          ['fonts', 'פונט'],
          ['colors', 'צבעים'],
          ['layout', 'מיקום וגודל'],
          ['effects', 'אפקטים'],
        ] as [Tab, string][]).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'presets' && (
        <>
          <p className="hint">לחיצה על תבנית מציגה אותה מיד על הסרטון. אפשר לבטל בכפתור החזרה.</p>
          {!!brand?.savedStyles.length && (
            <>
              <h3 className="section-title">העיצובים השמורים שלי</h3>
              <div className="preset-grid">
                {brand.savedStyles.map((s) => (
                  <button key={s.id} className="preset" onClick={() => edit((x) => ({ ...x, captionStyle: { ...s.style } }))}>
                    <PresetThumb style={s.style} />
                    <b>{s.name}</b>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="preset-grid">
            {CAPTION_PRESETS.map((pr) => {
              const style = applyPreset(st, pr.id);
              return (
                <button key={pr.id} className={'preset' + (st.presetId === pr.id ? ' on' : '')} onClick={() => edit((x) => ({ ...x, captionStyle: applyPreset(x.captionStyle, pr.id) }))}>
                  <PresetThumb style={style} />
                  <b>{pr.name}</b>
                  <small>{pr.description}</small>
                </button>
              );
            })}
          </div>
        </>
      )}

      {tab === 'fonts' && (
        <>
          <div className="tabs">
            {FONT_CATEGORIES.map((c) => (
              <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.label}</button>
            ))}
          </div>
          {cat === 'custom' && !customFonts.length && <p className="hint">אפשר להעלות פונטים אישיים (TTF / OTF) במסך "המיתוג שלי" בדף הבית.</p>}
          <div className="font-grid">
            {fonts.map((f) => (
              <button key={f.id} className={'font-opt' + (st.fontId === f.id ? ' on' : '')} onClick={() => set({ fontId: f.id })}>
                <span style={{ fontFamily: `"${f.family}"` }}>שלום עולם</span>
                <small>{f.label}</small>
              </button>
            ))}
          </div>
        </>
      )}

      {tab === 'colors' && (
        <>
          <ColorPicker label="צבע הטקסט" value={st.textColor} extra={brandColors} onChange={(c) => set({ textColor: c })} />
          <div className="field">
            <span className="field-label">הדגשת המילה הנאמרת</span>
            <Segmented
              value={st.highlightMode}
              onChange={(v) => set({ highlightMode: v })}
              options={[
                { value: 'none', label: 'בלי' },
                { value: 'color', label: 'שינוי צבע' },
                { value: 'box', label: 'רקע למילה' },
              ]}
            />
          </div>
          {st.highlightMode !== 'none' && <ColorPicker label="צבע ההדגשה" value={st.highlightColor} extra={brandColors} onChange={(c) => set({ highlightColor: c })} />}
          {st.highlightMode === 'box' && <ColorPicker label="צבע הטקסט על הרקע" value={st.highlightTextColor} extra={brandColors} onChange={(c) => set({ highlightTextColor: c })} />}
          <ColorPicker label="צבע למילים מודגשות (מסמנים בתמלול)" value={st.emphasisColor} extra={brandColors} onChange={(c) => set({ emphasisColor: c })} />
        </>
      )}

      {tab === 'layout' && (
        <>
          <div className="field">
            <span className="field-label">סוג הכתוביות</span>
            <Segmented
              value={st.display}
              onChange={(v) => set({ display: v, highlightMode: v === 'karaoke' && st.highlightMode === 'none' ? 'color' : st.highlightMode })}
              options={[
                { value: 'lines', label: 'שורות' },
                { value: 'karaoke', label: 'מילה מודגשת' },
                { value: 'chunks', label: 'קבוצות' },
                { value: 'single', label: 'מילה מילה' },
              ]}
            />
          </div>
          <Slider id="size" label="גודל" value={st.fontScale} min={0.03} max={0.14} step={0.002} format={(v) => `${Math.round(v * 1000)}`} onChange={(v) => set({ fontScale: v }, false)} />
          <Slider id="posy" label="מיקום אנכי" value={st.positionY} min={0.08} max={0.94} format={(v) => (v < 0.35 ? 'למעלה' : v > 0.65 ? 'למטה' : 'באמצע')} onChange={(v) => set({ positionY: v }, false)} />
          <Slider id="width" label="רוחב מקסימלי" value={st.maxWidth} min={0.4} max={0.98} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ maxWidth: v }, false)} />
          {(st.display === 'lines' || st.display === 'karaoke') && (
            <>
              <Slider id="chars" label="תווים בשורה" value={st.maxCharsPerLine} min={10} max={45} step={1} onChange={(v) => set({ maxCharsPerLine: v }, false)} />
              <div className="field">
                <span className="field-label">מספר שורות</span>
                <Segmented value={st.maxLines} onChange={(v) => set({ maxLines: v })} options={[{ value: 1, label: 'שורה אחת' }, { value: 2, label: 'שתי שורות' }]} />
              </div>
            </>
          )}
          {st.display === 'chunks' && <Slider id="chunk" label="מילים בכל פעם" value={st.chunkWords} min={2} max={6} step={1} onChange={(v) => set({ chunkWords: v }, false)} />}
          <Slider id="lh" label="מרווח בין שורות" value={st.lineHeight} min={0.9} max={1.8} format={(v) => v.toFixed(2)} onChange={(v) => set({ lineHeight: v }, false)} />
          <Slider id="ls" label="מרווח בין אותיות" value={st.letterSpacing} min={-0.05} max={0.2} step={0.005} format={(v) => v.toFixed(2)} onChange={(v) => set({ letterSpacing: v }, false)} />
          <p className="hint">שינויי סליידרים לא נכנסים לביטול כדי לא להציף אותו.</p>
        </>
      )}

      {tab === 'effects' && (
        <>
          <div className="field">
            <span className="field-label">אנימציית כניסה</span>
            <Segmented
              value={st.animation}
              onChange={(v) => set({ animation: v })}
              options={[
                { value: 'none', label: 'בלי' },
                { value: 'fade', label: 'עמעום' },
                { value: 'pop', label: 'קפיצה' },
                { value: 'slide', label: 'החלקה' },
              ]}
            />
          </div>
          <Slider id="stroke" label="קו מתאר" value={st.strokeWidth} min={0} max={0.2} step={0.005} format={(v) => (v ? `${Math.round(v * 100)}` : 'בלי')} onChange={(v) => set({ strokeWidth: v }, false)} />
          {st.strokeWidth > 0 && <ColorPicker label="צבע קו המתאר" value={st.strokeColor} extra={brandColors} onChange={(c) => set({ strokeColor: c })} />}
          <Toggle label="צל" value={st.shadow} onChange={(v) => set({ shadow: v })} />
          <Toggle label="רקע מאחורי הכתוביות" value={st.background} onChange={(v) => set({ background: v })} />
          {st.background && (
            <>
              <ColorPicker label="צבע הרקע" value={st.backgroundColor} extra={brandColors} onChange={(c) => set({ backgroundColor: c })} />
              <Slider id="bgop" label="שקיפות הרקע" value={st.backgroundOpacity} min={0.1} max={1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ backgroundOpacity: v }, false)} />
            </>
          )}
        </>
      )}
    </Sheet>
  );
}
