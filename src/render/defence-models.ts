// The night sim owns the timers and hit points. Only a camera transform changes between
// thumbnails, so a given sim time must always produce exactly the same mechanism pose.
import { Box3, Group, Mesh } from 'three';
import type { DeviceTypeId, Facing } from '../core/types';
import type { DeviceVisual } from './world';
import { buildDefence, emptyParts, type DefenceParts, type Wear } from './defence-meshes';
import { clamp01, smoothstep } from './noise';
import { batch } from './yard-meshes';

type State = Pick<DeviceVisual, 'state' | 'hpRatio' | 'activeAge' | 'rearm'>;
export const DEFENCE_FALL_SECONDS = 0.82;
const faces = [0, -Math.PI / 2, Math.PI / 4, -Math.PI / 4];
const still: State = { state: 'armed', hpRatio: 1 };

function fall(age: number, delay = 0): number {
  const t = Math.max(0, age - delay);
  if (t >= 0.65) return 1;
  const landing = 0.43;
  if (t < landing) return (t / landing) ** 2;
  const rebound = t - landing;
  return 1 - 0.13 * Math.sin((Math.PI * rebound) / (0.65 - landing)) * (1 - rebound / (0.65 - landing));
}

// Each detached assembly falls about the place where it broke. These transforms also
// define the settled wreck baked for subsequent nights and daytime repairs.
function collapse(type: DeviceTypeId, p: DefenceParts, age: number): void {
  const drop = fall(age),
    loose = fall(age, 0.12);
  p.signal.visible = false;
  switch (type) {
    case 'fence':
      p.main.position.set(-0.06 * drop, 0.024 + 0.065 * drop, 0.185 * drop);
      p.main.rotation.set(1.48 * drop, 0.21 * drop, -0.125 * drop);
      p.secondary.position.set(0.17 * loose, 0.06 + 0.082 * loose, -0.18 * loose);
      p.secondary.rotation.set(-1.49 * loose, 0.7 * loose, -0.32 * loose);
      break;
    case 'spikes':
      p.main.position.set(-0.038 - 0.108 * drop, 0.22 + 0.042 * drop, -0.374);
      p.main.rotation.set(-0.88 + 0.41 * drop, 0.15 * drop, -0.2 * drop);
      p.secondary.position.set(0, 0.151, 0.011);
      p.secondary.rotation.z = -0.08 * drop;
      p.rigging.position.set(0.329, 0.289 - 0.15 * loose, -0.34);
      p.rigging.rotation.set(0.56 + 0.91 * loose, 0.41 * loose, 0.21 * loose);
      break;
    case 'log':
      p.rigging.position.set(0, 1.52 - 0.506 * loose, 0.029 + 0.13 * loose);
      p.rigging.rotation.z = -0.79 * loose;
      p.main.position.set(-0.043 * drop, 0.961 - 0.745 * drop, 0.46 - 0.173 * drop);
      p.main.rotation.set(-0.89 + 1.89 * drop, 0.264 * drop, -0.057 * drop);
      p.secondary.position.set(0.582, 0.523 - 0.36 * loose, 0.091 + 0.25 * loose);
      p.secondary.rotation.set(2.11 * loose, -0.18 * loose, 0.27 * loose);
      break;
    case 'net':
      p.secondary.position.set(0, 1.499 - 0.399 * loose, 0.057 + 0.06 * loose);
      p.secondary.rotation.z = -0.72 * loose;
      p.main.position.set(0.061 * drop, 1.22 - 1.063 * drop, 0.07 + 0.148 * drop);
      p.main.rotation.set(0.21 * drop, 0.23 * drop, -0.09 * drop);
      p.main.scale.set(1.03, 0.3, 1.0);
      p.rigging.position.set(0, 1.47, 0.034);
      p.rigging.scale.y = 1.36;
      break;
    case 'barrier':
      p.main.position.set(0, 0.229, 0.018);
      p.main.rotation.set(0.4 + 0.77 * drop, 0.043 * drop, 0.085 * drop);
      p.secondary.position.set(0.048 + 0.09 * loose, 0.89 - 0.737 * loose, 0.182 + 0.355 * loose);
      p.secondary.rotation.set(0.19 + 1.16 * loose, 0.38 * loose, -0.153 * loose);
      break;
    case 'horn':
      p.main.position.set(0.24 * drop, 0.208 * drop, 0.05 * drop);
      p.main.rotation.set(-0.102 * drop, 0.147 * drop, -1.56 * drop);
      p.secondary.position.set(0.041 - 0.136 * loose, 0.871 - 0.643 * loose, 0.029 + 0.32 * loose);
      p.secondary.rotation.set(-0.21 + 0.53 * loose, -0.46 * loose, 0.12 + 1.26 * loose);
      break;
    case 'floodlight':
      p.secondary.position.set(-0.054 - 0.11 * drop, 0.868 - 0.697 * drop, -0.08 - 0.017 * drop);
      p.secondary.rotation.set(1.5 * drop, 0.57 * drop, 0.17 * drop);
      p.main.position.set(-0.034 - 0.304 * loose, 1.591 - 1.344 * loose, 0.136 + 0.246 * loose);
      p.main.rotation.set(0.35 - 0.19 * loose, -0.54 * loose, 1.21 * loose);
      break;
  }
}

