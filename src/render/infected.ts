// Directional character cels share a foot anchor across all four cameras. The combat simulation
// owns travel and action time, so a paused, obstructed or restrained character cannot tread air.

import { BOSS } from '../core/data/enemies';
import { DEVICES } from '../core/data/devices';
import { BLOW_RECOVERY_SECONDS, HIT_REACTION_SECONDS, hoistAge, type Enemy, type LogTarget } from '../core/night';
import type { EnemyTypeId, SectorId } from '../core/types';
import { sprite, type Sprite } from '../engine/assets';
import { calmMotion } from './lighting';
import { mobCycle, mobGaitAssetKey } from './mob-cycles';
import mobGaits from './mob-gaits.json';
import { drawHoist, drawMobGesture, type MobGesture } from './mob-signatures';
import mowerGait from './mower-gait.json';
import { smoothstep } from './noise';
import { project, TH, TW, type View } from './projection';
import { contactShadow } from './shadows';
import type { DeviceVisual } from './world';

export interface Fallen {
  readonly threshold?: SectorId;
  readonly id: number;
  readonly type: EnemyTypeId;
  readonly x: number;
  readonly y: number;
  readonly fx: number;
  readonly fy: number;
  readonly crawlDepth?: number;
  age: number;
}

export const FALL_SECONDS = 2.6;

// Centre of the resting silhouettes in the 224×144 front/rear death cels, by actor row.
// The standing boot anchor reaches the near edge of a prone body instead of its ground centre.
const RESTING_CENTRES = [
  [[112, 109], [110, 94]], [[107, 109], [112, 95]], [[110, 106], [109, 95]],
  [[109, 90], [112, 91]], [[105, 96], [111, 92]], [[110, 107], [112, 107]],
  [[113, 105], [115, 97]], [[105, 108], [118, 92]], [[112, 113], [113, 106]],
  [[116, 115], [116, 108]], [[120, 112], [117, 99]],
] as const;

interface CharacterArt {
  readonly key: string;
  readonly row: number;
  readonly height: number;
  /** Grid cells travelled in a complete two-step gait cycle. */
  readonly stride: number;
  readonly bounce: number;
  readonly animal?: boolean;
  readonly wheels?: boolean;
  readonly heavy?: boolean;
  /** The original front paintings for this character face screen right. */
  readonly reverseFrontPaint?: boolean;
}

const ART: Readonly<Record<EnemyTypeId, CharacterArt>> = {
  shambler: { key: 'en_shambler', row: 0, height: 64, stride: 0.85, bounce: 0.026 },
  runner: { key: 'en_runner', row: 1, height: 64, stride: 1.19, bounce: 0.045 },
  brute: { key: 'en_brute', row: 2, height: 84, stride: 0.76, bounce: 0.024, heavy: true },
  dog: { key: 'en_dog', row: 3, height: 40, stride: 1.18, bounce: 0.066, animal: true },
  boar: { key: 'en_boar', row: 4, height: 54, stride: 1.08, bounce: 0.052, animal: true, heavy: true },
  deer: { key: 'en_deer', row: 5, height: 74, stride: 1.52, bounce: 0.058, animal: true, reverseFrontPaint: true },
  mower: { key: 'boss_mower', row: 6, height: mowerGait.renderHeight, stride: 1.35, bounce: 0.009, wheels: true },
  mechanic: { key: 'boss_mechanic', row: 7, height: 92, stride: 0.92, bounce: 0.009, wheels: true, heavy: true, reverseFrontPaint: true },
  mail: { key: 'boss_mail', row: 8, height: 76, stride: 1.37, bounce: 0.046 },
  chief: { key: 'boss_chief', row: 9, height: 86, stride: 0.88, bounce: 0.021, heavy: true },
  mayor: { key: 'boss_mayor', row: 10, height: 96, stride: 2.0, bounce: 0.006, wheels: true, heavy: true },
};

const CLIPS = ['walk', 'run', 'grip', 'hit', 'fall', 'dead'] as const;
const CRAWL_CLIPS = ['kneel', 'crawlLeft', 'crawlGather', 'crawlRight'] as const;
const CRAWL_CYCLE = ['crawlLeft', 'crawlGather', 'crawlRight', 'crawlGather'] as const;
// Top of the ink and midpoint of the supporting limbs in each 216×148 crawl painting.
// The lowest toe changes across strokes and is on the near side in both camera views.
const CRAWL_CONTACTS = [
  [[41, 106, 139], [72, 107, 132], [89, 105, 141], [84, 103, 134]],
  [[32, 106, 131], [47, 97, 124], [62, 95, 130], [54, 83, 129]],
  [[12, 108, 128], [50, 112, 129], [70, 129, 130], [59, 119, 124]],
  [[4, 102, 126], [28, 102, 116], [59, 104, 130], [46, 106, 123]],
] as const;
type Clip = (typeof CLIPS)[number];
type CrawlClip = (typeof CRAWL_CLIPS)[number];
type Pose = Clip | CrawlClip | 'a' | 'p' | 'b' | 'x' | 'watch' | 'exposed';
interface Figure {
  readonly source: Sprite;
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
  /** Dimensions in multiples of the standing character height. */
  readonly width: number;
  readonly height: number;
  readonly reverse: boolean;
  /** Transparent space below the gait's authored ground line, in standing heights. */
  readonly groundPadding?: number;
  /** Travel from the lower centre of a crawl crop to its ground mount, in standing heights. */
  readonly crawlMount?: readonly [number, number];
}

const figures = new Map<string, Figure>();
const reverseFront = (art: CharacterArt): boolean =>
  art.reverseFrontPaint === true || (art.key === 'boss_chief' && mobCycle('chief')?.mirrorFront === true);

