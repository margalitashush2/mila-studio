import { useState } from 'react';
import { useApp } from '../state/store';
import { Icon } from '../ui/icons';
import { createProject } from '../services/projects';
import { db } from '../services/db';
import { pickFile } from './useLogoUpload';
import { formatTime } from '../core/text';
import type { Project, ProjectKind } from '../core/types';

export function Home({ go }: { go: (s: 'brand' | 'dictionary' | 'settings') => void }) {
  const { projects, open, refreshProjects, showToast } = useApp();
  const hasKey = useApp((s) => !!s.settings.elevenLabsKey?.trim());
  const [busy, setBusy] = useState<ProjectKind | null>(null);
  const [step, setStep] = useState('טוען את הסרטון…');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const start = async (kind: ProjectKind) => {
    const file = await pickFile('video/*');
    if (!file) return;
    setBusy(kind);
    try {
      setStep('טוען את הסרטון…');
      const p = await createProject(file, kind, setStep);
      await refreshProjects();
      open(p);
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (p: Project) => {
    await db.deleteProject(p);
    setConfirmDelete(null);
    await refreshProjects();
    showToast('הפרויקט נמחק');
  };

  return (
    <div className="screen">
      <header>
        <div className="brand-mark">מילה<span>.</span></div>
        <p className="lede">תמלול עברית, כתוביות ועריכת וידאו. הכול על הטלפון.</p>
      </header>

      {!hasKey && (
        <button className="banner" onClick={() => go('settings')} style={{ textAlign: 'start' }}>
          <b>✨ לתמלול מדויק בעברית:</b> חברי את ElevenLabs בהגדרות. זה לוקח 2 דקות. לחצי כאן.
        </button>
      )}
      <div className="mode-grid">
        <button className="mode-card primary" onClick={() => void start('transcribe')} disabled={!!busy}>
          <span className="glyph">{Icon.captions}</span>
          <b>{busy === 'transcribe' ? step : 'תמלול בלבד'}</b>
          <small>תמלול, תיקון, כתוביות מעוצבות ו-SRT. הסרטון נשאר כמו שהוא.</small>
        </button>
        <button className="mode-card secondary" onClick={() => void start('studio')} disabled={!!busy}>
          <span className="glyph">{Icon.film}</span>
          <b>{busy === 'studio' ? step : 'תמלול ועריכה מלאה'}</b>
          <small>הכול, ובנוסף לוגו, חיתוך, הסרת שתיקות ומילות מילוי ויחס מסך.</small>
        </button>
      </div>

      <section style={{ display: 'grid', gap: 10 }}>
        <h2 className="section-title">הפרויקטים שלי</h2>
        {projects.length ? (
          <div className="project-list">
            {projects.map((p) => (
              <div key={p.id} className="project-row">
                <button onClick={() => open(p)} aria-label={`פתיחת ${p.name}`} style={{ display: 'contents' }}>
                  {p.thumbnail ? <img src={p.thumbnail} alt="" /> : <span className="ph" />}
                  <span className="meta">
                    <b>{p.name}</b>
                    <small>
                      {formatTime(p.video.duration)} · {new Date(p.updatedAt).toLocaleDateString('he-IL')}{' '}
                      <span className={'chip ' + (p.kind === 'studio' ? 'violet' : 'honey')}>{p.kind === 'studio' ? 'עריכה' : 'תמלול'}</span>
                      {!p.transcript && <> <span className="chip">לא תומלל</span></>}
                    </small>
                  </span>
                </button>
                {confirmDelete === p.id ? (
                  <button className="btn small danger" onClick={() => void remove(p)}>למחוק?</button>
                ) : (
                  <button className="icon-btn" onClick={() => setConfirmDelete(p.id)} aria-label="מחיקה">{Icon.trash}</button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            {Icon.film}
            <span>עדיין אין פרויקטים. בחרי אחת מהאפשרויות למעלה כדי לבחור סרטון מהגלריה.</span>
          </div>
        )}
      </section>

      <p className="version-tag">גרסה 14</p>
      <nav className="links">
        <button className="link-tile" onClick={() => go('brand')}>{Icon.brand}<span>המיתוג שלי</span></button>
        <button className="link-tile" onClick={() => go('dictionary')}>{Icon.book}<span>מילון אישי</span></button>
        <button className="link-tile" onClick={() => go('settings')}>{Icon.gear}<span>הגדרות</span></button>
      </nav>
    </div>
  );
}
