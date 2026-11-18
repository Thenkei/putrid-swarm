import type { Group, Vector3 } from 'three';
import { BOSS, ENEMIES, MOB_CUE_SECONDS } from '../core/data/enemies';
import type { Enemy, EnemyAction } from '../core/night';
import type { EnemyTypeId } from '../core/types';

export type MobAction = EnemyAction | 'bound' | 'whistle';

/** Actions each character actually performs in the yard. Hit and defeat can interrupt any of them. */
export const MOB_ACTIONS: Readonly<Record<EnemyTypeId, readonly MobAction[]>> = {
  shambler: ['walk', 'attack'],
  runner: ['walk', 'attack'],
  brute: ['walk', 'attack'],
  dog: ['walk', 'attack'],
  boar: ['walk', 'windup', 'attack'],
  deer: ['walk', 'bound', 'attack'],
  mower: ['walk', 'rev', 'charge', 'jam'],
  mechanic: ['walk', 'windup', 'attack'],
  mail: ['walk', 'attack'],
  chief: ['walk', 'attack', 'whistle'],
  mayor: ['walk', 'speech', 'windup', 'attack'],
};

export type MobPose = Pick<Enemy, 'id' | 'x' | 'y' | 'fx' | 'fy'> &
  Partial<Pick<Enemy, 'type' | 'def' | 'nettedFor' | 'stunnedFor' | 'hasteFor' | 'hitFlash' | 'windup' | 'cooldown' | 'boss' | 'motionCue'>> & {
    readonly action: MobAction;
  };
export type MobFall = Pick<MobPose, 'id' | 'x' | 'y' | 'fx' | 'fy'> & { readonly age: number };