function figureFor(art: CharacterArt, front: boolean, pose: Pose): Figure | null {
  const base = art.key + (front ? '_front' : '_back');
  const key = pose === 'exposed' || pose === 'watch' ? 'chief_' + pose + '_pose_' + (front ? 'front' : 'back') : base + '_' + pose;
  const known = figures.get(key);
  if (known) return known;
  let figure: Figure;
  const clip = CLIPS.indexOf(pose as Clip);
  const crawl = CRAWL_CLIPS.indexOf(pose as CrawlClip);
  const atlas = clip >= 0 ? sprite('defense_mob_poses') : undefined;
  if (crawl >= 0) {
    const sheet = sprite('defense_crawl');
    if (!sheet) return figureFor(art, front, 'fall');
    const cw = sheet.w / CRAWL_CLIPS.length;
    const ch = sheet.h / 4;
    const row = (art.key === 'en_dog' ? 2 : 0) + (front ? 0 : 1);
    const [top, x, y] = CRAWL_CONTACTS[row]![crawl]!;
    figure = { source: sheet, sx: crawl * cw, sy: row * ch + top, sw: cw, sh: 146 - top,
      width: cw / 128, height: 1, reverse: false, crawlMount: [(cw / 2 - x) / 128, (146 - y) / (146 - top)] };
  } else if (atlas) {
    const cw = atlas.w / (CLIPS.length * 2);
    const ch = atlas.h / 11;
    figure = { source: atlas, sx: (clip * 2 + (front ? 0 : 1)) * cw, sy: art.row * ch, sw: cw, sh: ch, width: 2, height: 2 * ch / cw, reverse: false };
  } else {
    const reference = sprite(base + '_a') ?? sprite(base);
    const source = sprite(key) ?? (pose === 'grip' ? sprite(base + '_x') : undefined) ?? reference;
    if (!source || !reference) return null;
    const reversingAction = pose === 'x' && (art.key === 'boss_mechanic' && mobCycle('mechanic') ||
      art.key === 'en_deer' && mobCycle('deer') || art.key === 'boss_chief' && mobCycle('chief'));
    const reverse = front && reverseFront(art) && (pose === 'a' || pose === 'p' || pose === 'b' || pose === 'watch' || pose === 'exposed' || !!reversingAction);
    figure = { source, sx: 0, sy: 0, sw: source.w, sh: source.h, width: source.w / reference.h, height: source.h / reference.h, reverse };
  }
  figures.set(key, figure);
  return figure;
}

const mowerCels: Figure[] = [];
const gaitCels = new Map<string, Figure>();

function gaitFigure(type: EnemyTypeId, art: CharacterArt, front: boolean, phase: number): Figure | undefined {
  const { frames, columns, cellWidth: sw, cellHeight: sh, inkHeight } = mobGaits;
  const index = (front ? 0 : frames) + Math.floor(phase * frames);
  const key = `${type}:${index}`;
  const cached = gaitCels.get(key);
  if (cached) return cached;
  const atlas = sprite(mobGaitAssetKey(type));
  const rows = Math.ceil(2 * frames / columns);
  if (!atlas || atlas.img.naturalWidth !== sw * columns || atlas.img.naturalHeight !== sh * rows) return;
  const figure = {
    source: atlas, sx: index % columns * sw, sy: Math.floor(index / columns) * sh,
    sw, sh, width: sw / inkHeight, height: sh / inkHeight, reverse: front && reverseFront(art),
  };
  gaitCels.set(key, figure);
  return figure;
}

function mowerFigure(e: Enemy, front: boolean, reduced: boolean): Figure | undefined {
  if ((e.action !== 'walk' && e.action !== 'charge') || e.hitFlash > 0 || e.nettedFor > 0 ||
    e.stunnedFor > 0 || e.crawlDepth > 0 || e.blowRecovery > 0) return;
  const atlas = sprite('boss_mower_gait');
  if (!atlas) return;

  const { columns, cycleFrames, cellWidth, cellHeight, atlasScale, standingHeight, chargeStride, walkStride } = mowerGait;
  const view = front ? 0 : 1;
  const charging = e.action === 'charge';
  const cycles = e.travel / (charging ? chargeStride : walkStride);
  const frame = Math.floor((cycles % 1) * cycleFrames);
  const index = reduced ? 4 * cycleFrames + view : ((charging ? 2 : 0) + view) * cycleFrames + frame;
  const sw = cellWidth * atlasScale;
  const sh = cellHeight * atlasScale;
  const rows = Math.ceil((4 * cycleFrames + 2) / columns);
  if (atlas.img.naturalWidth !== sw * columns || atlas.img.naturalHeight !== sh * rows) return;

  return mowerCels[index] ??= {
    source: atlas,
    sx: index % columns * sw,
    sy: Math.floor(index / columns) * sh,
    sw,
    sh,
    width: cellWidth / standingHeight,
    height: cellHeight / standingHeight,
    groundPadding: mowerGait.groundPadding / standingHeight,
    reverse: false,
  };
}

const TAU = Math.PI * 2;
const NIGHT_LIFT = 0.32;
const trait = (id: number): number => {
  const a = Math.sin(id * 12.9898 + 9.127) * 43758.5453;
  return a - Math.floor(a);
};
const stature = (art: CharacterArt, id: number): number => art.row >= 6 ? 1 : 0.965 + 0.07 * trait(id);

/** One clock for the shoulder or jaw and the timber it holds. Positive load pulls
 * toward the attacker; a ram first drives the board into its fixings. */
