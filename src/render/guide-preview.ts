// The guide uses the same articulated figures as the yard. Only the inspection camera,
// lighting and slice of ground belong to this scene.
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  OrthographicCamera,
  PCFShadowMap,
  PointLight,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  type Texture,
} from 'three';
import { DEVICES } from '../core/data/devices';
import { ENEMIES } from '../core/data/enemies';
import { sprite } from '../engine/assets';
import { surfaceImage, type SurfaceChannel } from '../engine/material-images';
import type { GuideEntry, GuideStage } from '../scenes/guide-catalog';
import { DefenceFigure } from './defence-models';
import { InfectedFigure } from './infected-models';
import { seeded } from './noise';
import { MOB_ACTIONS } from './infected-motion';

function soilSection(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!,
    random = seeded(411);
  const bands = ctx.createLinearGradient(0, 0, 0, 96);
  for (const [y, color] of [
    [0, '#798053'],
    [0.09, '#70653c'],
    [0.26, '#473e2b'],
    [0.43, '#776448'],
    [0.53, '#665337'],
    [0.78, '#564839'],
    [1, '#3c352b'],
  ] as const)
    bands.addColorStop(y, color);
  ctx.fillStyle = bands;
  ctx.fillRect(0, 0, 512, 96);
  const earth = surfaceImage('soil');
  if (earth) {
    ctx.globalAlpha = 0.78;
    for (let x = 0; x < 512; x += 128) ctx.drawImage(earth, 0, 0, earth.width, earth.height * 0.75, x, 0, 128, 96);
    ctx.globalAlpha = 1;
  }
  for (let i = 0; i < (earth ? 95 : 980); i++) {
    const x = random() * 512,
      y = random() * 96,
      r = 0.4 + random() ** 4 * 3.5;
    ctx.fillStyle = i % 3 ? 'rgba(34,29,21,.44)' : 'rgba(203,179,125,.46)';
    ctx.beginPath();
    ctx.ellipse(x, y, r * 2, r, random() * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 64; i++) {
    const x = random() * 512,
      bend = (random() - 0.5) * 20,
      depth = 6 + random() ** 2 * 54;
    ctx.strokeStyle = i % 3 ? '#8d7951' : '#ad9567';
    ctx.lineWidth = 0.55 + random() * 1.1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x - bend, depth * 0.54, x + bend, depth);
    ctx.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

// All three channels share the same worn patch and texel scale, including its transition to grass.
function clearingMap(channel: SurfaceChannel): CanvasTexture {
  const canvas = document.createElement('canvas');
  const size = 1024;
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = channel === 'albedo' ? '#777653' : channel === 'normal' ? '#8080ff' : '#7bd600';
  ctx.fillRect(0, 0, size, size);
  const grass =
    surfaceImage('turf', channel) ?? surfaceImage('grass', channel) ?? (channel === 'albedo' ? sprite('tex_ground_grass')?.img : undefined);
  const path = surfaceImage('soil', channel) ?? (channel === 'albedo' ? sprite('tex_ground_path')?.img : undefined);
  if (grass) ctx.drawImage(grass, 0, 0, size, size);
  if (path) {
    const earth = canvas.cloneNode() as HTMLCanvasElement;
    const soil = earth.getContext('2d')!;
    soil.drawImage(path, 0, 0, size, size);
    soil.globalCompositeOperation = 'destination-in';
    const fade = soil.createRadialGradient(size * 0.57, size * 0.42, size * 0.06, size * 0.46, size * 0.52, size * 0.54);
    fade.addColorStop(0, '#000');
    fade.addColorStop(0.41, 'rgba(0,0,0,.86)');
    fade.addColorStop(1, 'transparent');
    soil.fillStyle = fade;
    soil.fillRect(0, 0, size, size);
    ctx.drawImage(earth, 0, 0);
  }
  const map = new CanvasTexture(canvas);
  if (channel === 'albedo') map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

function turf() {
  const top = new MeshStandardMaterial({
    map: clearingMap('albedo'),
    normalMap: clearingMap('normal'),
    normalScale: new Vector2(0.78, 0.78),
    roughnessMap: clearingMap('surface'),
    roughness: 1,
    metalness: 0,
  });
  const soil = new MeshLambertMaterial({ map: soilSection(), vertexColors: true });
  const grassMaterial = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  const positions: number[] = [],
    uvs: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const sides = 42,
    random = seeded(7204);
  const edge = Array.from({ length: sides }, (_, i) => {
    const a = (i * Math.PI * 2) / sides;
    const r = 0.95 + random() * 0.04 + 0.025 * Math.sin(3 * a);
    return [r * Math.sin(a), r * Math.cos(a), random() * 0.055] as const;
  });
  const vertex = (x: number, y: number, z: number, colour: number) => {
    positions.push(x, y, z);
    uvs.push(0.5 + x / 2.15, 0.5 - z / 2.15);
    colors.push(...new Color(colour).toArray());
    return positions.length / 3 - 1;
  };
  const centre = vertex(0, 0, 0, 0xffffff);
  for (const [x, z] of edge) vertex(x, 0, z, 0xffffff);
  for (let i = 0; i < sides; i++) indices.push(centre, i + 1, 1 + ((i + 1) % sides));
  const layers = [
    [1, 0, 0xffffff],
    [1.005, -0.043, 0xf2f1e4],
    [0.98, -0.085, 0xe9e6d5],
    [0.94, -0.165, 0xd4cbbc],
  ] as const;
  for (const [j, [radius, y, tint]] of layers.entries()) {
    for (let i = 0; i <= sides; i++) {
      const [x, z, depth] = edge[i % sides]!;
      const k = vertex(x * radius, y - (depth * j) / 4, z * radius, tint);
      uvs[k * 2] = (3 * i) / sides;
      uvs[k * 2 + 1] = 1 + j / (1 - layers.length);
      if (!i || !j) continue;
      const a = k - sides - 2;
      indices.push(a, k - 1, a + 1, a + 1, k - 1, k);
    }
  }
  const sideEnd = indices.length;
  for (let i = 0; i < 75; i++) {
    const angle = random() * Math.PI * 2,
      r = 0.71 + 0.22 * random();
    if (Math.sin(angle * 3 - 0.8) > 0.4 && i % 3) continue;
    const x = Math.sin(angle) * r,
      z = Math.cos(angle) * r;
    for (let b = 0; b < 5; b++) {
      const a = random() * 6.28,
        spread = random() * 0.022;
      const dx = x + spread * Math.sin(a),
        dz = z + spread * Math.cos(a);
      const w = 0.006 + random() * 0.008,
        h = 0.017 + random() * 0.052;
      const k = vertex(dx - w * Math.cos(a), 0, dz + w * Math.sin(a), 0x666735);
      vertex(dx + w * Math.cos(a), 0, dz - w * Math.sin(a), 0x747540);
      vertex(dx + Math.sin(a) * h * 0.65, h, dz + Math.cos(a) * h * 0.65, i % 3 ? 0x9c9d58 : 0xc1a366);
      indices.push(k, k + 1, k + 2);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.addGroup(0, 3 * sides, 0);
  geo.addGroup(3 * sides, sideEnd - 3 * sides, 1);
  geo.addGroup(sideEnd, indices.length - sideEnd, 2);
  geo.computeVertexNormals();
  const ground = new Mesh(geo, [top, soil, grassMaterial]);
  ground.receiveShadow = true;
  ground.position.y = -0.022;
  return ground;
}

export class GuidePreview {
  private readonly gl = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  readonly canvas = this.gl.domElement;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 35);
  private readonly key = new DirectionalLight();
  private readonly sky = new HemisphereLight();
  private readonly rim = new DirectionalLight();
  private readonly lamp = new PointLight(0xffdd9a, 0, 4);
  private readonly ground = turf();
  private readonly mount = new Group();
  private entry?: GuideEntry;
  private defence: DefenceFigure | undefined;
  private mob: InfectedFigure | undefined;
  private isNight: boolean | undefined;
  private frameHeight = 3.3;
  private density = 0;

  constructor(environment: Texture | null = null) {
    this.scene.environment = environment;
    this.scene.environmentRotation.y = 1.12;
    this.gl.toneMapping = NeutralToneMapping;
    this.gl.toneMappingExposure = 1.04;
    this.gl.setClearColor(0, 0);
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = PCFShadowMap;
    this.key.position.set(-3.4, 6, 3.8);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.normalBias = 0.008;
    Object.assign(this.key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.1, far: 16 });
    this.key.shadow.camera.updateProjectionMatrix();
    this.rim.position.set(2.5, 3.6, -3);
    this.lamp.position.set(0, 1.7, 0.25);
    this.scene.add(this.key, this.rim, this.sky, this.lamp, this.ground, this.mount);
  }

  select(entry: GuideEntry): void {
    this.mount.clear();
    this.entry = entry;
    this.defence = entry.kind === 'defence' ? new DefenceFigure(entry.id) : undefined;
    this.mob = entry.kind === 'mob' ? new InfectedFigure(entry.id, 'inspection') : undefined;
    this.mount.add((this.defence ?? this.mob)!.root);
    this.frameHeight =
      entry.kind === 'mob' ? Math.max(2.33, ENEMIES[entry.id].size * 2.95) : entry.id === 'spikes' ? 2.12 : entry.id === 'floodlight' ? 3.35 : 2.93;
    const radius = this.frameHeight * (entry.kind === 'mob' ? 0.625 : 0.57);
    this.ground.scale.set(radius * (entry.kind === 'mob' ? 1.09 : 1), 0.62 * radius, radius);
  }

  private light(night: boolean): void {
    if (this.isNight === night) return;
    this.isNight = night;
    this.scene.environmentIntensity = night ? 0.28 : 0.76;
    this.key.color.set(night ? 0xa7c8eb : 0xffefdc);
    this.key.intensity = night ? 1.6 : 2.3;
    this.sky.color.set(night ? 0xa9c3db : 0xdbe5e2);
    this.sky.groundColor.set(night ? 0x5d605b : 0xa58b6e);
    this.sky.intensity = night ? 0.74 : 0.95;
    this.rim.color.set(night ? 0xa2c6e3 : 0xffe3aa);
    this.rim.intensity = night ? 1.35 : 0.75;
  }

  draw(
    stage: GuideStage,
    age: number,
    duration: number,
    yaw: number,
    zoom: number,
    night: boolean,
    width: number,
    height: number,
    density: number,
  ): void {
    const entry = this.entry;
    if (!entry) return;
    this.light(night);
    this.lamp.intensity = 0;
    if (entry.kind === 'defence' && this.defence) {
      const def = DEVICES[entry.id],
        progress = Math.min(1, age / duration);
      const state =
        stage === 'broken'
          ? 'broken'
          : stage === 'rearming'
            ? 'rearming'
            : stage === 'active'
              ? 'active'
              : entry.id === 'fence'
                ? 'passive'
                : 'armed';
      this.defence.pose(
        { state, hpRatio: stage === 'broken' ? 0 : stage === 'impact' ? 0.42 : 1, activeAge: Math.min(age, def.activeSeconds), rearm: progress },
        age,
        stage === 'broken' ? age : stage === 'impact' ? age % 0.86 : undefined,
      );
      if (entry.id === 'floodlight' && stage === 'active') this.lamp.intensity = night ? 14 : 8;
    } else if (entry.kind === 'mob' && this.mob) {
      const place = { id: 2, x: 0, y: 0, fx: 0, fy: 1 };
      if (stage === 'fallen') this.mob.fall({ ...place, age });
      else {
        const action = MOB_ACTIONS[entry.id].find((action) => action === stage) ?? 'idle';
        const wound = stage === 'hit' ? Math.max(0, 0.18 - (age % 0.57)) : 0;
        this.mob.pose({ ...place, action, hitFlash: wound, windup: Math.max(0, ENEMIES[entry.id].windupSeconds - age) }, age);
      }
    }
    if (this.density !== density || this.canvas.width !== Math.floor(width * density) || this.canvas.height !== Math.floor(height * density)) {
      this.density = density;
      this.gl.setPixelRatio(density);
      this.gl.setSize(width, height, false);
    }
    const half = (this.frameHeight * 0.5) / zoom;
    const elevation = 0.38;
    const standing = entry.kind === 'mob' && !['dog', 'boar', 'deer'].includes(entry.id) && stage !== 'fallen';
    const focus = standing ? 0.49 : stage === 'broken' || stage === 'fallen' || (entry.kind === 'defence' && entry.id === 'spikes') ? 0.09 : 0.31;
    const aim = this.frameHeight * (0.204 + (focus - 0.204) * Math.min(1, Math.max(0, (zoom - 1) / 1.45)));
    this.camera.position.set(8 * Math.sin(yaw) * Math.cos(elevation), aim + 8 * Math.sin(elevation), 8 * Math.cos(yaw) * Math.cos(elevation));
    this.camera.lookAt(0, aim, 0);
    Object.assign(this.camera, { left: (-half * width) / height, right: (half * width) / height, top: half, bottom: -half });
    this.camera.updateProjectionMatrix();
    this.gl.render(this.scene, this.camera);
  }

  dispose(): void {
    this.ground.geometry.dispose();
    for (const material of this.ground.material) {
      material.map?.dispose();
      if (material instanceof MeshStandardMaterial) {
        material.normalMap?.dispose();
        material.roughnessMap?.dispose();
      }
      material.dispose();
    }
    this.key.shadow.dispose();
    this.scene.clear();
    this.gl.dispose();
    this.gl.forceContextLoss();
  }
}
