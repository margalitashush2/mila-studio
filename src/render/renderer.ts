/**
 * One renderer for both the live preview and the exported video, so what you see is exactly
 * what you get. Draws: the video frame (fit / fill into the output frame), the logo and the
 * captions (RTL-aware layout, per-word highlight, stroke, shadow, background, animation).
 */
import type { Cue } from '../core/captions';
import { activeWordId } from '../core/captions';
import type { CaptionStyle, FrameFit, LogoPlacement } from '../core/types';
import { visualOrderRtl } from '../core/bidi';

export interface FrameSource {
  image: CanvasImageSource;
  width: number;
  height: number;
}

export interface RenderInput {
  video: FrameSource | null;
  fit: FrameFit;
  background: string;
  cue: Cue | null;
  /** time on the SAME timeline as the cue's word times */
  time: number;
  style: CaptionStyle;
  fontFamily: string;
  logo: { image: CanvasImageSource; width: number; height: number; placement: LogoPlacement } | null;
}

type Ctx = CanvasRenderingContext2D;

const ANIM_IN = 0.18;

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function easeOutBack(x: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const v = parseInt(n, 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
}

export function drawVideo(ctx: Ctx, W: number, H: number, src: FrameSource, fit: FrameFit, bg: string) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  if (!src.width || !src.height) return;
  const s = fit === 'fill' ? Math.max(W / src.width, H / src.height) : Math.min(W / src.width, H / src.height);
  const w = src.width * s;
  const h = src.height * s;
  ctx.drawImage(src.image, (W - w) / 2, (H - h) / 2, w, h);
}

export function drawLogo(ctx: Ctx, W: number, H: number, logo: NonNullable<RenderInput['logo']>) {
  const p = logo.placement;
  const w = W * p.scale;
  const h = (w * logo.height) / Math.max(1, logo.width);
  const x = clamp(p.x * W - w / 2, 0, W - w);
  const y = clamp(p.y * H - h / 2, 0, H - h);
  ctx.save();
  ctx.globalAlpha = clamp(p.opacity, 0, 1);
  ctx.drawImage(logo.image, x, y, w, h);
  ctx.restore();
}

interface LaidWord {
  text: string;
  wordId: string;
  emphasis: boolean;
  x: number; // left edge
  w: number;
  dir: 'rtl' | 'ltr';
}

function setFont(ctx: Ctx, px: number, family: string, letterSpacing: number) {
  ctx.font = `${px}px "${family}", "Heebo-Bold", sans-serif`;
  const anyCtx = ctx as Ctx & { letterSpacing?: string };
  if ('letterSpacing' in anyCtx) anyCtx.letterSpacing = `${letterSpacing * px}px`;
}

function measure(ctx: Ctx, text: string, dir: 'rtl' | 'ltr') {
  ctx.direction = dir;
  return ctx.measureText(text).width;
}

/** Lay out one caption line centered on cx; returns words with absolute x. */
function layoutLine(ctx: Ctx, line: Cue['lines'][number], cx: number): { words: LaidWord[]; width: number } {
  const items = visualOrderRtl(line.map((w) => w.text));
  const space = measure(ctx, ' ', 'rtl');
  const widths = items.map((it) => measure(ctx, it.text, it.dir));
  let total = 0;
  items.forEach((it, i) => {
    total += widths[i];
    const next = items[i + 1];
    if (next && next.index !== it.index) total += space;
  });
  let x = cx + total / 2; // start at right edge
  const words: LaidWord[] = [];
  items.forEach((it, i) => {
    const w = widths[i];
    x -= w;
    const src = line[it.index];
    words.push({ text: it.text, wordId: src.id, emphasis: src.emphasis, x, w, dir: it.dir });
    const next = items[i + 1];
    if (next && next.index !== it.index) x -= space;
  });
  return { words, width: total };
}

