import { useEffect, useState } from 'react';
import { useApp } from '../state/store';
import { Icon } from '../ui/icons';
import { ColorPicker, Segmented, Slider, Toggle } from '../ui/controls';
import { LogoThumb } from '../editor/panels/LogoPanel';
import { addLogo, pickFile } from './useLogoUpload';
import { db, uid } from '../services/db';
import { registerCustomFont } from '../services/fonts';
import { getManifest, modelIsDownloaded, type ModelManifest } from '../asr/engine';
import type { CustomFont } from '../core/types';

function Top({ title, back }: { title: string; back: () => void }) {
  return (
    <div className="topbar">
      <button className="icon-btn" onClick={back} aria-label="חזרה">{Icon.back}</button>
      <h1>{title}</h1>
    </div>
  );
}

export function BrandScreen({ back }: { back: () => void }) {
  const { brand, setBrand, showToast } = useApp();
  if (!brand) return null;
  const d = brand.defaultLogo;
  const setDefault = (patch: Partial<typeof d>) => void setBrand({ ...brand, defaultLogo: { ...d, ...patch } });

  const uploadFont = async () => {
    const f = await pickFile('.ttf,.otf,font/ttf,font/otf');
    if (!f) return;
    const font: CustomFont = { id: uid('f_'), family: `custom-${uid()}`, label: f.name.replace(/\.[^.]+$/, ''), blobKey: uid('fb_') };
    await db.putBlob(font.blobKey, f);
    if (!(await registerCustomFont(font))) {
      await db.deleteBlob(font.blobKey);
      return showToast('לא הצלחנו לקרוא את קובץ הפונט.');
    }
    await setBrand({ ...useApp.getState().brand!, customFonts: [...brand.customFonts, font] });
    showToast('הפונט נוסף. הוא מופיע בעיצוב הכתוביות תחת "הפונטים שלי".');
  };

  return (
    <div className="screen">
      <Top title="המיתוג שלי" back={back} />
      <p className="hint">מה שנשמר כאן מוחל בלחיצה אחת בעורך, בכפתור "המיתוג שלי".</p>

      <section className="field">
        <h2 className="section-title">לוגואים</h2>
        <div className="logo-grid">
          {brand.logos.map((l) => (
            <button key={l.id} className={'logo-tile' + (d.logoId === l.id ? ' on' : '')} onClick={() => setDefault({ logoId: l.id })} aria-label={l.name}>
              <LogoThumb logo={l} />
            </button>
          ))}
          <button className="logo-tile" onClick={async () => { const f = await pickFile('image/png,image/*'); if (f) await addLogo(f).catch(() => showToast('לא הצלחנו לקרוא את התמונה.')); }} aria-label="העלאת לוגו">{Icon.plus}</button>
        </div>
        {d.logoId && (
          <>
            <p className="hint">הלוגו המסומן הוא ברירת המחדל. מיקום ברירת מחדל:</p>
            <Slider id="bx" label="מיקום אופקי" value={d.x} min={0} max={1} format={(v) => `${Math.round(v * 100)}`} onChange={(v) => setDefault({ x: v })} />
            <Slider id="by" label="מיקום אנכי" value={d.y} min={0} max={1} format={(v) => `${Math.round(v * 100)}`} onChange={(v) => setDefault({ y: v })} />
            <Slider id="bs" label="גודל" value={d.scale} min={0.05} max={0.6} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setDefault({ scale: v })} />
            <Slider id="bo" label="שקיפות" value={d.opacity} min={0.1} max={1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setDefault({ opacity: v })} />
            <button className="btn danger small" onClick={() => void setBrand({ ...brand, logos: brand.logos.filter((l) => l.id !== d.logoId), defaultLogo: { ...d, logoId: null } })}>{Icon.trash} מחיקת הלוגו המסומן</button>
          </>
        )}
      </section>

      <section className="field">
        <h2 className="section-title">צבעי מותג</h2>
        <div className="swatches">
          {brand.colors.map((c, i) => (
            <button key={c + i} className="swatch" style={{ background: c }} aria-label={`הסרת ${c}`} onClick={() => void setBrand({ ...brand, colors: brand.colors.filter((_, j) => j !== i) })} />
          ))}
        </div>
        <ColorPicker label="הוספת צבע" value="#ffffff" onChange={(c) => !brand.colors.includes(c) && void setBrand({ ...brand, colors: [...brand.colors, c] })} />
        <p className="hint">לחיצה על צבע קיים מסירה אותו.</p>
      </section>

      <section className="field">
        <h2 className="section-title">עיצוב כתוביות</h2>
        {brand.captionStyle ? <p className="hint">נשמר עיצוב כתוביות ({brand.savedStyles.length} עיצובים שמורים). שומרים עיצוב חדש מתוך מסך עיצוב הכתוביות.</p> : <p className="hint">עוד לא נשמר. בעורך: כתוביות ← "שמירה למיתוג".</p>}
        {!!brand.savedStyles.length && (
          <div className="list">
            {brand.savedStyles.map((s) => (
              <div key={s.id} className="list-item">
                <span className="grow">{s.name}</span>
                <button className="icon-btn" aria-label="מחיקה" onClick={() => void setBrand({ ...brand, savedStyles: brand.savedStyles.filter((x) => x.id !== s.id) })}>{Icon.trash}</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="field">
        <h2 className="section-title">פונטים אישיים</h2>
        <div className="list">
          {brand.customFonts.map((f) => (
            <div key={f.id} className="list-item">
              <span className="grow" style={{ fontFamily: `"${f.family}"`, fontSize: 20 }}>שלום עולם · {f.label}</span>
              <button className="icon-btn" aria-label="מחיקה" onClick={() => void setBrand({ ...brand, customFonts: brand.customFonts.filter((x) => x.id !== f.id) })}>{Icon.trash}</button>
            </div>
          ))}
        </div>
        <button className="btn" onClick={() => void uploadFont()}>{Icon.upload} העלאת פונט (TTF / OTF)</button>
      </section>
    </div>
  );
}

export function DictionaryScreen({ back }: { back: () => void }) {
  const { dictionary, setDictionary } = useApp();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const add = () => {
    if (!to.trim()) return;
    void setDictionary([...dictionary, { id: uid('d_'), from: from.trim(), to: to.trim(), keyterm: false }]);
    setFrom('');
    setTo('');
  };
  return (
    <div className="screen">
      <Top title="מילון אישי" back={back} />
      <p className="hint">שמות ומילים שהתמלול טועה בהם. אחרי כל תמלול, המילים מתוקנות אוטומטית לפי המילון. אפשר להוסיף מילים גם ישירות מתוך התמלול.</p>
      <div className="field">
        <input className="text-input" placeholder="איך התמלול כותב (למשל: מילא)" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="המילה השגויה" />
        <input className="text-input" placeholder="הכתיב הנכון (למשל: מילה)" value={to} onChange={(e) => setTo(e.target.value)} aria-label="הכתיב הנכון" />
        <button className="btn primary" onClick={add} disabled={!from.trim() || !to.trim()}>{Icon.plus} הוספה</button>
      </div>
      <div className="list">
        {dictionary.map((d) => (
          <div key={d.id} className="list-item">
            <span className="grow">{d.from} ← <b>{d.to}</b></span>
            <button className="icon-btn" aria-label="מחיקה" onClick={() => void setDictionary(dictionary.filter((x) => x.id !== d.id))}>{Icon.trash}</button>
          </div>
        ))}
        {!dictionary.length && <div className="empty">{Icon.book}<span>המילון ריק.</span></div>}
      </div>
    </div>
  );
}

export function SettingsScreen({ back }: { back: () => void }) {
  const { projects, showToast, refreshProjects, settings, setSettings } = useApp();
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  const [model, setModel] = useState<boolean | null>(null);
  const [manifest, setManifest] = useState<ModelManifest | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    void db.storageEstimate().then(setEst);
    void modelIsDownloaded().then(setModel);
    void getManifest().then(setManifest).catch(() => undefined);
  }, []);
  const mb = (n: number) => `${(n / 1e6).toFixed(0)}MB`;
  return (
    <div className="screen">
      <Top title="הגדרות" back={back} />
      <section className="status-card">
        <b>מנוע התמלול</b>
        <Segmented
          value={settings.engine}
          onChange={async (v) => {
            await setSettings({ engine: v });
            setManifest(null);
            void getManifest().then(setManifest).catch(() => undefined);
            void modelIsDownloaded().then(setModel);
          }}
          options={[
            { value: 'quality', label: 'איכותי (ivrit.ai)' },
            { value: 'light', label: 'קל ומהיר' },
          ]}
        />
        <p className="hint">האיכותי מדויק יותר ומוסיף פיסוק, אבל כבד (כ-790MB) ודורש אייפון חדש יחסית. הקל מתאים לכל אייפון.</p>
        <p className="hint">{manifest?.label ?? 'Whisper'}. מודל פתוח שרץ על הטלפון: בלי חשבון, בלי עלות, והסרטונים לא יוצאים מהמכשיר.</p>
        {manifest && !manifest.punctuation && <p className="hint">המנוע הזה לא מוסיף פיסוק. החלוקה למשפטים נעשית לפי ההפסקות בדיבור, ואפשר להוסיף פיסוק ידנית בתמלול.</p>}
        <p className="hint">{model == null ? '' : model ? 'המנוע כבר נשמר בטלפון.' : `המנוע נטען בתמלול הראשון${manifest ? ` (כ-${Math.round(manifest.totalBytes / 1e6)}MB)` : ''}.`}</p>
      </section>
      <section className="status-card">
        <b>אחסון</b>
        <p className="hint">{projects.length} פרויקטים{est ? ` · בשימוש ${mb(est.usage)}${est.quota ? ` מתוך ${mb(est.quota)}` : ''}` : ''}</p>
        {confirm ? (
          <div className="row">
            <button className="btn danger" onClick={async () => { for (const p of projects) await db.deleteProject(p); await refreshProjects(); setConfirm(false); showToast('כל הפרויקטים נמחקו'); }}>כן, למחוק הכול</button>
            <button className="btn" onClick={() => setConfirm(false)}>ביטול</button>
          </div>
        ) : (
          <button className="btn danger" onClick={() => setConfirm(true)} disabled={!projects.length}>{Icon.trash} מחיקת כל הפרויקטים</button>
        )}
      </section>
      <Toggle label="שמירה אוטומטית" value onChange={() => showToast('השמירה האוטומטית תמיד פעילה')} />
    </div>
  );
}