export function attackBeat(e: Enemy) {
  if (e.blowRecovery > 0) {
    const recovery = 1 - e.blowRecovery / BLOW_RECOVERY_SECONDS;
    const impact = 1 - smoothstep(0.06, 0.75, recovery);
    const rebound = Math.sin(Math.PI * smoothstep(0.45, 1, recovery)) * 0.21;
    return { phase: 0.3 + recovery * 0.68, reach: impact, load: rebound - impact };
  }
  const cycle = ART[e.type].animal ? 0.71 : 0.92;
  const phase = (e.actionSeconds / (cycle * (0.94 + 0.12 * trait(e.id)))) % 1;
  const reach = smoothstep(0.08, 0.29, phase) * (1 - smoothstep(0.72, 0.96, phase));
  const tug = smoothstep(0.29, 0.57, phase) * (1 - smoothstep(0.66, 0.81, phase));
  const spring = Math.sin(Math.PI * smoothstep(0.78, 0.97, phase)) * 0.14;
  return { phase, reach: reach - 0.72 * tug, load: tug - spring };
}

function facing(view: View, fx: number, fy: number) {
  const sign = view.rot === 0 ? 1 : -1;
  const dx = (fx - fy) * sign;
  const dy = (fx + fy) * sign;
  const front = Math.abs(dy) < 0.08 ? view.rot === 0 : dy > 0;
  const dir = Math.abs(dx) < 0.04 ? (front ? -1 : 1) : Math.sign(dx);
  // The mirror chooses between two paintings. Lunges, recoil and debris follow
  // the continuous grid heading, including straight toward or across the camera.
  const length = Math.hypot(fx, fy) || 1;
  return { front, flip: front ? dir > 0 : dir < 0, forwardX: dx / length, forwardY: dy / length * TH / TW };
}

// The rear painting includes the distance from the near boot to the far shoulder.
// Follow one continuous height envelope through kneel, alternate reaches and rise.
function crawlHeight(art: CharacterArt, front: boolean, depth: number): number {
  const standing = art.animal ? 1 : 0.92;
  const prone = art.animal ? (front ? 0.57 : 0.68) : (front ? 0.42 : 0.50);
  return standing + (prone - standing) * smoothstep(0, 1, depth);
}

interface Movement {
  pose: Pose;
  /** Displacement and squash use standing height as unit; forward is movement towards the target. */
  forward: number;
  up: number;
  lean: number;
  squash: number;
  flash: number;
  step: number;
  gait?: number;
  /** Moving portion of a signature gesture, independent of camera angle. */
  signature?: MobGesture;
}

/** Ground projection and shoulder height of the actor held in the release frame. */
export function shoulderAt(view: View, target: LogTarget) {
  const art = ART[target.type];
  const h = art.height * view.zoom * stature(art, target.id);
  const { forwardX, forwardY, front } = facing(view, target.fx, target.fy);
  const low = smoothstep(0, 1, target.crawlDepth);
  const p = project(view, target.x, target.y);
  const upright = art.animal ? 0.25 : 0.08;
  const forward = upright + (0.28 - upright) * low;
  const shoulder = art.animal ? 0.57 : 0.73;
  const lift = h * (shoulder + (crawlHeight(art, front, 1) * 0.67 - shoulder) * low);
  return { x: p.x + h * forwardX * forward, y: p.y + h * forwardY * forward, lift };
}

const grounded: Movement = { pose: 'p', forward: 0, up: 0, lean: 0, squash: 1, flash: 0, step: 1 };

// Length and onset of each footfall come from the painted gait. The hind legs
// of a galloping animal carry one full phase, unlike two alternating boots.
function locomotion(e: Enemy, art: CharacterArt, m: Movement, reduced: boolean, leader?: Enemy): void {
  const profile = mobCycle(e.type);
  const cycle = leader ? leader.travel / (mobCycle('chief')?.stride ?? ART.chief.stride) + trait(leader.id)
    : e.travel / (profile?.stride ?? art.stride) + trait(e.id);
  const phase = cycle % 1;
  const segment = Math.floor(phase * 4);
  const run = e.action === 'charge' || e.moveSpeed >= 1.45 || e.hasteFor > 0;
  m.pose = segment === 0 ? 'a' : segment === 1 ? (run ? 'run' : 'walk') : segment === 2 ? 'b' : 'p';
  if (!profile) {
    const step = art.animal && run ? phase : (phase * 2) % 1;
    const lift = Math.sin(Math.PI * step) ** 2;
    m.up = lift * art.bounce * (run ? 1.1 : 0.75);
    if (m.pose === 'run' && !art.wheels) m.up += 0.08;
    m.lean = (run && !art.wheels ? 0.065 : 0.014) + Math.sin(TAU * phase) * (art.wheels ? 0.008 : 0.022);
    m.squash = 1 - (1 - lift) * (run && !art.wheels ? 0.022 : 0.009);
    m.step = step;
    return;
  }
  const step = art.animal ? phase : (phase * 2) % 1;
  const lift = Math.sin(Math.PI * step) ** 2;
  m.gait = reduced ? 0 : phase;
  m.step = step;
  m.up = lift * art.bounce;
  m.lean = 0.012 + Math.sin(TAU * phase) * 0.023;
  m.squash = 1 - (1 - lift) * (art.heavy ? 0.046 : 0.023);
  switch (e.type) {
    case 'shambler':
      if (leader) {
        m.lean = 0.077;
        m.squash = 0.93;
        break;
      }
      m.up *= phase < 0.53 ? 0.92 : 0.22;
      m.lean *= phase < 0.53 ? 1.6 : -1.1;
      break;
    case 'runner':
    case 'mail':
      m.up = Math.sin(Math.PI * smoothstep(0.14, 0.82, step)) * 0.083;
      m.lean += 0.054;
      break;
    case 'brute':
    case 'chief':
      m.up *= 0.52;
      m.squash -= 0.044 * (1 - smoothstep(0.03, 0.22, step));
      break;
    case 'dog':
    case 'deer':
      m.up = Math.sin(Math.PI * smoothstep(0.36, 1, phase)) * (e.type === 'deer' ? 0.13 : 0.08);
      m.lean = 0.064 * Math.cos(TAU * phase);
      break;
    case 'boar':
      m.lean = 0.05 * Math.sin(TAU * phase);
      m.up *= 0.73;
      m.squash -= 0.042 * (1 - smoothstep(0, 0.24, phase));
      break;
    case 'mechanic':
    case 'mayor':
      m.up = 0;
      m.lean *= 0.27;
      m.squash = 1;
      break;
  }
  m.up *= profile.lift;
  m.lean *= profile.lean;
}

