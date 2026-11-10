import type { Project, ProjectKind, Transcript, VideoInfo } from '../core/types';
import { DEFAULT_CAPTION_STYLE } from '../core/presets';
import { applyDictionary } from '../core/cleanup';
import { db, uid } from './db';
import { transcribeOnDevice } from '../asr/engine';
import { decodeFileTo16k, fromInt16, toInt16 } from '../asr/audioExtract';
import { extractSpeech16k, type AudioCapture } from '../asr/audioExtract';
import type { EngineStage } from '../asr/engine';
import { getVideo } from './videoSource';
import { correctTranscript, getSample } from './claudeFix';
import { useApp } from '../state/store';

function loadVideoMeta(url: string): Promise<{ v: HTMLVideoElement; duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;
    v.src = url;
    v.onloadedmetadata = () => resolve({ v, duration: v.duration, width: v.videoWidth, height: v.videoHeight });
    v.onerror = () => reject(new Error('לא ניתן לקרוא את הסרטון. נסי קובץ אחר.'));
  });
}

async function makeThumbnail(v: HTMLVideoElement, at: number): Promise<string | null> {
  try {
    await new Promise<void>((res, rej) => {
      v.onseeked = () => res();
      v.onerror = () => rej();
      v.currentTime = at;
    });
    const c = document.createElement('canvas');
    const s = 320 / Math.max(v.videoWidth, v.videoHeight);
    c.width = Math.round(v.videoWidth * s);
    c.height = Math.round(v.videoHeight * s);
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
}

export async function createProject(file: File, kind: ProjectKind, onStep?: (label: string) => void): Promise<Project> {
  const id = uid('p_');
  const videoKey = uid('v_');
  const url = URL.createObjectURL(file);
  try {
    const meta = await loadVideoMeta(url);
    if (!isFinite(meta.duration) || meta.duration <= 0) throw new Error('לא ניתן לקרוא את אורך הסרטון.');
    const thumbnail = await makeThumbnail(meta.v, Math.min(1, meta.duration / 3));
    onStep?.('שומר את הסרטון…');
    const mem = await db.putVideo(videoKey, file);
    // Pull the speech audio out now, from our own in-memory copy.
    onStep?.('מכין את השמע לתמלול…');
    let audioNote: string | undefined;
    try {
      const pcm = await decodeFileTo16k(mem);
      await db.putAudio(videoKey, toInt16(pcm));
    } catch (e) {
      audioNote = (e as Error)?.message ?? String(e); // transcription will use real-time capture instead
    }
    const video: VideoInfo = {
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      fps: 30,
      hasAudio: true,
      fileSize: file.size,
      mimeType: file.type || 'video/mp4',
    };
    const name = file.name.replace(/\.[^.]+$/, '') || 'פרויקט חדש';
    const now = Date.now();
    const brand = useApp.getState().brand;
    const p: Project = {
      id,
      kind,
      name,
      createdAt: now,
      updatedAt: now,
      videoKey,
      thumbnail,
      video,
      transcript: null,
      transcriptMode: 'organized',
      transcriptionJob: null,
      captionsEnabled: true,
      captionStyle: brand?.captionStyle ?? DEFAULT_CAPTION_STYLE,
      logo: null,
      cuts: [],
      trimStart: 0,
      trimEnd: null,
      aspect: 'original',
      fit: 'fit',
      frameBackground: '#000000',
      audioNote,
    };
    await db.saveProject(p);
    return p;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Transcribe the open project on the device. Progress is kept in project.transcriptionJob
 * (not undoable). Nothing in the video is changed.
 */
let running = false;

export async function runTranscription(capture: AudioCapture): Promise<void> {
  const app = useApp.getState();
  const p = app.current;
  if (!p || running) {
    capture.close();
    return;
  }
  running = true;
  const setJob = (job: Project['transcriptionJob']) =>
    useApp.getState().edit((x) => (x.id === p.id ? { ...x, transcriptionJob: job } : x), false);
  const startedAt = Date.now();
  setJob({ status: 'loading', startedAt });
  try {
    const onStage = (st: EngineStage) => {
      const progress =
        st.stage === 'download'
          ? st.loaded / Math.max(1, st.total)
          : st.stage === 'transcribe'
            ? st.done / Math.max(1, st.total)
            : st.stage === 'audio'
              ? st.progress
              : undefined;
      setJob({
        status: st.stage,
        startedAt,
        progress,
        text: st.stage === 'transcribe' ? st.text : undefined,
        detail: st.stage === 'transcribe' && st.total > 1 ? `חלק ${Math.min(st.done + 1, st.total)} מתוך ${st.total}` : undefined,
      });
    };
    let audio: Float32Array | null = null;
    const saved = await db.getAudio(p.videoKey);
    if (saved && saved.length > 1600) {
      audio = fromInt16(saved);
      capture.close();
    } else {
      onStage({ stage: 'audio' });
      const video = await getVideo(p);
      try {
        if (video.blob) {
          try {
            audio = await decodeFileTo16k(video.blob);
          } catch {
            audio = null;
          }
        }
        if (!audio) audio = await extractSpeech16k(null, video.url, capture, (f: number | undefined) => onStage({ stage: 'audio', progress: f }));
        await db.putAudio(p.videoKey, toInt16(audio!));
      } finally {
        video.revoke();
        capture.close();
      }
    }
    const transcript: Transcript = await transcribeOnDevice(audio!, onStage);
    transcript.words = applyDictionary(transcript.words, useApp.getState().dictionary);
    // Show the raw result right away, then let Claude correct it (spelling, context, punctuation).
    useApp.getState().edit((x) => (x.id === p.id ? { ...x, transcript, transcriptionJob: { status: 'polish', startedAt } } : x), false);
    let finalT = transcript;
    if (await getSample()) try {
      finalT = await correctTranscript(transcript, useApp.getState().dictionary);
      finalT = { ...finalT, words: applyDictionary(finalT.words, useApp.getState().dictionary) };
    } catch (e) {
      useApp.getState().showToast((e as Error).message);
    }
    useApp.getState().edit((x) => (x.id === p.id ? { ...x, transcript: finalT, transcriptionJob: null } : x), true);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    const cur = useApp.getState().current?.transcriptionJob?.status ?? 'loading';
    const where: Record<string, string> = { loading: 'הפעלת המנוע', download: 'הורדת המנוע', audio: 'קריאת השמע', transcribe: 'תמלול', polish: 'תיקון חכם' };
    const note = useApp.getState().current?.audioNote;
    setJob({ status: 'failed', startedAt: Date.now(), error: `${msg}\n[שלב: ${where[cur] ?? cur}${note ? ` · ייבוא: ${note}` : ''}]` });
    throw e;
  } finally {
    running = false;
  }
}
