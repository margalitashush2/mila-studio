import { useApp } from '../state/store';
import { db, uid } from '../services/db';
import type { LogoAsset } from '../core/types';

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    };
    document.body.appendChild(input);
    input.click();
  });
}

export async function addLogo(file: File): Promise<LogoAsset> {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.src = url;
  await img.decode();
  const asset: LogoAsset = { id: uid('l_'), blobKey: uid('lb_'), width: img.naturalWidth, height: img.naturalHeight, name: file.name };
  URL.revokeObjectURL(url);
  await db.putBlob(asset.blobKey, file);
  const app = useApp.getState();
  const brand = app.brand!;
  const defaultLogo = brand.defaultLogo.logoId ? brand.defaultLogo : { ...brand.defaultLogo, logoId: asset.id };
  await app.setBrand({ ...brand, logos: [...brand.logos, asset], defaultLogo });
  return asset;
}

/** Upload a logo and, when a project is open, put it on the video. */
export function useLogoUpload() {
  return async () => {
    const f = await pickFile('image/png,image/*');
    if (!f) return;
    try {
      const asset = await addLogo(f);
      const app = useApp.getState();
      if (app.current) {
        const d = app.brand!.defaultLogo;
        app.edit((x) => ({ ...x, logo: { logoId: asset.id, x: x.logo?.x ?? d.x, y: x.logo?.y ?? d.y, scale: x.logo?.scale ?? d.scale, opacity: x.logo?.opacity ?? d.opacity } }));
      }
    } catch {
      useApp.getState().showToast('לא הצלחנו לקרוא את התמונה. נסי קובץ PNG או JPG.');
    }
  };
}
