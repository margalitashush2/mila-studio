import { useEffect, useState } from 'react';
import { useApp } from '../../state/store';
import { runTranscription } from '../../services/projects';
import { getManifest, modelIsDownloaded } from '../../asr/engine';
import { Progress } from '../../ui/controls';
import { Icon } from '../../ui/icons';
import { formatTime } from '../../core/text';
import { AudioCapture, audioDebug } from '../../asr/audioExtract';

function localStorageFlag(k: string) {
  try {
    return localStorage.getItem(k) === '1';
  } catch {
    return false;
  }
}

const LABEL: Record<string, string> = {
  download: 'מוריד את מנוע התמלול לטלפון (פעם אחת בלבד)',
  loading: 'מפעיל את מנוע התמלול',
  audio: 'מכין את השמע מהסרטון',
  transcribe: 'מתמלל',
};

export function TranscribeCard() {
  const job = useApp((s) => s.current?.transcriptionJob);
  const cloud = useApp((s) => !!s.settings.elevenLabsKey?.trim());
  const [downloaded, setDownloaded] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [sizeMb, setSizeMb] = useState<number | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [busy]);
  useEffect(() => {
    void modelIsDownloaded().then(setDownloaded);
    void getManifest().then((m) => setSizeMb(Math.round(m.totalBytes / 1e6))).catch(() => undefined);
  }, []);

  const start = async () => {
    // Created synchronously in the tap so iOS allows silent playback for audio capture later.
    const capture = new AudioCapture();
    if (localStorageFlag('mila-force-realtime')) audioDebug.forceRealtime = true;
    setBusy(true);
    try {
      await runTranscription(capture);
    } catch {
      /* error shown from job */
    } finally {
      setBusy(false);
    }
  };

  const running = busy && job && job.status !== 'failed';
  return (
    <div className="status-card" style={{ margin: '10px 16px 0' }}>
      {running ? (
        <>
          <b>{LABEL[job.status] ?? 'עובד…'}</b>
          <Progress value={job.progress} />
          {job.status === 'download' && job.progress != null && <p className="hint">{Math.round(job.progress * 100)}% · ההורדה נשמרת גם אם תיסגר האפליקציה</p>}
          {job.status === 'audio' && job.progress != null && <p className="hint">קורא את השמע מהסרטון בזמן אמת ({Math.round(job.progress * 100)}%). השאירי את המסך פתוח.</p>}
          {job.status === 'transcribe' && cloud && <p className="hint">{job.detail ?? 'מתמלל…'}</p>}
          {job.status === 'transcribe' && !cloud && (
            <>
              <p className="hint">
                {job.detail ? `${job.detail} · ` : ''}עברו {formatTime((Date.now() - job.startedAt) / 1000)} · התמלול רץ על הטלפון ולוקח בערך פי 2–4 מאורך הסרטון. השאירי את המסך פתוח.
              </p>
              {job.text ? <p className="live-text">…{job.text}</p> : <p className="hint">מעבד את תחילת הסרטון…</p>}
            </>
          )}
        </>
      ) : (
        <>
          {job?.status === 'failed' && <div className="banner error">{job.error}</div>}
          <b>התמלול עוד לא נעשה</b>
          <p className="hint">
            {cloud ? 'תמלול מדויק בעברית דרך ElevenLabs. לוקח בדרך כלל פחות מדקה.' : 'התמלול רץ על הטלפון עצמו.'}
            {!cloud && downloaded === false && ` בפעם הראשונה נטען מנוע התמלול${sizeMb ? ` (כ-${sizeMb}MB)` : ''}, ולכן עדיף להיות מחוברים ל-Wi-Fi.`}
          </p>
          <button className="btn primary block" onClick={start}>
            {Icon.mic} {job?.status === 'failed' ? 'לנסות שוב' : 'תמלול הסרטון'}
          </button>
        </>
      )}
    </div>
  );
}
