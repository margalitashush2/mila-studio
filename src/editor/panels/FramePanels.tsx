import { useApp } from '../../state/store';
import { usePlayer } from '../player';
import { ColorPicker, Segmented, Sheet, Slider } from '../../ui/controls';
import { formatTime } from '../../core/text';
import type { AspectRatio, FrameFit } from '../../core/types';

export function TrimPanel({ onClose }: { onClose: () => void }) {
  const p = useApp((s) => s.current)!;
  const edit = useApp((s) => s.edit);
  const { time, playRange } = usePlayer();
  const dur = p.video.duration;
  const end = p.trimEnd ?? dur;
  return (
    <Sheet title="חיתוך התחלה וסוף" onClose={onClose}>
      <Slider id="ts" label="התחלה" value={p.trimStart} min={0} max={Math.max(0, end - 0.5)} step={0.05} format={(v) => formatTime(v, true)} onChange={(v) => edit((x) => ({ ...x, trimStart: v }), false)} />
      <Slider id="te" label="סוף" value={end} min={Math.min(dur, p.trimStart + 0.5)} max={dur} step={0.05} format={(v) => formatTime(v, true)} onChange={(v) => edit((x) => ({ ...x, trimEnd: v >= dur - 0.01 ? null : v }), false)} />
      <div className="row split">
        <button className="btn small" onClick={() => edit((x) => ({ ...x, trimStart: Math.min(time, (x.trimEnd ?? dur) - 0.5) }))}>התחלה כאן ({formatTime(time)})</button>
        <button className="btn small" onClick={() => edit((x) => ({ ...x, trimEnd: Math.max(time, x.trimStart + 0.5) }))}>סוף כאן ({formatTime(time)})</button>
      </div>
      <div className="row split">
        <button className="btn small" onClick={() => playRange(p.trimStart, Math.min(end, p.trimStart + 3))}>ניגון ההתחלה</button>
        <button className="btn small" onClick={() => playRange(Math.max(p.trimStart, end - 3), end)}>ניגון הסוף</button>
      </div>
      <button className="btn" onClick={() => edit((x) => ({ ...x, trimStart: 0, trimEnd: null }))}>ביטול החיתוך</button>
      <p className="hint">הקובץ המקורי לא משתנה. החיתוך חל רק על הייצוא.</p>
    </Sheet>
  );
}

export function AspectPanel({ onClose }: { onClose: () => void }) {
  const p = useApp((s) => s.current)!;
  const { edit, brand } = useApp();
  return (
    <Sheet title="יחס מסך" onClose={onClose}>
      <Segmented<AspectRatio>
        value={p.aspect}
        onChange={(v) => edit((x) => ({ ...x, aspect: v }))}
        options={[
          { value: 'original', label: 'מקורי' },
          { value: '9:16', label: '9:16' },
          { value: '1:1', label: '1:1' },
          { value: '4:5', label: '4:5' },
          { value: '16:9', label: '16:9' },
        ]}
      />
      <p className="hint">9:16 לרילס, טיקטוק וסטטוס · 1:1 ו-4:5 לפיד · 16:9 ליוטיוב</p>
      {p.aspect !== 'original' && (
        <>
          <Segmented<FrameFit> value={p.fit} onChange={(v) => edit((x) => ({ ...x, fit: v }))} options={[{ value: 'fit', label: 'הסרטון כולו (עם שוליים)' }, { value: 'fill', label: 'מילוי המסך (זום)' }]} />
          {p.fit === 'fit' && <ColorPicker label="צבע השוליים" value={p.frameBackground} extra={brand?.colors} onChange={(c) => edit((x) => ({ ...x, frameBackground: c }))} />}
        </>
      )}
    </Sheet>
  );
}
