import type { Cut, Project } from './types';

export interface Range {
  start: number;
  end: number;
}

/** Merge overlapping / touching ranges (input order doesn't matter). */
export function mergeRanges(ranges: Range[], epsilon = 0.001): Range[] {
  const sorted = ranges
    .filter((r) => r.end - r.start > epsilon)
    .map((r) => ({ start: r.start, end: r.end }))
    .sort((a, b) => a.start - b.start);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + epsilon) {
      last.end = Math.max(last.end, r.end);
    } else {
      out.push(r);
    }
  }
  return out;
}

/** The parts of [start, end] that remain after removing `cuts`. */
export function keepSegments(start: number, end: number, cuts: Range[], minLen = 0.04): Range[] {
  const merged = mergeRanges(cuts);
  const out: Range[] = [];
  let cursor = start;
  for (const c of merged) {
    if (c.end <= cursor) continue;
    if (c.start >= end) break;
    if (c.start > cursor) out.push({ start: cursor, end: Math.min(c.start, end) });
    cursor = Math.max(cursor, c.end);
  }
  if (cursor < end) out.push({ start: cursor, end });
  return out.filter((r) => r.end - r.start >= minLen);
}

export function projectRange(p: Pick<Project, 'trimStart' | 'trimEnd' | 'video'>): Range {
  const end = p.trimEnd ?? p.video.duration;
  return { start: Math.max(0, p.trimStart), end: Math.min(end, p.video.duration) };
}

export function projectSegments(p: Pick<Project, 'trimStart' | 'trimEnd' | 'video' | 'cuts'>): Range[] {
  const r = projectRange(p);
  return keepSegments(r.start, r.end, p.cuts);
}

export function totalDuration(segments: Range[]): number {
  return segments.reduce((s, r) => s + (r.end - r.start), 0);
}

/**
 * Map a source time to the output timeline. Returns null when the time falls inside a removed part.
 */
export function sourceToOutput(t: number, segments: Range[]): number | null {
  let acc = 0;
  for (const s of segments) {
    if (t < s.start) return null;
    if (t <= s.end) return acc + (t - s.start);
    acc += s.end - s.start;
  }
  return null;
}

/** Map an output time back to source time. */
export function outputToSource(t: number, segments: Range[]): number {
  let acc = 0;
  for (const s of segments) {
    const len = s.end - s.start;
    if (t <= acc + len) return s.start + (t - acc);
    acc += len;
  }
  const last = segments[segments.length - 1];
  return last ? last.end : 0;
}

/**
 * Clip a source range to the kept segments and return its pieces on the output timeline.
 */
export function rangeToOutput(r: Range, segments: Range[]): Range[] {
  const out: Range[] = [];
  let acc = 0;
  for (const s of segments) {
    const a = Math.max(r.start, s.start);
    const b = Math.min(r.end, s.end);
    if (b > a) out.push({ start: acc + (a - s.start), end: acc + (b - s.start) });
    acc += s.end - s.start;
  }
  return out;
}

/** If `t` is inside a removed area, returns the source time playback should jump to. */
export function nextPlayableTime(t: number, segments: Range[]): number | null {
  for (const s of segments) {
    if (t < s.start - 0.02) return s.start;
    if (t <= s.end) return null;
  }
  return null; // past the end
}

export function isCut(t: number, cuts: Cut[]): boolean {
  return cuts.some((c) => t >= c.start && t < c.end);
}
