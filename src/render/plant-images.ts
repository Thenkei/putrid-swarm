// The photographs are packed together for one yard-only request. A bent leaf mesh
// can use a whole cell without sampling a neighbour's alpha edge in lower mip levels.
export const PLANT_TILES = ['pine', 'birch', 'oak', 'gold', 'grass', 'straw', 'fern', 'dandelion', 'clover', 'daisy', 'dead', 'apple'] as const;
export type PlantTile = (typeof PLANT_TILES)[number];
let atlas: HTMLImageElement | undefined;
let crowns: HTMLImageElement | undefined;
let pending: Promise<void> | undefined;
const cells = new Map<PlantTile, HTMLCanvasElement>();
const crownsByIndex = new Map<number, HTMLCanvasElement>();
export const plantAtlas = (): HTMLImageElement | undefined => atlas;

export function loadPlantImages(): Promise<void> {
  function read(file: string, store: (image: HTMLImageElement) => void): Promise<void> {
    return new Promise<void>((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        store(img);
        resolve();
      };
      img.onerror = () => {
        console.warn('[yard] using fallback for ' + file);
        resolve();
      };
      img.src = import.meta.env.BASE_URL + 'assets/materials/' + file + '.webp';
    });
  }
  pending ??= Promise.all([
    read('woodland-plants', (img) => {
      atlas = img;
    }),
    read('woodland-crowns', (img) => {
      crowns = img;
    }),
  ]).then(() => {});
  return pending;
}

export function distantCrown(index: number): HTMLCanvasElement | undefined {
  const known = crownsByIndex.get(index);
  if (known || !crowns) return known;
  const tile = document.createElement('canvas');
  tile.width = crowns.naturalWidth / 2;
  tile.height = crowns.naturalHeight / 2;
  tile
    .getContext('2d')!
    .drawImage(crowns, (index % 2) * tile.width, Math.floor(index / 2) * tile.height, tile.width, tile.height, 0, 0, tile.width, tile.height);
  crownsByIndex.set(index, tile);
  return tile;
}

export function plantImage(name: PlantTile): HTMLCanvasElement | undefined {
  const known = cells.get(name);
  if (known || !atlas) return known;
  const size = atlas.naturalWidth / 4;
  const i = PLANT_TILES.indexOf(name);
  const tile = document.createElement('canvas');
  tile.width = tile.height = size;
  tile.getContext('2d')!.drawImage(atlas, (i % 4) * size, Math.floor(i / 4) * size, size, size, 0, 0, size, size);
  cells.set(name, tile);
  return tile;
}
