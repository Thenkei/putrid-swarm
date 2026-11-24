// The shed, the morning after night 4: a cut-scene that is played.
//
// core/shed.ts decides what every input does. This file frames it (a wide shot from the door, three places,
// a bare wall to look at while the current runs), makes it heard, and puts the keys on screen. Nothing
// here changes the campaign except `settle`, once, at the very end.

import { PLATE, OVER, pointOnShot, shotTransform, type Cam, type Shot, type ShotLayer } from './shot-camera';
import { PauseMenu } from './pause';
import leadSleeves from '../render/shed-lead-sleeves.webp';
import bakerHands from '../assets/baker-hands.webp';
import { calmMotion } from '../render/lighting';
import { bindPromptPointer, promptLayer } from './prompt-pointer';
import { BOSS_NIGHT } from '../core/data/locations';
import { settleShed } from '../core/game';
import { hasLeftArm } from '../core/orchard';
import {
  ENDINGS,
  PLACES,
  SHED,
  canAsk,
  doing,
  isShedFate,
  press,
  promptsOf,
  resultOf,
  startShed,
  tick,
  zoneOf,
  type Cue,
  type Ending,
  type Held,
  type Item,
  type Place,
  type Press,
  type Prompt,
  type PromptId,
  type Question,
  type Shed,
  type Zone,
} from '../core/shed';
import { endingId } from '../core/endings';
import { endingsTally, rememberEnding as remember } from '../engine/progress';
import type { GameState } from '../core/types';
import { STAGE_H, STAGE_W, type App, type Scene } from '../engine/app';
import { sprite } from '../engine/assets';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S, fmt, hours, line } from '../engine/i18n';
import { hush, pickLine, say, sayAny, type VoiceId } from '../engine/voice';
import { Atmosphere, drawArm } from './atmosphere';
import { goDay, goEnd, goTitle } from './flow';

// ───────────────────────────── Framing ─────────────────────────────

const BAR = 54;
const CX = STAGE_W / 2;
const CY = STAGE_H / 2;

const WIDE: Shot = { plate: 'plate_shed', focusY: 0.5 };
const WALL: Shot = { plate: 'plate_shed_wall', focusY: 0.5 };
const SHOT: Readonly<Record<Place, Shot>> = {
  bench: { plate: 'plate_shed_bench', focusY: 0.55 },
  post: { plate: 'plate_shed_post', focusY: 0.62 },
  shelf: { plate: 'plate_shed_shelf', focusY: 0.5 },
};

interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * What lies on the bench in its picture, as rectangles of that picture (in its 1280 × 853 pixels).
 * Once one is picked up, the same rectangle of the bare bench is painted over it, edges feathered.
 */
const BENCH_ITEMS: Readonly<Record<'leads' | 'hammer', { readonly x: number; readonly y: number; readonly w: number; readonly h: number }>> = {
  leads: { x: 290, y: 416, w: 350, h: 228 },
  hammer: { x: 628, y: 438, w: 344, h: 166 },
};
const BENCH_BARE = 'plate_shed_bench_bare';
const FEATHER = 16;

/** A rectangle of a picture whose edges fade out, so it can be laid over its twin without a seam. */
function featheredPatch(art: { img: CanvasImageSource; w: number; h: number }, box: { x: number; y: number; w: number; h: number }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = box.w;
  canvas.height = box.h;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  const sx = art.w / PLATE.w;
  const sy = art.h / PLATE.h;
  g.drawImage(art.img, box.x * sx, box.y * sy, box.w * sx, box.h * sy, 0, 0, box.w, box.h);
  g.globalCompositeOperation = 'destination-out';
  const edges: readonly (readonly [number, number, number, number, number, number, number, number])[] = [
    [0, 0, FEATHER, 0, 0, 0, FEATHER, box.h],
    [box.w, 0, box.w - FEATHER, 0, box.w - FEATHER, 0, FEATHER, box.h],
    [0, 0, 0, FEATHER, 0, 0, box.w, FEATHER],
    [0, box.h, 0, box.h - FEATHER, 0, box.h - FEATHER, box.w, FEATHER],
  ];
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of edges) {
    const fade = g.createLinearGradient(x0, y0, x1, y1);
    fade.addColorStop(0, 'rgba(0, 0, 0, 1)');
    fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = fade;
    g.fillRect(rx, ry, rw, rh);
  }
  return canvas;
}

/** A point of a plate, given as fractions of the picture, in stage units for that shot. */
const at = (shot: Shot, fx: number, fy: number): Point => ({ x: fx * PLATE.w, y: fy * PLATE.h - OVER * shot.focusY });

/** Where things are in the pictures. */
const SPOT = {
  /** Where he sits in the wide shot, in front of the post, to walk toward. */
  far: at(WIDE, 0.47, 0.74),
  /** His feet, in front of the post. */
  seat: at(SHOT.post, 0.53, 0.86),
  /** The foot of the post, where his chain goes round it. */
  postFoot: at(SHOT.post, 0.47, 0.43),
  /** The padlock on the post. */
  padlock: at(SHOT.post, 0.6, 0.33),
  /** The loose end of the chain on the floor, where the leads are clipped. */
  coil: at(SHOT.post, 0.08, 0.6),
  /** The battery on the bench, where the leads come from. */
  battery: at(SHOT.bench, 0.18, 0.47),
  /** The jerrycan's tap and the flour sack. */
  tap: at(SHOT.shelf, 0.15, 0.53),
  sack: at(SHOT.shelf, 0.28, 0.33),
  /** The strip of grille the tarpaulin does not cover. */
  tarp: at(SHOT.shelf, 0.86, 0.6),
} as const;

/** How tall he is drawn at the post, sitting. */
const SEATED = 400;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number): number => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

// ───────────────────────────── Keys and prompts ─────────────────────────────

type KeyName = 'up' | 'down' | 'left' | 'right' | 'space' | '1' | '2' | '3' | '4';
type How = 'hold' | 'now';

interface PromptSpec {
  readonly keys: readonly KeyName[];
  readonly how?: How;
  /** What holding the prompt with the pointer holds down. */
  readonly hold?: keyof Held;
  /** What clicking it presses. */
  readonly tap?: Press;
  readonly at: Point;
  readonly big?: boolean;
  /** A question: laid out in the column on the left. */
  readonly ask?: boolean;
}

const LEFT = 250;
const MID = 640;
const RIGHT = 1000;
const LOW = 604;
const askAt = (row: number): Point => ({ x: 58, y: 196 + row * 56 });

const SPEC: Readonly<Record<PromptId, PromptSpec>> = {
  walk_in: { keys: ['up'], how: 'hold', hold: 'forward', at: { x: MID, y: LOW } },
  approach: { keys: ['up'], how: 'hold', hold: 'forward', at: { x: MID, y: LOW } },
  silence: { keys: ['space'], how: 'hold', hold: 'act', at: { x: LEFT, y: LOW } },
  clip: { keys: ['space'], tap: 'act', at: { x: LEFT, y: LOW } },
  leave: { keys: ['down'], how: 'hold', hold: 'back', at: { x: RIGHT, y: LOW } },
  go_left: { keys: ['left'], how: 'hold', hold: 'left', at: { x: 132, y: 452 } },
  go_right: { keys: ['right'], how: 'hold', hold: 'right', at: { x: 1148, y: 452 } },
  current: { keys: ['space'], how: 'hold', hold: 'act', at: { x: MID, y: 350 }, big: true },
  take_leads: { keys: ['space'], tap: 'act', at: { x: LEFT, y: LOW } },
  put_leads: { keys: ['space'], tap: 'act', at: { x: LEFT, y: LOW } },
  take_hammer: { keys: ['up'], tap: 'up', at: { x: RIGHT, y: LOW } },
  put_hammer: { keys: ['up'], tap: 'up', at: { x: RIGHT, y: LOW } },
  take_bowl: { keys: ['space'], tap: 'act', at: { x: LEFT, y: LOW } },
  refill: { keys: ['space'], tap: 'act', at: { x: LEFT, y: LOW } },
  put_bowl: { keys: ['space'], tap: 'act', at: { x: LEFT, y: LOW } },
  take_flour: { keys: ['up'], tap: 'up', at: { x: RIGHT, y: LOW } },
  put_flour: { keys: ['up'], tap: 'up', at: { x: RIGHT, y: LOW } },
  give_water: { keys: ['space'], how: 'hold', hold: 'act', at: { x: 560, y: LOW } },
  give_flour: { keys: ['space'], tap: 'act', at: { x: 560, y: LOW } },
  strike: { keys: ['space'], tap: 'act', at: { x: 560, y: LOW } },
  unlock: { keys: ['space'], how: 'hold', hold: 'act', at: { x: 560, y: LOW } },
  step_back: { keys: ['down'], tap: 'down', at: { x: 960, y: LOW } },
  dodge: { keys: ['down'], how: 'now', tap: 'down', at: { x: MID, y: 330 }, big: true },
  ask_stash: { keys: ['1'], tap: 'ask_stash', at: askAt(0), ask: true },
  ask_tonight: { keys: ['2'], tap: 'ask_tonight', at: askAt(1), ask: true },
  ask_chief: { keys: ['3'], tap: 'ask_chief', at: askAt(2), ask: true },
  ask_first: { keys: ['4'], tap: 'ask_first', at: askAt(3), ask: true },
};

