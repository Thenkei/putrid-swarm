// The bake pads every island before creating mipmaps. UVs refer to the usable interior.
export const surfaces = [
  'face',
  'shirt',
  'vest',
  'jersey',
  'apron',
  'trousers',
  'skin',
  'leather',
  'tweed',
  'cuff',
  'sock',
  'shorts',
  'knee',
  'bib',
  'placket',
  'zip',
] as const;
export type Surface = (typeof surfaces)[number];
export const ATLAS_COLUMNS = 4;
export const TILE = 384;
export const GUTTER = 12;

export function surfaceUV(surface: Surface, u: number, v: number): [number, number] {
  const i = surfaces.indexOf(surface);
  return [
    ((i % ATLAS_COLUMNS) * TILE + GUTTER + u * (TILE - 2 * GUTTER)) / (TILE * ATLAS_COLUMNS),
    1 - (Math.floor(i / ATLAS_COLUMNS) * TILE + GUTTER + v * (TILE - 2 * GUTTER)) / (TILE * Math.ceil(surfaces.length / ATLAS_COLUMNS)),
  ];
}
