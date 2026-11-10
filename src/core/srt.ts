import type { Cue } from './captions';
import { rtlSafeLine } from './text';
import { sourceToOutputClamped } from './remap';
import type { Range } from './timeline';

export function srtTimestamp(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

/**
 * Build an SRT file. If `segments` is given, timestamps are remapped to the edited output
 * timeline (after trims / cuts) so the file matches the exported video.
 */
export function buildSrt(cues: Cue[], segments?: Range[]): string {
  const blocks: string[] = [];
  let n = 1;
  for (const c of cues) {
    let start = c.start;
    let end = c.end;
    if (segments) {
      start = sourceToOutputClamped(c.start, segments);
      end = sourceToOutputClamped(c.end, segments);
      if (end - start < 0.05) continue;
    }
    const text = c.lines.map((l) => rtlSafeLine(l.map((w) => w.text).join(' '))).join('\n');
    blocks.push(`${n++}\n${srtTimestamp(start)} --> ${srtTimestamp(end)}\n${text}\n`);
  }
  return blocks.join('\n');
}