function poseParts(type: DeviceTypeId, p: DefenceParts, d: State, impactAge: number): void {
  if (d.state === 'broken') {
    collapse(type, p, impactAge);
    return;
  }
  const active = d.state === 'active',
    rearming = d.state === 'rearming';
  const age = Math.max(0, d.activeAge ?? 0),
    reset = clamp01(d.rearm ?? 0);
  const hit = impactAge >= 0 && impactAge < 0.62 ? Math.sin(28 * impactAge + 0.18) * Math.exp(-6.9 * impactAge) : 0;
  p.signal.visible = active;
  switch (type) {
    case 'fence': {
      const battered = d.hpRatio <= 0.5;
      p.main.rotation.x = 0.16 * hit + (battered ? 0.077 : 0);
      p.secondary.rotation.set((battered ? 0.18 : 0.007) + 0.264 * hit, 0, battered ? -0.24 : -0.008);
      p.secondary.position.set(battered ? -0.03 : 0, battered ? 0.023 : 0, battered ? 0.055 : 0);
      break;
    }
    case 'spikes': {
      const lift = active ? smoothstep(0, 0.126, age) : rearming ? 1 - smoothstep(0.04, 0.8, reset) : 0;
      const recoil = active ? Math.sin(28 * age) * Math.exp(-5 * age) * 0.16 : 0;
      p.main.position.set(0, 0.229, -0.374);
      p.main.rotation.x = -0.042 - 1.36 * lift - recoil;
      p.secondary.position.set(0, 0.12 + 0.041 * lift, 0);
      p.secondary.scale.y = 0.075 + 0.925 * lift;
      break;
    }
    case 'log': {
      const draw = rearming ? smoothstep(0.08, 0.995, reset) : 1;
      const swing = active
        ? -1.01 * (1 - smoothstep(0, 0.225, age)) + Math.sin(age * 9.3) * Math.exp(-1.9 * age) * 1.47 * smoothstep(0, 0.19, age)
        : rearming
          ? 0.23 * (1 - draw) - 1.01 * draw
          : -1.01;
      p.rigging.position.set(0, 1.525, 0);
      p.main.rotation.x = swing;
      p.main.position.set(0, 1.525 - 0.87 * Math.cos(swing), -0.87 * Math.sin(swing));
      p.secondary.position.set(0.598, 0.527, 0.071);
      p.secondary.rotation.x = active ? 3.65 * smoothstep(0, 0.42, age) : rearming ? (1 - draw) * 3.65 : 0;
      break;
    }
    case 'net': {
      const release = active ? smoothstep(0, 0.375, age) : rearming ? 1 - smoothstep(0.18, 0.96, reset) : 0;
      const stretch = active ? smoothstep(0.05, 0.45, age) * (0.05 * Math.sin(age * 8.2) * Math.exp(-0.9 * age)) : 0;
      const top = 1.212 - 0.73 * release + stretch;
      p.secondary.position.set(0, 1.525, 0);
      p.main.position.set(0, top, 0);
      p.main.scale.set(1, 0.61 + 0.45 * release, 1);
      p.rigging.position.set(0, 1.49, 0);
      p.rigging.scale.y = 1.49 - top;
      break;
    }
    case 'barrier': {
      const rise = active ? smoothstep(0, 0.23, age) : rearming ? 1 - smoothstep(0, 0.23, reset) : 0;
      const bounce = active ? Math.sin(Math.max(0, age - 0.19) * 28) * Math.exp(-Math.max(0, age - 0.19) * 7) * 0.1 : 0;
      p.main.position.set(0, 0.229, 0.018);
      p.main.rotation.x = 1.545 * (1 - rise) - bounce;
      const tilt = p.main.rotation.x;
      p.secondary.position.set(0.343, 0.229 + 0.894 * Math.cos(tilt) + 0.09 * Math.sin(tilt), 0.018 + 0.894 * Math.sin(tilt) - 0.09 * Math.cos(tilt));
      p.signal.position.copy(p.secondary.position);

      p.signal.visible = active && Math.sin(age * 8.2) > -0.4;
      break;
    }
    case 'horn': {
      const rattle = active ? Math.sin(age * 33) * 0.021 : 0;
      p.main.position.set(0, Math.abs(rattle) * 0.18, 0);
      p.main.rotation.z = rattle + hit * 0.056;
      p.secondary.position.set(0.041 - rattle * 0.83, 0.871 + rattle * 0.42, 0.029);
      p.secondary.rotation.set(-0.206 + 0.46 * rattle, 0.18, 0.116 + rattle);
      p.rigging.visible = active && Math.sin(age * 8.5) > -0.15;
      p.rigging.position.copy(p.main.position);
      p.rigging.rotation.copy(p.main.rotation);
      const pulse = (age % 0.72) / 0.72;
      p.signal.visible = active && pulse < 0.87;
      p.signal.rotation.copy(p.secondary.rotation);
      p.signal.position.set(0.12 + 0.06 * pulse, 0.97 + 0.115 * pulse, 0.424 + pulse * 0.435);
      p.signal.scale.setScalar(0.7 + pulse * 0.66);
      break;
    }
    case 'floodlight': {
      const wake = active ? smoothstep(0, 0.34, age) : rearming ? 1 - smoothstep(0, 0.11, reset) : 0;
      p.main.position.set(0, 1.601, 0.134);
      p.main.rotation.set(0.37 + 0.035 * wake, (active ? 0.17 * Math.sin(age * 1.75) * wake : 0) + 0.04, 0.023 + hit * 0.075, 'YXZ');
      p.signal.rotation.copy(p.main.rotation);
      p.signal.position.copy(p.main.position);
      p.signal.visible = active && age >= 0.034;
      p.signal.scale.set(1, 1, 0.74 + 0.26 * wake);
      break;
    }
  }
}

