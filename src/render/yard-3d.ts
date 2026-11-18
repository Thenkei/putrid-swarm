// The map is X/Z, in cells. The camera's ground-plane basis matches projection.ts exactly.
import {
  BufferGeometry,
  Float32BufferAttribute,
  MeshPhongMaterial,
  CanvasTexture,
  Color,
  DirectionalLight,
  DataTexture,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Object3D,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OrthographicCamera,
  NeutralToneMapping,
  PCFShadowMap,
  Plane,
  PlaneGeometry,
  PointLight,
  Raycaster,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Texture,
} from 'three';
import { BARRICADE } from '../core/data/devices';
import { GRID_H, GRID_W, HOUSE_CENTER, PROPS } from '../core/map';
import { SECTOR_IDS, type EnemyTypeId } from '../core/types';
import { farmhouse, part, spar } from './gate-models';
import { calmMotion } from './lighting';
import { ReliefMaterial } from './relief-material';
import { SoilMaterial } from './soil-material';
import { groundAlbedo } from './ground';
import { InfectedFigure } from './infected-models';
import { finish, foliageTime, paintedFace } from './painted-surfaces';
import { YardCover } from './yard-cover';
import { distantCrown, plantAtlas } from './plant-images';
import { birchCoppice, distantWoods, roadsideLedges, windthrow } from './woodland';
import { YardContacts } from './yard-contacts';
import { bankHeight, puddles } from './yard-soil';
import { onTrack } from './terrainfield';
import { seeded, smoothstep } from './noise';
import { TH, TW, groundMatrix, project, unproject, type View } from './projection';
import { TREES, type Tree } from './scenery';
import { batch, outcrop, scenery, tree } from './yard-meshes';
import { DefenceFigure } from './defence-models';
import type { DeviceVisual, WorldFrame } from './world';

const SCALE = TW / Math.SQRT2;
const PITCH = TH / TW;
const HORIZONTAL = Math.sqrt((1 - PITCH * PITCH) / 2);
const LIFT = SCALE * Math.sqrt(1 - PITCH * PITCH);
const UP = new Vector3(0, 1, 0);
const GROUND_VIEW: View = { x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0, zoom: 1, rot: 0 };

function plane(size: number, mat: MeshBasicMaterial | MeshLambertMaterial | SoilMaterial, y: number, banks = false): Mesh {
  const divisions = banks ? Math.ceil(size * 3) : 1;
  const geometry = new PlaneGeometry(size, size, divisions, divisions);
  if (banks) {
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) position.setZ(i, bankHeight(HOUSE_CENTER.x + position.getX(i), HOUSE_CENTER.y - position.getY(i)));
    geometry.computeVertexNormals();
  }
  const mesh = new Mesh(geometry, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(HOUSE_CENTER.x, y, HOUSE_CENTER.y);
  mesh.receiveShadow = true;
  return mesh;
}

