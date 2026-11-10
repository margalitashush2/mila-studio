import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '../core/types';
import { buildCues, cueAt } from '../core/captions';
import { nextPlayableTime, projectSegments } from '../core/timeline';
import { renderFrame, outputSize } from '../render/renderer';
import { usePlayer } from './player';
import { db } from '../services/db';
import { ensureFont, resolveFamily, registerCustomFont } from '../services/fonts';
import { useApp } from '../state/store';
import { useLogoImage } from './useLogo';

/**
 * Live preview: the hidden <video> is drawn every frame onto a canvas with the same renderer
 * used for export, so captions, logo and framing look exactly like the final file.
 */
export function Preview({ project }: { project: Project }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [box, setBox] = useState({ w: 300, h: 400 });
  const brand = useApp((s) => s.brand);
  const attach = usePlayer((s) => s.attach);

  useEffect(() => {
    let u: string | null = null;
    void db.getVideo(project.videoKey).then((b) => {
      if (b) {
        u = URL.createObjectURL(b);
        setUrl(u);
        usePlayer.setState({ src: u, srcKey: project.videoKey });
      }
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
      if (usePlayer.getState().src === u) usePlayer.setState({ src: null, srcKey: null });
    };
  }, [project.videoKey]);

  useEffect(() => {
    attach(videoRef.current);
    return () => attach(null);
  }, [attach, url]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const custom = brand?.customFonts ?? [];
  const family = resolveFamily(project.captionStyle.fontId, custom);
  useEffect(() => {
    const cf = custom.find((f) => f.id === project.captionStyle.fontId);
    if (cf) void registerCustomFont(cf);
    else void ensureFont(family);
  }, [family, custom, project.captionStyle.fontId]);

  const cues = useMemo(
    () => (project.captionsEnabled ? buildCues(project.transcript, project.captionStyle, project.transcriptMode, project.cuts) : []),
    [project.transcript, project.captionStyle, project.transcriptMode, project.cuts, project.captionsEnabled],
  );
  const segments = useMemo(() => projectSegments(project), [project]);
  const logo = useLogoImage(project.logo?.logoId ?? null);

  // Canvas size: output aspect fitted into the stage box, at device pixel ratio.
  const out = outputSize(project.aspect, project.video.width, project.video.height, 1080);
  const scale = Math.min(box.w / out.width, box.h / out.height);
  const cssW = Math.max(1, Math.floor(out.width * scale));
  const cssH = Math.max(1, Math.floor(out.height * scale));
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  const stateRef = useRef({ project, cues, segments, family, logo });
  stateRef.current = { project, cues, segments, family, logo };

  useEffect(() => {
    let raf = 0;
    let lastUi = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c) return;
      const st = stateRef.current;
      const player = usePlayer.getState();
      let t = v.currentTime;
      if (!v.paused) {
        if (player.stopAt != null && t >= player.stopAt) {
          v.pause();
          usePlayer.setState({ stopAt: null });
        } else if (player.stopAt == null) {
          const jump = nextPlayableTime(t, st.segments);
          const last = st.segments[st.segments.length - 1];
          if (jump != null) {
            v.currentTime = jump;
            t = jump;
          } else if (last && t >= last.end) {
            v.pause();
          }
        }
      }
      if (now - lastUi > 80) {
        lastUi = now;
        if (Math.abs(player.time - t) > 0.03) player.setTime(t);
        if (player.playing === v.paused) player.setPlaying(!v.paused);
      }
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const W = c.width;
      const H = c.height;
      renderFrame(ctx, W, H, {
        video: v.readyState >= 2 ? { image: v, width: v.videoWidth, height: v.videoHeight } : null,
        fit: st.project.fit,
        background: st.project.frameBackground,
        cue: cueAt(st.cues, t),
        time: t,
        style: st.project.captionStyle,
        fontFamily: st.family,
        logo: st.logo && st.project.logo ? { image: st.logo, width: st.logo.naturalWidth, height: st.logo.naturalHeight, placement: st.project.logo } : null,
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="stage" ref={boxRef} onClick={() => usePlayer.getState().toggle()}>
      {url && (
        <video ref={videoRef} src={url} playsInline preload="auto" onLoadedData={(e) => (e.currentTarget.currentTime = Math.max(0.01, project.trimStart))} />
      )}
      <canvas ref={canvasRef} width={Math.round(cssW * dpr)} height={Math.round(cssH * dpr)} style={{ width: cssW, height: cssH }} />
    </div>
  );
}
