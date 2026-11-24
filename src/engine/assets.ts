// Runtime art. Everything is optional by design: a missing image degrades to a placeholder
// instead of blocking the game, so art can be regenerated independently of the code.

import { mobGaitSheets } from '../render/mob-cycles';

export interface Sprite {
  readonly img: HTMLImageElement;
  readonly w: number;
  readonly h: number;
  /** Ground contact in normalized image coordinates, measured from the top left. */
  readonly footX?: number;
  readonly footY?: number;
}

interface ManifestEntry {
  readonly file: string;
  readonly w: number;
  readonly h: number;
  readonly footX?: number;
  readonly footY?: number;
}

const sprites = new Map<string, Sprite>();
const BASE = `${import.meta.env.BASE_URL}assets/`;
// Everything visible or interactive on the opening desk, including its news inset.
const TITLE_ART = new Set(['plate_title_desk', 'logo', 'plate_news', 'desk_joint', 'desk_mug',
  'desk_hand_open', 'desk_hand_joint', 'desk_hand_mug', 'fx_smoke']);

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

export interface LoadReport {
  readonly loaded: number;
  readonly failed: readonly string[];
}

export async function loadAssets(onProgress: (done: number, total: number) => void, onTitleReady?: () => void): Promise<LoadReport> {
  let manifest: Record<string, ManifestEntry> = {};
  try {
    const response = await fetch(`${BASE}manifest.json`);
    if (response.ok) manifest = (await response.json()) as Record<string, ManifestEntry>;
    else console.warn(`[assets] manifest.json returned ${response.status}; running with placeholders`);
  } catch (error) {
    console.warn('[assets] manifest.json unavailable; running with placeholders', error);
  }

  const entries = Object.entries<ManifestEntry>({ ...manifest, ...mobGaitSheets });
  const failed: string[] = [];
  async function loadBatch(batch: typeof entries): Promise<void> {
    let done = 0;
    onProgress(0, batch.length);
    await Promise.all(batch.map(async ([key, entry]) => {
      try {
        const img = await loadImage(BASE + entry.file);
        sprites.set(key, { img, w: entry.w, h: entry.h, footX: entry.footX ?? 0.5, footY: entry.footY ?? 1 });
      } catch (error) {
        failed.push(key);
        console.warn(`[assets] ${key}`, error);
      } finally {
        onProgress(++done, batch.length);
      }
    }));
  }
  if (onTitleReady) {
    await loadBatch(entries.filter(([key]) => TITLE_ART.has(key)));
    onTitleReady();
    await loadBatch(entries.filter(([key]) => !TITLE_ART.has(key)));
  } else {
    await loadBatch(entries);
  }
  return { loaded: sprites.size, failed };
}

export const sprite = (key: string): Sprite | undefined => sprites.get(key);
export const assetUrl = (key: string): string | undefined => sprites.get(key)?.img.src;
