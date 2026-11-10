import { useEffect, useRef, useState, type ReactNode } from 'react';
import { correctTranscript, getSample } from '../services/claudeFix';
import { applyDictionary } from '../core/cleanup';
import { cueAt, buildCues, cueText } from '../core/captions';
import type { Project } from '../core/types';

function hasTranscriptOf(p: Project) {
  return !!p.transcript && p.transcriptionJob == null;
}
import { useApp } from '../state/store';
import { Icon } from '../ui/icons';
import { Preview } from './Preview';
import { usePlayer } from './player';
import { formatTime } from '../core/text';
import { projectRange } from '../core/timeline';
import { TranscriptPanel } from './panels/TranscriptPanel';
import { StylePanel } from './panels/StylePanel';
import { LogoPanel } from './panels/LogoPanel';
import { TrimPanel, AspectPanel } from './panels/FramePanels';
import { SilencePanel, FillerPanel } from './panels/CleanupPanels';
import { ExportPanel } from './panels/ExportPanel';
import { TranscribeCard } from './panels/TranscribeCard';
import { applyBrand } from './brand';
import { Progress } from '../ui/controls';

type Tool = 'transcript' | 'style' | 'logo' | 'trim' | 'silence' | 'filler' | 'aspect' | 'export' | null;

export function Editor() {
  const p = useApp((s) => s.current)!;
  const { close, undo, redo, past, future, edit, showToast } = useApp();
  const [tool, setTool] = useState<Tool>(null);
  const [focusTime, setFocusTime] = useState<number | null>(null);
  const [fixing, setFixing] = useState(false);
  // Open the transcript as soon as a transcription finishes, so it's obvious where to edit.
  const hadTranscript = useRef(hasTranscriptOf(p));
  useEffect(() => {
    const now = !!p.transcript && p.transcriptionJob == null;
    if (now && !hadTranscript.current) setTool('transcript');
    hadTranscript.current = now;
  }, [p.transcript, p.transcriptionJob]);
  const smartFix = async () => {
    setFixing(true);
    try {
      const dict = useApp.getState().dictionary;
      const fixed = await correctTranscript(useApp.getState().current!.transcript!, dict);
      edit((x) => ({ ...x, transcript: { ...fixed, words: applyDictionary(fixed.words, dict) } }));
      showToast('Claude תיקן את התמלול. אפשר לבטל בכפתור החזרה למעלה.');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setFixing(false);
    }
  };
  const studio = p.kind === 'studio';
  const hasTranscript = !!p.transcript;

  const needTranscript = (t: Tool) => () => {
    if (!hasTranscript) {
      showToast('קודם צריך לתמלל את הסרטון');
      return;
    }
    setTool(t);
  };

  const tools: { id: string; label: string; icon: ReactNode; onClick?: () => void; soon?: boolean; on?: boolean }[] = [
    { id: 'transcript', label: 'תמלול', icon: Icon.text, onClick: needTranscript('transcript') },
    { id: 'style', label: 'כתוביות', icon: Icon.captions, onClick: needTranscript('style') },
  ];
  if (studio) {
    tools.push(
      { id: 'logo', label: 'לוגו', icon: Icon.logo, onClick: () => setTool('logo') },
      { id: 'trim', label: 'חיתוך', icon: Icon.trim, onClick: () => setTool('trim') },
      { id: 'silence', label: 'שתיקות', icon: Icon.silence, onClick: needTranscript('silence') },
      { id: 'filler', label: 'מילות מילוי', icon: Icon.filler, onClick: needTranscript('filler') },
      { id: 'aspect', label: 'יחס מסך', icon: Icon.aspect, onClick: () => setTool('aspect') },
      {
        id: 'brand',
        label: 'המיתוג שלי',
        icon: Icon.brand,
        onClick: () => {
          const b = useApp.getState().brand;
          if (!b || (!b.captionStyle && !b.defaultLogo.logoId)) return showToast('עוד לא נשמר מיתוג. הגדירי אותו במסך "המיתוג שלי" בדף הבית.');
          edit((x) => applyBrand(x, b));
          showToast('המיתוג הוחל על הסרטון');
        },
      },
    );
  }
  tools.push({ id: 'export', label: 'ייצוא', icon: Icon.export, onClick: () => setTool('export') });
  if (studio) {
    tools.push(
      { id: 'music', label: 'מוזיקה', icon: Icon.music, soon: true },
      { id: 'ai', label: 'עריכה חכמה', icon: Icon.wand, soon: true },
      { id: 'timeline', label: 'טיימליין', icon: Icon.film, soon: true },
    );
  }

  return (
    <div className="editor">
      <div className="topbar">
        <button className="icon-btn" onClick={close} aria-label="חזרה">{Icon.back}</button>
        <h1>{p.name}</h1>
        <button className="icon-btn" onClick={undo} disabled={!past.length} aria-label="ביטול">{Icon.undo}</button>
        <button className="icon-btn" onClick={redo} disabled={!future.length} aria-label="ביצוע מחדש">{Icon.redo}</button>
      </div>
      <Preview project={p} />
      {!hasTranscript && <TranscribeCard />}
      {p.transcriptionJob?.status === 'polish' && (
        <div className="status-card" style={{ margin: '10px 16px 0' }}>
          <b>✨ Claude מתקן את התמלול…</b>
          <Progress />
          <p className="hint">מתקן שגיאות כתיב, מילים שנשמעו לא נכון ומוסיף פיסוק. בדרך כלל לוקח פחות מדקה.</p>
        </div>
      )}
      {hasTranscript && p.transcriptionJob?.status !== 'polish' && (
        <TranscriptBar
          onEdit={() => { setFocusTime(usePlayer.getState().time); usePlayer.getState().video?.pause(); setTool('transcript'); }}
          onSmartFix={smartFix}
          fixing={fixing}
        />
      )}
      <Transport />
      <div className="toolbar" role="toolbar">
        {tools.map((t) => (
          <button
            key={t.id}
            className={'tool' + (tool === t.id ? ' on' : '') + (t.soon ? ' soon' : '')}
            onClick={t.soon ? () => showToast('הכלי הזה יגיע בשלב הבא של הפיתוח') : t.onClick}
            aria-disabled={t.soon}
          >
            {t.icon}
            <span>{t.label}</span>
            {t.soon && <span className="soon-tag">בקרוב</span>}
          </button>
        ))}
      </div>
      {tool === 'transcript' && <TranscriptPanel focusTime={focusTime} onClose={() => { setTool(null); setFocusTime(null); }} />}
      {tool === 'style' && <StylePanel onClose={() => setTool(null)} />}
      {tool === 'logo' && <LogoPanel onClose={() => setTool(null)} />}
      {tool === 'trim' && <TrimPanel onClose={() => setTool(null)} />}
      {tool === 'silence' && <SilencePanel onClose={() => setTool(null)} />}
      {tool === 'filler' && <FillerPanel onClose={() => setTool(null)} />}
      {tool === 'aspect' && <AspectPanel onClose={() => setTool(null)} />}
      {tool === 'export' && <ExportPanel onClose={() => setTool(null)} />}
    </div>
  );
}

