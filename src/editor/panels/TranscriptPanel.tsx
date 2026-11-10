import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../state/store';
import { usePlayer } from '../player';
import { Progress, Sheet, Segmented, Toggle } from '../../ui/controls';
import { Icon } from '../../ui/icons';
import { sentences, updateWord, cutForWords, wordAtTime, replaceWordsText, type Sentence } from '../../core/transcript';
import { applyLocalClean, applyDictionary } from '../../core/cleanup';
import { formatTime, normalizeWord, stripPunctuation } from '../../core/text';
import type { DictionaryEntry, TranscriptMode, Word } from '../../core/types';
import { uid } from '../../services/db';
import { correctTranscript, getSample } from '../../services/claudeFix';

export function TranscriptPanel({ onClose, focusTime }: { onClose: () => void; focusTime?: number | null }) {
  const p = useApp((s) => s.current)!;
  const { edit, dictionary, setDictionary, showToast } = useApp();
  const time = usePlayer((s) => s.time);
  const seek = usePlayer((s) => s.seek);
  const playRange = usePlayer((s) => s.playRange);
  const t = p.transcript!;
  const list = useMemo(() => sentences(t), [t]);
  const active = wordAtTime(t, time);
  const [editing, setEditing] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [canFix, setCanFix] = useState(false);
  useEffect(() => {
    void getSample().then((x) => setCanFix(!!x));
  }, []);
  const isCut = (w: Word) => p.cuts.some((c) => (w.start + w.end) / 2 >= c.start && (w.start + w.end) / 2 < c.end);

  // Opened from "fix this caption": jump straight into editing the sentence at that time.
  useEffect(() => {
    if (focusTime == null) return;
    const s = list.find((x) => focusTime >= x.start - 0.3 && focusTime <= x.end + 0.6) ?? list.find((x) => x.start >= focusTime);
    if (s) {
      setEditing(s.id);
      setTimeout(() => document.getElementById(`s-${s.id}`)?.scrollIntoView({ block: 'center' }), 50);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setMode = (m: TranscriptMode) =>
    edit((x) => {
      let tr = x.transcript!;
      if (m === 'clean' && !tr.words.some((w) => w.cleanHidden)) tr = applyLocalClean(tr);
      return { ...x, transcriptMode: m, transcript: tr };
    });

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

  const toggleSentenceCut = (ws: Word[]) => {
    const cutIds = p.cuts.filter((c) => ws.some((w) => (w.start + w.end) / 2 >= c.start && (w.start + w.end) / 2 < c.end)).map((c) => c.id);
    if (cutIds.length) {
      edit((x) => ({ ...x, cuts: x.cuts.filter((c) => !cutIds.includes(c.id)) }));
      showToast('המשפט הוחזר לסרטון');
    } else {
      const c = cutForWords(t.words, ws, 'sentence');
      if (c) edit((x) => ({ ...x, cuts: [...x.cuts, c] }));
      showToast('המשפט הוסר מהסרטון. אפשר לבטל בכפתור החזרה.');
    }
  };

  return (
    <Sheet
      title="תמלול"
      onClose={onClose}
      tall
      actions={
        canFix ? (
          <button className="btn small violet" onClick={smartFix} disabled={fixing}>
            ✨ {fixing ? 'מתקן…' : 'תיקון חכם'}
          </button>
        ) : undefined
      }
    >
      {fixing && (
        <div className="status-card">
          <b>Claude מתקן את התמלול…</b>
          <Progress />
        </div>
      )}
      <div className="banner">✏️ כדי לתקן: לחצי על משפט, הוא ייפתח לעריכה. כתבי את הנוסח הנכון ולחצי "שמירה". הכתוביות מתעדכנות מיד.</div>
      <Segmented<TranscriptMode>
        value={p.transcriptMode}
        onChange={setMode}
        options={[
          { value: 'verbatim', label: 'מילולי' },
          { value: 'organized', label: 'מסודר' },
          { value: 'clean', label: 'נקי' },
        ]}
      />
      <div className="transcript">
        {list.map((s) =>
          editing === s.id ? (
            <SentenceEditor
              key={s.id + ':' + t.revision}
              s={s}
              onDone={() => setEditing(null)}
              onSave={(text, remember) => {
                const before = s.words.map((w) => w.text);
                edit((x) => ({ ...x, transcript: replaceWordsText(x.transcript!, s.words.map((w) => w.id), text) }));
                if (remember) {
                  const after = text.split(/\s+/).filter(Boolean);
                  const added = learnPairs(before, after, dictionary);
                  if (added.length) {
                    void setDictionary([...dictionary, ...added]);
                    showToast(`נשמר. ${added.length} תיקונים נוספו למילון האישי.`);
                  }
                }
                setEditing(null);
              }}
              onToggleEmphasis={(w) => edit((x) => ({ ...x, transcript: updateWord(x.transcript!, w.id, { emphasis: !w.emphasis }) }))}
              onPlay={() => playRange(s.start, s.end)}
            />
          ) : (
            <div key={s.id} id={`s-${s.id}`} className={'sentence' + (s.words.every(isCut) ? ' cut' : '')}>
              <div className="head">
                {(() => {
                  const sp = t.speakers.find((x) => x.id === s.speakerId);
                  return sp ? <span className="chip" style={{ color: sp.color }}>{sp.name}</span> : null;
                })()}
                <button className="time" onClick={() => playRange(s.start, s.end)} aria-label="ניגון המשפט">▶ {formatTime(s.start)}</button>
                <span className="spacer" />
                {p.kind === 'studio' && (
                  <button className="btn small" onClick={() => toggleSentenceCut(s.words)}>
                    {s.words.every(isCut) ? <>{Icon.restore} החזרה</> : <>{Icon.trash} מחיקה מהסרטון</>}
                  </button>
                )}
              </div>
              <div
                className="words editable"
                role="button"
                tabIndex={0}
                onClick={() => {
                  seek(s.start);
                  setEditing(s.id);
                }}
              >
                {s.words.map((w, i) => (
                  <span key={w.id}>
                    <span
                      className={
                        'w' +
                        (active?.id === w.id ? ' active' : '') +
                        (w.emphasis ? ' emph' : '') +
                        (p.transcriptMode === 'clean' && w.cleanHidden ? ' hidden-clean' : '')
                      }
                    >
                      {p.transcriptMode === 'verbatim' ? stripPunctuation(w.text) || w.text : w.text}
                    </span>
                    {i < s.words.length - 1 ? ' ' : ''}
                  </span>
                ))}
                <span className="edit-hint">{Icon.text}</span>
              </div>
            </div>
          ),
        )}
      </div>
      <Toggle label="הצגת כתוביות על הסרטון" value={p.captionsEnabled} onChange={(v) => edit((x) => ({ ...x, captionsEnabled: v }))} />
    </Sheet>
  );
}

function SentenceEditor(props: {
  s: Sentence;
  onSave: (text: string, remember: boolean) => void;
  onDone: () => void;
  onToggleEmphasis: (w: Word) => void;
  onPlay: () => void;
}) {
  const { s } = props;
  const [text, setText] = useState(s.words.map((w) => w.text).join(' '));
  const [remember, setRemember] = useState(true);
  const [emph, setEmph] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, []);
  return (
    <div id={`s-${s.id}`} className="sentence editing">
      <div className="head">
        <button className="time" onClick={props.onPlay}>▶ השמעת המשפט ({formatTime(s.start)})</button>
      </div>
      {emph ? (
        <div className="words">
          {s.words.map((w) => (
            <button key={w.id} className={'chip-word' + (w.emphasis ? ' on' : '')} onClick={() => props.onToggleEmphasis(w)}>
              {w.text}
            </button>
          ))}
        </div>
      ) : (
        <textarea
          ref={ref}
          className="text-input sentence-input"
          dir="rtl"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
          }}
          aria-label="עריכת המשפט"
        />
      )}
      {!emph && (
        <label className="remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> לזכור את התיקונים למילון האישי
        </label>
      )}
      <div className="row">
        {!emph && (
          <button className="btn small primary" onClick={() => props.onSave(text.trim(), remember)} disabled={!text.trim()}>
            {Icon.check} שמירה
          </button>
        )}
        <button className="btn small" onClick={() => setEmph(!emph)}>{Icon.star} {emph ? 'חזרה לעריכה' : 'הדגשת מילים'}</button>
        <button className="btn small" onClick={props.onDone}>{emph ? 'סיום' : 'ביטול'}</button>
      </div>
      {emph && <p className="hint">לחצי על מילה כדי להדגיש אותה בכתוביות (בצבע ההדגשה).</p>}
    </div>
  );
}

/** Word-for-word corrections become dictionary entries (only when the word count didn't change). */
function learnPairs(before: string[], after: string[], dict: DictionaryEntry[]): DictionaryEntry[] {
  if (before.length !== after.length) return [];
  const known = new Set(dict.map((d) => normalizeWord(d.from)));
  const out: DictionaryEntry[] = [];
  before.forEach((b, i) => {
    const from = normalizeWord(b);
    const to = stripPunctuation(after[i]);
    if (!from || !to || from === normalizeWord(to) || known.has(from) || from.length < 2) return;
    known.add(from);
    out.push({ id: uid('d_'), from, to, keyterm: false });
  });
  return out;
}
