import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';
import { surfaceUV, type Surface } from './infected-atlas';
import { infectedMap } from './infected-surfaces';
import clothURL from './textures/infected-cloth.webp?url';
import normalsURL from './textures/infected-normals.webp?url';
import type { EnemyTypeId } from '../core/types';

export type Villager = Exclude<EnemyTypeId, 'dog' | 'boar' | 'deer'>;
type Point = readonly [number, number, number];
type Section = readonly [y: number, halfWidth: number, halfDepth: number, z: number, x?: number];
const tau = Math.PI * 2;
const materials = new Map<boolean, MeshStandardMaterial>();
function surfaceMaterial(leather = false): MeshStandardMaterial {
  let mat = materials.get(leather);
  if (!mat) {
    mat = new MeshStandardMaterial({
      map: infectedMap(clothURL, true),
      normalMap: infectedMap(normalsURL, false),
      vertexColors: true,
      side: DoubleSide,
      roughness: leather ? 0.51 : 0.9,
      envMapIntensity: leather ? 0.62 : 0.39,
    });
    mat.normalScale.setScalar(leather ? 0.49 : 0.65);
    materials.set(leather, mat);
  }
  return mat;
}

interface Cut {
  sides?: number;
  /** Closed shells have their seam at the back. A partial arc can form an open vest or apron. */
  arc?: (v: number) => readonly [number, number];
  hem?: number;
  square?: number;
}

