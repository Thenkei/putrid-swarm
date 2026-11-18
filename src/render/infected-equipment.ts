// UV swatches measured on the 550-unit campaign paintings. Bilerp along the illustrated
// edges so the grain, scratched enamel and mould seams follow the actual 3D parts.
import { BufferGeometry, Group, LatheGeometry, Mesh, MeshStandardMaterial, Texture, Vector2 } from 'three';
import { yardSprite } from '../engine/assets';
import type { EnemyTypeId } from '../core/types';
import { paintedFace, paintedMap } from './painted-surfaces';
import { material, part } from './gate-models';
import { surfaceTexture } from './farm-materials';

type UV = readonly [number, number];
type Swatch = readonly [string, UV, UV, UV, UV];
const swatches = {
  horn: ['boss_mayor_front', [283, 61], [309, 43], [314, 62], [287, 73]],
  enamel: ['boss_mechanic_front', [262, 234], [276, 237], [250, 385], [234, 386]],
  mower: ['boss_mower_front', [87, 438], [173, 442], [167, 459], [74, 451]],
  cast: ['boss_mechanic_front', [399, 209], [430, 209], [425, 239], [393, 235]],
  steel: ['boss_chief_front', [85, 274], [171, 287], [151, 368], [56, 354]],
  tyre: ['boss_mower_front', [22, 446], [33, 445], [33, 495], [20, 497]],
  wood: ['boss_mayor_front', [191, 274], [246, 265], [246, 337], [191, 338]],
  bag: ['boss_mail_front', [389, 241], [434, 228], [447, 275], [405, 291]],
  battery: ['boss_mayor_front', [93, 335], [121, 341], [120, 377], [92, 372]],
  brass: ['boss_mechanic_front', [423, 202], [448, 203], [446, 214], [421, 212]],
  paper: ['boss_mechanic_front', [319, 71], [349, 72], [349, 126], [318, 126]],
} as const satisfies Record<string, Swatch>;
type Finish = keyof typeof swatches;
const materials = new Map<string, MeshStandardMaterial>();
const geometry = new WeakMap<BufferGeometry, Map<string, BufferGeometry>>();
const secondary = new WeakMap<Texture, Texture>();
function coating(original: Texture | null) {
  if (!original) return null;
  let copy = secondary.get(original);
  if (!copy) {
    copy = original.clone();
    copy.channel = 1;
    copy.needsUpdate = true;
    secondary.set(original, copy);
  }
  return copy;
}
const responses: Record<Finish, readonly [family: 'iron' | 'enamel' | 'timber', tint: string, rough: number, metal: number, raw: boolean]> = {
  horn: ['enamel', '#e1d9bf', 0.61, 0.13, false],
  enamel: ['enamel', '#ddd4c6', 0.69, 0.38, false],
  mower: ['enamel', '#e9dbcf', 0.66, 0.4, false],
  cast: ['iron', '#7c7365', 0.82, 0.62, true],
  steel: ['iron', '#adaea6', 0.65, 0.65, true],
  tyre: ['enamel', '#45453f', 0.92, 0, true],
  wood: ['timber', '#af977a', 0.9, 0, true],
  bag: ['enamel', '#c1aa92', 0.79, 0, false],
  battery: ['iron', '#53584f', 0.77, 0.21, true],
  brass: ['iron', '#c3a772', 0.48, 0.74, true],
  paper: ['timber', '#e6dcc6', 0.97, 0, false],
};
const hardware: Record<string, Finish> = {
  '48463c': 'tyre',
  '4c504a': 'battery',
  '5a6255': 'battery',
  ac8d64: 'brass',
  '716951': 'steel',
  '838372': 'cast',
  ada997: 'steel',
  '6c6759': 'steel',
  '76664e': 'steel',
  '9b9485': 'steel',
  b09a76: 'brass',
  b39a70: 'brass',
  '7f7461': 'cast',
  '918777': 'cast',
  '685f4d': 'cast',
  b79f78: 'brass',
  c4af81: 'brass',
  d5c5a2: 'brass',
  bda574: 'brass',
  b4a17a: 'brass',
  '4b4c46': 'battery',
  '746d59': 'steel',
  '998e75': 'cast',
  c2a771: 'brass',
  '694e3b': 'bag',
  bfa378: 'brass',
  d8c99f: 'paper',
  ebd9b0: 'paper',
  a84e3b: 'mower',
  c6b292: 'horn',
  '635d54': 'battery',
  d1c39e: 'brass',
  '856c4f': 'bag',
};
const gearFinish: Partial<Record<EnemyTypeId, Finish>> = { mower: 'mower', mechanic: 'enamel', chief: 'steel', mayor: 'wood', mail: 'bag' };