function windup(e: Enemy, m: Movement, enhanced: boolean, reduced: boolean): void {
  const age = hoistAge(e);
  if (age !== null) {
    const pull = Math.min(1, age / BOSS.mechanic.chainSeconds);
    // He gathers the loose chain standing close to the upright, then steps back into the pull.
    m.pose = pull < (reduced ? 1 : 0.44) ? 'p' : 'x';
    if (m.pose === 'x') {
      // The wheels stay on the dirt. Only the boot, chain and suspended engine take the load.
      m.signature = { kind: 'hoist', time: pull, force: smoothstep(0.44, 1, pull) };
    }
    return;
  }
  const t = Math.min(1, e.actionSeconds / e.def.windupSeconds);
  if (!enhanced) {
    m.pose = 'x';
    m.forward = -0.035 * t;
    m.lean = -0.07 * t;
    m.squash = 1 - 0.045 * t;
    return;
  }
  const load = smoothstep(0.07, 0.76, t);
  m.pose = t < 0.13 ? 'p' : 'x';
  m.forward = -0.042 * load;
  m.lean = -0.078 * load;
  m.squash = 1 - 0.038 * load;
  if (e.type === 'boar') {
    m.pose = t < 0.46 ? 'p' : 'x';
    m.squash = 1 - 0.17 * load;
    m.lean = 0.058 * load;
  } else if (e.action === 'rev') {
    m.lean -= 0.025 * Math.sin(e.actionSeconds * 36) * load;
    m.signature = { kind: 'rev', time: e.actionSeconds, force: load };
  } else if (e.action === 'speech') {
    const declaim = Math.sin(Math.PI * 3 * t) ** 2 * load;
    m.forward = 0.016 + 0.044 * declaim;
    m.lean = 0.072 * declaim;
    m.squash = 1 + 0.028 * declaim;
    m.signature = { kind: 'speech', time: t, force: load };
  }
}

