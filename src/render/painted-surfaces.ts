// UV landmarks are measured on the existing illustrations with their longest side at 550.
// Each panel is an independently lit mesh face; the texture follows it in either camera.
import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from 'three';
import { ReliefMaterial } from './relief-material';
import { surfaceHeight } from './surface-height';
import { surfaceImage } from '../engine/material-images';
import { plantImage } from './plant-images';
import { loadYardSprite, yardSprite as sprite } from '../engine/assets';

type Point = readonly [number, number];
type Vertex = readonly [number, number, number];
// All four cameras see the same gust. UV height pins the base of each blade and bough.
export const foliageTime = { value: 0 };
export function wind(material: MeshLambertMaterial, bladeFlex = false): void {
  if (bladeFlex) material.customProgramCacheKey = () => 'yard-plant-flex';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.foliageTime = foliageTime;
    shader.vertexShader =
      (bladeFlex ? 'attribute float flex;\n' : '') + 'uniform float foliageTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
      #include <begin_vertex>
      vec4 stem = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        stem = instanceMatrix * stem;
      #endif
      vec3 yard = (modelMatrix * stem).xyz;
      float breeze = sin(1.25 * foliageTime + 0.48 * yard.x + 0.32 * yard.z)
                   + 0.32 * sin(2.3 * foliageTime + 1.07 * yard.z);
      transformed.xz += vec2(0.039, 0.017) * ${bladeFlex ? 'flex * flex' : 'uv.y * uv.y'} * breeze;
    `,
      );
  };
}
const reliefDepth: Readonly<Record<string, number>> = {
  obj_house_front: 0.049,
  obj_house_back: 0.049,
  dev_fence_resting: 0.024,
  dev_spikes_resting: 0.023,
  obj_props_well: 0.038,
  obj_props2_rock: 0.028,
  obj_props_woodpile: 0.042,
};
const heights = new Map<string, CanvasTexture>();
const panels = new Map<string, MeshLambertMaterial>();
// Only the glass and lamp cores emit light. Stone, iron and shutters keep their local shadows.
const glass: Record<string, readonly (readonly Point[])[]> = {
  obj_house_front: [
    [
      [155, 198],
      [192, 203],
      [192, 252],
      [155, 247],
    ],
    [
      [368, 244],
      [396, 235],
      [396, 277],
      [368, 287],
    ],
    [
      [333, 396],
      [344, 392],
      [348, 405],
      [340, 419],
      [333, 413],
    ],
  ],
  obj_house_back: [
    [
      [147, 209],
      [178, 216],
      [178, 271],
      [147, 264],
    ],
    [
      [377, 355],
      [432, 338],
      [432, 447],
      [377, 470],
    ],
  ],
};
const maps = new Map<string, Texture>();
export function paintedMap(art: string): Texture | undefined {
  const known = maps.get(art);
  if (known) return known;
  const source = sprite(art);
  if (!source) return;
  const map = new Texture(source.img);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  map.needsUpdate = true;
  maps.set(art, map);
  if (art.startsWith('en_') || art.startsWith('boss_')) {
    void loadYardSprite(art).then((detail) => {
      if (detail && map.image !== detail.img) {
        // An actor may already be on camera with the smaller campaign texture.
        map.dispose();
        map.image = detail.img;
        map.needsUpdate = true;
      }
    });
  }
  return map;
}

export function paintedFace(
  group: Group,
  art: string,
  vertices: readonly Vertex[],
  points: readonly Point[],
  glow = false,
): Mesh<BufferGeometry, MeshLambertMaterial> | undefined {
  const source = sprite(art);
  const map = paintedMap(art);
  if (!source || !map) return;
  const scale = 550 / Math.max(source.w, source.h);
  const key = art + (glow ? ':lit' : '');
  let mat = panels.get(key);
  if (!mat) {
    const blades = art === 'orchard_fg_grass_a';
    const options = {
      map,
      color: art === 'obj_props2_rock' ? 0xc1bfae : 0xffffff,
      side: DoubleSide,
      alphaTest: blades ? 0.17 : 0.35,
      alphaToCoverage: blades,
    } as const;
    const depth = reliefDepth[art];
    if (depth) {
      let height = heights.get(art);
      if (!height) {
        height = new CanvasTexture(surfaceHeight(source.img));
        height.anisotropy = 4;
        heights.set(art, height);
      }
      mat = new ReliefMaterial({ ...options, bumpMap: height, bumpScale: depth });
      mat.userData.atlas = true;
    } else mat = new MeshLambertMaterial(options);
    if (blades) wind(mat);
    if (glow && glass[art]) {
      const canvas = document.createElement('canvas');
      canvas.width = source.w;
      canvas.height = source.h;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(1 / scale, 1 / scale);
      ctx.beginPath();
      for (const polygon of glass[art]) {
        polygon.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
      }
      ctx.clip();
      ctx.drawImage(source.img, 0, 0, source.w * scale, source.h * scale);
      mat.emissiveMap = new CanvasTexture(canvas);
      mat.emissiveMap.colorSpace = SRGBColorSpace;
      mat.emissive.setHex(0xffd298);
      mat.emissiveIntensity = 1.8;
    }
    panels.set(key, mat);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(vertices.flat(), 3));
  geo.setAttribute(
    'uv',
    new Float32BufferAttribute(
      points.flatMap(([x, y]) => [x / (source.w * scale), 1 - y / (source.h * scale)]),
      2,
    ),
  );
  if (mat.userData.atlas) {
    // Distances to this panel's edges, interpolated across the original two triangles.
    const edges = vertices.length === 3 ? [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1] : [0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0];
    geo.setAttribute('panelEdges', new Float32BufferAttribute(edges, 4));
  }
  // The lists run clockwise from upper left, as seen looking at the surface.
  geo.setIndex(vertices.length === 3 ? [0, 2, 1] : [0, 2, 1, 0, 3, 2]);
  geo.computeVertexNormals();
  const panel = new Mesh(geo, mat);
  group.add(panel);
  return panel;
}

// Small, tiling sections for rounded surfaces. The geometry supplies curvature and shading.
const samples = {
  bark: ['obj_trees_oak', 244, 392, 37, 84],
  hewn: ['dev_fence_resting', 127, 117, 66, 212],
  log: ['dev_log_armed', 177, 178, 49, 48],
  roundwood: ['dev_log_armed', 177, 178, 49, 48],
  ridge: ['obj_house_back', 203, 86, 12, 13],
  moss: ['obj_props2_rock', 81, 116, 191, 164],
  brick: ['obj_props_well', 110, 431, 128, 84],
  staves: ['obj_props2_barrel', 53, 187, 257, 274],
  lid: ['obj_props2_barrel', 87, 49, 195, 79],
} as const;
const sampled = new Map<string, MeshLambertMaterial>();
let roughBark: MeshLambertMaterial | undefined;
export function scannedBark(): MeshLambertMaterial | undefined {
  const colour = surfaceImage('bark'), relief = surfaceImage('bark', 'normal');
  if (!colour || !relief || roughBark) return roughBark;
  const map = new Texture(colour), normalMap = new Texture(relief);
  for (const tile of [map, normalMap]) {
    tile.wrapT = RepeatWrapping;
    tile.repeat.set(1, 1.85);
    tile.anisotropy = 6;
    tile.needsUpdate = true;
  }
  map.colorSpace = SRGBColorSpace;
  roughBark = new MeshLambertMaterial({ map, normalMap });
  roughBark.normalScale.set(0.75,0.75);
  return roughBark;
}
export function finish(mesh: Mesh, surface: keyof typeof samples): Mesh {
  if (surface === 'bark') {
    const capture = scannedBark();
    if (capture) { mesh.material = capture; return mesh; }
  }
  let mat = sampled.get(surface);
  if (!mat) {
    const [art, x, y, w, h] = samples[surface];
    const source = sprite(art);
    if (!source) return mesh;
    const scale = Math.max(source.w, source.h) / 550;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(w * scale);
    canvas.height = Math.ceil(h * scale);
    const ctx = canvas.getContext('2d')!;
    if (surface === 'log' || surface === 'roundwood') {
      // The unbound bark between the two ropes is oblique in the original.
      // On a cylinder the grain follows V; on the sawn planks it follows U.
      const grain = new DOMMatrix([41, 14, -12, 40, 183, 183]);
      const basis = surface === 'roundwood' ? grain.multiply(new DOMMatrix([0, 1, 1, 0, 0, 0])) : grain;
      ctx.setTransform(new DOMMatrix().scale(canvas.width, canvas.height).multiply(basis.inverse()));
      ctx.drawImage(source.img, 0, 0, source.w / scale, source.h / scale);
    } else ctx.drawImage(source.img, x * scale, y * scale, w * scale, h * scale, 0, 0, canvas.width, canvas.height);
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
    const depth = { bark: 0, hewn: 0.022, log: 0.018, roundwood: 0.022, ridge: 0, moss: 0, brick: 0.04, staves: 0.026, lid: 0.018 }[surface];
    mat = depth ? new ReliefMaterial({ map, bumpMap: new CanvasTexture(surfaceHeight(canvas)), bumpScale: depth }) : new MeshLambertMaterial({ map });
    sampled.set(surface, mat);
  }
  mesh.material = mat;
  return mesh;
}

type LeafArt = 'pine' | 'fir' | 'oak' | 'gold' | 'apple' | 'cabbage';
const sprays = new Map<LeafArt, MeshLambertMaterial>();
function needles(ctx: CanvasRenderingContext2D): void {
  // Use overlapping ranks of needles. Individual needles merge into distinct sprays at a distance.
  ctx.lineCap = 'round';
  const twig = (x: number, y: number, tx: number, ty: number, width: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
  };
  twig(94, 157, 99, 8, 5, '#574631');
  for (let j = 0; j < 10; j++) {
    const f = j / 10;
    const sy = 148 - f * 127;
    const reach = (0.3 + Math.sin((f + 0.16) * Math.PI) * 0.72) * (79 - f * 18);
    for (const side of [-1, 1]) {
      const tx = 97 + side * reach,
        ty = sy - 32 - f * 9 + Math.sin(j * 7 + side) * 4;
      twig(96, sy, tx, ty, 3, '#48553a');
      for (let n = 0; n < 11; n++) {
        const t = n / 11;
        const x = 96 + (tx - 96) * t,
          y = sy + (ty - sy) * t;
        const len = 8 + (1 - t) * 9;
        for (const dir of [-1, 1]) {
          const nx = x + side * (len + dir * 7),
            ny = y - 12 + dir * 8;
          twig(x, y, nx, ny, 4.4, '#304334');
          twig(x + 0.5, y - 0.7, nx, ny - 0.7, 2.2, (j + n) % 3 === 0 ? '#81915e' : dir > 0 ? '#667e54' : '#506b49');
        }
      }
    }
  }
}

function leafMaterial(kind: LeafArt): MeshLambertMaterial {
  const cached = sprays.get(kind);
  if (cached) return cached;
  const photo = kind === 'cabbage' ? undefined : plantImage(kind === 'fir' ? 'pine' : kind);
  if (photo) {
    const map = new CanvasTexture(photo);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 5;
    const mat = new MeshLambertMaterial({ map, side: DoubleSide, vertexColors: true, alphaTest: 0.21, alphaToCoverage: true });
    wind(mat);
    sprays.set(kind,mat);
    return mat;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;
  if (kind === 'cabbage') {
    // Cupped brassica leaves carry pale branching ribs all the way to their scalloped margins.
    ctx.beginPath();
    ctx.moveTo(96, 153);
    ctx.bezierCurveTo(75, 133, 23, 140, 27, 106);
    ctx.bezierCurveTo(2, 96, 18, 66, 34, 63);
    ctx.bezierCurveTo(10, 42, 41, 23, 57, 32);
    ctx.bezierCurveTo(60, 10, 88, 2, 98, 18);
    ctx.bezierCurveTo(118, 0, 148, 14, 145, 33);
    ctx.bezierCurveTo(172, 17, 188, 44, 169, 66);
    ctx.bezierCurveTo(193, 73, 183, 105, 161, 110);
    ctx.bezierCurveTo(161, 133, 125, 128, 96, 153);
    ctx.clip();
    const wash = ctx.createLinearGradient(0, 148, 0, 12);
    wash.addColorStop(0, '#445e3d');
    wash.addColorStop(0.56, '#93ab7c');
    wash.addColorStop(1, '#b7c29a');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, 192, 160);
    ctx.strokeStyle = '#cad2a1';
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const y = 132 - i * 20,
        span = 23 + 37 * Math.sin(i * 0.56);
      for (const side of [-1, 1]) {
        ctx.lineWidth = 2.8 - i * 0.26;
        ctx.beginPath();
        ctx.moveTo(96, y + 8);
        ctx.quadraticCurveTo(96 + side * span * 0.65, y - 4, 96 + side * span, y - 21);
        ctx.stroke();
      }
    }
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(96, 153);
    ctx.quadraticCurveTo(93, 90, 98, 18);
    ctx.stroke();
  } else if (kind === 'pine') needles(ctx);
  else if (kind === 'fir' && sprite('obj_trees_pine')) {
    const art = sprite('obj_trees_pine')!;
    const scale = Math.max(art.w, art.h) / 550;
    // The lower opening follows the hanging needles around the fork of the real trunk.
    ctx.scale(192 / 278, 160 / 443);
    ctx.beginPath();
    const hem: Point[] = [
      [0, 0],
      [278, 0],
      [278, 431],
      [219, 433],
      [210, 407],
      [189, 419],
      [181, 393],
      [161, 403],
      [154, 387],
      [145, 394],
      [137, 389],
      [126, 414],
      [120, 395],
      [105, 408],
      [91, 427],
      [78, 409],
      [49, 442],
      [0, 442],
    ];
    hem.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(art.img, 0, 0, art.w / scale, art.h / scale);
  } else {
    const apple = kind === 'apple';
    const art = sprite(apple ? 'obj_trees_apple' : 'obj_trees_oak');
    if (art) {
      const s = Math.max(art.w, art.h) / 550;
      if (kind === 'gold') ctx.filter = 'hue-rotate(23deg) saturate(0.75)';
      else if (!apple) ctx.filter = 'saturate(0.82)';
      if (apple) {
        // A fruit-bearing fork from the orchard canopy, clipped where it joins the trunk.
        ctx.scale(192 / 245, 160 / 247);
        ctx.translate(-1, -29);
        ctx.beginPath();
        const outline: Point[] = [
          [0, 28],
          [244, 28],
          [228, 139],
          [218, 155],
          [223, 179],
          [206, 191],
          [210, 205],
          [181, 219],
          [167, 243],
          [142, 238],
          [122, 271],
          [102, 247],
          [72, 251],
          [62, 231],
          [34, 235],
          [42, 219],
          [9, 225],
          [0, 205],
        ];
        outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(art.img, 0, 0, art.w / s, art.h / s);
      } else {
        ctx.scale(192 / 254, 160 / 188);
        ctx.translate(-290, -88);
        ctx.beginPath();
        const edge: Point[] = [
          [290, 88],
          [544, 88],
          [544, 259],
          [481, 265],
          [458, 246],
          [436, 259],
          [418, 242],
          [397, 249],
          [391, 232],
          [369, 243],
          [349, 235],
          [325, 254],
          [306, 274],
          [291, 269],
          [307, 233],
          [295, 214],
          [308, 181],
          [290, 160],
        ];
        edge.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(art.img, 0, 0, art.w / s, art.h / s);
      }
    } else {
      ctx.fillStyle = '#96743e';
      ctx.beginPath();
      ctx.ellipse(96, 76, 85, 74, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 4;
  const mat = new MeshLambertMaterial({ map, side: DoubleSide, alphaTest: 0.33, alphaToCoverage: true, vertexColors: true });
  wind(mat);
  sprays.set(kind, mat);
  return mat;
}

// A bent spray, broad at its crown and narrow where it meets its branch. +Z points outwards.
const sprayGeo = new BufferGeometry();
sprayGeo.setAttribute(
  'position',
  new Float32BufferAttribute(
    [-0.46, -0.1, 0.87, 0, 0.13, 1.05, 0.47, -0.08, 0.9, -0.57, -0.013, 0.49, 0, 0.19, 0.54, 0.56, -0.034, 0.47, -0.34, -0.1, 0.02, 0, 0, 0, 0.36, -0.12, 0.02],
    3,
  ),
);
sprayGeo.setAttribute(
  'color',
  new Float32BufferAttribute(
    [0.92, 0.95, 0.86, 1, 1, 0.95, 0.88, 0.91, 0.82, 0.62, 0.68, 0.61, 0.81, 0.87, 0.76, 0.61, 0.65, 0.59, 0.35, 0.41, 0.39, 0.44, 0.5, 0.46, 0.34, 0.41, 0.39],
    3,
  ),
);
sprayGeo.setAttribute('uv', new Float32BufferAttribute([0, 1, 0.5, 1, 1, 1, 0, 0.5, 0.5, 0.5, 1, 0.5, 0, 0, 0.5, 0, 1, 0], 2));
sprayGeo.setIndex([0, 1, 3, 1, 4, 3, 1, 2, 4, 2, 5, 4, 3, 4, 6, 4, 7, 6, 4, 5, 7, 5, 8, 7]);
sprayGeo.computeVertexNormals();
export function leafSpray(group: Group, kind: LeafArt, x: number, y: number, z: number, yaw: number, pitch: number, width: number, length: number): void {
  const mesh = new Mesh(sprayGeo, leafMaterial(kind));
  mesh.position.set(x, y, z);
  mesh.rotation.set(pitch, yaw, 0, 'YXZ');
  mesh.scale.set(width, Math.min(width, length), length);
  group.add(mesh);
}

// Project whole clusters of painted leaves onto bowed surfaces. Their cut edges keep the leaf
// silhouettes at both camera angles while their depth shades the inside of each branch.
const clusterGeo = new PlaneGeometry(1, 1, 4, 4);
const clusterPositions = clusterGeo.getAttribute('position');
const clusterColors: number[] = [];
for (let i = 0; i < clusterPositions.count; i++) {
  const x = clusterPositions.getX(i),
    y = clusterPositions.getY(i);
  const dome = (1 - 4 * x * x) * (1 - 4 * y * y);
  clusterPositions.setZ(i, 0.25 * dome - 0.2 * y);
  const light = 0.73 + 0.2 * (y + 0.5) + 0.08 * dome;
  clusterColors.push(light, light, light * 0.97);
}
clusterGeo.setAttribute('color', new Float32BufferAttribute(clusterColors, 3));
clusterGeo.computeVertexNormals();
export function canopy(group: Group, kind: LeafArt, x: number, y: number, z: number, yaw: number, width: number, height: number): void {
  for (let face = 0; face < 4; face++) {
    const mesh = new Mesh(clusterGeo, leafMaterial(kind));
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw + (face * Math.PI) / 2;
    mesh.scale.set(width, height, width);
    group.add(mesh);
  }
}
