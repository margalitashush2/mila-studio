import { useMemo, useState } from 'react';
import { useApp } from '../../state/store';
import { usePlayer } from '../player';
import { Check, Sheet, Slider } from '../../ui/controls';
import { Icon } from '../../ui/icons';
import { detectFillers, detectSilences, type FillerKind } from '../../core/cleanup';
import { cutForWords, newCutId } from '../../core/transcript';
import { projectRange } from '../../core/timeline';
import { formatTime } from '../../core/text';
import type { Cut } from '../../core/types';

export function SilencePanel({ onClose }: { onClose: () => void }) {
  const p = useApp((s) => s.current)!;
  const { edit, showToast } = useApp();
  const playRange = usePlayer((s) => s.playRange);
  const [minGap, setMinGap] = useState(0.8);
  const existing = p.cuts.filter((c) => c.reason === 'silence');
  const found = useMemo(
    () =>
      detectSilences(p.transcript!.words, projectRange(p), { minGap }).filter(
        (s) => !p.cuts.some((c) => c.start <= s.cutStart + 0.01 && c.end >= s.cutEnd - 0.01),
      ),
    [p, minGap],
  );
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const sel = picked ?? new Set(found.map((f) => f.id));
  const total = found.filter((f) => sel.has(f.id)).reduce((s, f) => s + f.duration, 0);

  const apply = () => {
    const cuts: Cut[] = found.filter((f) => sel.has(f.id)).map((f) => ({ id: newCutId(), start: f.cutStart, end: f.cutEnd, reason: 'silence' }));
    if (!cuts.length) return;
    edit((x) => ({ ...x, cuts: [...x.cuts, ...cuts] }));
    setPicked(null);
    showToast(`הוסרו ${cuts.length} שתיקות (${total.toFixed(1)} שניות)`);
  };

  return (
    <Sheet title="הסרת שתיקות" onClose={onClose} tall>
      <Slider id="gap" label="שתיקה מינימלית" value={minGap} min={0.4} max={3} step={0.1} format={(v) => `${v.toFixed(1)} שנ׳`} onChange={(v) => { setMinGap(v); setPicked(null); }} />
      {found.length ? (
        <>
          <p className="hint">נמצאו {found.length} קטעים בלי דיבור. סמני מה להסיר. לחיצה על ▶ מנגנת את הקטע.</p>
          <div className="list">
            {found.map((f) => (
              <div key={f.id} className="list-item">
                <button onClick={() => { const n = new Set(sel); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); setPicked(n); }} aria-label="בחירה"><Check on={sel.has(f.id)} /></button>
                <div className="grow"><b>{f.duration.toFixed(1)} שניות</b><br /><small>{formatTime(f.gapStart)} – {formatTime(f.gapEnd)}</small></div>
                <button className="icon-btn" onClick={() => playRange(Math.max(0, f.gapStart - 1), f.gapEnd + 1)} aria-label="ניגון">{Icon.play}</button>
              </div>
            ))}
          </div>
          <button className="btn primary block" onClick={apply} disabled={!sel.size}>הסרת {sel.size} שתיקות ({total.toFixed(1)} שנ׳)</button>
        </>
      ) : (
        <div className="empty">{Icon.check}<span>לא נמצאו שתיקות ארוכות מ-{minGap.toFixed(1)} שניות.</span></div>
      )}
      {!!existing.length && (
        <button className="btn" onClick={() => edit((x) => ({ ...x, cuts: x.cuts.filter((c) => c.reason !== 'silence') }))}>{Icon.restore} החזרת כל {existing.length} השתיקות שהוסרו</button>
      )}
    </Sheet>
  );
}

const KIND_LABEL: Record<FillerKind, string> = { filler: 'מילת מילוי', 'possible-filler': 'אולי מילוי', repetition: 'חזרה' };

export function FillerPanel({ onClose }: { onClose: () => void }) {
  const p = useApp((s) => s.current)!;
  const { edit, showToast } = useApp();
  const playRange = usePlayer((s) => s.playRange);
  const words = p.transcript!.words;
  const found = useMemo(
    () => detectFillers(words).filter((f) => !p.cuts.some((c) => (f.start + f.end) / 2 >= c.start && (f.start + f.end) / 2 < c.end)),
    [words, p.cuts],
  );
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const sel = picked ?? new Set(found.filter((f) => f.suggested).map((f) => f.wordId));

  const apply = () => {
    const ws = words.filter((w) => sel.has(w.id));
    const cuts = ws.map((w) => cutForWords(words, [w], 'filler')).filter((c): c is Cut => !!c);
    if (!cuts.length) return;
    edit((x) => ({ ...x, cuts: [...x.cuts, ...cuts] }));
    setPicked(null);
    showToast(`הוסרו ${cuts.length} מילים מהסרטון`);
  };

  return (
    <Sheet title="הסרת מילות מילוי" onClose={onClose} tall>
      {found.length ? (
        <>
          <p className="hint">מילים כמו "אהה", "אממ", "כאילו" וחזרות. מילים שמסומנות "אולי מילוי" לא נבחרו מראש.</p>
          <div className="list">
            {found.map((f) => (
              <div key={f.wordId} className="list-item">
                <button onClick={() => { const n = new Set(sel); if (n.has(f.wordId)) n.delete(f.wordId); else n.add(f.wordId); setPicked(n); }} aria-label="בחירה"><Check on={sel.has(f.wordId)} /></button>
                <div className="grow"><b>{f.text}</b> <span className="chip">{KIND_LABEL[f.kind]}</span><br /><small>{formatTime(f.start)}</small></div>
                <button className="icon-btn" onClick={() => playRange(Math.max(0, f.start - 1.5), f.end + 1.5)} aria-label="ניגון">{Icon.play}</button>
              </div>
            ))}
          </div>
          <button className="btn primary block" onClick={apply} disabled={!sel.size}>הסרת {sel.size} מילים מהסרטון</button>
          <button className="btn block" onClick={() => { edit((x) => ({ ...x, transcriptMode: 'clean', transcript: { ...x.transcript!, revision: x.transcript!.revision + 1, words: x.transcript!.words.map((w) => ({ ...w, cleanHidden: sel.has(w.id) })) } })); showToast('המילים הוסתרו מהכתוביות בלבד'); }}>
            הסתרה מהכתוביות בלבד (בלי לחתוך)
          </button>
        </>
      ) : (
        <div className="empty">{Icon.check}<span>לא נמצאו מילות מילוי.</span></div>
      )}
      {p.cuts.some((c) => c.reason === 'filler') && (
        <button className="btn" onClick={() => edit((x) => ({ ...x, cuts: x.cuts.filter((c) => c.reason !== 'filler') }))}>{Icon.restore} החזרת כל המילים שהוסרו</button>
      )}
    </Sheet>
  );
}