interface Template {
  resting: Group;
  moving: Group;
  restingHeight: number;
}
const templates = new Map<string, Template>();
// The first placement prepares both representations. Firing changes only shared
// geometry references and pivot transforms, including on the first trigger.
function template(type: DeviceTypeId, wide: boolean, wear: Wear): Template {
  const key = type + '/' + Number(wide) + '/' + wear;
  const cached = templates.get(key);
  if (cached) return cached;
  const pieces = buildDefence(type, wide, wear);
  const moving = new Group();
  for (const [name, group] of Object.entries(pieces)) {
    const joint = batch(group);
    joint.name = name;
    moving.add(joint);
  }
  poseParts(type, pieces, { state: wear === 'wreck' ? 'broken' : 'armed', hpRatio: wear === 'battered' ? 0.3 : 1 }, Infinity);
  const root = new Group();
  for (const group of Object.values(pieces)) if (group.visible) root.add(group);
  const resting = batch(root);
  const result = { resting, moving, restingHeight: new Box3().setFromObject(resting).max.y };
  templates.set(key, result);
  return result;
}

function jointsOf(node: Group): DefenceParts {
  const parts = emptyParts();
  for (const joint of node.children) parts[joint.name as keyof DefenceParts] = joint as Group;
  // A cone of light or an acoustic ripple can extend across another device's hit area.
  parts.signal.traverse((o) => {
    if (o instanceof Mesh) {
      o.raycast = () => {};
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return parts;
}

export class DefenceFigure {
  readonly root = new Group();
  height = 1;
  private wear: Wear | undefined;
  private restingHeight = 1;
  private moving = false;
  private joints: DefenceParts | undefined;
  private hitAt = -Infinity;
  private lastTime = -Infinity;
  private previousHealth: number | undefined;
  private readonly wide: boolean;
  constructor(
    readonly type: DeviceTypeId,
    readonly facing: Facing = 0,
  ) {
    this.wide = type === 'fence' && facing >= 2;
    this.root.rotation.y = faces[facing]!;
    this.pose(still, 0);
    this.previousHealth = undefined;
  }
  pose(d: State, time: number, impactAge?: number): void {
    const wear: Wear = d.state === 'broken' ? 'wreck' : this.type === 'fence' && d.hpRatio <= 0.5 ? 'battered' : 'whole';
    if (time < this.lastTime || (this.previousHealth !== undefined && d.hpRatio > this.previousHealth)) this.hitAt = -Infinity;
    if (this.previousHealth !== undefined && d.hpRatio < this.previousHealth && (wear === 'wreck' || time - this.hitAt > 0.25)) this.hitAt = time;
    const hitAge = impactAge ?? time - this.hitAt;
    const moving =
      wear === 'wreck'
        ? hitAge < DEFENCE_FALL_SECONDS
        : d.state === 'active' || d.state === 'rearming' || (hitAge < 0.62 && (this.type === 'fence' || this.type === 'horn' || this.type === 'floodlight'));
    this.previousHealth = d.hpRatio;
    this.lastTime = time;
    if (this.wear !== wear || this.moving !== moving) {
      const art = template(this.type, this.wide, wear);
      const node = (moving ? art.moving : art.resting).clone();
      this.root.clear();
      this.root.add(node);
      this.wear = wear;
      this.moving = moving;
      this.joints = moving ? jointsOf(node) : undefined;
      this.restingHeight = art.restingHeight;
      this.height = art.restingHeight;
    }
    if (this.joints) {
      poseParts(this.type, this.joints, d, hitAge);
      // Follow the moving silhouette for the desk's action key and aiming dot.
      if (wear === 'wreck') this.height = this.restingHeight + (1 - fall(hitAge)) * (1.51 - this.restingHeight);
      else
        switch (this.type) {
          case 'log':
          case 'net':
            this.height = 1.63;
            break;
          case 'fence':
            this.height = 1;
            break;
          case 'floodlight':
            this.height = 1.84;
            break;
          case 'horn':
            this.height = 1.12;
            break;
          case 'barrier':
            this.height = 0.29 + 1.01 * Math.cos(this.joints.main.rotation.x);
            break;
          case 'spikes':
            this.height = 0.31 + 0.79 * Math.abs(Math.sin(this.joints.main.rotation.x));
            break;
        }
    }
  }
}