/** Physical keys, so the same fingers work on AZERTY and QWERTY. */
const KEY_OF: Readonly<Record<string, keyof Held | Question>> = {
  ArrowUp: 'forward',
  KeyW: 'forward',
  ArrowDown: 'back',
  KeyS: 'back',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'act',
  Enter: 'act',
  KeyE: 'act',
  Digit1: 'stash',
  Numpad1: 'stash',
  Digit2: 'tonight',
  Numpad2: 'tonight',
  Digit3: 'chief',
  Numpad3: 'chief',
  Digit4: 'first',
  Numpad4: 'first',
};
const HELD_KEYS: readonly (keyof Held)[] = ['forward', 'back', 'left', 'right', 'act'];
const isHeld = (name: keyof Held | Question): name is keyof Held => (HELD_KEYS as readonly string[]).includes(name);

/** The answers, as he says them. The first one has one line per piece. */
const ANSWER: Readonly<Record<Exclude<Question, 'first'>, VoiceId>> = { stash: 'vo_baker_stash', tonight: 'vo_baker_tonight', chief: 'vo_baker_chief' };
const FIRST: readonly VoiceId[] = ['vo_baker_first_1', 'vo_baker_first_2', 'vo_baker_first_3'];

// ───────────────────────────── Timings of what the reducer does not time ─────────────────────────────

const INTRO_SECONDS = 2.8;
const TAKE_SECONDS = 0.5;
const FLOUR_INSERT = 2.65;
const POSE_FADE = 0.22;
const OUTRO: Readonly<Record<Ending, number>> = { freed: 6.2, finished: 4.2, chained: 3.4, emptied: 5.6, bitten: 2.6 };
const rememberEnding = (ending: Ending): boolean => remember(endingId('shed', ending));

/** The sprite he is drawn with. */
type Pose = 'feral' | 'drift' | 'lucid' | 'lunge' | 'drink' | 'knead' | 'slump' | 'stand';
const POSE_SPRITE: Readonly<Record<Pose, string>> = {
  feral: 'shed_baker_feral',
  drift: 'shed_baker_drift',
  lucid: 'shed_baker_lucid',
  lunge: 'shed_baker_lunge',
  drink: 'shed_baker_more_drink',
  knead: 'shed_baker_more_knead',
  slump: 'shed_baker_more_slump',
  stand: 'shed_baker_more_stand',
};
/** Where his shackle is, as fractions of each sprite: the end of the chain. */
const SHACKLE: Readonly<Record<Pose, Point>> = {
  feral: { x: 0.72, y: 0.84 },
  drift: { x: 0.66, y: 0.88 },
  lucid: { x: 0.64, y: 0.92 },
  lunge: { x: 0.8, y: 0.86 },
  drink: { x: 0.66, y: 0.9 },
  knead: { x: 0.66, y: 0.88 },
  slump: { x: 0.68, y: 0.9 },
  stand: { x: 0.5, y: 0.98 },
};
/** Where his mouth and his hands are, as fractions of his height from his feet. */
const MOUTH = 0.8;
const LAP = 0.36;

type Phase = 'intro' | 'play' | 'outro' | 'card';

export class ShedScene implements Scene {
  private shed: Shed = startShed();
  private phase: Phase = 'intro';
  private time = 0;
  private phaseTime = 0;
  private paused = false;
  private left = false;
  private readonly oneArm: boolean;

  private readonly keys = new Set<string>();
  /**
   * A key whose press just did something (took the bowl, gave the flour, stepped back out of a lunge) does not
   * also count as held until it has been let go: holding Space after the flour must not open the padlock, and
   * holding ↓ after a dodge must not walk out of the door.
   */
  private readonly latched = new Set<keyof Held>();
  private pointerHold: keyof Held | null = null;

  private readonly cam: Cam = { zoom: 1.04, x: CX, y: CY };
  private stride = 0;
  private walking = false;
  private shake = 0;
  private white = 0;
  private red = 0;
  private flicker = 0;
  /** 0 looking where we stand, 1 looking at the bare wall. */
  private away = 0;
  /** 0 standing, 1 sitting on the upturned pot. */
  private seated = 0;

  private pose: Pose = 'feral';
  private prevPose: Pose = 'feral';
  private poseAt = -10;
  /** Seconds since flour went into his hands; null before. */
  private flourInsert: number | null = null;
  private readonly bakerHands = new Image();
  /** Seconds since he went for us; null otherwise. */
  private lunging: number | null = null;
  private lastDoing: ReturnType<typeof doing> = null;
  private take: { what: Item; t: number } | null = null;

  private nextRattle = 2;
  private nextSnarl = 1.2;
  private nextMumble = 5;
  private nextIdle = 0;
  private nextGulp = 0;
  private nextCry = 0;
  private nextBreath = 2;
  private greeted = false;
  private sawTarp = false;
  private said = new Set<string>();
  private ending: Ending | null = null;

  private readonly atmo = new Atmosphere({ mist: 2, leaves: 3, motes: 46 });
  /** The right hand, when it comes into view: where its fingers are going, how it leans and how far it has got. */
  private hand: { tip: Point; lean: number; art: string } = { tip: { x: 900, y: 620 }, lean: -0.4, art: 'desk_hand_open' };
  private handReach = 0;
  private support = 0;

  private readonly queue: { at: number; run: () => void }[] = [];
  private readonly shadowCanvas = document.createElement('canvas');

  private root!: HTMLElement;
  private titleEl!: HTMLElement;
  private promptsEl!: HTMLElement;
  private gaugeEl!: HTMLElement;
  private needleEl!: HTMLElement;
  private zoneEl!: HTMLElement;
  private remnantEl!: HTMLElement;
  private remnantFill!: HTMLElement;
  private windowEl!: HTMLElement;
  private noteEl!: HTMLElement;
  private gestureStatus!: HTMLElement;
  private overlay!: HTMLElement;
  private pauseMenu!: PauseMenu;
  private promptSignature = '';
  private readonly promptEls = new Map<PromptId, HTMLElement>();

  constructor(private readonly app: App) {
    this.oneArm = app.state ? !hasLeftArm(app.state) : false;
  }

  private get state(): GameState {
    if (!this.app.state) throw new Error('ShedScene needs a running game');
    return this.app.state;
  }

