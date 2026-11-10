import { useRef, useState } from 'react';
import { useApp } from '../../state/store';
import { Progress, Segmented, Sheet } from '../../ui/controls';
import { Icon } from '../../ui/icons';
import { buildCues } from '../../core/captions';
import { buildSrt } from '../../core/srt';
import { plainText } from '../../core/transcript';
import { projectSegments, totalDuration } from '../../core/timeline';
import { outputSize } from '../../render/renderer';
import { Exporter, exportSupported } from '../../render/exporter';
import { getVideo } from '../../services/videoSource';
import { ensureFont, registerCustomFont, resolveFamily } from '../../services/fonts';
import { saveFile, safeName, zipFiles } from '../../services/share';
import { loadLogoImage } from '../useLogo';
import { formatTime } from '../../core/text';

type Kind = 'captions' | 'clean' | 'audio';

export function ExportPanel({ onClose }: { onClose: () => void }) {
  const p = useApp((s) => s.current)!;
  const { settings, setSettings, showToast, brand } = useApp();
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const exporterRef = useRef<Exporter | null>(null);
  const segments = projectSegments(p);
  const outDur = totalDuration(segments);
  const q = settings.exportQuality;
  const size = outputSize(p.aspect, p.video.width, p.video.height, q);
  const supported = exportSupported();
  const name = safeName(p.name);
  const untouched = !p.cuts.length && p.trimStart === 0 && p.trimEnd == null && p.aspect === 'original' && !p.logo;

  const cues = () => buildCues(p.transcript, p.captionStyle, p.transcriptMode, p.cuts);

  const start = async (kind: Kind) => {
    setError(null);
    setResult(null);
    if (kind === 'clean' && untouched) {
      // Original file, untouched quality — no re-encoding needed.
      try {
        const v = await getVideo(p);
        if (v.blob) setResult({ blob: v.blob, name: `${name}.${v.blob.type.includes('quicktime') ? 'mov' : 'mp4'}` });
        else setError('לא הצלחנו לקרוא את הקובץ המקורי.');
        v.revoke();
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    }
    // Exporter must be created synchronously inside the tap (iOS audio/playback unlock).
    const ex = new Exporter();
    exporterRef.current = ex;
    setProgress(0);
    let revoke: (() => void) | null = null;
    try {
      const v = await getVideo(p);
      revoke = v.revoke;
      const url = v.url;
      const family = resolveFamily(p.captionStyle.fontId, brand?.customFonts ?? []);
      const cf = brand?.customFonts.find((f) => f.id === p.captionStyle.fontId);
      if (cf) await registerCustomFont(cf);
      else await ensureFont(family);
      let logo: { image: HTMLImageElement; placement: NonNullable<typeof p.logo> } | null = null;
      if (p.logo && kind !== 'audio') {
        const img = await loadLogoImage(p.logo.logoId);
        if (img) logo = { image: img, placement: p.logo };
      }
      const r = await ex.run({
        videoUrl: url,
        segments,
        width: size.width,
        height: size.height,
        fit: p.fit,
        background: p.frameBackground,
        cues: kind === 'captions' && p.captionsEnabled ? cues() : null,
        style: p.captionStyle,
        fontFamily: family,
        logo,
        audioOnly: kind === 'audio',
        onProgress: setProgress,
      });
      const ext = r.mimeType.includes('webm') ? 'webm' : 'mp4';
      setResult({ blob: r.blob, name: `${name}${kind === 'audio' ? '-אודיו' : kind === 'clean' ? '' : '-כתוביות'}.${ext}` });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      revoke?.();
      setProgress(null);
      exporterRef.current = null;
    }
  };

  const save = async () => {
    if (!result) return;
    const r = await saveFile(result.blob, result.name);
    if (r === 'saved') showToast('נשמר! בחלון השיתוף בחרי "שמירת וידאו" כדי שיופיע בגלריה.');
    if (r === 'failed') showToast('השמירה נכשלה. נסי שוב.');
  };

  const saveSrt = async () => {
    const srt = buildSrt(cues(), segments);
    const r = await saveFile(zipFiles([{ name: `${name}.srt`, data: srt }]), `${name}-srt.zip`);
    if (r === 'saved') showToast('קובץ הכתוביות נשמר (בתוך ZIP — פותחים אותו באפליקציית הקבצים).');
  };
  const saveTxt = async () => {
    const r = await saveFile(new Blob([plainText(p.transcript!, { mode: p.transcriptMode === 'clean' ? 'clean' : 'organized' })], { type: 'text/plain' }), `${name}-תמלול.txt`);
    if (r === 'saved') showToast('התמלול נשמר');
  };

  return (
    <Sheet title="ייצוא ושמירה" onClose={() => { exporterRef.current?.cancel(); onClose(); }} tall>
      {progress != null ? (
        <div className="status-card">
          <b>מייצא… {Math.round(progress * 100)}%</b>
          <Progress value={progress} />
          <p className="hint">הייצוא מתבצע בזמן אמת (סרטון של {formatTime(outDur)} דקות ייקח בערך אותו זמן). השאירי את המסך פתוח ואל תעברי לאפליקציה אחרת.</p>
          <button className="btn" onClick={() => exporterRef.current?.cancel()}>ביטול</button>
        </div>
      ) : result ? (
        <div className="status-card">
          <b>{Icon.check} הקובץ מוכן ({(result.blob.size / 1e6).toFixed(1)}MB)</b>
          <button className="btn primary block" onClick={save}>{Icon.export} שמירה לגלריה / שיתוף</button>
          <button className="btn block" onClick={() => setResult(null)}>ייצוא נוסף</button>
        </div>
      ) : (
        <>
          {error && <div className="banner error">{error}</div>}
          {!supported && <div className="banner error">הדפדפן הזה לא תומך בייצוא וידאו. עדכני את מערכת ההפעלה של האייפון לגרסה האחרונה.</div>}
          <div className="field">
            <span className="field-label">איכות <output>{size.width}×{size.height}</output></span>
            <Segmented value={q} onChange={(v) => setSettings({ exportQuality: v })} options={[{ value: 720, label: '720p' }, { value: 1080, label: '1080p' }, { value: 2160, label: '4K (ניסיוני)' }]} />
          </div>
          <p className="hint">אורך הסרטון המיוצא: {formatTime(outDur)}{p.cuts.length ? ` (אחרי ${p.cuts.length} הסרות)` : ''}</p>
          <button className="btn primary block" disabled={!supported || !p.transcript} onClick={() => void start('captions')}>{Icon.captions} סרטון עם כתוביות</button>
          <button className="btn block" disabled={!supported && !untouched} onClick={() => void start('clean')}>{Icon.film} סרטון בלי כתוביות{untouched ? ' (הקובץ המקורי)' : ''}</button>
          <button className="btn block" disabled={!supported} onClick={() => void start('audio')}>{Icon.music} אודיו בלבד</button>
          <div className="row split">
            <button className="btn" disabled={!p.transcript} onClick={saveSrt}>קובץ SRT</button>
            <button className="btn" disabled={!p.transcript} onClick={saveTxt}>תמלול כטקסט</button>
          </div>
          <p className="hint">ה-SRT מותאם לזמנים של הסרטון הערוך, עם סימני כיווניות כדי שהעברית תוצג נכון בכל נגן.</p>
        </>
      )}
    </Sheet>
  );
}