function trackWater(): Mesh {
  const vertices: number[] = [],
    indices: number[] = [],
    waterDepth: number[] = [];
  for (const { x, z, outline } of puddles) {
    const start = vertices.length / 3;
    vertices.push(x, 0.009, z);
    waterDepth.push(1);
    for (const [px, pz] of outline) {
      vertices.push(x + (px - x) * 0.97, 0.009, z + (pz - z) * 0.97);
      waterDepth.push(0);
    }
    for (let i = 0; i < outline.length; i++) indices.push(start, start + 1 + ((i + 1) % outline.length), start + 1 + i);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('waterDepth', new Float32BufferAttribute(waterDepth, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mat = new MeshPhongMaterial({ color: 0x6b7363, specular: 0x9fae9b, shininess: 49, transparent: true, opacity: 0.65, depthWrite: false });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.yardTime = foliageTime;
    shader.vertexShader =
      'attribute float waterDepth; varying float poolDepth; varying vec2 poolXZ;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\npoolXZ = position.xz; poolDepth = waterDepth;');
    shader.fragmentShader =
      'uniform float yardTime; varying float poolDepth; varying vec2 poolXZ;\n' +
      shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `
      #include <normal_fragment_maps>
      float wave = poolXZ.x*16.+poolXZ.y*22.;
      float small = 1.-smoothstep(0.6,2.8,fwidth(wave));
      float ripple = small * (cos(wave+yardTime*1.1)*0.058+cos(wave*0.59-yardTime*0.73)*0.042);
      // Broken reflections of the woodland edge across the open strip of sky.
      vec2 sky = poolXZ + vec2(viewMatrix[0][2],viewMatrix[2][2])*1.12;
      float band = sky.x*2.8+sky.y*4.7+ripple*2.5;
      float horizon = sin(band) + 0.42*sin(band*2.8+0.4) + 0.22*sin(band*4.6);
      float gap = smoothstep(-0.28,0.78,horizon);
      vec2 bank = poolXZ*vec2(11.3,17.8);
      float broken = sin(bank.x+0.52*sin(bank.y))*sin(bank.y+0.71*cos(bank.x));
      float silt = smoothstep(0.12,0.66,poolDepth+0.16*broken);
      diffuseColor.rgb *= mix(vec3(0.36,0.40,0.34),vec3(1.28,1.34,1.36),gap);
      diffuseColor.a *= smoothstep(0.,0.38,poolDepth) * mix(0.42,1.0,silt);
      normal = normalize(normal+mat3(viewMatrix)*vec3(ripple,0.,ripple*0.6));
      float fresnel = pow(1.-abs(dot(normal,vec3(0.,0.,1.))),3.);
      totalEmissiveRadiance += vec3(.19,.26,.30) * fresnel;
    `,
      );
  };
  const mesh = new Mesh(geometry, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = -1;
  return mesh;
}



/** Both camera directions reuse the same few tree meshes; only their instance matrices differ. */
function forestViews(): Group[] {
  const prototypes = new Map<string, Group>();
  const distantTrees = !!distantCrown(0);
  return ([0, 1] as const).map((rot) => {
    const placements = new Map<Group, { transform: Matrix4; tint: Color }[]>();
    const placement = new Object3D();
    const distant: Tree[] = [];
    for (const [i, t] of TREES.entries()) {
      const far = rot === 0 ? t.gx < 0 || t.gy < 0 : t.gx > GRID_W || t.gy > GRID_H;
      if (!far && (t.row > 0 || t.trait > 0.3)) continue;
      // Birch colonises gaps in groups along the verge; deep stands retain the evergreen skyline.
      const clearing = Math.sin(t.gx * 0.49 + t.gy * 0.36) + Math.cos(t.gx * 0.17 - t.gy * 0.63);
      const birch = clearing + t.trait * 1.2 > 1.03 && t.trait > 0.25;
      if (far && (t.row >= 2 || (t.row === 1 && !birch && t.trait < 0.82 && distantTrees))) {
        distant.push(t);
        continue;
      }
      const variant = i % 4;
      const key = far ? (birch ? 'birch' : t.key) + variant : t.flip ? 'bush' : 'rock';
      let prototype = prototypes.get(key);
      if (!prototype) {
        const stand = !far ? scenery(t.flip ? 'bush' : 'rock', 0)
          : birch ? birchCoppice(variant + 19)
          : tree(t.key === 'obj_trees_pine', variant + 11);
        prototype = batch(stand);
        prototypes.set(key, prototype);
      }
      placement.position.set(t.gx, bankHeight(t.gx, t.gy), t.gy);
      placement.rotation.y = t.trait * 6;
      const size = far ? t.h / 195 : 0.62;
      placement.scale.set(size, size * (far ? 0.89 + t.trait * 0.28 : 1), size);
      placement.updateMatrix();
      const layer = far ? t.row : 0;
      const instance = { transform: placement.matrix.clone(), tint: new Color().setRGB(1 - 0.145 * layer, 1 - 0.11 * layer, 1 - 0.068 * layer) };
      const matrices = placements.get(prototype);
      if (matrices) matrices.push(instance);
      else placements.set(prototype, [instance]);
    }
    const woods = distantWoods(distant, rot);
    for (const [prototype, matrices] of placements) {
      for (const mesh of prototype.children) {
        if (!(mesh instanceof Mesh)) continue;
        const instances = new InstancedMesh(mesh.geometry, mesh.material, matrices.length);
        matrices.forEach(({ transform, tint }, i) => {
          instances.setMatrixAt(i, transform);
          instances.setColorAt(i, tint);
        });
        instances.computeBoundingSphere();
        woods.add(instances);
      }
    }
    return woods;
  });
}

/** Reed clumps and windfall collect in pockets at the woodland edge, leaving the paths open. */
function undergrowth(): Group {
  const verge = new Group(),
    rand = seeded(42);
  const liveVerge = !!plantAtlas();
  function tuft(x: number, z: number, height: number, yaw: number): void {
    if (liveVerge) return;
    const clump = new Group();
    for (let j = 0; j < 2; j++) {
      const spray = new Group();
      spray.rotation.y = j * 1.67;
      const w = height * (0.32 + rand() * 0.15);
      const lean = height * 0.19;
      paintedFace(
        spray,
        'orchard_fg_grass_a',
        [
          [-w + lean, height, 0],
          [w + lean, height, 0],
          [w, 0, 0],
          [-w, 0, 0],
        ],
        [
          [0, 0],
          [287, 0],
          [287, 549],
          [0, 549],
        ],
      );
      clump.add(spray);
    }
    clump.position.set(x, bankHeight(x, z) + 0.01, z);
    clump.rotation.y = yaw;
    verge.add(clump);
  }
  for (let i = 0; i < 135; i++) {
    const along = rand() * (GRID_W + 7) - 3.5;
    const depth = -4.5 + rand() * 6.1;
    const x = i % 4 === 0 ? depth : i % 4 === 1 ? GRID_W - depth : along;
    const z = i % 4 === 2 ? depth : i % 4 === 3 ? GRID_H - depth : along;
    if (onTrack(x, z, 0.66)) continue;
    const tall = 0.26 + rand() * 0.57;
    for (let j = 0; j < 3; j++) tuft(x + (rand() - 0.5) * 0.7, z + (rand() - 0.5) * 0.7, tall * (0.65 + rand() * 0.46), rand() * 6.28);
    if (i % 11 === 0) {
      const dy = rand() - 0.5;
      const y = bankHeight(x, z);
      finish(spar(verge, [x - 0.67, y + 0.13, z - dy], [x + 0.72, y + 0.19, z + dy], 0.19, '#795f42'), 'bark');
      spar(verge, [x, y + 0.16, z], [x + 0.27, y + 0.34, z - dy - 0.19], 0.07, '#72583e');
    }
  }
  // Windfall follows the contour. The tips stay outside the playable lot and the two approach lanes.
  const logs = [
    [-1.6, 4.2, 1.42], [4.5, -1.15, -0.04], [16.7, -1.36, 0.31],
    [23.0, 8.2, 1.28], [23.3, 17.0, 1.75], [16.8, 23.25, -0.13], [7.7, 23.25, 0.23],
    [-1.35, 16.3, 1.13],
  ] as const;
  for (const [i, [x, z, yaw]] of logs.entries()) {
    const trunk = windthrow(i * 31 + 5);
    trunk.rotation.y = yaw;
    trunk.scale.setScalar(0.88 + (i % 3) * 0.11);
    trunk.position.set(x, bankHeight(x, z) - 0.02, z);
    verge.add(trunk);
  }
  roadsideLedges(verge);
  // Broken shelves surface in the wooded banks; both approaches stay open.
  for (let i = 0; i < 18; i++) {
    const along = -2 + rand() * 26,
      depth = 0.75 + rand() * 3.75;
    const x = i % 4 === 0 ? -depth : i % 4 === 1 ? GRID_W + depth : along;
    const z = i % 4 === 2 ? -depth : i % 4 === 3 ? GRID_H + depth : along;
    if (onTrack(x, z, 1.6)) continue;
    const yaw = rand() * 0.6 + 0.24;
    for (let j = 0; j < 2 + (i % 3); j++) {
      const px = x + j * 0.48 + rand() * 0.26,
        pz = z + j * 0.12 + rand() * 0.32;
      const size = 0.68 + rand() * 0.79;
      outcrop(verge, px, bankHeight(px, pz) - size * 0.19, pz, size * 1.6, size * (0.35 + rand() * 0.31), size, yaw, i * 17 + j + 8);
    }
  }
  for (const prop of PROPS) {
    if (!['apple', 'oak', 'woodpile', 'well', 'rock'].includes(prop.kind)) continue;
    for (let i = 0; i < 5; i++) {
      const a = rand() * Math.PI * 2;
      tuft(prop.x + prop.w / 2 + Math.sin(a) * 0.57, prop.y + prop.h / 2 + Math.cos(a) * 0.48, 0.26 + rand() * 0.37, a);
    }
  }
  return batch(verge);
}


interface Figure {
  type: EnemyTypeId;
  actor: InfectedFigure;
}
type GroundPaint = (ctx: CanvasRenderingContext2D, view: View, frame: WorldFrame) => void;

export class Yard3D {
  private readonly gl = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 160);
  private readonly sun = new DirectionalLight(0xffdfa8, 2.1);
  private readonly sky = new HemisphereLight(0xffedd4, 0x95836a, 1.5);
  private readonly floods: PointLight[] = [];
  private readonly porchLights: PointLight[] = [];
  private readonly woods: Group[];
  private readonly houses: Group[];
  private readonly roofCut = new Plane(new Vector3(0, -1, 0), 8);
  private readonly car: Group;
  private readonly cover = new YardCover();
  private readonly contacts = new YardContacts();
  private readonly doors: Group[] = [];
  private readonly devices = new Map<number, DefenceFigure>();
  private readonly figures = new Map<number, Figure>();
  private readonly ray = new Raycaster();
  private readonly ink = document.createElement('canvas');
  private readonly inkTexture: CanvasTexture;
  private readonly marks: Mesh;
  private inkTime = -1;
  private inkHover = '';
  private inkRoutes: WorldFrame['routes'];
  private readonly ghostMaterial = new MeshLambertMaterial({ color: 0xc5ee9a, transparent: true, opacity: 0.58, depthWrite: false });
  private ghost: Group | undefined;
  private ghostKey = '';
  private exposure = NaN;

  constructor(environment: Texture | null = null) {
    this.scene.environment = environment;
    this.scene.environmentRotation.y = 1.12;
    this.gl.toneMapping = NeutralToneMapping;
    this.gl.toneMappingExposure = 1.04;
    this.gl.localClippingEnabled = true;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = PCFShadowMap;
    this.sun.position.set(2, 20, 19);
    this.sun.target.position.set(11, 0, 11);
    Object.assign(this.sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 0.1, far: 60 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.normalBias = 0.019;
    this.sun.castShadow = true;
    this.scene.add(this.sun, this.sun.target, this.sky);
    this.scene.background = new Color('#504936');
    this.scene.fog = new FogExp2(0x8b806a, 0.006);
    const ground = groundAlbedo();
    this.scene.add(plane(240, new MeshLambertMaterial({ color: 0x544733 }), -0.055));
    const terrain = (image: HTMLCanvasElement, size: number, y: number, height?: HTMLCanvasElement): void => {
      const tex = new CanvasTexture(image);
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = 4;
      const mat = height
        ? ground.normal ? new SoilMaterial(tex, height, ground.normal) : new ReliefMaterial({ map: tex, bumpMap: new CanvasTexture(height), bumpScale: 0.105, transparent: true, depthWrite: false })
        : new MeshLambertMaterial({ map: tex });
      if (mat instanceof ReliefMaterial) {
        const grain = new DataTexture(ground.grain, 256, 256);
        grain.wrapS = grain.wrapT = RepeatWrapping;
        grain.magFilter = LinearFilter;
        grain.minFilter = LinearMipmapLinearFilter;
        grain.generateMipmaps = true;
        grain.anisotropy = 8;
        grain.needsUpdate = true;
        mat.grain = { texture: grain, repeats: size / 1.65 };
        mat.bumpMap!.anisotropy = 8;
      }
      const tile = plane(size, mat, y, !!height);
      // Paint the feathered clearing before transparent placement ghosts and highlights.
      tile.renderOrder = -2;
      this.scene.add(tile);
    };
    terrain(ground.surround, ground.surroundSize, -0.032);
    terrain(ground.clearing, ground.clearingSize, 0, ground.relief);
    this.scene.add(trackWater());

    this.ink.width = this.ink.height = 768;
    this.inkTexture = new CanvasTexture(this.ink);
    this.inkTexture.generateMipmaps = false;
    this.inkTexture.colorSpace = SRGBColorSpace;
    this.marks = plane(GRID_W, new MeshBasicMaterial({ map: this.inkTexture, transparent: true, depthWrite: false }), 0.012);
    this.marks.renderOrder = 1;
    this.scene.add(this.marks);
    this.houses = [false, true].map((night) => {
      const house = batch(farmhouse(night));
      house.traverse((o) => {
        if (o instanceof Mesh) {
          const mat = (o.material as MeshLambertMaterial).clone();
          mat.clippingPlanes = [this.roofCut];
          mat.clipShadows = true;
          o.material = mat;
        }
      });
      house.position.set(HOUSE_CENTER.x, 0, HOUSE_CENTER.y);
      this.scene.add(house);
      return house;
    });
    this.car = batch(scenery('car', 0));
    const props = new Group();
    for (const [i, p] of PROPS.entries()) {
      const obj = p.kind === 'car' ? this.car : scenery(p.kind, i + 17);
      obj.position.set(p.x + p.w / 2, 0, p.y + p.h / 2);
      (p.kind === 'car' ? this.scene : props).add(obj);
    }
    this.scene.add(batch(props));
    this.woods = forestViews();
    this.scene.add(...this.woods);
    this.scene.add(undergrowth(), this.cover, this.contacts);
    for (let i = 0; i < 4; i++) {
      const door = new Group();
      for (let j = 0; j < 5; j++) {
        const board = new Group();
        finish(part(board, 0, 0, 0, 1.06, 0.16, 0.11, '#9c7856'), 'log');
        for (const x of [-0.42, 0.43]) part(board, x, 0.012, 0.065, 0.042, 0.047, 0.023, '#5b5346');
        const slat = batch(board);
        slat.position.y = 0.24 + j * 0.24;
        slat.rotation.z = Math.sin(j * 3.5 + 1) * 0.17;
        door.add(slat);
      }
      part(door, 0, 0.72, 0.1, 0.12, 1.5, 0.11, '#9d947b').rotation.z = 0.59;
      const a = (i * Math.PI) / 2,
        offset = i % 2 === 0 ? -0.25 : 0.05;
      door.rotation.y = a;
      door.position.set(11 + Math.sin(a) * 2.24 + Math.cos(a) * offset, 0, 11 + Math.cos(a) * 2.24 - Math.sin(a) * offset);
      this.scene.add(door);
      this.doors.push(door);
      const porch = new PointLight(0xffbd76, 0, 5.2, 2);
      porch.position.copy(door.position);
      porch.position.x += Math.sin(a) * 0.64;
      porch.position.z += Math.cos(a) * 0.64;
      porch.position.y = 1.55;
      this.porchLights.push(porch);
      this.scene.add(porch);
    }
    // Fixed shader light count. The screen-space light map also covers every active lamp.
    for (let i = 0; i < 4; i++) {
      const light = new PointLight(0xffdfab, 0, 7, 2);
      this.floods.push(light);
      this.scene.add(light);
    }
  }

  get available(): boolean {
    return !this.gl.getContext().isContextLost();
  }

  private aim(v: View): void {
    const w = v.w / (2 * SCALE * v.zoom),
      h = v.h / (2 * SCALE * v.zoom),
      s = v.rot === 0 ? 1 : -1;
    Object.assign(this.camera, { left: -w, right: w, top: h, bottom: -h });
    this.camera.position.set(v.cx + s * HORIZONTAL * 50, PITCH * 50, v.cy + s * HORIZONTAL * 50);
    this.camera.up.copy(UP);
    this.camera.lookAt(v.cx, 0, v.cy);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  get roofVisible(): boolean {
    return this.roofCut.constant > 1;
  }

  deviceTop(d: DeviceVisual): number {
    return -(this.devices.get(d.id)?.height ?? 1) * LIFT;
  }

  pick(v: View, devices: readonly DeviceVisual[], sx: number, sy: number): DeviceVisual | null {
    this.aim(v);
    this.ray.setFromCamera(new Vector2(((sx - v.x) / v.w) * 2 - 1, 1 - ((sy - v.y) / v.h) * 2), this.camera);
    let nearest = Infinity,
      result: DeviceVisual | null = null;
    for (const d of devices) {
      const item = this.devices.get(d.id);
      if (!item) continue;
      const p = project(v, d.x + 0.5, d.y + 0.5);
      if (d.label && Math.abs((sx - p.x) / v.zoom - 12) < 12 && Math.abs((sy - p.y) / v.zoom - this.deviceTop(d) + 18) < 12) return d;
      const hit = this.ray.intersectObject(item.root, true)[0];
      if (hit && hit.distance < nearest) {
        nearest = hit.distance;
        result = d;
      }
    }
    const cell = unproject(v, sx, sy);
    return result ?? devices.find((d) => d.x === Math.floor(cell.gx) && d.y === Math.floor(cell.gy)) ?? null;
  }

  private sync(v: View, f: WorldFrame): void {
    const exposure = f.night ? -1 : Math.min(1, Math.max(0, f.dusk ?? 0));
    if (this.exposure !== exposure) {
      this.exposure = exposure;
      const late = smoothstep(0.53, 1, exposure);
      this.scene.environmentIntensity = f.night ? 0.18 : 0.54 - late * 0.24;
      const noon = Math.sin(Math.PI * Math.max(0, exposure));
      // Azimuth and elevation belong to the yard. Turning to the other camera
      // reveals the shaded side of the same object at the same hour.
      if (f.night) this.sun.position.set(4, 19, -5);
      else this.sun.position.set(11 - 17 * Math.cos(Math.PI * exposure), 13 + noon * 15 - late * 4, 19 + noon * 7);
      this.sun.color.set(f.night ? 0xb6cffa : 0xffe4c0).lerp(new Color(0xffb86c), late);
      this.sun.intensity = f.night ? 1.6 : 2.45 + noon * 0.28 - late * 0.75;
      this.sky.color.set(f.night ? 0xc0d3ea : 0xd7e8fa).lerp(new Color(0xadb9d4), late);
      this.sky.groundColor.set(f.night ? 0x746e69 : 0x9c8568);
      this.sky.intensity = f.night ? 1.32 : 1.44 - late * 0.25;
      (this.scene.fog as FogExp2).color.set(f.night ? 0x475661 : 0xa39682);
      for (const porch of this.porchLights) porch.intensity = f.night ? 6.2 : 4.8 * late;
    }
    for (const [i, wood] of this.woods.entries()) wood.visible = i === v.rot;
    for (const [i, house] of this.houses.entries()) house.visible = i === Number(f.night || exposure >= 0.77);
    this.car.visible = f.carPresent;
    this.cover.sync(f);
    this.contacts.sync(f, this.car.position);
    for (const [i, door] of this.doors.entries()) {
      const state = f.barricades[SECTOR_IDS[i]!];
      const boards = Math.ceil((5 * state.hp) / BARRICADE.maxHp[state.level]);
      door.children.forEach((obj, j) => {
        obj.visible = j === 5 ? state.level === 1 && boards > 0 : j < boards;
      });
    }

    const ids = new Set<number>();
    let lit = 0;
    for (const d of f.devices) {
      ids.add(d.id);
      const facing=d.facing ?? 0;
      let item = this.devices.get(d.id);
      if (item?.type !== d.type || item.facing !== facing) {
        if (item) this.scene.remove(item.root);
        item = new DefenceFigure(d.type, facing);
        this.devices.set(d.id, item);
        this.scene.add(item.root);
      }
      item.pose(d,f.time);
      item.root.position.set(d.x + 0.5, 0, d.y + 0.5);
      if (d.type === 'floodlight' && d.state === 'active' && lit < this.floods.length) {
        const lamp = this.floods[lit++]!;
        lamp.position.set(d.x + 0.5, 1.7, d.y + 0.5);
        lamp.intensity = 16;
      }
    }
    for (const [id, item] of this.devices)
      if (!ids.has(id)) {
        this.scene.remove(item.root);
        this.devices.delete(id);
      }
    for (const lamp of this.floods.slice(lit)) lamp.intensity = 0;

    if (this.ghost) this.ghost.visible = false;
    if (f.ghost) {
      const g = f.ghost;
      const key=g.type+'/'+(g.facing ?? 0);
      if (key !== this.ghostKey) {
        if (this.ghost) this.scene.remove(this.ghost);
        this.ghost = new DefenceFigure(g.type,g.facing??0).root;
        this.ghost.traverse((o) => {
          if (o instanceof Mesh) {
            o.material = this.ghostMaterial;
            o.castShadow = false;
          }
        });
        this.scene.add(this.ghost);
        this.ghostKey = key;
      }
      this.ghost!.position.set(g.x + 0.5, 0.025, g.y + 0.5);
      this.ghost!.visible = true;
      this.ghostMaterial.color.set(!g.ok ? 0xee644a : g.idle ? 0xeab866 : 0xb9eb88);
    }
    ids.clear();
    const actorFor = (id: number, type: EnemyTypeId): InfectedFigure => {
      ids.add(id);
      let record = this.figures.get(id);
      if (record?.type !== type) {
        if (record) this.scene.remove(record.actor.root);
        record = { type, actor: new InfectedFigure(type) };
        this.figures.set(id, record);
        this.scene.add(record.actor.root);
      }
      return record.actor;
    };
    for (const enemy of f.enemies) if (enemy.alive) actorFor(enemy.id, enemy.type).pose(enemy, f.time);
    for (const dead of f.fallen ?? []) actorFor(dead.id, dead.type).fall(dead);
    for (const [id, item] of this.figures)
      if (!ids.has(id)) {
        this.scene.remove(item.actor.root);
        this.figures.delete(id);
      }

    // Cut away walls above the sill when the roof would cover placement or an infected.
    const centre = project(v, 11, 11);
    const blocked = (x: number, y: number): boolean => {
      const p = project(v, x, y);
      const dx = Math.abs(p.x - centre.x) / v.zoom,
        dy = (centre.y - p.y) / v.zoom;
      return dx < 128 && dy > 0 && dy < 177 - dx * 0.33;
    };
    const cut = (f.ghost && blocked(f.ghost.x + 0.5, f.ghost.y + 0.5)) || f.enemies.some((e) => e.alive && blocked(e.x, e.y));
    this.roofCut.constant = cut ? 0.62 : 8;
  }

  draw(ctx: CanvasRenderingContext2D, v: View, f: WorldFrame, paint: GroundPaint): void {
    this.aim(v);
    foliageTime.value = calmMotion() ? 0 : f.time;
    this.sync(v, f);
    this.marks.visible = !!(
      f.decals.length ||
      f.routes?.length ||
      f.hoverCell ||
      f.lanes?.length ||
      f.particles.some((p) => p.kind === 'ring' || p.kind === 'splat')
    );
    if (this.marks.visible) {
      const tick = Math.floor(f.time * 12);
      const hover = [f.hoverCell?.x, f.hoverCell?.y, f.hoverRadius, f.ghost?.ok, f.ghost?.idle, f.decals.length, f.lanes?.length].join('/');
      if (tick !== this.inkTime || hover !== this.inkHover || f.routes !== this.inkRoutes) {
        const ink = this.ink.getContext('2d')!;
        ink.resetTransform();
        ink.clearRect(0, 0, this.ink.width, this.ink.height);
        const scale = this.ink.width / GRID_W;
        // The painter works in isometric screen pixels. Invert that projection onto a top-down UV sheet.
        ink.setTransform(new DOMMatrix().scale(scale).multiply(new DOMMatrix([...groundMatrix(GROUND_VIEW)]).inverse()));
        paint(ink, GROUND_VIEW, f);
        this.inkTexture.needsUpdate = true;
        this.inkTime = tick;
        this.inkHover = hover;
        this.inkRoutes = f.routes;
      }
    }
    // Resolve the main feed at the stage's physical density. Small monitors already
    // render at their destination density and do not need the wide view's extra samples.
    const dpr = Math.min(2, Math.max(v.w >= 600 ? 1.25 : 1, ctx.getTransform().a));
    const w = Math.ceil(v.w * dpr),
      h = Math.ceil(v.h * dpr);
    const canvas = this.gl.domElement;
    if (canvas.width < w || canvas.height < h) this.gl.setSize(Math.max(w, canvas.width), Math.max(h, canvas.height), false);
    this.gl.setViewport(0, canvas.height - h, w, h);
    this.gl.setScissor(0, canvas.height - h, w, h);
    this.gl.setScissorTest(true);
    this.gl.render(this.scene, this.camera);
    ctx.drawImage(canvas, 0, 0, w, h, v.x, v.y, v.w, v.h);
  }
}