function motion(e: Enemy, art: CharacterArt, reduced: boolean, leader?: Enemy, horn?: DeviceVisual): Movement {
  const m = { ...grounded };
  // Their passing pose gathers every boot or paw in the air. A stopped actor
  // settles on the planted walk contact while the simulation holds it still.
  const planted = art.animal || e.type === 'runner' || e.type === 'mail' ? 'walk' : 'p';
  const enhanced = e.type === 'mower' || !!mobCycle(e.type);
  if (e.hitFlash > 0) {
    const t = 1 - e.hitFlash / HIT_REACTION_SECONDS;
    const recoil = (1 - smoothstep(0.24, 1, t)) * (0.65 + 0.35 * smoothstep(0, 0.15, t));
    m.pose = 'hit';
    m.forward = -(enhanced ? art.wheels ? 0.039 : art.heavy ? 0.049 : 0.085 : 0.065) * recoil;
    m.lean = -(enhanced ? art.wheels ? 0.031 : art.animal ? 0.15 : 0.10 : 0.09) * recoil;
    m.squash = 1 - (enhanced ? art.animal ? 0.093 : 0.049 : 0.045) * recoil;
    m.flash = 0.4 * (1 - smoothstep(0, 0.3, t));
    const low = e.hitCrawlDepth ?? e.crawlDepth;
    if (low > 0) {
      // The forearm folds under the runner. The hound pulls its forepaws under its
      // muzzle before stretching back out. Both keep the shoulder below the rig.
      m.pose = low < 0.6 ? 'kneel' : art.animal && t > 0.64 ? 'crawlRight' : 'crawlGather';
      m.forward = -(art.animal ? 0.07 : 0.035) * recoil;
      m.lean = (art.animal ? -0.025 : 0.10) * recoil;
      m.squash = 1 - (art.animal ? 0.20 : 0.24) * recoil;
    }
  } else if (e.nettedFor > 0 || e.stunnedFor > 0 || (e.action === 'idle' && e.crawlDepth > 0)) {
    const low = Math.max(e.crawlDepth, e.hitCrawlDepth ?? 0);
    m.pose = low >= 0.6 ? 'crawlGather' : low > 0 ? 'kneel' : planted;
    if (e.type === 'chief' && (e.nettedFor > 0 || e.lit)) m.pose = 'exposed';
    const pull = enhanced && e.nettedFor > 0 ? Math.sin(e.nettedFor * 21) * smoothstep(0, 0.4, e.nettedFor) : 0;
    m.squash = enhanced ? 0.93 + 0.021 * pull : 0.96;
    m.lean = 0.044 * pull;
  } else if (e.crawlDepth > 0) {
    const phase = (e.travel / (art.animal ? 0.83 : 0.68) + trait(e.id)) % 1;
    m.pose = e.crawlDepth < 0.6 ? 'kneel' : CRAWL_CYCLE[Math.floor(phase * 4)]!;
    m.squash = 1 - 0.025 * Math.sin(TAU * phase) * e.crawlDepth;
    m.forward = 0.023 * Math.sin(TAU * phase);
    m.lean = 0.022 * Math.cos(TAU * phase);
  } else if (e.type === 'mail' && e.boss?.phase === 'signature' && e.blowRecovery <= 0) {
    const progress = 1 - e.boss.timer / BOSS.mail.signatureSeconds;
    m.pose = 'grip';
    m.lean = 0.045 * smoothstep(0.85, 0.94, progress);
    m.signature = { kind: 'registered', time: reduced ? 0 : progress, force: 1 };
  } else if (e.type === 'chief' && e.lit) {
    m.pose = 'exposed';
    const step = e.travel / art.stride;
    m.up = .014 * Math.sin(TAU * step) ** 2;
    m.lean = -.024 + .014 * Math.sin(TAU * step);
  } else if (e.type === 'chief' && e.boss && e.boss.ability <= BOSS.chief.watchLead) {
    m.pose = 'watch';
    m.lean = .025;
  } else if (enhanced && e.type === 'chief' && e.boss && e.boss.ability > BOSS.chief.whistleEvery - 0.7) {
    const t = (BOSS.chief.whistleEvery - e.boss.ability) / 0.7;
    m.pose = 'x';
    m.lean = -0.04 * (1 - smoothstep(0.45, 1, t));
    m.signature = { kind: 'whistle', time: t, force: 1 };
  } else if (e.blowRecovery > 0 || (e.action === 'attack' && (e.type !== 'mail' || e.cooldown <= 0))) {
    // A discrete blow starts at contact. Continuous attackers reach, keep their grip, tug and release.
    const { phase: t, reach } = attackBeat(e);
    const armed = e.type === 'shambler' || e.type === 'brute' || (enhanced && (e.def.flanks || e.type === 'deer'));
    m.pose = t < 0.1 || t > 0.94 ? 'p' : t < 0.23 && armed ? 'x' : 'grip';
    m.forward = (enhanced && art.animal ? 0.125 : 0.095) * reach;
    m.lean = reach * (enhanced ? e.type === 'brute' ? 0.15 : 0.084 : 0.07);
    m.squash = 1 - (enhanced ? 0.058 : 0.038) * reach;
    if (enhanced && e.type === 'mail' && t < 0.78) {
      const secondKnock = e.boss?.knocks === 0;
      m.pose = 'x';
      m.forward *= secondKnock ? 1.2 : 0.78;
      m.lean *= secondKnock ? 1.1 : 0.82;
      m.signature = { kind: 'delivery', time: (t - 0.3) / 0.68, force: secondKnock ? 1 : 0.62 };
    } else if (enhanced && e.type === 'mechanic' && e.blowRecovery > 0 && t < 0.88) {
      m.pose = 'x';
      m.signature = { kind: 'hoist', time: t, force: -2.5 * reach };
    }
  } else if (e.action === 'windup' || e.action === 'rev' || e.action === 'speech') {
    windup(e, m, enhanced, reduced);
  } else if (e.type === 'chief' && e.boss && e.boss.ability > BOSS.chief.whistleEvery - 0.42) {
    m.pose = 'x';
  } else if (e.action === 'jam') {
    const recoil = Math.sin(e.actionSeconds * 24) * (1 - smoothstep(0, 0.46, e.actionSeconds));
    m.pose = e.actionSeconds < 0.22 ? 'hit' : 'p';
    m.lean = -0.106 * recoil;
    m.squash = 1 - 0.056 * Math.abs(recoil);
    m.signature = { kind: 'jam', time: e.actionSeconds, force: 1 - smoothstep(1, 2.5, e.actionSeconds) };
  } else if (leader && (e.action === 'walk' || e.action === 'idle') &&
    (horn || (leader.boss && leader.boss.ability <= BOSS.chief.watchLead))) {
    // The rear rank takes the same low, forward brace a fraction after the front.
    const age = horn?.activeAge ?? (BOSS.chief.watchLead - leader.boss!.ability);
    const press = smoothstep(0, 0.17, age - ((e.fileRank ?? 1) - 1) * 0.065);
    m.pose = press > 0.35 ? 'grip' : 'p';
    m.squash = 1 - 0.16 * press;
    m.lean = 0.12 * press;
    m.forward = 0.045 * press;
  } else if (e.action === 'walk' || e.action === 'charge') {
    const vault = e.vault && (e.travel - e.vault.start) / e.vault.length;
    if (enhanced && vault !== undefined && vault >= 0 && vault < 1) {
      m.pose = vault < 0.15 ? 'x' : vault < 0.74 ? 'a' : 'b';
      const takeoff = smoothstep(0.05, 0.58, vault);
      const landing = smoothstep(0.58, 0.99, vault);
      m.up = 0.58 * Math.sin(Math.PI / 2 * (takeoff + landing));
      m.lean = 0.17 * Math.sin(TAU * vault);
      m.squash = 1 - 0.15 * smoothstep(0.76, 0.91, vault) * (1 - smoothstep(0.92, 1, vault));
    } else locomotion(e, art, m, reduced, leader);
  } else if (e.action === 'idle') m.pose = planted;
  if (reduced) {
    m.lean = 0;
    m.up = 0;
    if (enhanced) m.squash = 1;
    m.forward *= 0.35;
    m.flash = 0;
    if (m.signature?.kind !== 'registered' && !(m.signature?.kind === 'hoist' && e.windup > 0)) delete m.signature;
  }
  return m;
}