  enter(): void {
    this.leadPainting.src = leadSleeves;
    this.bakerHands.src = bakerHands;
    audio.setAmbience('day');
    audio.setMusic('shed');
    const s = S();
    this.titleEl = el('div', { class: 'orchard-title' }, [el('h1', { text: s.shed.title }), el('p', { text: fmt(s.shed.when, { n: this.state.day + 1 }) })]);
    this.promptsEl = promptLayer(() => { this.pointerHold = null; });
    this.needleEl = el('i', { class: 'needle' });
    this.zoneEl = el('b');
    const bands = el('span', { class: 'bands' }, [
      el('span', { class: 'band feral', style: { width: `${SHED.feral * 100}%` } }),
      el('span', { class: 'band drift', style: { width: `${(SHED.lucid - SHED.feral) * 100}%` } }),
      el('span', { class: 'band lucid', style: { width: `${(SHED.breaking - SHED.lucid) * 100}%` } }),
      el('span', { class: 'band breaking', style: { width: `${(1 - SHED.breaking) * 100}%` } }),
      this.needleEl,
    ]);
    this.remnantFill = el('i');
    this.remnantEl = el('div', { class: 'remnant' }, [el('span', { text: s.shed.remnant }), el('span', { class: 'bar' }, [this.remnantFill])]);
    this.gaugeEl = el('div', { class: 'shed-gauge' }, [el('div', { class: 'row' }, [bands, this.zoneEl]), this.remnantEl]);
    this.windowEl = el('div', { class: 'shed-window', text: s.shed.window });
    this.noteEl = el('div', { class: 'orchard-note' });
    this.gestureStatus = el('span', { style: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)' } });
    this.gestureStatus.setAttribute('role', 'status');
    this.overlay = el('div');
    const pauseOverlay = el('div');
    this.pauseMenu = new PauseMenu(pauseOverlay);
    this.root = el('div', { class: 'orchard shed' }, [this.titleEl, this.gaugeEl, this.windowEl, this.promptsEl, this.noteEl, this.gestureStatus, this.overlay, pauseOverlay]);
    this.app.ui.append(this.root);
    this.after(1, () => this.line('vo_shed_arrive'));
  }

  exit(): void {
    this.left = true;
    hush();
    audio.fadeOut('zap', 0.2);
    audio.fadeOut('knead', 0.2);
  }

  // ───────────────────────────── Small machinery ─────────────────────────────

  private after(seconds: number, run: () => void): void {
    this.queue.push({ at: this.time + seconds, run });
  }

  private line(id: VoiceId, interrupt = false): number {
    return say(id, { interrupt });
  }

  /** A line said once in the scene, the first time it applies. */
  private once(id: VoiceId, interrupt = false): void {
    if (this.said.has(id)) return;
    if (this.line(id, interrupt) > 0 || interrupt) this.said.add(id);
  }

  private held(): Held {
    const down = (name: keyof Held): boolean => this.pointerHold === name || (!this.latched.has(name) && [...this.keys].some((code) => KEY_OF[code] === name));
    return { forward: down('forward'), back: down('back'), left: down('left'), right: down('right'), act: down('act') };
  }

  private apply(turn: { shed: Shed; cues: readonly Cue[] }): void {
    this.shed = turn.shed;
    for (const cue of turn.cues) this.onCue(cue);
  }

  /** Presses a key in the scene; true when it did something. */
  private send(key: Press): boolean {
    if (this.phase !== 'play' || this.paused || this.flourInsert !== null) return false;
    const turn = press(this.shed, key);
    const changed = turn.shed !== this.shed;
    this.apply(turn);
    return changed;
  }

  // ───────────────────────────── What happens, made seen and heard ─────────────────────────────

  private onCue(cue: Cue): void {
    switch (cue.type) {
      case 'arrived':
        if (cue.place === 'post' && !this.greeted) {
          this.greeted = true;
          this.after(0.5, () => this.once('vo_shed_see'));
        }
        if (cue.place === 'shelf' && !this.sawTarp) {
          this.sawTarp = true;
          this.after(0.6, () => this.once('vo_shed_tarp'));
        }
        break;
      case 'took':
        this.take = { what: cue.what, t: 0 };
        if (cue.what === 'bowl') audio.play('pour');
        if (cue.what === 'flour') {
          audio.play('flour');
          this.after(0.4, () => this.once('vo_shed_flour'));
        }
        if (cue.what === 'leads') this.after(0.4, () => this.once('vo_shed_leads'));
        if (cue.what === 'hammer') this.after(0.4, () => this.once('vo_shed_hammer'));
        break;
      case 'put':
        audio.play('rummage', 0.6);
        break;
      case 'refilled':
        this.take = { what: 'bowl', t: 0 };
        audio.play('pour');
        break;
      case 'crouched':
        audio.play('chain', 0.6);
        break;
      case 'stood':
        break;
      case 'wired':
        audio.play('clamp');
        this.flicker = 0.4;
        this.after(0.5, () => this.once('vo_shed_wired', true));
        break;
      case 'emptied_bowl':
        audio.play('gulp', 0.6);
        break;
      case 'floured':
        hush();
        audio.play('flour');
        this.flourInsert = 0;
        this.gestureStatus.textContent = line('Du pouce, il essuie la farine sur son annulaire. Ses mains replient une pâte invisible.', 'His thumb wipes flour off his ring finger. His hands fold an invisible piece of dough.');
        this.atmo.spray(this.onScreen(this.lap()).x, this.onScreen(this.lap()).y, 22, '#f6efe0', { angle: -Math.PI / 2, spread: 2.6, speed: 160, size: 3, gravity: 120, life: 1.4 });
        this.after(1.58, () => audio.play('knead', .48));
        this.after(2.18, () => {
          // His first lucid line about his wife follows immediately after the
          // insert if the flour brought him back. Give that line the room.
          if (this.shed.named || this.shed.presence < SHED.lucid) this.once('vo_baker_kneaded', true);
        });
        break;
      case 'flash':
        hush();
        this.white = 0.25;
        this.after(0.25, () => this.line(cue.hurt ? 'vo_baker_flash_hurt' : 'vo_baker_flash', true));
        this.nextIdle = this.time + 9;
        break;
      case 'asked': {
        hush();
        const id = cue.question === 'first' ? FIRST[this.shed.fragments] ?? 'vo_baker_first_3' : ANSWER[cue.question];
        this.after(0.15, () => this.line(id, true));
        this.nextIdle = this.time + 10;
        break;
      }
      case 'answered':
        this.nextIdle = this.time + 6;
        break;
      case 'cut':
        // Mid-word: the man is gone and something else answers.
        hush();
        audio.play('snarl');
        this.shake = Math.max(this.shake, 10);
        this.red = Math.max(this.red, 0.35);
        if (cue.fragment === null) this.after(0.7, () => sayAny('shedCut', { interrupt: true }));
        break;
      case 'surge':
        audio.play('snarl', 0.9);
        audio.play('chain', 0.8);
        this.shake = Math.max(this.shake, 8);
        break;
      case 'lunge':
        hush();
        this.lunging = 0;
        audio.play('chain_snap');
        audio.play('snarl');
        this.shake = 14;
        this.red = 0.5;
        break;
      case 'dodged':
        this.lunging = null;
        this.shake = 18;
        audio.play('chain_snap', 0.8);
        if (cue.dropped === 'bowl') audio.play('tin', 0.7);
        this.after(0.5, () => sayAny('shedDodge', { interrupt: true }));
        break;
      case 'ended':
        this.finish(cue.ending);
        break;
    }
  }

  private finish(ending: Ending): void {
    this.ending = ending;
    this.phase = 'outro';
    this.phaseTime = 0;
    this.keys.clear();
    this.pointerHold = null;
    audio.fadeOut('zap', 0.3);
    rememberEnding(ending);
    switch (ending) {
      case 'freed':
        audio.play('unlock');
        this.after(0.6, () => this.line('vo_shed_free', true));
        this.after(2.6, () => this.line('vo_baker_freed', true));
        this.after(3.8, () => audio.play('step_shed'));
        this.after(4.3, () => audio.play('step_shed'));
        break;
      case 'finished':
        hush();
        this.after(0.3, () => this.line('vo_shed_finish', true));
        this.after(1.9, () => {
          audio.setMusic('none');
          audio.play('thud');
          this.shake = 12;
        });
        break;
      case 'chained':
        this.after(0.2, () => this.line('vo_shed_leave', true));
        this.after(2, () => audio.play('shed_door'));
        break;
      case 'emptied':
        audio.fadeOut('zap', 0.6);
        this.after(0.8, () => this.line('vo_shed_emptied', true));
        this.after(3.6, () => {
          audio.setMusic('none');
          audio.play('thud');
          this.shake = 10;
        });
        break;
      case 'bitten':
        hush();
        audio.setMusic('none');
        audio.play('bite');
        this.after(0.1, () => audio.play('scream'));
        this.after(1.1, () => audio.play('body_fall'));
        this.red = 1;
        this.shake = 34;
        break;
    }
  }

  /** Writes the outcome into the campaign and leaves. */
  private settle(): void {
    if (this.left || !this.ending) return;
    const result = resultOf(this.shed);
    if (!result) return;
    this.left = true;
    const settled = settleShed(this.state, result);
    if (!settled.ok) {
      console.error('[shed] could not settle the morning', settled.error);
      goTitle(this.app);
      return;
    }
    this.app.state = settled.value;
    this.app.save();
    if (settled.value.phase === 'lost') goEnd(this.app);
    else goDay(this.app);
  }

  private showCard(): void {
    const ending = this.ending;
    const result = resultOf(this.shed);
    if (!ending || isShedFate(ending) || !result) return;
    this.phase = 'card';
    this.phaseTime = 0;
    audio.setMusic('morning');
    const s = S();
    const text = s.shed.ending[ending];
    const seen = endingsTally('shed');
    const learned: string[] = this.shed.learned.map((intel) =>
      intel === 'stash'
        ? fmt(s.shed.learned.stash, { wood: SHED.stash.wood ?? 0, battery: SHED.stash.battery ?? 0 })
        : intel === 'chief'
          ? fmt(s.shed.learned.chief, { n: BOSS_NIGHT.chief })
          : s.shed.learned.tonight,
    );
    if (this.shed.fragments > 0) learned.push(fmt(s.shed.learned.first, { n: this.shed.fragments }));
    const cost = fmt(text.cost, { h: hours(result.hours), n: SHED.delivery.wood ?? 0, upkeep: hours(SHED.upkeepHours) });
    const card = el('div', { class: `card orchard-card shed-card ${ending}` }, [
      el('h2', { text: text.title }),
      el('p', { text: text.text }),
      el(
        'ol',
        { class: 'trail' },
        this.shed.trail.map((step) => el('li', { text: s.shed.step[step] })),
      ),
      el('ul', { class: 'learned' }, (learned.length > 0 ? learned : [s.shed.learned.nothing]).map((line) => el('li', { text: line }))),
      el('p', { class: `cost ${ending === 'freed' ? 'good' : 'bad'}`, text: cost }),
      el('div', { class: 'actions' }, [
        el('span', { class: 'paths', text: fmt(s.shed.paths, { n: seen.seen, total: seen.total }) }),
        el('button', { class: 'btn btn-primary', text: fmt(s.shed.next, { n: this.state.day + 1 }), onClick: () => this.settle() }),
      ]),
    ]);
    this.overlay.replaceChildren(el('div', { class: 'modal orchard-modal' }, [card]));
  }

  // ───────────────────────────── Input ─────────────────────────────

  onKeyDown(code: string, event: KeyboardEvent): void {
    if (code === 'Escape') {
      this.togglePause();
      return;
    }
    if (this.paused) return;
    const name = KEY_OF[code];
    if (!name) return;
    event.preventDefault();
    if (this.phase === 'card') {
      if (name === 'act' && this.phaseTime > 0.6) this.settle();
      return;
    }
    if (this.phase === 'intro' && this.phaseTime > 0.8) this.phaseTime = INTRO_SECONDS;
    if (!isHeld(name)) {
      this.send(`ask_${name}`);
      return;
    }
    if (event.repeat) return;
    this.keys.add(code);
    const did = name === 'act' ? this.send('act') : name === 'left' || name === 'right' ? this.send(name) : name === 'forward' ? this.send('up') : this.send('down');
    if (did && name !== 'left' && name !== 'right') this.latched.add(name);
  }

  onKeyUp(code: string): void {
    this.keys.delete(code);
    const name = KEY_OF[code];
    if (name && isHeld(name) && ![...this.keys].some((other) => KEY_OF[other] === name)) this.latched.delete(name);
  }

  onBlur(): void {
    this.keys.clear();
    this.latched.clear();
    this.pointerHold = null;
    if (!this.paused) this.togglePause(true);
  }

  private promptDown(id: PromptId): void {
    const spec = SPEC[id];
    if (spec.hold) this.pointerHold = spec.hold;
    else if (spec.tap) this.send(spec.tap);
  }

  private togglePause(auto = false): void {
    if (this.phase === 'card' || this.left) return;
    this.paused = !this.paused;
    this.keys.clear();
    this.pointerHold = null;
    if (!this.paused) {
      this.pauseMenu.close();
      return;
    }
    audio.fadeOut('zap', 0.2);
    this.pauseMenu.open(() => this.togglePause(), () => goTitle(this.app), auto);
  }

  // ───────────────────────────── Loop ─────────────────────────────

  update(dt: number): void {
    if (this.paused || this.left) return;
    this.time += dt;
    this.phaseTime += dt;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const job = this.queue[i];
      if (job && job.at <= this.time) {
        this.queue.splice(i, 1);
        job.run();
      }
    }

    this.shake = Math.max(0, this.shake - dt * 46);
    this.white = Math.max(0, this.white - dt * 1.9);
    this.red = Math.max(0, this.red - dt * 2.2);
    this.flicker = Math.max(0, this.flicker - dt * 3);
    if (this.take && (this.take.t += dt) >= TAKE_SECONDS) this.take = null;
    if (this.lunging !== null) this.lunging += dt;
    this.atmo.update(dt);

    if (this.phase === 'intro' && this.phaseTime >= INTRO_SECONDS) {
      this.phase = 'play';
      this.phaseTime = 0;
    }
    if (this.flourInsert !== null) {
      this.flourInsert += dt;
      if (this.flourInsert >= FLOUR_INSERT) {
        this.flourInsert = null;
        audio.fadeOut('knead', 0.5);
      }
    } else if (this.phase === 'play') this.play(dt);
    if (this.phase === 'outro' && this.ending && this.phaseTime >= OUTRO[this.ending]) {
      if (isShedFate(this.ending)) this.settle();
      else this.showCard();
    }

    this.updatePose();
    this.follow(dt);
    this.reach(dt);
    this.syncHud();
  }

