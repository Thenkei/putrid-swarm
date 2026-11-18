/** Tileable yard materials. Only 3D entry points request these decoded, locally shipped images. */
export type SurfaceId =
  | 'grass'
  | 'turf'
  | 'soil'
  | 'gravel'
  | 'trail'
  | 'litter'
  | 'bark'
  | 'timber'
  | 'iron'
  | 'endgrain'
  | 'rope'
  | 'enamel'
  | 'plaster'
  | 'stone'
  | 'roof'
  | 'limewash'
  | 'coachwork';
export type SurfaceChannel = 'albedo' | 'normal' | 'surface';

const hardware: readonly SurfaceId[] = ['timber', 'bark', 'iron', 'endgrain', 'rope', 'enamel'];
const clearing: readonly SurfaceId[] = ['grass', 'turf', 'soil', 'gravel'];
const scenery: readonly SurfaceId[] = ['trail', 'litter', 'plaster', 'stone', 'roof', 'coachwork', 'limewash'];
const channels: readonly SurfaceChannel[] = ['albedo', 'normal', 'surface'];
const decoded = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<void>>();

/** Normal is tangent-space OpenGL. Surface packs height into R, roughness into G and metalness into B. */
export function surfaceImage(id: SurfaceId, channel: SurfaceChannel = 'albedo'): HTMLImageElement | undefined {
  return decoded.get(id + '-' + channel);
}

async function load(id: SurfaceId, channel: SurfaceChannel): Promise<void> {
  const key = id + '-' + channel;
  if (decoded.has(key)) return;
  let request = pending.get(key);
  if (!request) {
    const img = new Image();
    img.decoding = 'async';
    img.src = import.meta.env.BASE_URL + 'assets/materials/' + key + '.webp';
    request = img
      .decode()
      .then(
        () => {
          decoded.set(key, img);
        },
        () => {
          console.warn('[materials] using fallback for ' + key);
        },
      )
      .finally(() => pending.delete(key));
    pending.set(key, request);
  }
  await request;
}

export async function loadSurfaceImages(scope: 'yard' | 'guide'): Promise<void> {
  const surfaces = scope === 'yard' ? [...hardware, ...clearing, ...scenery] : [...hardware, ...clearing];
  await Promise.all(surfaces.flatMap((id) => channels.map((channel) => load(id, channel))));
}
