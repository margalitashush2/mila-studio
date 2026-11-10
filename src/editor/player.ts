import { create } from 'zustand';

/** Shared playback state for the open project (time is on the SOURCE timeline). */
interface PlayerState {
  time: number;
  playing: boolean;
  video: HTMLVideoElement | null;
  /** Object URL of the video currently loaded in the preview, and which project video it is. */
  src: string | null;
  srcKey: string | null;
  /** When set, playback stops at this source time (used for previews of a single range). */
  stopAt: number | null;
  attach(v: HTMLVideoElement | null): void;
  setTime(t: number): void;
  setPlaying(p: boolean): void;
  seek(t: number): void;
  toggle(): void;
  playRange(start: number, end: number): void;
}

export const usePlayer = create<PlayerState>((set, get) => ({
  time: 0,
  playing: false,
  video: null,
  src: null,
  srcKey: null,
  stopAt: null,
  attach(v) {
    set({ video: v });
  },
  setTime(t) {
    set({ time: t });
  },
  setPlaying(p) {
    set({ playing: p });
  },
  seek(t) {
    const v = get().video;
    if (v) v.currentTime = Math.max(0, t);
    set({ time: t });
  },
  toggle() {
    const v = get().video;
    if (!v) return;
    if (v.paused) void v.play().catch(() => undefined);
    else v.pause();
    set({ stopAt: null });
  },
  playRange(start, end) {
    const v = get().video;
    if (!v) return;
    v.currentTime = start;
    set({ stopAt: end, time: start });
    void v.play().catch(() => undefined);
  },
}));