  private play(dt: number): void {
    const held = this.held();
    const before = this.shed;
    const now = doing(before, held);
    this.apply(tick(before, dt, held));
    const o = this.shed;
    if (this.phase !== 'play') {
      this.stopDoing();
      return;
    }

    // Feet: whatever is held and actually gets somewhere.
    const moving = (o.beat === 'arrive' && held.forward) || (o.heading !== null && o.walk > before.walk) || (o.place !== before.place && before.heading !== null) || o.near > before.near;
    this.walking = moving;
    if (moving) {
      const steps = Math.floor(this.stride);
      this.stride += dt * 2.3;
      if (Math.floor(this.stride) !== steps) audio.play('step_shed', o.near > 0 ? 0.5 : 1);
    }

    // What is being done with held keys, started and stopped.
    const doingNow = o.beat === 'play' ? now : null;
    if (doingNow !== this.lastDoing) {
      if (this.lastDoing === 'current') audio.fadeOut('zap', 0.35);
      if (doingNow === 'current') {
        audio.play('zap');
        this.nextCry = this.time + 0.35;
        this.once('vo_shed_shock', true);
      }
      if (doingNow === 'silence') {
        if (o.named && !audio.speaking) say(pickLine('shedName'));
        else this.once('vo_shed_sit');
      }
      if (doingNow === 'drinking') {
        this.nextGulp = this.time + 0.3;
        this.once('vo_shed_water');
      }
      this.lastDoing = doingNow;
    }
    if (doingNow === 'current') {
      this.flicker = Math.max(this.flicker, 0.2 + Math.random() * 0.4);
      if (Math.random() < dt * 9) this.atmo.spray(120 + Math.random() * 60, STAGE_H - 70, 6, '#ffe6a0', { angle: -1.2, spread: 1.4, speed: 420, size: 2.2, gravity: 900, life: 0.5 });
      if (this.time >= this.nextCry) {
        this.nextCry = this.time + 1.7;
        audio.play('cry', 0.9);
      }
    }
    if (doingNow === 'drinking' && this.time >= this.nextGulp) {
      this.nextGulp = this.time + 1.5;
      audio.play('gulp');
    }

    // He is heard wherever we stand: the chain, the snarls, the old words.
    const zone = zoneOf(o.presence);
    if (zone === 'feral' && this.time >= this.nextRattle) {
      this.nextRattle = this.time + 1.8 + Math.random() * 2.2;
      audio.play('chain', o.place === 'post' ? 0.8 : 0.45);
    }
    if (zone === 'feral' && this.time >= this.nextSnarl && o.beat === 'play') {
      this.nextSnarl = this.time + 3.5 + Math.random() * 3;
      audio.play('snarl', o.place === 'post' ? 0.75 : 0.4);
    }
    if (zone === 'drift' && o.beat === 'play' && doingNow === null && this.time >= this.nextMumble && !audio.speaking) {
      this.nextMumble = this.time + 7 + Math.random() * 4;
      sayAny('bakerDrift');
    }
    if (zone !== 'feral' && zone !== 'drift' && o.beat === 'play' && o.named && doingNow === null && this.time >= this.nextIdle && !audio.speaking) {
      this.nextIdle = this.time + 10;
      if (o.hurt && !this.said.has('vo_baker_hurt')) this.once('vo_baker_hurt');
      else sayAny('bakerLucid');
    }
  }