export function drawCaption(ctx: Ctx, W: number, H: number, input: Pick<RenderInput, 'cue' | 'time' | 'style' | 'fontFamily'>) {
  const { cue, time, style, fontFamily } = input;
  if (!cue) return;
  const base = Math.min(W, H);
  let px = style.fontScale * base;
  setFont(ctx, px, fontFamily, style.letterSpacing);
  const maxW = style.maxWidth * W;

  // Shrink to fit the widest line inside maxWidth.
  let widest = 0;
  for (const line of cue.lines) widest = Math.max(widest, layoutLine(ctx, line, W / 2).width);
  if (widest > maxW) {
    px = px * (maxW / widest);
    setFont(ctx, px, fontFamily, style.letterSpacing);
  }

  const lineH = px * style.lineHeight;
  const blockH = lineH * cue.lines.length;
  const cy = clamp(style.positionY * H, blockH / 2 + px * 0.4, H - blockH / 2 - px * 0.4);

  const p = clamp((time - cue.start) / ANIM_IN, 0, 1);
  ctx.save();
  if (style.animation === 'fade') ctx.globalAlpha = p;
  if (style.animation === 'pop') {
    const s = 0.82 + 0.18 * easeOutBack(p);
    ctx.translate(W / 2, cy);
    ctx.scale(s, s);
    ctx.translate(-W / 2, -cy);
    ctx.globalAlpha = Math.min(1, p * 2);
  }
  if (style.animation === 'slide') {
    ctx.translate(0, (1 - p) * px * 0.6);
    ctx.globalAlpha = p;
  }

  const active = style.highlightMode !== 'none' ? activeWordId(cue, time) : null;
  const laid = cue.lines.map((line) => layoutLine(ctx, line, W / 2));
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  laid.forEach((line, li) => {
    const y = cy - blockH / 2 + lineH * (li + 0.5);
    if (style.background) {
      const padX = px * 0.35;
      const padY = px * 0.12;
      ctx.fillStyle = hexToRgba(style.backgroundColor, style.backgroundOpacity);
      roundRect(ctx, W / 2 - line.width / 2 - padX, y - lineH / 2 - padY + px * 0.04, line.width + padX * 2, lineH + padY * 2, px * 0.22);
      ctx.fill();
    }
    for (const w of line.words) {
      const isActive = active === w.wordId;
      if (isActive && style.highlightMode === 'box') {
        ctx.fillStyle = style.highlightColor;
        const pad = px * 0.14;
        roundRect(ctx, w.x - pad, y - px * 0.58, w.w + pad * 2, px * 1.16, px * 0.2);
        ctx.fill();
      }
      let color = style.textColor;
      if (w.emphasis) color = style.emphasisColor;
      if (isActive && style.highlightMode === 'color') color = style.highlightColor;
      if (isActive && style.highlightMode === 'box') color = style.highlightTextColor;
      ctx.direction = w.dir;
      if (style.strokeWidth > 0) {
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.lineWidth = style.strokeWidth * px * 2;
        ctx.strokeStyle = style.strokeColor;
        ctx.strokeText(w.text, w.x, y);
        ctx.restore();
      }
      ctx.save();
      if (style.shadow) {
        ctx.shadowColor = hexToRgba(style.shadowColor, 0.75);
        ctx.shadowBlur = px * 0.25;
        ctx.shadowOffsetY = px * 0.06;
      }
      ctx.fillStyle = color;
      ctx.fillText(w.text, w.x, y);
      ctx.restore();
    }
  });
  ctx.restore();
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function renderFrame(ctx: Ctx, W: number, H: number, input: RenderInput) {
  if (input.video) drawVideo(ctx, W, H, input.video, input.fit, input.background);
  else {
    ctx.fillStyle = input.background;
    ctx.fillRect(0, 0, W, H);
  }
  if (input.logo) drawLogo(ctx, W, H, input.logo);
  drawCaption(ctx, W, H, input);
}

/** Output frame size for an aspect ratio and target quality (short side in px). */
export function outputSize(
  aspect: '9:16' | '16:9' | '1:1' | '4:5' | 'original',
  videoW: number,
  videoH: number,
  shortSide: number,
): { width: number; height: number } {
  let rw: number;
  let rh: number;
  switch (aspect) {
    case '9:16': rw = 9; rh = 16; break;
    case '16:9': rw = 16; rh = 9; break;
    case '1:1': rw = 1; rh = 1; break;
    case '4:5': rw = 4; rh = 5; break;
    default: rw = videoW || 9; rh = videoH || 16;
  }
  const scale = shortSide / Math.min(rw, rh);
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  let width = even(rw * scale);
  let height = even(rh * scale);
  if (aspect === 'original' && videoW && videoH) {
    // never upscale the original
    const maxShort = Math.min(videoW, videoH);
    if (shortSide > maxShort) {
      const k = maxShort / shortSide;
      width = even(width * k);
      height = even(height * k);
    }
  }
  return { width, height };
}
