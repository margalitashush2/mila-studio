import { useEffect, useState } from 'react';
import { useApp } from '../state/store';
import { db } from '../services/db';

const cache = new Map<string, HTMLImageElement>();

export async function loadLogoImage(logoId: string): Promise<HTMLImageElement | null> {
  if (cache.has(logoId)) return cache.get(logoId)!;
  const asset = useApp.getState().brand?.logos.find((l) => l.id === logoId);
  if (!asset) return null;
  const blob = await db.getBlob(asset.blobKey);
  if (!blob) return null;
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await img.decode().catch(() => undefined);
  cache.set(logoId, img);
  return img;
}

export function useLogoImage(logoId: string | null): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(logoId ? cache.get(logoId) ?? null : null);
  useEffect(() => {
    if (!logoId) return setImg(null);
    let alive = true;
    void loadLogoImage(logoId).then((i) => alive && setImg(i));
    return () => {
      alive = false;
    };
  }, [logoId]);
  return img;
}
