import { useApp } from '../../state/store';
import { Sheet, Slider } from '../../ui/controls';
import { Icon } from '../../ui/icons';
import { useLogoUpload } from '../../screens/useLogoUpload';
import { useEffect, useState } from 'react';
import { db } from '../../services/db';
import type { LogoAsset } from '../../core/types';

export function LogoThumb({ logo }: { logo: LogoAsset }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    void db.getBlob(logo.blobKey).then((b) => b && setUrl((u = URL.createObjectURL(b))));
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [logo.blobKey]);
  return url ? <img src={url} alt={logo.name} /> : null;
}

const POS: [number, number][] = [
  [0.85, 0.08], [0.5, 0.08], [0.15, 0.08],
  [0.85, 0.5], [0.5, 0.5], [0.15, 0.5],
  [0.85, 0.92], [0.5, 0.92], [0.15, 0.92],
];

export function LogoPanel({ onClose }: { onClose: () => void }) {
  const p = useApp((s) => s.current)!;
  const { edit, brand } = useApp();
  const upload = useLogoUpload();
  const logos = brand?.logos ?? [];
  const pl = p.logo;
  const set = (patch: Partial<NonNullable<typeof pl>>, undoable = true) => edit((x) => (x.logo ? { ...x, logo: { ...x.logo, ...patch } } : x), undoable);

  return (
    <Sheet title="לוגו" onClose={onClose}>
      <div className="logo-grid">
        {logos.map((l) => (
          <button
            key={l.id}
            className={'logo-tile' + (pl?.logoId === l.id ? ' on' : '')}
            onClick={() => edit((x) => { const d = x.logo ?? brand!.defaultLogo; return { ...x, logo: { logoId: l.id, x: d.x, y: d.y, scale: d.scale, opacity: d.opacity } }; })}
            aria-label={l.name}
          >
            <LogoThumb logo={l} />
          </button>
        ))}
        <button className="logo-tile" onClick={upload} aria-label="העלאת לוגו">{Icon.plus}</button>
      </div>
      <p className="hint">מומלץ PNG עם רקע שקוף. הלוגואים נשמרים במיתוג שלך לשימוש חוזר.</p>
      {pl && (
        <>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div className="field">
              <span className="field-label">מיקום</span>
              <div className="pos-grid">
                {POS.map(([x, y]) => (
                  <button key={`${x}${y}`} className={Math.abs(pl.x - x) < 0.02 && Math.abs(pl.y - y) < 0.02 ? 'on' : ''} onClick={() => set({ x, y })} aria-label="מיקום" />
                ))}
              </div>
            </div>
          </div>
          <Slider id="lx" label="מיקום אופקי" value={pl.x} min={0} max={1} format={(v) => `${Math.round(v * 100)}`} onChange={(v) => set({ x: v }, false)} />
          <Slider id="ly" label="מיקום אנכי" value={pl.y} min={0} max={1} format={(v) => `${Math.round(v * 100)}`} onChange={(v) => set({ y: v }, false)} />
          <Slider id="ls" label="גודל" value={pl.scale} min={0.05} max={0.6} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ scale: v }, false)} />
          <Slider id="lo" label="שקיפות" value={pl.opacity} min={0.1} max={1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ opacity: v }, false)} />
          <button className="btn danger" onClick={() => edit((x) => ({ ...x, logo: null }))}>{Icon.trash} הסרת הלוגו מהסרטון</button>
        </>
      )}
    </Sheet>
  );
}