interface PropJoint {
  readonly node: Group;
  readonly rest: Vector3;
  readonly carrier: Group;
}
export interface ActorJoints {
  readonly root: Group;
  readonly gripTarget: Vector3;
  readonly puppet: Group;
  readonly head: Group;
  readonly limbs: Group[];
  readonly hinges: Group[];
  readonly gear: PropJoint | null;
  readonly mechanism: PropJoint | null;
  readonly reel: Group | null;
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const smooth = (start: number, end: number, value: number) => {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
};
const cycle = (value: number) => value - Math.floor(value);
const mix = (a: number, b: number, weight: number) => a + (b - a) * weight;
const tau = 2 * Math.PI;

function resetProp(prop: PropJoint | null, carrier?: Group): Group | undefined {
  if (!prop) return;
  const parent = carrier ?? prop.carrier;
  if (prop.node.parent !== parent) parent.add(prop.node);
  prop.node.position.copy(prop.rest);
  prop.node.rotation.set(0, 0, 0, 'YXZ');
  return prop.node;
}

function arms(j: ActorJoints, left: number, leftElbow: number, right: number, rightElbow: number): void {
  j.limbs[1]!.rotation.x = left;
  j.hinges[1]!.rotation.x = leftElbow;
  j.limbs[3]!.rotation.x = right;
  j.hinges[3]!.rotation.x = rightElbow;
}

// The handles and the rider have different pivots. Solve the two links in the
// shoulder's plane after the vehicle has tilted or the speaker has lifted the horn.
function grip(j: ActorJoints, arm: 1 | 3, prop: Group, x: number, y: number, z: number): void {
  const shoulder = j.limbs[arm]!,
    elbow = j.hinges[arm]!;
  const point = j.gripTarget.set(x, y, z);
  prop.localToWorld(point);
  j.puppet.worldToLocal(point);
  point.sub(shoulder.position);
  const upper = Math.hypot(elbow.position.y, elbow.position.z);
  // Distances from the elbow to the centre of the sculpted palm.
  const foreY = -0.609 - elbow.position.y,
    foreZ = 0.176 - elbow.position.z;
  const fore = Math.hypot(foreY, foreZ),
    direction = point.z < 0 ? -1 : 1;
  const forward = direction * Math.hypot(point.x, point.z);
  const d = Math.min(upper + fore - 0.001, Math.max(Math.abs(upper - fore) + 0.001, Math.hypot(forward, point.y)));
  const elbowBend = Math.acos(Math.min(1, Math.max(-1, (d * d - upper * upper - fore * fore) / (2 * upper * fore))));
  const elevation = Math.atan2(forward, -point.y) - Math.atan2(fore * Math.sin(elbowBend), upper + fore * Math.cos(elbowBend));
  const rest = Math.atan2(elbow.position.z, -elbow.position.y);
  shoulder.rotation.set(rest - elevation, Math.atan2(direction * point.x, direction * point.z), 0, 'YXZ');
  elbow.rotation.x = Math.atan2(foreZ, -foreY) - rest - elbowBend;
}

export function animateInfected(type: EnemyTypeId, j: ActorJoints, enemy: MobPose, time: number): void {
  const definition = ENEMIES[type];
  const animal = type === 'dog' || type === 'boar' || type === 'deer';
  const held = (enemy.stunnedFor ?? 0) > 0 || (enemy.nettedFor ?? 0) > 0;
  let action = enemy.action;
  if (!held && enemy.motionCue) action = enemy.motionCue.kind === 'bound' ? 'bound' : 'attack';
  else if (!held && type === 'chief' && enemy.boss && enemy.boss.ability > BOSS.chief.whistleEvery - 0.94) action = 'whistle';
  const moving = !held && (action === 'walk' || action === 'charge');
  const running = type === 'runner' || type === 'mail' || action === 'charge';
  const heavy = type === 'brute' || type === 'boar' || type === 'mechanic';
  const limp = type === 'shambler';
  const phase = time * (4 + definition.speed * 3) * ((enemy.hasteFor ?? 0) > 0 ? 1.3 : 1) + enemy.id;
  const stride = moving ? Math.sin(phase) : 0,
    sway = moving ? Math.cos(phase) : 0;
  const side = enemy.id % 2 ? 1 : -1;
  const flinch = clamp((enemy.hitFlash ?? 0) / 0.18);
  const lean = animal ? 0 : running ? 0.2 : limp ? 0.14 : type === 'mayor' ? 0 : 0.047;
  const lift = type === 'mayor' ? 0 : limp ? Math.max(0, stride) * 0.045 + Math.max(0, -stride) * 0.011 : Math.abs(stride) * (running ? 0.063 : 0.031);
  j.root.position.set(enemy.x, 0, enemy.y);
  j.root.rotation.set(0, Math.atan2(enemy.fx, enemy.fy), 0);
  j.puppet.position.set(0, lift, 0);
  j.puppet.rotation.set(lean, 0, stride * (heavy ? 0.049 : 0.033), 'YXZ');
  j.head.rotation.set(
    lean * 0.47 + sway * (heavy ? 0.024 : 0.052),
    sway * (animal ? 0.053 : 0.11),
    limp ? side * 0.14 + 0.06 * stride : sway * 0.035,
    'YXZ',
  );
  const gear = resetProp(j.gear),
    mechanism = resetProp(j.mechanism);
  if (j.reel) {
    const rpm = action === 'charge' ? 17 : action === 'rev' ? 7 : moving ? 4.8 : 0;
    j.reel.rotation.x = held || action === 'jam' ? 0.12 * Math.sin(time * 10) : time * rpm;
  }
  for (let i = 0; i < j.limbs.length; i++) {
    const left = i < 2 ? 1 : -1;
    const arm = !animal && i % 2 === 1;
    const diagonal = animal && i % 2 ? -left : left;
    const step = diagonal * stride;
    const legStep = step * (running ? 0.84 : heavy ? 0.4 : limp && i === 0 ? 0.32 : 0.54);
    const legFold = (running ? 1.06 : limp && i === 0 ? 0.72 : 0.58) * Math.max(0, step);
    j.limbs[i]!.rotation.set(
      arm ? (running ? -0.4 : -0.66) - step * (running ? 0.83 : limp && i === 1 ? 0.21 : 0.46) : type === 'mayor' ? -0.06 : legStep,
      0,
      arm ? -left * (type === 'brute' ? 0.21 : 0.13) : left * 0.026,
    );
    j.hinges[i]!.rotation.set(arm ? (running ? -1.12 : limp && i === 1 ? -0.91 : -0.39) - 0.28 * Math.max(0, step) : 0.07 + legFold, 0, 0);
  }

  // A blow can land between camera updates. Its short cue keeps the ram and tusk follow-through visible.
  const strikeT = enemy.motionCue?.kind === 'strike' ? 1 - enemy.motionCue.remaining / MOB_CUE_SECONDS.strike : cycle(time * 0.91 + enemy.id * 0.113);
  const thump = Math.sin(Math.PI * smooth(0, 0.82, strikeT));
  const coil =
    action === 'windup' || action === 'rev'
      ? enemy.windup && enemy.windup > 0
        ? clamp(1 - enemy.windup / definition.windupSeconds)
        : action === 'rev' && enemy.boss
          ? clamp(1 - enemy.boss.timer / definition.windupSeconds)
          : 0.56 + 0.32 * Math.sin(time * 3.7)
      : 0;
  if (!held) {
    switch (type) {
      case 'shambler':
        if (action === 'attack') {
          const reach = 0.5 + 0.5 * Math.sin(time * 4.6 + 0.31);
          j.puppet.rotation.x = 0.17 + reach * 0.24;
          j.puppet.rotation.y = 0.18 - 0.34 * reach;
          j.head.rotation.x = -0.18 * reach;
          arms(j, -1.13 - 0.63 * reach, -0.75 + 0.64 * reach, -1.36 + 0.46 * reach, -0.18 - 0.68 * reach);
        }
        break;
      case 'runner':
        if (action === 'attack') {
          const jab = Math.sin(time * 8.3);
          j.puppet.rotation.set(0.3 + 0.13 * jab ** 2, jab * 0.32, -jab * 0.07, 'YXZ');
          arms(j, -1.19 - 0.55 * jab, -0.81 + 0.64 * jab, -1.19 + 0.55 * jab, -0.81 - 0.64 * jab);
          j.limbs[0]!.rotation.x = -0.37;
          j.hinges[2]!.rotation.x = 0.46;
        }
        break;
      case 'brute':
        if (action === 'attack') {
          const slam = smooth(0.48, 0.63, strikeT) * (1 - smooth(0.67, 0.99, strikeT));
          j.puppet.rotation.x = mix(-0.18, 0.39, slam);
          j.head.rotation.x = mix(0.18, -0.2, slam);
          arms(j, mix(-2.43, -1.43, slam), mix(-0.76, -0.12, slam), mix(-2.64, -1.58, slam), mix(-0.68, -0.09, slam));
          j.limbs[1]!.rotation.z = -0.35;
          j.limbs[3]!.rotation.z = 0.35;
        }
        break;
      case 'dog': {
        const snap = (Math.sin(time * 7.8) + 1) / 2;
        if (moving) {
          // Front and hind paws exchange lead in a compact four-beat run.
          for (let i = 0; i < 4; i++) {
            const beat = phase + (i % 2 ? Math.PI : 0) + (i < 2 ? 0 : 0.68);
            j.limbs[i]!.rotation.x = Math.sin(beat) * 0.85;
            j.hinges[i]!.rotation.x = 0.08 + Math.max(0, Math.sin(beat + 0.35)) * 0.78;
          }
          j.puppet.rotation.x = -0.12 * sway;
          j.puppet.position.y += 0.05 * (1 + sway);
        }
        if (action === 'attack') {
          j.puppet.rotation.x = -0.22 + 0.37 * snap;
          j.puppet.position.z = 0.18 * snap;
          j.head.rotation.x = -0.33 + 0.54 * snap;
          for (let i = 0; i < 4; i++) {
            j.limbs[i]!.rotation.x = i % 2 ? -0.45 + 0.28 * snap : 0.32 - 0.16 * snap;
            j.hinges[i]!.rotation.x = i % 2 ? 0.16 : 0.44;
          }
        }
        if (mechanism) mechanism.rotation.x = action === 'attack' ? 0.16 + 0.89 * (1 - snap) : 0.15 + 0.1 * Math.sin(phase);
        if (gear) gear.rotation.y = 0.28 * Math.sin(phase + 0.8);
        break;
      }
      case 'boar':
        if (action === 'windup' || action === 'attack') {
          const jab = action === 'attack' ? thump : 0;
          j.head.rotation.set(0.37 + 0.41 * coil - 1.15 * jab, 0.075 * Math.sin(phase), 0, 'YXZ');
          j.puppet.rotation.x = 0.13 + 0.15 * coil - 0.32 * jab;
          j.puppet.position.z = -0.13 * coil + 0.26 * jab;
          j.limbs[2]!.rotation.x = 0.22 + 0.42 * coil * Math.sin(phase * 1.4);
          j.hinges[2]!.rotation.x = 0.38;
        }
        if (gear) gear.rotation.z = 0.12 * sway;
        break;
      case 'deer':
        if (action === 'bound') {
          const p = enemy.motionCue?.kind === 'bound' ? clamp(1 - enemy.motionCue.remaining / MOB_CUE_SECONDS.bound) : cycle(time * 0.91);
          const arc = Math.sin(Math.PI * p);
          j.puppet.position.y = arc * 0.82;
          j.puppet.rotation.x = -Math.sin(tau * p) * 0.3;
          j.head.rotation.x = -0.21 * arc;
          for (let i = 0; i < 4; i++) {
            const front = i % 2 === 1,
              offset = i < 2 ? 0.11 : -0.11;
            j.limbs[i]!.rotation.x = (front ? -1.21 : 0.71) * arc + offset;
            j.hinges[i]!.rotation.x = (front ? 1.55 : 0.67) * arc;
          }
        } else if (action === 'attack') {
          const toss = (Math.cos(time * 4.8) + 1) * 0.5;
          j.head.rotation.x = -0.41 + 1.09 * toss;
          j.head.rotation.y = 0.39 * Math.sin(time * 4.8);
          j.puppet.rotation.x = 0.13 * toss;
          j.limbs[1]!.rotation.x = -0.24 * (1 - toss);
        }
        break;
      case 'mower': {
        const rev = action === 'rev',
          charge = action === 'charge',
          jam = action === 'jam';
        const engine = rev ? 0.6 + 0.4 * coil : charge ? 1 : jam ? 0.28 : 0.14;
        j.puppet.rotation.x = jam ? -0.23 : rev ? 0.12 + coil * 0.08 : charge ? 0.21 : 0.1;
        if (gear) {
          gear.rotation.x = jam ? -0.17 : Math.sin(time * 31) * 0.033 * engine;
          gear.position.z += charge ? 0.21 : 0;
          grip(j, 1, gear, -0.253, 0.921, -0.429);
          grip(j, 3, gear, 0.253, 0.921, -0.429);
        }
        if (mechanism) mechanism.rotation.x = (jam ? -0.93 : -0.05) + engine * 0.072 * Math.sin(time * 36);
        break;
      }
      case 'mechanic':
        if (mechanism) mechanism.rotation.x = action === 'windup' ? -0.31 - coil * 0.66 : action === 'attack' ? 0.84 * thump : sway * 0.17;
        j.limbs[3]!.rotation.z = 0.64;
        j.limbs[3]!.rotation.x = action === 'windup' ? -1.87 : -0.94;
        if (action === 'attack' || action === 'windup') {
          j.puppet.rotation.z = -0.19 + coil * 0.1;
          j.head.rotation.y = 0.37;
          j.limbs[1]!.rotation.x = action === 'attack' ? -1.59 : -0.87;
        }
        if (gear) {
          grip(j, 3, gear, -0.047, 0.989, 0.043);
          if (moving) grip(j, 1, gear, -0.36, 0.983, 0.073);
        }
        break;
      case 'mail':
        if (gear) {
          gear.rotation.x = -0.15 + 0.22 * stride;
          gear.rotation.z = 0.11 + sway * 0.08;
        }
        if (action === 'attack') {
          const knock = enemy.cooldown && enemy.cooldown > 0 ? clamp(1 - enemy.cooldown / BOSS.mail.knockInterval) : cycle(time / BOSS.mail.knockInterval);
          const tap = 1 - smooth(0.03, 0.4, knock) + 0.6 * smooth(0.7, 0.95, knock);
          j.head.rotation.z = -0.13;
          j.puppet.rotation.y = -0.23;
          j.limbs[3]!.rotation.x = -1.37 - 0.32 * tap;
          j.hinges[3]!.rotation.x = -1.38 + tap * 1.27;
          j.limbs[1]!.rotation.x = -0.27;
        }
        break;
      case 'chief': {
        const whistle = action === 'whistle',
          bash = action === 'attack' ? (Math.sin(time * 4.6) + 1) * 0.5 : 0;
        if (gear) {
          gear.position.y += 0.09 + 0.09 * bash;
          gear.position.z += 0.17 * bash;
          gear.rotation.set(-0.11 - 0.27 * bash, -0.28 + bash * 0.36, 0.06, 'YXZ');
        }
        arms(j, -0.64 - 0.64 * bash, -0.8, whistle ? -1.27 : -0.52, whistle ? -1.59 : -0.59);
        j.limbs[3]!.rotation.z = whistle ? -0.48 : 0.18;
        if (whistle) {
          j.head.rotation.set(-0.12, 0.25 * Math.sin(time * 3.7), -0.07);
          if (mechanism) mechanism.position.set(0.041, 1.584, 0.345);
        }
        if (gear) grip(j, 1, gear, 0.082, -0.12, -0.133);
        if (mechanism) grip(j, 3, mechanism, 0.012, -0.022, -0.003);
        break;
      }
      case 'mayor': {
        const speech = action === 'speech',
          wave = Math.sin(time * (speech ? 4.9 : 2.7));
        if (gear) gear.rotation.z = moving ? 0.014 * sway : 0;
        if (mechanism) {
          mechanism.position.x -= speech ? 0.14 : 0;
          mechanism.position.y += speech ? 0.28 + 0.025 * wave : 0.017 * wave;
          mechanism.position.z += speech ? 0.034 : 0;
          mechanism.rotation.set(speech ? -0.18 : 0.12, speech ? wave * 0.32 : 0, speech ? -0.15 : 0);
        }
        if (speech) {
          arms(j, -1.97 - 0.48 * wave, -0.56, -1.34, -1.26);
          j.limbs[1]!.rotation.z = -0.85 + 0.17 * wave;
          j.head.rotation.y = wave * 0.29;
        } else if (action === 'attack' || action === 'windup') {
          arms(j, -1.38 - coil * 0.75, -0.45, -1.21 - thump * 0.54, -0.62);
          j.puppet.rotation.x = action === 'windup' ? -0.15 : 0.24 * thump;
        }
        if (mechanism) grip(j, 3, mechanism, 0.016, -0.061, 0.033);
        break;
      }
    }
  } else {
    // Arms wind against a net; a stunned animal draws its paws in.
    j.head.rotation.x = 0.24;
    j.puppet.rotation.z = 0.045 * Math.sin(time * 15 + enemy.id);
    if (animal) {
      for (const knee of j.hinges) knee.rotation.x = 0.55;
    } else {
      arms(j, -0.93, -0.92, -0.79, -1.13);
    }
  }
  if (flinch > 0) {
    j.puppet.rotation.x -= flinch * (animal ? 0.21 : 0.38);
    j.puppet.rotation.z += side * 0.16 * flinch;
    j.head.rotation.y -= side * 0.44 * flinch;
    j.head.rotation.x -= flinch * 0.31;
    j.puppet.position.z -= flinch * 0.105;
    j.hinges[0]!.rotation.x += flinch * 0.42;
  }
}

// Pitch, roll and resting height in model space. Bulky clothing, antlers and the
// wheeled machines need different landing directions and ground clearances.
const landings: Record<EnemyTypeId, readonly [number, number, number]> = {
  shambler: [1.47, -0.29, 0.264],
  runner: [1.48, 0.39, 0.27],
  brute: [-1.62, 0.27, 0.363],
  dog: [0.05, 1.44, 0.213],
  boar: [-0.08, 1.49, 0.355],
  deer: [0.02, -1.49, 0.235],
  mower: [-1.61, 0.26, 0.227],
  mechanic: [-1.52, 0.47, 0.178],
  mail: [1.43, -0.64, 0.29],
  chief: [-1.6, -0.47, 0.263],
  mayor: [-1.63, 0.26, 0.249],
};

export function collapseInfected(type: EnemyTypeId, j: ActorJoints, dead: MobFall): void {
  const animal = type === 'dog' || type === 'boar' || type === 'deer';
  const t = Math.max(0, dead.age);
  const [pitch, roll, height] = landings[type];
  const side = dead.id % 2 ? 1 : -1;
  const fall = smooth(0.075, type === 'brute' ? 0.57 : 0.5, t),
    settle = smooth(0.36, 0.85, t);
  const recoil = Math.sin(Math.PI * clamp(t / 0.27));
  const bounce = Math.sin(Math.PI * smooth(0.51, 0.73, t)) * 0.052;
  j.root.position.set(dead.x, 0, dead.y);
  j.root.rotation.set(0, Math.atan2(dead.fx, dead.fy), 0);
  j.puppet.position.set((animal ? -0.06 * side : type === 'mechanic' ? -0.19 : 0.035 * side) * fall, height * fall + bounce, (animal ? 0.06 : -0.1) * fall);
  j.puppet.rotation.set(pitch * fall - 0.19 * recoil, side * (animal ? 0.043 : 0.11) * fall, roll * fall - 0.08 * side * recoil, 'YXZ');
  j.head.rotation.set((animal ? -0.035 : -0.12) * fall - 0.23 * recoil, side * (animal ? 0.22 : 0.46) * settle, side * 0.14 * fall, 'YXZ');
  if (type === 'deer') j.head.rotation.set(-0.2 * settle, -0.62 * settle, 0.55 * settle, 'YXZ');
  else if (!animal) {
    j.head.rotation.x += (pitch < 0 ? -0.29 : 0.12) * settle;
    j.head.rotation.y = side * (pitch < 0 ? 0.62 : 0.85) * settle;
  }
  if (j.reel) j.reel.rotation.x = 1.4 * smooth(0.07, 0.64, t);
  for (let i = 0; i < 4; i++) {
    const left = i < 2 ? 1 : -1,
      front = i % 2 === 1;
    const limb = j.limbs[i]!,
      hinge = j.hinges[i]!;
    if (animal) {
      // The lower pair of legs folds against the flank, the upper pair stays extended.
      const lower = left > 0 === roll > 0;
      limb.rotation.set(
        (front ? -0.58 : 0.41) * fall + (lower ? 0.16 : -0.23) * settle,
        0,
        Math.sign(roll) * (lower ? 0.09 : type === 'deer' ? -0.36 : -0.63) * fall,
      );
      hinge.rotation.set((lower ? 1.04 : 0.28) * settle + 0.45 * recoil, 0, 0);
    } else if (front) {
      const reach = pitch > 0 && left > 0 ? -2.64 : pitch > 0 ? 0.51 : 0.16 + left * 0.14;
      limb.rotation.set(mix(-0.63, reach, fall) - 0.51 * recoil, left * 0.16 * settle, -left * (0.14 + (left > 0 ? 0.72 : 0.38) * fall));
      hinge.rotation.set(mix(-0.58, left > 0 ? -0.21 : -0.31, settle), 0, 0);
    } else {
      const bend = pitch > 0 ? 0.19 + left * 0.12 : -0.09 + left * 0.09;
      limb.rotation.set(bend * fall - 0.23 * recoil, left * 0.12 * settle, -left * (0.04 + 0.22 * fall));
      hinge.rotation.set(0.07 + (left > 0 && pitch > 0 ? 0.57 : 0.28) * settle + recoil * 0.39, 0, 0);
    }
  }

  // Loose equipment has inertia of its own. Keep vehicles on their wheels while the
  // driver falls, and let carried pieces leave the body once, at their authored pivots.
  const gear = resetProp(j.gear, animal ? undefined : j.root);
  const mech = resetProp(j.mechanism, type === 'mayor' || type === 'chief' ? j.root : undefined);
  const drop = smooth(0.1, 0.68, t);
  switch (type) {
    case 'runner':
      if (gear) {
        gear.position.x -= 0.64 * drop;
        gear.position.y = mix(gear.position.y, 0.127, drop) + bounce;
        gear.position.z -= 0.33 * drop;
        gear.rotation.set(1.48 * drop, 0.23 * drop, -2.2 * drop);
      }
      break;
    case 'mail':
      if (gear) {
        gear.position.x += 0.5 * drop;
        gear.position.y = mix(gear.position.y, 0.25, drop) + bounce;
        gear.position.z += 0.32 * drop;
        gear.rotation.set(-1.4 * drop, 0.45 * drop, 0.12 * drop);
      }
      if (mech) {
        mech.position.y += 0.24 * drop;
        mech.position.z -= 0.1 * drop;
        mech.rotation.z = 0.42 * drop;
      }
      break;
    case 'chief':
      if (gear) {
        gear.position.x -= 0.43 * drop;
        gear.position.y = mix(gear.position.y, 0.13, drop) + bounce;
        gear.position.z += 0.42 * drop;
        gear.rotation.set(1.49 * drop, -0.37 * drop, -0.13 * drop);
      }
      if (mech) {
        mech.position.y = mix(mech.position.y, 0.047, drop);
        mech.position.x += 0.27 * drop;
        mech.position.z += 0.48 * drop;
      }
      break;
    case 'mayor':
      if (gear) {
        gear.position.z += 0.29 * drop;
        gear.rotation.y = 0.21 * drop;
      }
      if (mech) {
        mech.position.x += 0.5 * drop;
        mech.position.y = mix(mech.position.y, 0.216, drop) + bounce;
        mech.position.z += 0.36 * drop;
        mech.rotation.set(0.29 * drop, 1.31 * drop, -0.45 * drop);
      }
      break;
    case 'mower':
      if (gear) {
        gear.position.z += 0.25 * drop;
        gear.position.y += 0.045 * drop;
        gear.rotation.set(-0.11 * drop, 0.31 * drop, 0.105 * drop);
      }
      if (mech) mech.rotation.x = -1.29 * drop - 0.1 * Math.sin(tau * drop) * drop;
      break;
    case 'mechanic':
      if (gear) {
        gear.rotation.z = -0.14 * drop;
        gear.position.y += 0.043 * drop;
        gear.position.z += 0.16 * drop;
      }
      if (mech) {
        mech.position.y -= 1.02 * drop;
        mech.position.z += 0.22 * drop;
        mech.rotation.set(-0.42 * Math.sin(Math.PI * drop), 0.14 * drop, 0.2 * drop);
      }
      break;
    case 'dog':
      if (mech) mech.rotation.x = 0.36 * settle;
      if (gear) gear.rotation.y = 0.42 * settle;
      break;
    case 'boar':
    case 'deer':
      if (gear) gear.rotation.z = side * 0.43 * settle;
      break;
  }
}