function shell(g: Group, rows: readonly Section[], surface: Surface, colour: string, cut: Cut = {}): Mesh {
  const pos: number[] = [],
    uv: number[] = [],
    rgb: number[] = [],
    idx: number[] = [];
  const n = cut.sides ?? 12,
    tint = new Color(colour);
  const vertex = (x: number, y: number, z: number, u: number, v: number, light = 1) => {
    pos.push(x, y, z);
    uv.push(...surfaceUV(surface, u, v));
    rgb.push(tint.r * light, tint.g * light, tint.b * light);
    return pos.length / 3 - 1;
  };
  for (let j = 0; j < rows.length; j++) {
    const [y, w, d, z, x = 0] = rows[j]!;
    const v = (rows[0]![0] - y) / (rows[0]![0] - rows[rows.length - 1]![0]);
    const [a, b] = cut.arc?.(v) ?? [-Math.PI, Math.PI];
    for (let i = 0; i <= n; i++) {
      const u = i / n,
        angle = a + (b - a) * u,
        sx = Math.sin(angle),
        sz = Math.cos(angle);
      const shape = (s: number) => Math.sign(s) * Math.pow(Math.abs(s), cut.square ?? 1);
      const lift = (cut.hem ?? 0) * v ** 7 * (0.55 * Math.sin(angle * 3.0 + 0.7) + 0.35 * Math.sin(angle * 7.0));
      const k = vertex(x + w * shape(sx), y + lift, z + d * shape(sz), u, v);
      if (j && i) {
        const p = k - n - 1;
        idx.push(p - 1, k - 1, p, p, k - 1, k);
      }
    }
  }
  const geo = new BufferGeometry();
  // Keep lids independent of the side normals. Close partial shells only with their garment underneath.
  if (!cut.arc)
    for (const top of [true, false]) {
      const j = top ? 0 : rows.length - 1,
        [y, w, d, z, x = 0] = rows[j]!;
      const mid = vertex(x, y, z, 0.5, 0.5, top ? 1 : 0.69);
      for (let i = 0; i <= n; i++) {
        const src = (j * (n + 1) + i) * 3;
        const vx = pos[src]!,
          vz = pos[src + 2]!;
        const k = vertex(vx, pos[src + 1]!, vz, 0.5 + (vx - x) / (2.001 * w), 0.5 + (vz - z) / (2.001 * d), top ? 1 : 0.73);
        if (i) {
          if (top) idx.push(mid, k - 1, k);
          else idx.push(mid, k, k - 1);
        }
      }
    }
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new Float32BufferAttribute(rgb, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  if (!cut.arc) {
    const normals = geo.getAttribute('normal');
    for (let j = 0; j < rows.length; j++) {
      const a = j * (n + 1),
        b = a + n;
      const x = normals.getX(a) + normals.getX(b),
        y = normals.getY(a) + normals.getY(b),
        z = normals.getZ(a) + normals.getZ(b);
      const l = Math.hypot(x, y, z) || 1;
      normals.setXYZ(a, x / l, y / l, z / l);
      normals.setXYZ(b, x / l, y / l, z / l);
    }
  }
  const mesh = new Mesh(geo, surfaceMaterial(surface === 'leather'));
  g.add(mesh);
  return mesh;
}

// Narrow stitched trims and shirt flaps can share the garment draw call.
function panel(g: Group, points: readonly Point[], surface: Surface, colour: string) {
  const geo = new BufferGeometry(),
    c = new Color(colour);
  geo.setAttribute('position', new Float32BufferAttribute(points.flat(), 3));
  geo.setAttribute(
    'color',
    new Float32BufferAttribute(
      points.flatMap(() => [c.r, c.g, c.b]),
      3,
    ),
  );
  geo.setAttribute(
    'uv',
    new Float32BufferAttribute(
      [
        [0.22, 0.1],
        [0.78, 0.1],
        [0.78, 0.86],
        [0.22, 0.86],
      ]
        .slice(0, points.length)
        .flatMap(([u, v]) => surfaceUV(surface, u!, v!)),
      2,
    ),
  );
  geo.setIndex(points.length === 3 ? [0, 2, 1] : [0, 2, 1, 0, 3, 2]);
  geo.computeVertexNormals();
  g.add(new Mesh(geo, surfaceMaterial(surface === 'leather')));
}

const uniforms: Record<Villager, readonly [shirt: string, leg: string]> = {
  shambler: ['#be9a5b', '#69594f'],
  runner: ['#ffefd7', '#faf0d2'],
  brute: ['#cbb48c', '#5b5247'],
  mower: ['#778047', '#9c8862'],
  mechanic: ['#bea57c', '#615a52'],
  mail: ['#59687d', '#765f61'],
  chief: ['#4b5869', '#48505f'],
  mayor: ['#844454', '#4c4c52'],
};

export function torso(g: Group, type: 'shambler' | 'runner' | 'brute'): void {
  const wide = type === 'brute',
    sport = type === 'runner';
  const w = wide ? 0.41 : sport ? 0.245 : 0.27;
  const d = wide ? 0.285 : sport ? 0.173 : 0.188;
  shell(
    g,
    [
      [1.475, w * 0.38, d * 0.59, 0.106],
      [1.4, w * 0.95, d * 0.96, 0.083],
      [1.32, w * 1.08, d * 1.08, 0.073],
      [1.18, w * 1.04, d * 1.11, 0.048],
      [1.02, w * (wide ? 1.1 : 0.83), d * (wide ? 1.18 : 0.96), 0.027],
      [0.86, w * 0.85, d * 0.92, 0.015],
      [0.8, w * 0.85, d * 0.9, 0.012],
    ],
    sport ? 'jersey' : 'shirt',
    uniforms[type][0],
    { sides: 14, square: 0.86 },
  );
  shell(
    g,
    [
      [0.89, w * 0.86, d * 0.94, 0.016],
      [0.77, w * 0.96, d * 1.08, -0.005],
      [0.67, w * 0.8, d * 0.98, 0],
    ],
    sport ? 'shorts' : 'trousers',
    uniforms[type][1],
    { square: 0.8 },
  );
  if (sport) {
    // A partly open zip and upturned collar interrupt the cyclist's chest stripe.
    shell(
      g,
      [
        [1.448, 0.155, 0.148, 0.099],
        [1.4, 0.24, 0.178, 0.086],
        [1.32, 0.27, 0.197, 0.074],
        [1.23, 0.264, 0.201, 0.06],
      ],
      'zip',
      '#aa997c',
      { sides: 8, square: 0.86, arc: (v) => [-0.48 + 0.38 * v, 0.54 - 0.42 * v] },
    );
    for (const s of [-1, 1])
      panel(
        g,
        [
          [s * 0.068, 1.483, 0.197],
          [s * 0.142, 1.439, 0.218],
          [s * 0.08, 1.375, 0.263],
        ],
        'cuff',
        '#a75337',
      );
  }
  if (type === 'shambler') {
    shell(
      g,
      [
        [1.452, 0.162, 0.144, 0.101],
        [1.39, 0.263, 0.217, 0.09],
        [1.32, 0.301, 0.232, 0.073],
        [1.18, 0.3, 0.232, 0.057],
        [1.09, 0.275, 0.235, 0.037],
        [0.91, 0.253, 0.215, 0.02],
        [0.737, 0.266, 0.21, 0.012],
      ],
      'vest',
      '#977152',
      {
        sides: 18,
        square: 0.87,
        hem: 0.066,
        arc: (v) => {
          const gap = 0.065 + 0.94 * (1 - v) ** 2 + 0.23 * v ** 7;
          return [gap, tau - gap];
        },
      },
    );
    // The shirt front has its own UVs so the buttonholes stay vertical inside the open vest.
    shell(
      g,
      [
        [1.447, 0.171, 0.151, 0.099],
        [1.4, 0.265, 0.19, 0.086],
        [1.32, 0.297, 0.211, 0.076],
        [1.18, 0.285, 0.216, 0.052],
        [1.02, 0.228, 0.187, 0.032],
        [0.86, 0.23, 0.18, 0.02],
      ],
      'placket',
      '#aaa07b',
      { sides: 10, square: 0.86, arc: (v) => [-0.91 + 0.34 * v, 0.91 - 0.34 * v] },
    );
    // Welt pockets stand proud of the waistcoat at the hips.
    for (const side of [-1, 1]) {
      panel(
        g,
        [
          [side * 0.069, 1.035, 0.274],
          [side * 0.218, 1.061, 0.202],
          [side * 0.211, 0.951, 0.206],
          [side * 0.097, 0.924, 0.257],
        ],
        'vest',
        '#77573f',
      );
      panel(
        g,
        [
          [side * 0.066, 1.049, 0.278],
          [side * 0.219, 1.073, 0.202],
          [side * 0.222, 1.04, 0.211],
          [side * 0.073, 1.023, 0.278],
        ],
        'leather',
        '#ad8255',
      );
    }
  }
  if (!sport) {
    const lapel = wide ? 0.255 : 0.181,
      front = wide ? 0.365 : 0.295,
      dye = wide ? '#d9bc8c' : '#d2a267';
    // The lapels turn back at the shoulders and lift away from the throat.
    panel(
      g,
      [
        [-0.077, 1.475, 0.18],
        [0.077, 1.475, 0.18],
        [0, 1.321, front + 0.003],
      ],
      'leather',
      '#684d39',
    );
    for (const side of [-1, 1]) {
      panel(
        g,
        [
          [side * 0.074, 1.475, 0.182],
          [side * lapel, 1.423, front - 0.088],
          [side * lapel * 0.84, 1.326, front + 0.012],
          [side * 0.078, 1.382, front + 0.004],
        ],
        'shirt',
        dye,
      );
    }
  }
  if (wide || sport) {
    // The butcher's straps cross behind his apron. The cyclist's run alongside the wheel.
    const route: readonly Point[] = wide
      ? [
          [0.203, 1.45, 0.143],
          [0.208, 1.435, -0.067],
          [0.245, 1.328, -0.192],
          [0.012, 1.165, -0.281],
          [-0.213, 1.001, -0.259],
        ]
      : [
          [0.107, 1.448, 0.12],
          [0.11, 1.419, -0.018],
          [0.168, 1.267, -0.177],
          [0.129, 0.926, -0.119],
        ];
    for (const side of [-1, 1]) {
      for (let i = 1; i < route.length; i++) {
        const [x, y, z] = route[i - 1]!,
          [nextX, nextY, nextZ] = route[i]!;
        const halfWidth = wide ? 0.027 : 0.019;
        panel(
          g,
          [
            [side * (x - halfWidth), y, z],
            [side * (x + halfWidth), y, z],
            [side * (nextX + halfWidth), nextY, nextZ],
            [side * (nextX - halfWidth), nextY, nextZ],
          ],
          'leather',
          wide ? '#996f49' : '#8b6040',
        );
      }
    }
  }
  if (wide) {
    const ivory = '#fff1d9';
    shell(
      g,
      [
        [1.355, 0.416, 0.322, 0.084],
        [1.27, 0.446, 0.323, 0.073],
        [1.075, 0.451, 0.339, 0.048],
        [0.966, 0.458, 0.348, 0.032],
      ],
      'bib',
      '#fff9ea',
      { sides: 12, arc: (v) => [-0.67 - v * 0.75, 0.67 + v * 0.75] },
    );
    shell(
      g,
      [
        [1.008, 0.458, 0.353, 0.03],
        [0.942, 0.47, 0.352, 0.03],
        [0.8, 0.442, 0.322, 0.031],
        [0.62, 0.402, 0.308, 0.044],
        [0.447, 0.398, 0.316, 0.059],
      ],
      'apron',
      ivory,
      { sides: 24, hem: 0.125, arc: (v) => [Math.PI + 0.5 + 0.18 * v, 3 * Math.PI - 0.48 - 0.18 * v] },
    );
    shell(
      g,
      [
        [1.04, 0.458, 0.349, 0.04],
        [0.997, 0.464, 0.361, 0.032],
        [0.976, 0.462, 0.357, 0.032],
      ],
      'cuff',
      '#8c6247',
      { sides: 15 },
    );
    for (const s of [-1, 1])
      panel(
        g,
        [
          [s * 0.17, 1.455, 0.144],
          [s * 0.225, 1.445, 0.146],
          [s * 0.244, 1.341, 0.334],
          [s * 0.187, 1.349, 0.351],
        ],
        'leather',
        '#8d6648',
      );
  }
}

export function armAndHand(upper: Group, lower: Group, type: Villager, side: number, length: number, jointY: number, jointZ: number): void {
  const brute = type === 'brute',
    runner = type === 'runner',
    fist = brute || runner;
  const w = brute ? 0.153 : runner ? 0.092 : 0.112;
  const skin = brute ? '#ab9c86' : runner ? '#bcaa94' : '#b2a18b';
  const cuff = runner ? -0.183 : jointY + 0.058;
  shell(
    upper,
    [
      [0.085, w * 0.46, w * 0.54, 0],
      [0.032, w * 0.94, w * 0.99, 0],
      [-0.046, w * 1.07, w * 1.13, 0.004],
      [cuff + 0.052, w * 0.92, w * 0.97, 0.02],
      [cuff, w * 0.88, w * 0.91, 0.024],
    ],
    runner ? 'jersey' : 'shirt',
    uniforms[type][0],
    { sides: 10 },
  );
  shell(
    upper,
    [
      [cuff + 0.033, w * 0.92, w * 0.99, 0.025],
      [cuff, w * 1.02, w * 1.02, 0.028],
      [cuff - 0.039, w * 0.97, w * 0.99, 0.032],
      [cuff - 0.053, w * 0.82, w * 0.86, 0.033],
    ],
    'cuff',
    runner ? '#a84435' : uniforms[type][0],
    { sides: 10 },
  );
  shell(
    upper,
    [
      [cuff, w * 0.77, w * 0.8, 0.027],
      [jointY + 0.005, w * 0.74, w * 0.8, jointZ],
      [jointY - 0.052, w * 0.58, w * 0.63, jointZ],
    ],
    'skin',
    skin,
    { sides: 9 },
  );
  shell(
    lower,
    [
      [jointY + 0.046, w * 0.55, w * 0.6, jointZ],
      [jointY, w * 0.75, w * 0.8, jointZ],
      [jointY - 0.09, w * 0.88, w * 0.91, jointZ + 0.033],
      [-length + 0.114, w * 0.54, w * 0.6, 0.136],
      [-length + 0.057, w * 0.49, w * 0.5, 0.154],
    ],
    'skin',
    skin,
    { sides: 10 },
  );
  const glove = runner ? 'leather' : 'skin',
    dye = runner ? '#855937' : skin;
  const palm = brute ? 0.13 : runner ? 0.095 : 0.1;
  shell(
    lower,
    [
      [-length + 0.081, palm * 0.58, 0.047, 0.151],
      [-length + 0.028, palm * 0.9, 0.061, 0.169],
      [-length - 0.044, palm, 0.065, 0.175],
      [-length - 0.071, palm * 0.83, 0.05, 0.171],
    ],
    glove,
    dye,
    { sides: 9, square: 0.8 },
  );
  for (let i = 0; i < 4; i++) {
    const x = side * (i - 1.5) * palm * 0.47;
    const r = palm * (0.25 - 0.019 * i),
      reach = (fist ? 0.073 : 0.139) * (1 - 0.12 * Math.abs(i - 1));
    // Fingertips curl back towards the palm. The shambler's index and middle finger lead.
    shell(
      lower,
      [
        [-length - 0.031, r, r * 1.04, 0.184, x],
        [-length - 0.063, r * 1.04, r * 1.08, 0.192, x * 1.09],
        [-length - 0.047 - reach * 0.58, r * 0.86, r * 0.96, fist ? 0.172 : 0.208, x * 1.13],
        [-length - 0.047 - reach, r * 0.64, r * 0.77, fist ? 0.129 : 0.196 - i * 0.009, x * 1.17],
      ],
      'skin',
      skin,
      { sides: 6 },
    );
  }
  shell(
    lower,
    [
      [-length + 0.035, palm * 0.33, 0.041, 0.171, -side * palm * 0.7],
      [-length - 0.004, palm * 0.33, 0.04, 0.202, -side * palm * 1.06],
      [-length - 0.054, palm * 0.24, 0.029, 0.227, -side * palm * (fist ? 0.78 : 1.28)],
    ],
    glove,
    dye,
    { sides: 7 },
  );
}

export function legAndBoot(upper: Group, lower: Group, type: Villager, side: number, length: number, jointY: number, jointZ: number): void {
  const brute = type === 'brute',
    runner = type === 'runner',
    w = brute ? 0.158 : runner ? 0.107 : 0.126,
    leg = uniforms[type][1];
  const hem = runner ? jointY + 0.102 : jointY - 0.045;
  shell(
    upper,
    [
      [0.103, w * 0.79, w * 0.9, 0],
      [0.044, w * 1.05, w * 1.18, -0.009],
      [-0.094, w * 1.03, w * 1.13, 0.009],
      [hem + 0.04, w * (runner ? 0.81 : 0.86), w * 0.88, 0.041],
      [hem, w * (runner ? 0.88 : 0.8), w * 0.9, jointZ],
    ],
    runner ? 'shorts' : 'trousers',
    leg,
    { sides: 10, hem: 0.013 },
  );
  if (side < 0 && (type === 'shambler' || brute)) {
    // Torn front knee follows the lower hinge as the shin turns.
    shell(
      lower,
      [
        [jointY + 0.064, w * 0.84, w * 0.94, jointZ + 0.015],
        [jointY + 0.004, w * 0.85, w * 0.93, jointZ + 0.025],
        [jointY - 0.066, w * 0.86, w * 0.91, 0.041],
      ],
      'knee',
      '#837865',
      { sides: 6, arc: () => [-0.83, 0.83] },
    );
  }
  if (runner)
    shell(
      upper,
      [
        [hem + 0.025, w * 0.78, w * 0.85, 0.042],
        [jointY, w * 0.72, w * 0.81, jointZ],
        [jointY - 0.046, w * 0.6, w * 0.64, jointZ],
      ],
      'skin',
      '#b9a478',
      { sides: 9 },
    );
  const ankle = -length + 0.131;
  shell(
    lower,
    [
      [jointY + 0.055, w * 0.65, w * 0.75, jointZ],
      [jointY, w * 0.8, w * 0.88, jointZ + 0.017],
      [jointY - 0.069, w * 0.82, w * 0.81, 0.027],
      [-length + 0.188, w * 0.73, w * 0.76, 0.011],
      [ankle, w * 0.65, w * 0.67, 0.02],
    ],
    runner ? 'skin' : 'trousers',
    runner ? '#bead7b' : leg,
    { sides: 10 },
  );
  shell(
    lower,
    [
      [ankle + 0.069, w * 0.78, w * 0.8, 0.019],
      [ankle + 0.044, w * 0.82, w * 0.85, 0.017],
      [ankle - 0.005, w * 0.73, w * 0.76, 0.019],
    ],
    runner ? 'sock' : 'cuff',
    runner ? '#ede0b6' : leg,
    { sides: 10 },
  );
  const toe = runner ? 0.163 : brute ? 0.205 : 0.181,
    shoe = runner ? '#c9a769' : '#79573d';
  shell(
    lower,
    [
      [ankle + 0.028, w * 0.67, w * 0.69, 0.019],
      [ankle - 0.005, w * 0.77, w * 0.8, 0.028],
      [-length + 0.092, w * 0.92, toe * 0.63, 0.079],
      [-length + 0.062, w * 1.02, toe * 0.89, 0.111],
      [-length + 0.024, w, toe * 0.94, 0.112],
    ],
    'leather',
    shoe,
    { sides: 11, square: 0.75 },
  );
  shell(
    lower,
    [
      [-length + 0.041, w * 1.04, toe * 0.96, 0.112],
      [-length + 0.014, w * 1.055, toe * 0.96, 0.112],
      [-length + 0.001, w * 0.97, toe * 0.92, 0.11],
    ],
    'leather',
    runner ? '#826c4c' : '#443c34',
    { sides: 11, square: 0.75 },
  );
  for (let i = 0; i < 3; i++) {
    const y = ankle + 0.003 - i * 0.019,
      z = 0.119 + i * 0.037;
    panel(
      lower,
      [
        [-w * 0.53, y, z],
        [w * 0.55, y - 0.009, z + 0.009],
        [w * 0.53, y - 0.016, z + 0.022],
        [-w * 0.51, y - 0.008, z + 0.013],
      ],
      'sock',
      runner ? '#eddbac' : '#b29a6b',
    );
  }
}

export function cap(head: Group, runner: boolean): void {
  const fabric = 'tweed',
    color = runner ? '#b6904c' : '#766b57',
    z = 0.125;
  shell(
    head,
    [
      [1.884, 0.036, 0.051, z - 0.032, -0.013],
      [1.868, 0.122, 0.151, z - 0.025, -0.012],
      [1.824, 0.207, 0.214, z - 0.002, -0.009],
      [1.79, 0.222, 0.224, z + 0.017],
      [1.762, 0.192, 0.193, z + 0.012],
    ],
    fabric,
    color,
    { sides: 16 },
  );
  shell(
    head,
    [
      [1.783, 0.201, 0.2, z + 0.017],
      [1.753, 0.191, 0.191, z + 0.016],
    ],
    'tweed',
    runner ? '#977541' : '#514938',
    { sides: 16 },
  );
  if (runner) {
    const profile: readonly [number, number, number][] = [
      [0.118, 1.782, -0.089],
      [0.094, 1.844, -0.035],
      [0.078, 1.877, 0.054],
      [0.08, 1.883, 0.115],
      [0.101, 1.856, 0.234],
      [0.128, 1.801, 0.329],
    ];
    for (let i = 1; i < profile.length; i++) {
      const [x, y, b] = profile[i - 1]!,
        [nx, ny, f] = profile[i]!;
      panel(
        head,
        [
          [-x * 0.15 - 0.022, y, b],
          [x * 0.15 - 0.022, y + 0.001, b],
          [nx * 0.15 - 0.022, ny + 0.001, f],
          [-nx * 0.15 - 0.022, ny, f],
        ],
        'vest',
        '#426b65',
      );
    }
  }
  const brim = runner ? '#914a39' : '#6b5d47';
  for (let i = 0; i < 10; i++) {
    const point = (j: number, out: boolean): Point => {
      const a = (j / 10 - 0.5) * 2.64,
        f = Math.max(0, Math.cos(a));
      return [
        Math.sin(a) * (out ? 0.208 : 0.175),
        1.768 - (out ? 0.041 : 0.012) * f + 0.007 * Math.sin(a),
        z + 0.035 + Math.cos(a) * (out ? (runner ? 0.253 : 0.23) : 0.159),
      ];
    };
    panel(head, [point(i, false), point(i + 1, false), point(i + 1, true), point(i, true)], 'tweed', brim);
  }
}

export function occupationalTorso(g: Group, type: Exclude<Villager, 'runner' | 'shambler' | 'brute'>): void {
  const buttoned = type === 'chief' || type === 'mail' || type === 'mayor',
    w = type === 'mechanic' ? 0.316 : type === 'mayor' ? 0.267 : 0.289;
  const jacket = uniforms[type][0],
    trim = type === 'chief' ? '#73775e' : type === 'mail' ? '#677888' : type === 'mayor' ? '#7c4750' : '#73654e';
  const d = type === 'mechanic' ? 0.218 : 0.195;
  const chest: Section[] = [
    [1.476, w * 0.44, d * 0.56, 0.102],
    [1.431, w * 0.85, d * 0.91, 0.089],
    [1.366, w * 1.1, d * 1.03, 0.074],
    [1.267, w * 1.055, d * 1.07, 0.067],
    [1.139, w * 0.963, d * 1.04, 0.048],
    [1.006, w * 0.86, d, 0.03],
    [0.881, w * 0.83, d * 0.92, 0.017],
    [0.82, w * 0.89, d * 0.93, 0.012],
  ];
  shell(g, chest, 'shirt', jacket, { sides: 24, hem: 0.019 });
  // The pockets, fastenings and collar must follow the curved uniform front so they
  // remain visible when a heavier neighbour fills out the shoulders.
  const sewn = (points: readonly Point[], surface: Surface, dye: string) => {
    const raised = points.map(([x, y, z]): Point => {
      const next = chest.findIndex((r) => r[0] <= y),
        i = next < 1 ? 1 : next,
        a = chest[i - 1]!,
        b = chest[i]!;
      const t = Math.max(0, Math.min(1, (a[0] - y) / (a[0] - b[0])));
      const radius = a[1] + (b[1] - a[1]) * t,
        depth = a[2] + (b[2] - a[2]) * t,
        centre = a[3] + (b[3] - a[3]) * t;
      return [x, y, Math.max(z, centre + depth * Math.sqrt(Math.max(0, 1 - (x / radius) ** 2)) + 0.012)];
    });
    panel(g, raised, surface, dye);
  };
  shell(
    g,
    [
      [0.885, w * 0.84, d * 0.84, 0.012],
      [0.781, w * 0.89, d * 1.03, -0.006],
      [0.668, w * 0.77, d * 0.9, 0],
    ],
    'trousers',
    uniforms[type][1],
    { sides: 18 },
  );
  shell(
    g,
    [
      [0.903, w * 0.84, d * 0.95, 0.017],
      [0.882, w * 0.86, d * 0.96, 0.017],
      [0.847, w * 0.86, d * 0.96, 0.017],
    ],
    'leather',
    '#4c4438',
    { sides: 22 },
  );
  for (const s of [-1, 1]) {
    sewn(
      [
        [s * 0.068, 1.46, 0.152],
        [s * 0.153, 1.411, 0.227],
        [s * 0.105, 1.31, 0.273],
        [s * 0.037, 1.393, 0.24],
      ],
      'cuff',
      trim,
    );
    if (type !== 'mayor') {
      const y = type === 'chief' ? 1.24 : 1.15;
      sewn(
        [
          [s * 0.075, y + 0.064, 0.265],
          [s * 0.197, y + 0.043, 0.237],
          [s * 0.189, y - 0.067, 0.238],
          [s * 0.088, y - 0.081, 0.252],
        ],
        'shirt',
        trim,
      );
      sewn(
        [
          [s * 0.073, y + 0.071, 0.269],
          [s * 0.205, y + 0.046, 0.242],
          [s * 0.164, y + 0.006, 0.257],
          [s * 0.094, y + 0.014, 0.272],
        ],
        'trousers',
        trim,
      );
    }
    if (type === 'chief' || type === 'mail')
      sewn(
        [
          [s * 0.142, 1.432, 0.058],
          [s * 0.268, 1.394, 0.064],
          [s * 0.27, 1.376, 0.138],
          [s * 0.143, 1.418, 0.145],
        ],
        'cuff',
        trim,
      );
    if (type === 'mower' || type === 'mechanic')
      sewn(
        [
          [s * 0.155, 1.45, 0.133],
          [s * 0.207, 1.425, 0.154],
          [s * 0.155, 1.09, 0.266],
          [s * 0.111, 1.09, 0.277],
        ],
        'leather',
        type === 'mower' ? '#696849' : '#6d6556',
      );
  }
  if (type === 'mower' || type === 'mechanic')
    sewn(
      [
        [-0.142, 1.142, 0.258],
        [0.142, 1.142, 0.258],
        [0.177, 0.87, 0.179],
        [-0.177, 0.87, 0.179],
      ],
      'trousers',
      type === 'mechanic' ? '#6b6252' : '#777c61',
    );
  if (buttoned) {
    sewn(
      [
        [-0.016, 1.385, 0.252],
        [0.018, 1.385, 0.252],
        [0.018, 0.9, 0.218],
        [-0.016, 0.9, 0.218],
      ],
      'cuff',
      trim,
    );
    for (let i = 0; i < 4; i++) {
      const y = 1.302 - i * 0.094,
        z = 0.267 - i * 0.014;
      sewn(
        [
          [-0.012, y + 0.008, z],
          [0.007, y + 0.01, z],
          [0.013, y - 0.006, z],
          [-0.007, y - 0.011, z],
        ],
        'leather',
        '#837b63',
      );
    }
  }
}

export function uniformCap(g: Group, chief: boolean): void {
  const fabric = chief ? '#343f4a' : '#596879',
    z = 0.126;
  shell(
    g,
    [
      [1.865, 0.049, 0.06, z - 0.021],
      [1.851, 0.142, 0.151, z - 0.016],
      [1.819, 0.198, 0.201, z + 0.001],
      [1.79, 0.205, 0.207, z + 0.007],
      [1.766, 0.179, 0.18, z + 0.013],
    ],
    'tweed',
    fabric,
    { sides: 25 },
  );
  shell(
    g,
    [
      [1.792, 0.191, 0.198, z + 0.009],
      [1.759, 0.18, 0.182, z + 0.01],
    ],
    'leather',
    chief ? '#363934' : '#414a4a',
    { sides: 24 },
  );
  for (let i = 0; i < 16; i++) {
    const edge = (j: number, outer: boolean): Point => {
      const a = (j / 16 - 0.5) * 2.56;
      return [
        Math.sin(a) * (outer ? 0.195 : 0.168),
        1.768 - (outer ? 0.031 : 0.008) * Math.cos(a),
        z + 0.028 + Math.cos(a) * (outer ? 0.289 : 0.152),
      ];
    };
    panel(g, [edge(i, false), edge(i + 1, false), edge(i + 1, true), edge(i, true)], 'leather', chief ? '#393a33' : '#454a45');
  }
  panel(
    g,
    [
      [-0.018, 1.793, 0.326],
      [0.018, 1.793, 0.326],
      [0.012, 1.764, 0.327],
      [0, 1.758, 0.328],
    ],
    'leather',
    chief ? '#bbac77' : '#a48965',
  );
}