export function dressEquipment(group: Group, type: EnemyTypeId, moving = false): void {
  const defaultFinish = moving && type === 'mechanic' ? 'cast' : gearFinish[type];
  if (!defaultFinish) return;
  group.traverse((node) => {
    if (!(node instanceof Mesh) || node.material.map) return;
    // Letters keep their paper and wax colours.
    if (type === 'mail' && moving) return;
    const finish = hardware[node.material.color.getHexString()] ?? defaultFinish;
    const [art, tl, tr, br, bl] = swatches[finish],
      source = yardSprite(art),
      map = paintedMap(art);
    if (!source || !map) return;
    const [family, tint, roughness, metalness, raw] = responses[finish],
      physical = raw ? surfaceTexture(family, 'albedo') : null;
    const key = finish + (physical ? ':photo' : ':pigment');
    let mat = materials.get(key);
    if (!mat) {
      const response = coating(surfaceTexture(family, 'surface')),
        normal = coating(surfaceTexture(family, 'normal'));
      mat = new MeshStandardMaterial({
        map: physical ?? map,
        color: tint,
        roughness,
        metalness,
        normalMap: normal,
        roughnessMap: response,
        envMapIntensity: 0.73,
      });
      mat.normalScale.setScalar(finish === 'tyre' ? 0.32 : 0.56);
      materials.set(key, mat);
    }
    let byFinish = geometry.get(node.geometry);
    if (!byFinish) {
      byFinish = new Map();
      geometry.set(node.geometry, byFinish);
    }
    let geo = byFinish.get(key);
    if (!geo) {
      geo = node.geometry.clone() as BufferGeometry;
      const uv = geo.getAttribute('uv');
      geo.setAttribute('uv1', uv.clone());
      const scale = 550 / Math.max(source.w, source.h);
      if (!physical)
        for (let i = 0; i < uv.count; i++) {
          const u = uv.getX(i),
            v = uv.getY(i);
          const x = (bl[0] + (br[0] - bl[0]) * u) * (1 - v) + (tl[0] + (tr[0] - tl[0]) * u) * v;
          const y = (bl[1] + (br[1] - bl[1]) * u) * (1 - v) + (tl[1] + (tr[1] - tl[1]) * u) * v;
          uv.setXY(i, x / (source.w * scale), 1 - y / (source.h * scale));
        }
      byFinish.set(key, geo);
    }
    node.geometry = geo;
    node.material = mat;
  });
}

const wheels = {
  mower: [251, 483, 22, 49],
  mechanic: [409, 489, 17, 23],
  mayor: [235, 509, 26, 36],
} as const;
export function castor(g: Group, type: keyof typeof wheels, x: number, y: number, z: number, r: number, thickness: number): void {
  part(g, x, y, z, r * 2, thickness, r * 2, '#48463c', true).rotation.z = Math.PI / 2;
  const [cx, cy, rx, ry] = wheels[type];
  const art = 'boss_' + type + '_front';
  for (const side of [-1, 1]) {
    const xx = x + side * (thickness * 0.5 + 0.002);
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8,
        b = ((i + 1) * Math.PI) / 8;
      const rim = (t: number): [number, number, number] => [xx, y + Math.sin(t) * r * 0.96, z + Math.cos(t) * r * 0.96];
      const uv = (t: number): [number, number] => [cx + Math.cos(t) * rx, cy - Math.sin(t) * ry];
      paintedFace(g, art, [[xx, y, z], rim(a), rim(b)], [[cx, cy], uv(a), uv(b)]);
    }
    part(g, xx + side * 0.007, y, z, r * 0.33, 0.023, r * 0.33, '#c2a771', true).rotation.z = Math.PI / 2;
  }
}

export function loudhailer(g: Group): void {
  const profile = [
    [0.029, 0],
    [0.048, 0.046],
    [0.051, 0.106],
    [0.088, 0.215],
    [0.153, 0.332],
    [0.16, 0.343],
    [0.151, 0.35],
    [0.092, 0.258],
    [0.047, 0.16],
    [0.019, 0.143],
  ];
  const bell = new Mesh(
    new LatheGeometry(
      profile.map(([r, y]) => new Vector2(r, y)),
      18,
    ),
    material('#c6b292'),
  );
  bell.rotation.x = Math.PI / 2;
  bell.position.set(0.267, 1.303, 0.345);
  g.add(bell);
  part(g, 0.267, 1.303, 0.377, 0.109, 0.126, 0.109, '#a84e3b', true).rotation.x = Math.PI / 2;
  part(g, 0.267, 1.236, 0.396, 0.056, 0.135, 0.072, '#856c4f').rotation.x = 0.2;
  part(g, 0.267, 1.303, 0.53, 0.046, 0.096, 0.046, '#635d54', true).rotation.x = Math.PI / 2;
}