function Transport({ onFixCaption }: { onFixCaption?: () => void }) {
  const p = useApp((s) => s.current)!;
  const { time, playing, toggle, seek } = usePlayer();
  const dur = p.video.duration;
  const ref = useRef<HTMLDivElement>(null);
  const range = projectRange(p);
  const pct = (t: number) => `${(t / Math.max(0.001, dur)) * 100}%`;
  const onPointer = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    if (e.type === 'pointerdown') el.setPointerCapture(e.pointerId);
    else if (!el.hasPointerCapture(e.pointerId)) return;
    const r = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    seek(f * dur);
  };
  return (
    <div className="transport">
      <button className="play-btn" onClick={toggle} aria-label={playing ? 'עצירה' : 'ניגון'}>{playing ? Icon.pause : Icon.play}</button>
      <div className="scrub" ref={ref} onPointerDown={onPointer} onPointerMove={onPointer} role="slider" aria-label="מיקום בסרטון" aria-valuenow={Math.round(time)} aria-valuemax={Math.round(dur)}>
        <div className="track">
          <div className="fill" style={{ width: pct(time) }} />
          {p.cuts.map((c) => (
            <div key={c.id} className="cut" style={{ left: pct(c.start), width: pct(c.end - c.start) }} />
          ))}
          {range.start > 0 && <div className="trimmed" style={{ left: 0, width: pct(range.start) }} />}
          {range.end < dur && <div className="trimmed" style={{ left: pct(range.end), right: 0 }} />}
        </div>
        <div className="knob" style={{ left: pct(time) }} />
      </div>
      <span className="time">{formatTime(time)} / {formatTime(dur)}</span>
      {onFixCaption && (
        <button className="fix-caption" onClick={onFixCaption} aria-label="תיקון הכתובית הנוכחית">
          {Icon.text} תיקון
        </button>
      )}
    </div>
  );
}

/** Always-visible strip under the video: the caption being spoken + the two editing actions. */
function TranscriptBar({ onEdit, onSmartFix, fixing }: { onEdit: () => void; onSmartFix: () => void; fixing: boolean }) {
  const p = useApp((s) => s.current)!;
  const [canFix, setCanFix] = useState(false);
  useEffect(() => {
    void getSample().then((s) => setCanFix(!!s));
  }, []);
  const time = usePlayer((s) => s.time);
  const cues = useMemoCues(p);
  const cue = cueAt(cues, time);
  return (
    <div className="tbar">
      <button className="tbar-text" onClick={onEdit} aria-label="עריכת הכתובית">
        {cue ? cueText(cue).replace(/\n/g, ' ') : 'לחצי כאן כדי לראות ולתקן את התמלול'}
      </button>
      <div className="tbar-actions" style={canFix ? undefined : { gridTemplateColumns: '1fr' }}>
        <button className="btn small" onClick={onEdit}>✏️ עריכת התמלול</button>
        {canFix && <button className="btn small violet" onClick={onSmartFix} disabled={fixing}>✨ {fixing ? 'מתקן…' : 'תיקון חכם'}</button>}
      </div>
    </div>
  );
}

const cueCache = new WeakMap<object, ReturnType<typeof buildCues>>();
function useMemoCues(p: Project) {
  const key = p.transcript as object;
  let c = cueCache.get(key);
  if (!c) {
    c = buildCues(p.transcript, { ...p.captionStyle, display: 'lines', maxLines: 2 }, p.transcriptMode, p.cuts);
    cueCache.set(key, c);
  }
  return c;
}
