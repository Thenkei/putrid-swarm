import camerasUrl from './garden-cameras.webp';
import windowUrl from './garden-window.webp';
import { sprite } from '../engine/assets';

let cameras: HTMLImageElement | undefined;
let kitchen: HTMLImageElement | undefined;

function loadSheet(url: string) {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  return image;
}

/** Only the sixth night's invitation starts these downloads. */
export function warmGardenArt() {
  cameras ??= loadSheet(camerasUrl);
  kitchen ??= loadSheet(windowUrl);
}

export function paintGardenPlate(ctx: CanvasRenderingContext2D, garden: number) {
  warmGardenArt();
  const sheet = cameras!;
  if (sheet.complete && sheet.naturalWidth) {
    const height = sheet.naturalHeight / 3;
    // Inset two rows: the image filter must never sample the adjoining camera.
    ctx.drawImage(sheet, 0, garden * height + 2, sheet.naturalWidth, height - 4, 0, 16, 900, 328);
  } else {
    const fallback = sprite('plate_orchard');
    if (fallback) ctx.drawImage(fallback.img, 0, 16, 900, 328);
  }
}

/** Both outcomes use the same camera and the same cottage as the final crossing. */
export function gardenAftermath(canvas: HTMLCanvasElement, home: boolean) {
  warmGardenArt();
  const sheet = kitchen!;
  const paint = () => {
    const ctx = canvas.getContext('2d');
    if (!ctx || !sheet.naturalWidth) return;
    const height = sheet.naturalHeight / 2;
    const crop = sheet.naturalWidth * canvas.height / canvas.width;
    const y = (home ? 0 : height) + (height - crop) / 2;
    ctx.drawImage(sheet, 0, y, sheet.naturalWidth, crop, 0, 0, canvas.width, canvas.height);
  };
  if (sheet.complete && sheet.naturalWidth) paint();
  else {
    // A fast loss or a slow connection can reach the still before it has decoded.
    const ctx = canvas.getContext('2d');
    if (ctx) paintGardenPlate(ctx, 2);
    void sheet.decode().then(paint).catch(() => {});
  }
}