  private stopDoing(): void {
    if (this.lastDoing === 'current') audio.fadeOut('zap', 0.35);
    this.lastDoing = null;
  }

  /** Which picture of him, from where he is and what is being done to him. */
  private updatePose(): void {
    const o = this.shed;
    const zone: Zone = zoneOf(o.presence);
    let next: Pose = zone === 'feral' ? 'feral' : zone === 'drift' ? 'drift' : 'lucid';
    if (o.remnant < 0.35 && zone !== 'lucid') next = 'slump';
    if (this.lastDoing === 'drinking') next = 'drink';
    if (this.flourInsert !== null && zone !== 'feral') next = 'knead';
    if (o.beat === 'lunge' || this.ending === 'bitten') next = 'lunge';
    if (this.ending === 'emptied') next = 'slump';
    if (this.ending === 'freed') next = this.phaseTime > 1.4 ? 'stand' : 'lucid';
    if (next !== this.pose) {
      this.prevPose = this.pose;
      this.pose = next;
      this.poseAt = this.time;
    }
  }

  /** Where a point of the current shot lands on screen, through the camera. */
  private onScreen(point: Point): Point {
    const shots = this.groundShots();
    const active = shots.find(layer => layer.place === this.shed.place) ?? shots[0]!;
    return pointOnShot(active.shot, active.cam, point);
  }

  /** His mouth and his lap, in the post shot. */
  private mouth(): Point {
    return { x: SPOT.seat.x, y: SPOT.seat.y - SEATED * MOUTH };
  }
  private lap(): Point {
    return { x: SPOT.seat.x, y: SPOT.seat.y - SEATED * LAP };
  }

  /** The right hand comes into view whenever it holds or does something, and goes back out the way it came. */
  private reach(dt: number): void {
    const o = this.shed;
    const art = (what: Item | 'key' | null): string => (what ? `shed_hands_${what}` : 'desk_hand_open');
    let wanted: { tip: Point; lean: number; art: string; reach: number } | null = null;
    let support = 0;
    const atPost = o.place === 'post' && o.heading === null && this.phase !== 'card';
    if (this.take) {
      // Out to the shelf or the bench and back, in one movement.
      const from = o.place === 'shelf' ? (this.take.what === 'bowl' ? SPOT.tap : SPOT.sack) : SPOT.battery;
      const target = this.onScreen({ x: from.x + 60, y: from.y + 40 });
      this.hand = { tip: target, lean: -0.45, art: art(this.take.what) };
      this.handReach = Math.sin(Math.min(1, this.take.t / TAKE_SECONDS) * Math.PI) * 0.9 + 0.1;
      this.support = 0;
      return;
    }
    if (o.beat === 'play' && o.close && atPost) {
      if (this.lastDoing === 'drinking') {
        const m = this.onScreen(this.mouth());
        wanted = { tip: { x: m.x + 40, y: m.y + 70 }, lean: -0.55, art: art('bowl'), reach: 1 };
        // Two hands under a bowl, when there are two.
        support = this.oneArm ? 0 : 1;
      } else if (this.lastDoing === 'unlock') {
        const p = this.onScreen(SPOT.padlock);
        wanted = { tip: { x: p.x + 6 + Math.sin(this.time * 19) * 4, y: p.y + 14 }, lean: -0.5, art: art('key'), reach: 1 };
      } else if (o.holding) {
        const l = this.onScreen(this.lap());
        // Held out at his side, in reach of him and of the eye.
        wanted = { tip: { x: l.x + 250, y: l.y + 30 }, lean: -0.42, art: art(o.holding), reach: 1 };
      }
    } else if (o.holding && this.phase === 'play' && o.beat !== 'lunge') {
      // Carried, low in the frame.
      wanted = { tip: { x: 930, y: 610 + (this.walking ? Math.sin(this.stride * Math.PI) * 12 : 0) }, lean: -0.32, art: art(o.holding), reach: 0.62 };
    } else if (this.lastDoing === 'current') {
      wanted = { tip: { x: 150 + Math.sin(this.time * 40) * 3, y: 640 }, lean: 0.35, art: art('leads'), reach: 0.5 };
    }
    const k = 1 - Math.exp(-dt * (wanted ? 9 : 16));
    if (wanted) {
      this.hand = {
        tip: { x: lerp(this.hand.tip.x, wanted.tip.x, k), y: lerp(this.hand.tip.y, wanted.tip.y, k) },
        lean: lerp(this.hand.lean, wanted.lean, k),
        art: wanted.art,
      };
    }
    this.handReach = lerp(this.handReach, wanted ? wanted.reach : 0, k);
    if (this.handReach < 0.004) this.handReach = 0;
    this.support = lerp(this.support, support, k);
  }

  /** The camera eases toward where the moment wants it. */
  private follow(dt: number): void {
    const o = this.shed;
    const target: Cam = { zoom: 1.05, x: CX + Math.sin(this.time * 0.45) * 6, y: CY + Math.cos(this.time * 0.33) * 4 };
    const sitting = this.lastDoing === 'silence';
    this.seated = clamp01(this.seated + (sitting ? dt * 1.6 : -dt * 2.4));
    if (this.phase === 'outro' && this.ending === 'freed') {
      // Stepped back to let him stand up and by.
      target.zoom = 1.02;
      target.y = CY - 40;
    } else if (o.place === 'post' && o.heading === null) {
      const face = this.mouth();
      const n = smooth(o.near);
      if (o.beat === 'lunge' || this.ending === 'bitten') {
        target.zoom = 1.5;
        target.x = face.x;
        target.y = face.y + 60;
      } else if (o.beat === 'answer' || o.beat === 'flash') {
        target.zoom = lerp(1.32, 1.6, n) + (o.beat === 'answer' ? Math.min(0.12, o.clock * 0.02) : 0);
        target.x = lerp(target.x, face.x, 0.9);
        target.y = lerp(target.y, face.y + 70, 0.9);
      } else if (n > 0) {
        target.zoom = 1.05 + 0.34 * n;
        target.x = lerp(target.x, face.x, n);
        target.y = lerp(target.y, face.y + 110, n);
      }
      // Sitting on an upturned pot: lower, a little wider, looking up at him.
      target.y -= this.seated * 46;
      target.zoom -= this.seated * 0.03;
    }
    const k = 1 - Math.exp(-dt * (o.beat === 'lunge' ? 10 : 4.5));
    this.cam.zoom = lerp(this.cam.zoom, target.zoom, k);
    this.cam.x = lerp(this.cam.x, target.x, k);
    this.cam.y = lerp(this.cam.y, target.y, k);
    // Looking away: while the current runs, and while it is ended with the hammer.
    const look = this.lastDoing === 'current' || (this.phase === 'outro' && (this.ending === 'finished' || (this.ending === 'emptied' && this.phaseTime > 2.6)));
    this.away = clamp01(this.away + (look ? dt * 2.2 : -dt * 1.8));
  }

  // ───────────────────────────── HUD ─────────────────────────────

