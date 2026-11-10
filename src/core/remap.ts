import type { Range } from './timeline';

/**
 * Map a source time to the output timeline; times inside removed areas snap to the
 * output position where the next kept segment begins.
 */
export function sourceToOutputClamped(t: number, segments: Range[]): number {
  let acc = 0;
  for (const s of segments) {
    if (t < s.start) return acc;
    if (t <= s.end) return acc + (t - s.start);
    acc += s.end - s.start;
  }
  return acc;
}
