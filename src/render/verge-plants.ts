// Each photographed frond has its own curvature, fold and rooted orientation.
// The alpha edge supplies the fine division of its leaflets even on the small feeds.
import { BufferGeometry, DoubleSide, Float32BufferAttribute, MeshLambertMaterial, SRGBColorSpace, Texture } from 'three';
import { seeded } from './noise';
import { plantAtlas, PLANT_TILES, type PlantTile } from './plant-images';
import { wind } from './painted-surfaces';

let material: MeshLambertMaterial | undefined;
export function vergeMaterial(): MeshLambertMaterial | undefined {
  const image = plantAtlas();
  if (!image || material) return material;
  const map = new Texture(image);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 6;
  map.needsUpdate = true;
  material = new MeshLambertMaterial({ map, vertexColors: true, side: DoubleSide, alphaTest: 0.24, alphaToCoverage: true });
  wind(material, true);
  return material;
}

export function vergePlant(kind: 'grass' | 'forb' | 'fern' | 'flower', variant: number): BufferGeometry {
  const rand = seeded(479 + kind.length * 17 + variant * 263);
  const p: number[] = [],
    uv: number[] = [],
    rgb: number[] = [],
    flex: number[] = [],
    indices: number[] = [];
  function point(x: number, y: number, z: number, key: PlantTile, u: number, v: number, shade: number, windWeight: number): number {
    const tile = PLANT_TILES.indexOf(key),
      pad = 0.006;
    p.push(x, y, z);
    uv.push(((tile % 4) + pad + u * (1 - 2 * pad)) / 4, (2 - Math.floor(tile / 4) + pad + v * (1 - 2 * pad)) / 3);
    rgb.push(shade * 0.98, shade, shade * 0.95);
    flex.push(windWeight);
    return p.length / 3 - 1;
  }
  function frond(tile: PlantTile, x: number, z: number, angle: number, height: number, reach: number, width: number, drop: number): void {
    const first = p.length / 3,
      dx = Math.sin(angle),
      dz = Math.cos(angle),
      curl = (rand() - 0.5) * 0.22;
    const sections = tile === 'fern' ? 3 : 2;
    for (let j = 0; j <= sections; j++) {
      const t = j / sections,
        bend = Math.sin(Math.PI * t),
        h = height * t + drop * bend;
      const across = curl * reach * t * t;
      for (const side of [-1, 0, 1]) {
        const span = side * width * (0.44 + 0.15 * bend),
          fold = side === 0 ? 0.056 * bend : -0.055 * t * t;
        point(
          x + dx * reach * t + dz * (span + across),
          h + width * fold,
          z + dz * reach * t - dx * (span + across),
          tile,
          (side + 1) * 0.5,
          t,
          0.56 + 0.38 * t + (side === 0 ? 0.06 : 0),
          t * 0.82,
        );
      }
      if (j) {
        const k = first + j * 3;
        indices.push(k - 3, k, k - 2, k, k + 1, k - 2, k - 2, k + 1, k - 1, k + 1, k + 2, k - 1);
      }
    }
  }
  const fern = kind === 'fern',
    grass = kind === 'grass',
    flower = kind === 'flower';
  const tile = fern ? 'fern' : grass ? (variant ? 'straw' : 'grass') : kind === 'forb' && variant ? 'clover' : 'dandelion';
  const count = fern ? 7 : grass ? 4 : flower ? 4 : 6;
  for (let i = 0; i < count; i++) {
    const a = i * 2.4 + rand() * 0.65,
      r = 0.032 + rand() * 0.12;
    const len = 0.72 + rand() * 0.38;
    const height = (fern ? 0.24 : grass ? 0.36 : tile === 'clover' ? 0.28 : 0.15) * len;
    const reach = (fern ? 0.57 : grass ? 0.29 : tile === 'clover' ? 0.17 : 0.33) * len;
    const width = (fern ? 0.37 : grass ? 0.43 : tile === 'clover' ? 0.19 : 0.16) * len;
    frond(tile, Math.sin(a) * r, Math.cos(a) * r, a, height, reach, width, fern ? 0.24 : grass ? 0.058 : 0.082);
  }
  if (flower) {
    for (let i = 0; i < 5; i++) {
      const x = (rand() - 0.5) * 0.42,
        z = (rand() - 0.5) * 0.42,
        h = 0.27 + rand() * 0.28;
      // A narrow strip sampled from the photographed clover petiole.
      const first = p.length / 3;
      for (const t of [0, 1])
        for (const side of [-1, 1])
          point(
            x * 0.68 + 0.012 * side + x * 0.32 * t,
            h * t,
            z * 0.68 + z * 0.32 * t,
            'clover',
            0.5 + side * 0.008,
            0.05 + t * 0.1,
            0.65 + 0.25 * t,
            t,
          );
      indices.push(first, first + 1, first + 3, first, first + 3, first + 2);
      const a = rand() * 6.28,
        r = 0.047 + rand() * 0.026,
        top = p.length / 3;
      point(x, h + 0.016, z, 'daisy', 0.5, 0.5, 1, i * 0.04 + 0.54);
      for (let j = 0; j <= 8; j++) {
        const t = (j * Math.PI) / 4;
        point(
          x + Math.cos(t) * r,
          h + Math.cos(t + a) * r * 0.31,
          z + Math.sin(t) * r,
          'daisy',
          0.5 + 0.49 * Math.cos(t),
          0.5 + 0.49 * Math.sin(t),
          0.97,
          0.78,
        );
        if (j) indices.push(top, top + j + 1, top + j);
      }
    }
  }
  const mesh = new BufferGeometry();
  for (const [name, data, n] of [
    ['position', p, 3],
    ['uv', uv, 2],
    ['color', rgb, 3],
    ['flex', flex, 1],
  ] as const)
    mesh.setAttribute(name, new Float32BufferAttribute(data, n));
  mesh.setIndex(indices);
  mesh.computeVertexNormals();
  return mesh;
}