function paintCel(ctx: CanvasRenderingContext2D, f: Figure, x: number, y: number, w: number, h: number): void {
  ctx.drawImage(f.source.img, f.sx, f.sy, f.sw, f.sh, x, y, w, h);
}

/** Rope lies on the cutout under the head. Pre-mask it per cel so a crowd never becomes a stack of cages. */
const netOverlays = new WeakMap<Figure, HTMLCanvasElement>();
function netOverlay(f: Figure): HTMLCanvasElement {
  const known = netOverlays.get(f);
  if (known) return known;
  const base = 110;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(base * f.width);
  canvas.height = Math.ceil(base * f.height);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const bottom = canvas.height - base * 0.12;
    const top = Math.max(0, canvas.height - base * 0.72);
    ctx.beginPath();
    ctx.rect(0, top, canvas.width, bottom - top);
    ctx.clip();
    ctx.beginPath();
    for (let x = -base; x < canvas.width + base; x += base * 0.23) {
      for (const side of [-1, 1]) {
        ctx.moveTo(x, top);
        ctx.quadraticCurveTo(x + side * base * 0.13, top + base * 0.32, x + side * base * 0.46, bottom);
      }
    }
    ctx.strokeStyle = '#3e301b';
    ctx.lineWidth = 3.3;
    ctx.stroke();
    ctx.strokeStyle = '#c6ab72';
    ctx.lineWidth = 1.55;
    ctx.stroke();
    ctx.globalCompositeOperation = 'destination-in';
    paintCel(ctx, f, 0, 0, canvas.width, canvas.height);
  }
  netOverlays.set(f, canvas);
  return canvas;
}

