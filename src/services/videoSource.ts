import type { Project } from '../core/types';
import { usePlayer } from '../editor/player';
import { db } from './db';

/**
 * The project's video as a readable Blob plus a playable URL.
 * Prefers the copy already loaded in the preview (known to work), then storage.
 */
export async function getVideo(p: Project): Promise<{ blob: Blob | null; url: string; revoke: () => void }> {
  const { src, srcKey } = usePlayer.getState();
  if (src && srcKey === p.videoKey) {
    let blob: Blob | null = null;
    try {
      blob = await (await fetch(src)).blob();
    } catch {
      blob = null;
    }
    return { blob, url: src, revoke: () => undefined };
  }
  const b = await db.getVideo(p.videoKey);
  if (!b) throw new Error('קובץ הסרטון לא נמצא במכשיר.');
  const url = URL.createObjectURL(b);
  return { blob: b, url, revoke: () => URL.revokeObjectURL(url) };
}