  private syncHud(): void {
    const s = S();
    const o = this.shed;

    const titleOn = this.phase === 'intro' && this.phaseTime > 0.3 && this.phaseTime < INTRO_SECONDS - 0.5;
    this.titleEl.classList.toggle('on', titleOn);

    const inPlay = this.phase === 'play' && this.flourInsert === null;
    const prompts = inPlay && !this.paused ? promptsOf(o) : [];
    const signature = prompts.map((p) => `${p.id}:${p.to ?? ''}:${p.id === 'silence' ? o.named : ''}`).join('|');
    if (signature !== this.promptSignature) {
      this.promptSignature = signature;
      this.promptEls.clear();
      this.promptsEl.replaceChildren(...prompts.map((prompt) => this.buildPrompt(prompt)));
    }
    const held = this.held();
    for (const prompt of prompts) {
      const node = this.promptEls.get(prompt.id);
      if (!node) continue;
      node.style.setProperty('--p', String(clamp01(prompt.progress ?? (prompt.id === 'silence' ? o.presence / (o.named ? SHED.silenceNamedCeiling : SHED.silenceCeiling) : 0))));
      const spec = SPEC[prompt.id];
      node.classList.toggle('held', spec.hold !== undefined && held[spec.hold]);
    }

    // The gauge: where he is, between the virus and the man.
    const gaugeOn = inPlay && o.beat !== 'arrive';
    const zone = zoneOf(o.presence);
    this.gaugeEl.classList.toggle('on', gaugeOn);
    this.gaugeEl.dataset['zone'] = zone;
    this.needleEl.style.left = `${o.presence * 100}%`;
    if (this.zoneEl.textContent !== s.shed.gauge[zone]) this.zoneEl.textContent = s.shed.gauge[zone];
    this.remnantEl.classList.toggle('on', o.hurt);
    this.remnantEl.classList.toggle('low', o.remnant < 0.35);
    this.remnantFill.style.width = `${o.remnant * 100}%`;
    this.windowEl.classList.toggle('on', inPlay && canAsk(o));

    const note = this.phase === 'outro' && this.ending === 'chained' && this.phaseTime > 1.8 ? s.shed.later : '';
    if (this.noteEl.textContent !== note) this.noteEl.textContent = note;
    this.noteEl.classList.toggle('on', note !== '');
  }

  /** Questions close up when one has been answered: their keys stay, their rows do not. */
  private askRow(id: PromptId): number {
    return promptsOf(this.shed)
      .filter((p) => SPEC[p.id].ask)
      .findIndex((p) => p.id === id);
  }