// The infrared exposure is fixed for a live or fallen character. Bake the small source
// rectangle once, so each camera can blit the figure with one ordinary source-over draw.
type Exposure = 'live' | 'door' | 'net' | 'fallen';
const cameraCels = new WeakMap<Figure, Partial<Record<Exposure, HTMLCanvasElement>>>();
function cameraCel(f: Figure, exposure: Exposure): HTMLCanvasElement | undefined {
  let cels = cameraCels.get(f);
  if (!cels) {
    cels = {};
    cameraCels.set(f, cels);
  }
  if (cels[exposure]) return cels[exposure];
  const canvas = document.createElement('canvas');
  canvas.width = f.sw;
  canvas.height = f.sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  const lift = exposure === 'fallen' ? NIGHT_LIFT * 0.55 : exposure === 'door' ? 0.09 : NIGHT_LIFT;
  if (typeof ctx.filter === 'string') {
    ctx.filter = `brightness(${1 + lift})`;
    paintCel(ctx, f, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';
  } else {
    paintCel(ctx, f, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = lift;
    paintCel(ctx, f, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  if (exposure === 'net') ctx.drawImage(netOverlay(f), 0, 0, canvas.width, canvas.height);
  if (exposure === 'door') {
    // The lamp and the villager's coat share the wood's ochre. Keep the wrist
    // and shoulder legible against the grain with a narrow warm ink contour.
    const ink = document.createElement('canvas');
    ink.width = canvas.width;
    ink.height = canvas.height;
    const outline = ink.getContext('2d');
    if (outline) {
      outline.drawImage(canvas, 0, 0);
      outline.globalCompositeOperation = 'source-in';
      outline.fillStyle = '#33271f';
      outline.fillRect(0, 0, ink.width, ink.height);
      ctx.globalCompositeOperation = 'destination-over';
      const radius = f.sw / (64 * f.width) * 1.45;
      for (const [x, y] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) ctx.drawImage(ink, x * radius, y * radius);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  cels[exposure] = canvas;
  return canvas;
}

function drawFigure(
  ctx: CanvasRenderingContext2D, f: Figure, height: number, exposure: Exposure, night: boolean,
  flash = 0, front = false, signature?: MobGesture, crawlDepth = 0,
): void {
  const w = f.width * height;
  const h = f.height * height;
  ctx.save();
  if (f.crawlMount) ctx.translate(f.crawlMount[0] * height * crawlDepth, f.crawlMount[1] * height * crawlDepth);
  if (f.reverse) ctx.scale(-1, 1);
  const baked = night ? cameraCel(f, exposure) : undefined;
  if (signature?.kind === 'hoist' && f.sw === (front ? 331 : 302) && f.sh === (front ? 269 : 268)) {
    drawHoist(ctx, front, w, h, signature, () => {
      if (baked) ctx.drawImage(baked, -w / 2, -h, w, h);
      else paintCel(ctx, f, -w / 2, -h, w, h);
    });
  } else if (baked) ctx.drawImage(baked, -w / 2, -h, w, h);
  else {
    paintCel(ctx, f, -w / 2, -h, w, h);
    if (exposure === 'net') ctx.drawImage(netOverlay(f), -w / 2, -h, w, h);
  }
  if (signature) drawMobGesture(ctx, front, height, signature);
  if (flash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= flash;
    paintCel(ctx, f, -w / 2, -h, w, h);
  }
  ctx.restore();
}

/** The finale walks the same painted cels along a side-scrolling lane. */
export function drawMobStride(ctx: CanvasRenderingContext2D, type: EnemyTypeId, phase: number, height: number): boolean {
  const reduced = calmMotion();
  const f = gaitFigure(type, ART[type], true, reduced ? 0 : phase);
  if (!f) return false;
  ctx.save();
  const airborne = type === 'runner' || type === 'dog';
  const lift = reduced ? 0 : Math.sin(Math.PI * (type === 'dog' ? phase : (2 * phase) % 1)) ** 2;
  ctx.translate(0, -height * lift * (airborne ? 0.075 : 0.016));
  drawFigure(ctx, f, height, 'live', false);
  ctx.restore();
  return true;
}

interface Moment { readonly time: number; readonly night: boolean }

export function drawEnemy(ctx: CanvasRenderingContext2D, view: View, frame: Moment & { devices: readonly DeviceVisual[] },
  enemy: Enemy & { threshold?: SectorId }, chief?: Enemy): void {
  const z = view.zoom;
  const art = ART[enemy.type];
  const p = project(view, enemy.x, enemy.y);
  if (p.x < view.x - 110 * z || p.x > view.x + view.w + 110 * z || p.y < view.y - 25 * z || p.y > view.y + view.h + 125 * z) return;
  const leader = enemy.fileRank && enemy.shielded && chief?.action === 'walk' && (enemy.action === 'walk' || enemy.action === 'idle') &&
    enemy.nettedFor <= 0 && enemy.stunnedFor <= 0 && enemy.hitFlash <= 0 ? chief : undefined;
  const horn = chief && (leader || enemy.lureDevice !== null) ? frame.devices.find(d => d.type === 'horn' && d.state === 'active' &&
    (d.activeAge ?? Infinity) < 0.8 && (enemy.lureDevice === d.id || (leader &&
      Math.hypot(enemy.x - d.x - 0.5, enemy.y - d.y - 0.5) <= DEVICES.horn.radius))) : undefined;
  const facingTarget = horn && enemy.lureDevice === horn.id ? horn : undefined;
  const dx = facingTarget ? facingTarget.x + 0.5 - enemy.x : 0;
  const dy = facingTarget ? facingTarget.y + 0.5 - enemy.y : 0;
  const reach = Math.hypot(dx, dy);
  const { front, flip, forwardX, forwardY } = reach > 0.001 ? facing(view, dx / reach, dy / reach)
    : facing(view, leader?.fx ?? enemy.fx, leader?.fy ?? enemy.fy);
  const h = art.height * z * stature(art, enemy.id);
  const reduced = calmMotion();
  const gait = enemy.type === 'mower' ? mowerFigure(enemy, front, reduced) : undefined;
  const movement = gait ? grounded : motion(enemy, art, reduced, leader, horn);
  const moveCel = movement.gait === undefined ? undefined : gaitFigure(enemy.type, art, front, movement.gait);
  const f = gait ?? moveCel ?? figureFor(art, front, movement.pose);
  const crouching = CRAWL_CLIPS.includes(movement.pose as CrawlClip);
  const low = enemy.hitFlash > 0 || enemy.nettedFor > 0 || enemy.stunnedFor > 0
    ? Math.max(enemy.crawlDepth, enemy.hitCrawlDepth ?? 0) : enemy.crawlDepth;
  const posture = crouching ? crawlHeight(art, front, low) : 1;
  if (f && !moveCel && !reduced && movement.step < 1 && movement.pose === 'p' && !art.wheels) {
    // With legs tucked, the bottom of the cel is the lifted foot. Keep the chest
    // near the stride's shoulder line while a grounded walker retains a little dip.
    const flight = art.animal || enemy.type === 'runner' || enemy.type === 'mail';
    movement.up += Math.max(0, 1 - f.height) * (flight ? 0.8 : 0.45);
  }

  const groundX = p.x + forwardX * movement.forward * h, groundY = p.y + forwardY * movement.forward * h;
  const support = f?.crawlMount ? smoothstep(0, 1, low) : 0;
  contactShadow(ctx, groundX, groundY + z, 18 * enemy.def.size * z, 7 * enemy.def.size * z, 0.58 - movement.up);
  if (art.heavy && movement.step < 0.24 && !reduced) {
    const t = movement.step / 0.24;
    ctx.fillStyle = 'rgba(172,154,121,' + (0.19 * (1 - t)) + ')';
    ctx.beginPath();
    ctx.ellipse(groundX - forwardX * h * 0.06, groundY + z - forwardY * h * 0.06, h * (0.08 + t * 0.12), h * (0.025 + t * 0.032), 0, 0, TAU);
    ctx.fill();
  }
  ctx.save();
  const padding = f?.groundPadding === undefined ? 3 * z : f.groundPadding * h;
  ctx.translate(groundX, groundY + padding * (1 - support) - h * movement.up);
  ctx.rotate(forwardX * movement.lean);
  ctx.scale(flip ? -1 : 1, posture * movement.squash);
  if (f) drawFigure(ctx, f, h, enemy.nettedFor > 0 ? 'net' : enemy.threshold ? 'door' : 'live', frame.night, movement.flash, front, movement.signature, support);
  else {
    ctx.fillStyle = enemy.def.boss ? '#a8433a' : '#7d9a58';
    ctx.beginPath();
    ctx.ellipse(0, -h / 2, h * 0.22, h / 2, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  const top = p.y - h * posture;
  if (enemy.stunnedFor > 0) {
    for (let i = 0; i < 3; i++) {
      const a = (reduced ? 0 : frame.time * 6) + (i * Math.PI * 2) / 3;
      ctx.fillStyle = '#ffe58a';
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a) * 11 * z, top - 4 * z + Math.sin(a) * 4 * z, 2.4 * z, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Telegraphs: anything about to hit hard says so first.
  if (enemy.action === 'windup' || enemy.action === 'rev' || enemy.action === 'speech') {
    const blink = reduced || Math.sin(frame.time * 10) > 0;
    ctx.fillStyle = blink ? '#ffd23a' : '#e0432e';
    ctx.strokeStyle = '#1a1206';
    ctx.lineWidth = 1.5;
    const s = 11 * z;
    ctx.save();
    ctx.translate(p.x, top - 16 * z);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = '#1a1206';
    ctx.font = `700 ${12 * z}px "DIN Condensed","Arial Narrow",sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('!', p.x, top - 12 * z);
    ctx.restore();
  }
  if (enemy.hasteFor > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.2 * z;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(p.x - forwardX * 14 * z, p.y - (10 + i * 12 + forwardY * 14) * z);
      ctx.lineTo(p.x - forwardX * 24 * z, p.y - (10 + i * 12 + forwardY * 24) * z);
      ctx.stroke();
    }
  }
  if (enemy.shielded) {
    ctx.strokeStyle = 'rgba(120,150,255,0.75)';
    ctx.lineWidth = 1.5 * z;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 13 * z, 6 * z, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Health: bosses always, others once hurt.
  const ratio = enemy.hp / enemy.def.hp;
  if (enemy.def.boss || ratio < 0.999) {
    const barW = (enemy.def.boss ? 54 : 24) * z;
    const barH = (enemy.def.boss ? 5 : 3) * z;
    const by = top - (enemy.def.boss ? 8 : 5) * z;
    ctx.fillStyle = 'rgba(10,8,6,0.85)';
    ctx.fillRect(p.x - barW / 2 - 1, by - 1, barW + 2, barH + 2);
    ctx.fillStyle = enemy.def.boss ? '#d8483a' : '#c9d36a';
    ctx.fillRect(p.x - barW / 2, by, barW * Math.max(0, ratio), barH);
  }
}

// Each cel has its own silhouette: recoil, knees buckling, then a fully prone resting pose.
// Changes of drawing coincide with the fastest movement, followed by a long still hold.
export function drawFallen(ctx: CanvasRenderingContext2D, view: View, frame: Moment, body: Fallen): void {
  const art = ART[body.type];
  const h = art.height * view.zoom * stature(art, body.id);
  const age = body.age;
  const opacity = 1 - smoothstep(FALL_SECONDS - 0.62, FALL_SECONDS, age);
  if (opacity <= 0) return;
  const { front, flip, forwardX, forwardY } = facing(view, body.fx, body.fy);
  const initialDepth = body.crawlDepth ?? 0;
  const low = initialDepth > 0;
  const enhanced = body.type === 'mower' || !!mobCycle(body.type);
  const rollEnd = low ? 0.24 : enhanced && art.wheels ? 0.52 : enhanced && art.heavy ? 0.45 : enhanced && art.animal ? 0.31 : 0.39;
  const recoilEnd = enhanced ? rollEnd * (art.wheels ? 0.34 : 0.27) : 0.12;
  const under = initialDepth + (1 - initialDepth) * smoothstep(0, rollEnd, age);
  const falling: Pose = low ? (under < 0.6 ? 'kneel' : 'crawlGather') : (age < recoilEnd ? 'hit' : 'fall');
  const pose = age < rollEnd ? falling : 'dead';
  const cel = figureFor(art, front, pose);
  if (!cel) return;
  const p = project(view, body.x, body.y);
  const reduced = calmMotion();
  const collapse = smoothstep(0.04, rollEnd + 0.065, age);
  const buckle = smoothstep(low ? 0 : recoilEnd, rollEnd, age);
  const landing = smoothstep(rollEnd, rollEnd + 0.18, age);
  const settle = Math.sin(Math.PI * landing);
  const slide = low ? 0.075 : enhanced && art.wheels ? 0.18 : enhanced && art.animal ? 0.16 : 0.115;
  const distance = h * collapse * (reduced ? 0.03 : slide);
  const x = p.x - forwardX * distance;
  // A crawler is already grounded between its limbs when the resting painting arrives.
  const prone = sprite('defense_mob_poses') ? low && pose === 'dead' ? 1 : smoothstep(recoilEnd, rollEnd + .17, age) : 0;
  const support = cel.crawlMount ? smoothstep(0, 1, under) : 0;
  const y = p.y + view.zoom * 3 * (1 - Math.max(support, prone)) - forwardY * distance;
  contactShadow(ctx, x, y - h * collapse * (1 - Math.max(support, prone)) * 0.075, h * (0.22 + 0.15 * collapse), h * (0.075 + 0.03 * collapse), 0.51 * opacity);
  ctx.save();
  ctx.globalAlpha *= opacity;
  ctx.translate(x, y);
  if (low) {
    const tilt = art.animal ? -0.06 : 0.14;
    ctx.rotate(reduced ? 0 : forwardX * tilt * (pose === 'dead' ? 1 - settle * 0.3 : buckle));
  } else if (!reduced) {
    if (!sprite('defense_mob_poses')) ctx.rotate(-forwardX * collapse * 1.35);
    else if (pose !== 'dead') ctx.rotate(forwardX * (pose === 'hit' ? -0.08 : -buckle * (art.wheels ? 0.075 : 0.16)));
  }
  const squash = pose === 'crawlGather' ? 1 - 0.28 * buckle : pose === 'fall' ? 1 - 0.22 * buckle : 1 - 0.045 * settle;
  const posture = low ? pose === 'dead' ? 0.80 : crawlHeight(art, front, under) : 1;
  ctx.scale(flip ? -1 : 1, posture * (reduced ? 1 : squash));
  if (prone > 0 && !cel.crawlMount) {
    const [cx, cy] = RESTING_CENTRES[art.row]![front ? 0 : 1];
    const pixel = 2 * h / 224;
    ctx.translate((112 - cx) * pixel * prone, (144 - cy) * pixel * prone);
  }
  drawFigure(ctx, cel, h, 'fallen', frame.night, 0, front, undefined, support);
  ctx.restore();
}
