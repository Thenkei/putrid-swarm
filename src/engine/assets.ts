// Runtime art. Everything is optional by design: a missing image degrades to a placeholder
// instead of blocking the game, so art can be regenerated independently of the code.

export interface Sprite {
  readonly img: HTMLImageElement;
  readonly w: number;
  readonly h: number;
}

interface ManifestEntry {
  readonly file: string;
  readonly w: number;
  readonly h: number;
  readonly detail?: string;
}

const sprites = new Map<string, Sprite>();
const detailFiles = new Map<string, string>();
const details = new Map<string, Sprite>();
const pendingDetails = new Map<string, Promise<Sprite | undefined>>();
const BASE = `${import.meta.env.BASE_URL}assets/`;

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

export async function loadAssets(onProgress: (done: number, total: number) => void): Promise<LoadReport> {
  let manifest: Record<string, ManifestEntry> = {};
  try {
    const response = await fetch(`${BASE}manifest.json`);
    if (response.ok) manifest = (await response.json()) as Record<string, ManifestEntry>;
    else console.warn(`[assets] manifest.json returned ${response.status}; running with placeholders`);
  } catch (error) {
    console.warn('[assets] manifest.json unavailable; running with placeholders', error);
  }

  const entries = Object.entries(manifest);
  for (const [key, entry] of entries) if (entry.detail) detailFiles.set(key, entry.detail);
  const failed: string[] = [];
  let done = 0;
  await Promise.all(
    entries.map(async ([key, entry]) => {
      try {
        const img = await loadImage(BASE + entry.file);
        sprites.set(key, { img, w: entry.w, h: entry.h });
      } catch (error) {
        failed.push(key);
        console.warn(`[assets] ${key}`, error);
      } finally {
        onProgress(++done, entries.length);
      }
    }),
  );
  return { loaded: sprites.size, failed };
}

export const sprite = (key: string): Sprite | undefined => sprites.get(key);
export const assetUrl = (key: string): string | undefined => sprites.get(key)?.img.src;

export const yardSprite = (key: string): Sprite | undefined => details.get(key) ?? sprite(key);

export function loadYardSprite(key: string): Promise<Sprite | undefined> {
  const file = detailFiles.get(key);
  if (!file) return Promise.resolve(sprite(key));
  let request = pendingDetails.get(key);
  if (!request) {
    request = loadImage(BASE + file).then(img => {
      const art = { img, w: img.naturalWidth, h: img.naturalHeight };
      details.set(key, art);
      return art;
    }, error => {
      console.warn('[yard] using standard art for ' + key, error);
      return sprite(key);
    });
    pendingDetails.set(key, request);
  }
  return request;
}

/** Scenery is baked on entry. Character paint can upgrade in place as each type arrives. */
export async function loadYardScenery(scope: 'yard' | 'defences' = 'yard'): Promise<void> {
  const keys = [...detailFiles.keys()].filter(key => key.startsWith('dev_') || (scope === 'yard' && key.startsWith('obj_')));
  await Promise.all(keys.map(loadYardSprite));
}