  private buildPrompt(prompt: Prompt): HTMLElement {
    const s = S();
    const o = this.shed;
    const spec = SPEC[prompt.id];
    const label =
      prompt.id === 'go_left' || prompt.id === 'go_right'
        ? fmt(s.shed.prompt.go, { place: prompt.to ? s.shed.place[prompt.to] : '' })
        : prompt.id === 'silence' && o.named
          ? s.shed.prompt.silenceNamed
          : s.shed.prompt[prompt.id];
    const keys = spec.keys.map((key) => el('kbd', { class: `key-${key}`, text: key in s.orchard.key ? s.orchard.key[key as keyof typeof s.orchard.key] : key }));
    const node = el(
      'button',
      {
        class: `qte qte-${prompt.id}${spec.how ? ` how-${spec.how}` : ''}${spec.big ? ' big' : ''}${spec.ask ? ' ask' : ''}`,
        style: { left: `${spec.at.x}px`, top: `${spec.ask ? askAt(this.askRow(prompt.id)).y : spec.at.y}px` },
      },
      [el('span', { class: 'keys' }, keys), el('span', { class: 'what' }, [label, spec.how ? el('small', { text: s.orchard.how[spec.how] }) : null])],
    );
    bindPromptPointer(node, this.promptsEl, !!spec.hold, () => this.promptDown(prompt.id));
    this.promptEls.set(prompt.id, node);
    return node;
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private drawSprite(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, height: number, options: { ax?: number; ay?: number; flip?: boolean; squash?: number; rot?: number; alpha?: number } = {}): void {
    const art = sprite(key);
    if (!art) return;
    const width = (art.w / art.h) * height;
    ctx.save();
    ctx.translate(x, y);
    if (options.rot) ctx.rotate(options.rot);
    ctx.scale((options.flip ? -1 : 1) * (options.squash ?? 1), 1);
    ctx.globalAlpha *= options.alpha ?? 1;
    ctx.drawImage(art.img, -width * (options.ax ?? 0.5), -height * (options.ay ?? 1), width, height);
    ctx.restore();
  }

  private drawShot(ctx: CanvasRenderingContext2D, shot: Shot, cam: Cam, alpha: number, props?: () => void): void {
    if (alpha <= 0) return;
    const top = -OVER * shot.focusY;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.transform(...shotTransform(shot, cam));
    const art = sprite(shot.plate);
    if (art) ctx.drawImage(art.img, 0, top, PLATE.w, PLATE.h);
    else {
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(0, top, PLATE.w, PLATE.h);
    }
    props?.();
    ctx.restore();
  }

  private shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, alpha: number): void {
    ctx.save();
    ctx.fillStyle = `rgba(20, 14, 8, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** A chain from one point to another, link by link, slack or taut. */
  private drawChain(ctx: CanvasRenderingContext2D, from: Point, to: Point, sag: number, scale = 1): void {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const links = Math.max(3, Math.round(length / (15 * scale)));
    ctx.save();
    ctx.lineWidth = 4.5 * scale;
    for (let i = 0; i < links; i++) {
      const t = (i + 0.5) / links;
      const x = lerp(from.x, to.x, t);
      const y = lerp(from.y, to.y, t) + Math.sin(t * Math.PI) * sag;
      const next = (i + 1.5) / links;
      const angle = Math.atan2(lerp(from.y, to.y, next) + Math.sin(next * Math.PI) * sag - y, lerp(from.x, to.x, next) - x);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.strokeStyle = '#3b2414';
      ctx.beginPath();
      ctx.ellipse(0, 0, 10 * scale, (i % 2 === 0 ? 5.5 : 2) * scale, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = i % 2 === 0 ? '#9a5a2c' : '#7a4320';
      ctx.lineWidth = 2.4 * scale;
      ctx.stroke();
      ctx.lineWidth = 4.5 * scale;
      ctx.restore();
    }
    ctx.restore();
  }

  private readonly leadPainting = new Image();
  /** Traced on the 1280 × 853 paintings. The tabletop leads curl over the timber lip. */
  private readonly leadPaths = {
    bench: [
      new Path2D('M 378 532 C 407 537 395 574 462 581 S 568 565 591 588 C 619 615 574 619 590 633 C 604 645 604 641 608 664 C 622 751 650 808 714 893'),
      new Path2D('M 379 547 C 421 550 405 590 479 599 S 565 582 574 599 C 583 617 550 621 553 636 C 553 652 568 647 570 678 C 570 743 601 827 641 886'),
    ],
    post: [
      new Path2D('M 104 511 C 87 524 97 540 67 543 S 20 531 -8 544 L -50 560'),
      new Path2D('M 101 520 C 82 523 84 552 58 554 S 19 544 -6 551 L -50 568'),
    ],
  };

  private drawLeads(ctx: CanvasRenderingContext2D, place: 'bench' | 'post', live: boolean): void {
    const bench = place === 'bench';
    const painted = this.leadPainting.complete && this.leadPainting.naturalWidth > 0;
    ctx.save();
    ctx.translate(0, -OVER * SHOT[place].focusY);
    ctx.lineCap = 'round';
    for (const [index, lead] of this.leadPaths[place].entries()) {
      const red = index === 0;
      ctx.save();
      ctx.translate(-2, 4);
      ctx.strokeStyle = '#301d1180';
      ctx.lineWidth = 11;
      ctx.stroke(lead);
      ctx.restore();
      if (painted) continue;
      ctx.strokeStyle = red ? '#48261d' : '#28231d';
      ctx.lineWidth = 9;
      ctx.stroke(lead);
      const sleeve = ctx.createLinearGradient(0, bench ? 530 : 505, 0, bench ? 760 : 573);
      sleeve.addColorStop(0, red ? '#985139' : '#574f41');
      sleeve.addColorStop(.45, red ? '#aa5537' : '#61594b');
      sleeve.addColorStop(.56, red ? '#713a2b' : '#403c34');
      sleeve.addColorStop(1, red ? '#593428' : '#38352f');
      ctx.strokeStyle = sleeve;
      ctx.lineWidth = 6.3;
      ctx.stroke(lead);
      ctx.save();
      ctx.translate(.5, -1.5);
      ctx.strokeStyle = red ? '#e6986594' : '#b0a38c80';
      ctx.setLineDash([12, 8, 3, 7, 34, 21]);
      ctx.lineWidth = 1.2;
      ctx.stroke(lead);
      ctx.restore();
    }
    // Rubber cross-sections and scuffs are sampled from the original coil painting, then
    // laid along these paths. The bench cutout begins at the occluding edge of the box.
    if (painted) {
      if (bench) ctx.drawImage(this.leadPainting, 0, 0, 363, 336, 366, 517, 363, 336);
      else ctx.drawImage(this.leadPainting, 363, 0, 180, 82, -62, 497, 180, 82);
    }
    if (live && Math.random() < 0.5) {
      const from = bench ? { x: SPOT.battery.x, y: SPOT.battery.y + OVER * SHOT.bench.focusY }
        : { x: SPOT.coil.x, y: SPOT.coil.y + OVER * SHOT.post.focusY };
      ctx.fillStyle = '#fff1b0';
      for (let i = 0; i < 4; i++) ctx.fillRect(from.x + (Math.random() - 0.5) * 30, from.y + (Math.random() - 0.5) * 20, 3, 3);
    }
    ctx.restore();
  }

  /** Him, where he sits: the pose of the moment, crossfading from the last. */
  private drawBaker(ctx: CanvasRenderingContext2D, base: Point, height: number, chainFrom: Point | null): void {
    const o = this.shed;
    const fade = clamp01((this.time - this.poseAt) / POSE_FADE);
    const zone = zoneOf(o.presence);
    const breathe = Math.sin(this.time * (zone === 'feral' ? 3.4 : 1.6)) * 0.008;
    const jitter = zone === 'feral' ? Math.sin(this.time * 31) * 1.6 : 0;
    // Kneading: the shoulders roll with the hands.
    const knead = this.pose === 'drift' || this.pose === 'knead' ? Math.sin(this.time * 5.2) * 0.012 : 0;
    let x = base.x + jitter;
    let y = base.y;
    let h = height * (1 + breathe);
    let alpha = 1;
    if (this.pose === 'lunge') {
      // Off the floor and at us, until the chain stops him.
      const t = this.lunging !== null ? this.lunging / SHED.lungeSeconds : this.ending === 'bitten' ? 1 + this.phaseTime * 2 : 1;
      const e = Math.pow(clamp01(t), 1.6) + Math.max(0, t - 1);
      h = lerp(height * 0.95, height * 2.5, e);
      y = lerp(base.y, base.y + height * 0.9, e);
      x = base.x + Math.sin(this.time * 41) * 6;
    }
    if (this.pose === 'stand') {
      // Up, a nod, then past us toward the door.
      const t = clamp01((this.phaseTime - 3.6) / 2);
      h = height * 1.12 * lerp(1, 2.6, t * t);
      y = base.y + lerp(0, height * 1.4, t * t);
      x = base.x + lerp(0, 560, t * t);
      alpha = 1 - clamp01((t - 0.6) / 0.4);
    }
    if (chainFrom && this.pose !== 'stand') {
      const shackle = SHACKLE[this.pose];
      const art = sprite(POSE_SPRITE[this.pose]);
      const w = art ? (art.w / art.h) * h : h * 0.8;
      const end = { x: x - w / 2 + shackle.x * w, y: y - h + shackle.y * h };
      const taut = this.pose === 'lunge' ? 0 : 26;
      this.drawChain(ctx, chainFrom, end, taut, this.pose === 'lunge' ? 1.4 : 1);
    }
    if (this.pose === 'stand') {
      // The chain he leaves behind, on the floor.
      this.drawChain(ctx, SPOT.postFoot, { x: base.x + 150, y: base.y - 8 }, 24);
    }
    this.shadow(ctx, base.x, base.y - 4, height * 0.42, height * 0.06, 0.45);
    if (fade < 1) this.drawSprite(ctx, POSE_SPRITE[this.prevPose], x, y, h, { alpha: (1 - fade) * alpha, rot: knead });
    this.drawSprite(ctx, POSE_SPRITE[this.pose], x, y, h, { alpha: fade * alpha, rot: knead });
  }

  private propsOf(place: Place): () => void {
    return () => {
      const ctx = this.app.ctx;
      const o = this.shed;
      if (place === 'post') {
        if (o.wired) this.drawLeads(ctx, 'post', this.lastDoing === 'current');
        this.drawBaker(ctx, SPOT.seat, SEATED, SPOT.postFoot);
      }
      if (place === 'bench') {
        // The picture has the leads and the hammer lying on the bench: not once they have been taken.
        if (o.holding === 'leads' || o.wired) this.drawBenchGap(ctx, 'leads');
        if (o.holding === 'hammer') this.drawBenchGap(ctx, 'hammer');
        if (o.wired) this.drawLeads(ctx, 'bench', this.lastDoing === 'current');
      }
    };
  }

  private readonly benchGaps = new Map<keyof typeof BENCH_ITEMS, HTMLCanvasElement>();

  /** Paints the bare bench where something lay. Without the bare picture the thing simply stays painted. */
  private drawBenchGap(ctx: CanvasRenderingContext2D, what: keyof typeof BENCH_ITEMS): void {
    const box = BENCH_ITEMS[what];
    let patch = this.benchGaps.get(what);
    if (!patch) {
      const bare = sprite(BENCH_BARE);
      if (!bare) return;
      patch = featheredPatch(bare, box);
      this.benchGaps.set(what, patch);
    }
    ctx.drawImage(patch, box.x, box.y - OVER * SHOT.bench.focusY, box.w, box.h);
  }

  private groundShots(): ShotLayer<Place>[] {
    const o = this.shed;
    const bob = this.walking ? Math.sin(this.stride * Math.PI) * 6 : 0;

    if (this.phase === 'intro' || o.beat === 'arrive') {
      // In at the door, toward the shape against the post.
      const w = smooth(o.walk);
      const zoom = 1.04 + this.time * 0.005 + w * 0.9;
      const cam: Cam = { zoom, x: lerp(CX, SPOT.far.x, w), y: lerp(CY, SPOT.far.y - 60, w) + bob };
      const arriving = clamp01((o.walk - 0.74) / 0.26);
      const shots: ShotLayer<Place>[] = [{ shot: WIDE, cam, alpha: 1 }];
      if (arriving > 0) shots.push({ shot: SHOT.post, place: 'post', cam: { zoom: 1.22 - 0.17 * arriving, x: CX, y: CY + bob }, alpha: arriving });
      return shots;
    }

    const roll = this.walking ? Math.sin(this.stride * Math.PI) * 0.006 : this.lastDoing === 'current' ? Math.sin(this.time * 23) * 0.004 : 0;
    const cam: Cam = { zoom: this.cam.zoom + Math.abs(roll) * 2.4, x: this.cam.x, y: this.cam.y + bob, roll };
    if (o.heading !== null && o.walk > 0) {
      const direction = Math.sign(PLACES.indexOf(o.heading) - PLACES.indexOf(o.place));
      const e = smooth(o.walk);
      const incoming = clamp01((e - 0.4) / 0.45);
      return [
        { shot: SHOT[o.place], place: o.place, cam: { zoom: cam.zoom + 0.1 * e, x: cam.x + direction * e * 240, y: cam.y, roll }, alpha: 1 },
        { shot: SHOT[o.heading], place: o.heading, cam: { zoom: cam.zoom + 0.1 * (1 - e), x: CX - direction * (1 - e) * 240, y: CY + bob, roll }, alpha: incoming },
      ];
    }
    return [{ shot: SHOT[o.place], place: o.place, cam, alpha: 1 }];
  }

  private drawGround(ctx: CanvasRenderingContext2D): void {
    for (const layer of this.groundShots()) {
      const props = layer.place ? this.propsOf(layer.place) : () => this.drawBaker(ctx, SPOT.far, 150, null);
      this.drawShot(ctx, layer.shot, layer.cam, layer.alpha, props);
    }
  }

  /** The bare wall, and his shadow on it: what is seen of the current, and of the hammer. */
  private drawWall(ctx: CanvasRenderingContext2D, alpha: number): void {
    if (alpha <= 0) return;
    const pan = (1 - smooth(alpha)) * 220;
    this.drawShot(ctx, WALL, { zoom: 1.08 + Math.sin(this.time * 0.6) * 0.01, x: CX + pan + Math.sin(this.time * 0.7) * 8, y: CY }, alpha, () => {
      const hammer = this.ending === 'finished' || this.ending === 'emptied';
      const live = this.lastDoing === 'current';
      if (!live && !hammer) return;
      const key = hammer ? POSE_SPRITE.slump : this.shed.presence > SHED.breaking ? POSE_SPRITE.lunge : POSE_SPRITE.feral;
      const jolt = live ? (Math.random() - 0.5) * 18 : 0;
      const struck = hammer && this.phaseTime > (this.ending === 'finished' ? 1.9 : 3.6);
      this.drawSilhouette(ctx, key, 580 + jolt, 760, 540, live ? (Math.random() - 0.5) * 0.08 : struck ? 0.5 : 0, 0.42 * alpha * (struck ? 1 - clamp01((this.phaseTime - 2.2) / 1.4) : 1));
    });
  }

  /** A sprite as a soft dark shadow thrown on the planks, stretched by the light from the door. */
  private drawSilhouette(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, height: number, rot: number, alpha: number): void {
    const art = sprite(key);
    if (!art || alpha <= 0) return;
    const canvas = this.shadowCanvas;
    if (canvas.width !== art.w || canvas.height !== art.h) {
      canvas.width = art.w;
      canvas.height = art.h;
    }
    const g = canvas.getContext('2d');
    if (!g) return;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, art.w, art.h);
    g.drawImage(art.img, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#1a0f08';
    g.fillRect(0, 0, art.w, art.h);
    const width = (art.w / art.h) * height;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.rotate(rot);
    // Slanted, as light from a low door throws it.
    ctx.transform(1, 0, -0.28, 1, 0, 0);
    ctx.drawImage(canvas, -width / 2, -height, width * 1.12, height);
    ctx.restore();
  }

  /** What is between the eye and the picture: the door's edge, hanging rope, pots. */
  private drawForeground(ctx: CanvasRenderingContext2D): void {
    const o = this.shed;
    const alpha = 1 - this.away;
    if (alpha <= 0) return;
    const sway = Math.sin(this.time * 0.9) * 0.02;
    const bob = this.walking ? Math.sin(this.stride * Math.PI) * 10 : 0;
    const arriving = this.phase === 'intro' || o.beat === 'arrive';
    const push = arriving ? smooth(o.walk) * 520 : (this.cam.zoom - 1.05) * 480;
    const drag = arriving ? 0 : -(this.cam.x - CX) * 1.5;
    const sets: { shift: number }[] = [{ shift: 0 }];
    if (!arriving && o.heading !== null && o.walk > 0) {
      const direction = Math.sign(PLACES.indexOf(o.heading) - PLACES.indexOf(o.place));
      const e = smooth(o.walk);
      sets[0] = { shift: -direction * e * 1500 };
      sets.push({ shift: direction * (1 - e) * 1500 });
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    for (const set of sets) {
      if (arriving) this.drawSprite(ctx, 'shed_fg_door', 40 - push * 1.2, STAGE_H + 40 + bob, 900, { ay: 1 });
      this.drawSprite(ctx, 'shed_fg_rope', 1170 + push * 0.6 + drag * 0.7 + set.shift, -40 + bob * 0.4 + this.seated * 30, 380, { ay: 0, rot: sway });
      this.drawSprite(ctx, 'shed_fg_pots', 1210 + push + drag + set.shift, STAGE_H + 60 + bob + this.seated * 20, 400 + this.seated * 60);
    }
    ctx.restore();
  }

  /** What the player sees of himself: a hand holding out water, flour, a key, a hammer. */
  private drawBody(ctx: CanvasRenderingContext2D): void {
    if (this.handReach > 0 && this.away < 1) {
      const art = sprite(this.hand.art) ?? sprite('desk_hand_open');
      if (this.support > 0.02 && this.hand.art === 'shed_hands_bowl') {
        // The left fingers tuck behind the near edge of the bowl as it comes up.
        drawArm(ctx, sprite('desk_hand_open'), { x: this.hand.tip.x - 48, y: this.hand.tip.y + 66 }, { height: 620, lean: 0.55, reach: this.support * this.handReach, mirror: true, alpha: 1 - this.away });
      }
      drawArm(ctx, art, this.hand.tip, { height: 620, lean: this.hand.lean, reach: this.handReach, alpha: 1 - this.away });
    }
  }

  private drawVeil(ctx: CanvasRenderingContext2D): void {
    const o = this.shed;
    const edge = (r: number, g: number, b: number, alpha: number, inner: number): void => {
      if (alpha <= 0) return;
      const gradient = ctx.createRadialGradient(CX, CY, STAGE_H * inner, CX, CY, STAGE_W * 0.62);
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    };
    const flat = (color: string, alpha: number): void => {
      if (alpha <= 0) return;
      ctx.globalAlpha = clamp01(alpha);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, STAGE_W, STAGE_H);
      ctx.globalAlpha = 1;
    };

    const zone = zoneOf(o.presence);
    // A shed is dark at the edges; darker, and greener, while only the virus is there.
    edge(10, 8, 4, 0.42, 0.42);
    if (o.beat !== 'arrive' && o.place === 'post') edge(8, 22, 10, zone === 'feral' ? 0.4 : zone === 'drift' ? 0.18 : 0, 0.45);
    // Warmer while he is there.
    if (zone === 'lucid' && o.place === 'post') flat('#ffcf7a', 0.05 + Math.sin(this.time * 1.4) * 0.015);
    edge(150, 12, 8, this.red * 0.75 + (o.beat === 'lunge' ? 0.3 : 0), 0.3);
    flat('#fff3cc', this.flicker * 0.18);
    flat('#fff', this.white);

    if (this.phase === 'intro') flat('#000', 1 - this.phaseTime / 1.4);
    if (this.phase === 'outro' && this.ending) {
      const t = this.phaseTime;
      switch (this.ending) {
        case 'freed':
          flat('#fff6e0', clamp01((t - 5) / 1.2) * 0.4);
          break;
        case 'finished':
          flat('#000', clamp01((t - 2.4) / 1.4));
          break;
        case 'chained':
          // The door shuts on him: the light goes from the sides in.
          flat('#000', clamp01((t - 1.8) / 1.2));
          break;
        case 'emptied':
          flat('#000', clamp01((t - 4) / 1.4));
          break;
        case 'bitten':
          flat('#3a0604', clamp01(t / 0.3));
          flat('#000', clamp01((t - 0.6) / 1));
          break;
      }
    }
    if (this.phase === 'card') flat('#0a0806', 0.45);
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);

    ctx.save();
    ctx.translate((Math.random() * 2 - 1) * this.shake, (Math.random() * 2 - 1) * this.shake);
    if (this.phase === 'card') this.drawShot(ctx, SHOT.post, { zoom: 1.06 + this.phaseTime * 0.004, x: CX, y: CY }, 1, this.ending === 'chained' || this.ending === 'freed' ? this.propsOf('post') : undefined);
    else {
      if (this.away < 1) this.drawGround(ctx);
      this.drawWall(ctx, this.away);
    }
    const slide = -(this.cam.x - CX) * 0.4;
    this.atmo.drawBack(ctx, slide, 0.7);
    if (this.phase !== 'card') this.drawForeground(ctx);
    this.atmo.drawFront(ctx, slide * 1.4);
    ctx.restore();
    if (this.phase !== 'card') this.drawBody(ctx);
    this.drawVeil(ctx);
    if (this.flourInsert !== null && this.bakerHands.complete && this.bakerHands.naturalWidth) {
      const t = this.flourInsert;
      const still = calmMotion();
      const pose = t < .48 ? 0 : t < 1.14 ? 1 : t < 1.83 ? 2 : 3;
      const sw = this.bakerHands.naturalWidth / 2, sh = this.bakerHands.naturalHeight / 2;
      const push = still ? 1 : 1 + .045 * smooth(t / FLOUR_INSERT);
      const dw = STAGE_W * push, dh = dw * sh / sw;
      ctx.save();
      ctx.globalAlpha = still ? 1 : Math.min(smooth(t / .14), smooth((FLOUR_INSERT - t) / .18));
      ctx.drawImage(this.bakerHands, (pose % 2) * sw, Math.floor(pose / 2) * sh, sw, sh,
        (STAGE_W - dw) / 2, CY - dh * .54, dw, dh);
      ctx.restore();
    }

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, STAGE_W, BAR);
    ctx.fillRect(0, STAGE_H - BAR, STAGE_W, BAR);
  }
}
