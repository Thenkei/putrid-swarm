// The orchard, the morning after a camera went dark: a cut-scene that is played.
//
// core/orchard.ts decides what every input does. This file frames it (one wide shot, three places,
// the sky while sawing), makes it heard, and puts the keys on screen. Nothing here changes the
// campaign except `settle`, once, at the very end.

import { PLATE, OVER, pointOnShot, shotTransform, type Cam, type Shot, type ShotLayer } from './shot-camera';
import { PauseMenu } from './pause';
import { bindPromptPointer, promptLayer } from './prompt-pointer';
import { endingId } from '../core/endings';
import { settleOrchard } from '../core/game';
import {
  NOTHING_HELD,
  ORCHARD,
  PLACES,
  infectionPace,
  isFate,
  press,
  promptsOf,
  startOrchard,
  tick,
  type Cue,
  type Ending,
  type Held,
  type Orchard,
  type Place,
  type Press,
  type Prompt,
  type PromptId,
  type Side,
} from '../core/orchard';
import type { GameState } from '../core/types';
import { STAGE_H, STAGE_W, type App, type Scene } from '../engine/app';
import { sprite } from '../engine/assets';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S, fmt, hours } from '../engine/i18n';
import { endingsTally, rememberEnding as remember } from '../engine/progress';
import { hush, say, type VoiceId } from '../engine/voice';
import { Atmosphere, drawArm } from './atmosphere';
import { calmMotion } from '../render/lighting';
import { goDay, goEnd, goTitle } from './flow';

// ───────────────────────────── Framing ─────────────────────────────

/** Cinema bars, top and bottom. */
const BAR = 54;
const CX = STAGE_W / 2;
const CY = STAGE_H / 2;

const WIDE: Shot = { plate: 'plate_orchard', focusY: 0.45 };
const CANOPY: Shot = { plate: 'plate_orchard_canopy', focusY: 0.5 };
const SHOT: Readonly<Record<Place, Shot>> = {
  tree: { plate: 'plate_orchard_tree', focusY: 0.8 },
  pole: { plate: 'plate_orchard_pole', focusY: 0.7 },
  fence: { plate: 'plate_orchard_fence', focusY: 0 },
};

interface Point {
  readonly x: number;
  readonly y: number;
}

/** A point of a plate, given as fractions of the picture, in stage units for that shot. */
const at = (shot: Shot, fx: number, fy: number): Point => ({ x: fx * PLATE.w, y: fy * PLATE.h - OVER * shot.focusY });

/** Where things stand in the pictures. */
const SPOT = {
  /** The rabbit in the wide shot, to walk toward. */
  far: at(WIDE, 0.535, 0.5),
  /** Its feet on the flattened grass. */
  rabbit: at(SHOT.pole, 0.44, 0.71),
  /** The contact point on the original pole illustration, in stage units. */
  splice: { x: 893, y: 515 - OVER * SHOT.pole.focusY },
  /** The foot of the saw, between the roots. */
  saw: at(SHOT.tree, 0.555, 0.845),
  /** The bent nail the rope hangs on. */
  nail: at(SHOT.fence, 0.538, 0.1),
} as const;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number): number => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

// ───────────────────────────── Keys and prompts ─────────────────────────────

type KeyName = 'up' | 'down' | 'left' | 'right' | 'space';
type How = 'hold' | 'mash' | 'alternate' | 'both' | 'now';

interface PromptSpec {
  readonly keys: readonly KeyName[];
  readonly how?: How;
  /** What holding the prompt with the pointer holds down. */
  readonly hold?: keyof Held;
  /** What clicking it presses. */
  readonly tap?: Press;
  readonly at: Point;
  readonly big?: boolean;
}

const SPEC: Readonly<Record<PromptId, PromptSpec>> = {
  walk_in: { keys: ['up'], how: 'hold', hold: 'forward', at: { x: 640, y: 604 } },
  approach: { keys: ['up'], how: 'hold', hold: 'forward', at: { x: 560, y: 268 } },
  clap: { keys: ['left', 'right'], how: 'both', tap: 'clap', at: { x: 936, y: 452 } },
  go_left: { keys: ['left'], how: 'hold', hold: 'left', at: { x: 132, y: 300 } },
  go_right: { keys: ['right'], how: 'hold', hold: 'right', at: { x: 1148, y: 300 } },
  look_saw: { keys: ['space'], tap: 'act', at: { x: 840, y: 420 } },
  take_saw: { keys: ['space'], tap: 'act', at: { x: 840, y: 420 } },
  look_rope: { keys: ['space'], tap: 'act', at: { x: 880, y: 236 } },
  take_rope: { keys: ['space'], tap: 'act', at: { x: 880, y: 236 } },
  guard: { keys: ['space'], how: 'now', tap: 'act', at: { x: 640, y: 318 }, big: true },
  tug: { keys: ['space'], how: 'mash', tap: 'act', at: { x: 842, y: 404 }, big: true },
  tie: { keys: ['space'], how: 'hold', hold: 'act', at: { x: 640, y: 604 } },
  kneel: { keys: ['down'], tap: 'down', at: { x: 930, y: 604 } },
  saw: { keys: ['left', 'right'], how: 'alternate', at: { x: 640, y: 596 }, big: true },
  stand: { keys: ['up'], tap: 'up', at: { x: 1010, y: 604 } },
  splice: { keys: ['space'], how: 'hold', hold: 'act', at: { x: 900, y: 318 } },
};

/** Physical keys, so the same fingers work on AZERTY and QWERTY. */
const KEY_OF: Readonly<Record<string, keyof Held | 'down'>> = {
  ArrowUp: 'forward',
  KeyW: 'forward',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'act',
  Enter: 'act',
  KeyE: 'act',
};

// ───────────────────────────── Timings of what the reducer does not time ─────────────────────────────

const INTRO_SECONDS = 2.6;
const BOLT_SECONDS = 0.85;
const CLAP_READY = 0.19;
const CLAP_CONTACT = 0.30;
const CLAP_SECONDS = 0.76;
const TAKE_SECONDS = 0.5;
const FLING_SECONDS = 0.7;
const OUTRO: Readonly<Record<Ending, number>> = { spared: 2.8, maimed: 5.4, throat: 2.4, turned: 3.2, bled: 2.2 };
/** The orchard's endings are counted with every other in the game (core/endings.ts). */
const rememberEnding = (ending: Ending): boolean => remember(endingId('orchard', ending));

/** A vein: a crooked line from the bite, toward the hand (`up`) or the elbow, in fractions of the arm sprite. */
interface Vein {
  readonly points: readonly Point[];
}

function growVeins(): Vein[] {
  // A fixed little generator: the same arm every time, no dependence on the campaign's RNG.
  let seed = 0x5eed1e;
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const veins: Vein[] = [];
  for (let v = 0; v < 9; v++) {
    const up = v % 3 === 0;
    let x = 0.5 + (rnd() - 0.5) * 0.2;
    let y = 0.53;
    const points: Point[] = [{ x, y }];
    const steps = up ? 12 : 14;
    for (let i = 0; i < steps; i++) {
      x = clamp(x + (rnd() - 0.5) * 0.16, 0.14, 0.86);
      y += (up ? -0.5 : 0.46) / steps;
      points.push({ x, y });
    }
    veins.push({ points });
  }
  return veins;
}

type Phase = 'intro' | 'play' | 'outro' | 'card';

export class OrchardScene implements Scene {
  private orchard: Orchard = startOrchard();
  private phase: Phase = 'intro';
  private time = 0;
  private phaseTime = 0;
  private paused = false;
  private left = false;

  private readonly keys = new Set<string>();
  private pointerHold: keyof Held | null = null;

  private readonly cam: Cam = { zoom: 1.04, x: CX, y: CY };
  /** 0 on the ground, 1 looking up through the branches. */
  private canopy = 0;
  private stride = 0;
  private walking = false;
  private shake = 0;
  private white = 0;
  private red = 0;
  private pulse = 0;
  /** Seconds since the player started the clap. The rabbit bolts at palm contact. */
  private clap: number | null = null;
  private fling: number | null = null;
  private armUp = 0;
  private kick = 0;
  private sawSide: Side | null = null;
  private sawSwing = 0;
  private spliced = false;

  private nextChew = 1.2;
  private chewing = 0;
  private nextBeat = 0;
  private coaxed = false;
  private greeted = false;
  private workSound: 'tie' | 'splice' | null = null;
  private nextWorkStroke = 0;
  private ending: Ending | null = null;

  /** Mist, leaves and dust in the dawn light, and whatever gets thrown about. */
  private readonly atmo = new Atmosphere({ mist: 6, leaves: 12, motes: 28 });
  /** The right hand, when it comes into view: where its fingers are going and how far it has got. */
  private hand: { tip: Point; lean: number } = { tip: { x: 820, y: 640 }, lean: -0.42 };
  private handReach = 0;
  private take: { what: 'saw' | 'rope'; t: number } | null = null;
  private twitch = 0;
  private nextBreath = 1.5;

  private readonly queue: { at: number; run: () => void }[] = [];
  private readonly veins = growVeins();
  private readonly armCanvas = document.createElement('canvas');

  private root!: HTMLElement;
  private titleEl!: HTMLElement;
  private promptsEl!: HTMLElement;
  private meterEl!: HTMLElement;
  private meterFill!: HTMLElement;
  private meterTag!: HTMLElement;
  private noteEl!: HTMLElement;
  private overlay!: HTMLElement;
  private pauseMenu!: PauseMenu;
  private promptSignature = '';
  private readonly promptEls = new Map<PromptId, HTMLElement>();

  constructor(private readonly app: App) {}

  private get state(): GameState {
    if (!this.app.state) throw new Error('OrchardScene needs a running game');
    return this.app.state;
  }

  enter(): void {
    audio.setAmbience('day');
    audio.setMusic('orchard');
    const s = S();
    this.titleEl = el('div', { class: 'orchard-title' }, [el('h1', { text: s.orchard.title }), el('p', { text: fmt(s.orchard.when, { n: this.state.day + 1 }) })]);
    this.promptsEl = promptLayer(() => { this.pointerHold = null; });
    this.meterFill = el('i');
    this.meterTag = el('b', { text: s.orchard.tourniquet });
    this.meterEl = el('div', { class: 'orchard-meter' }, [el('span', { text: s.orchard.infection }), el('span', { class: 'bar' }, [this.meterFill]), this.meterTag]);
    this.noteEl = el('div', { class: 'orchard-note' });
    this.overlay = el('div');
    const pauseOverlay = el('div');
    this.pauseMenu = new PauseMenu(pauseOverlay);
    this.root = el('div', { class: 'orchard' }, [this.titleEl, this.promptsEl, this.meterEl, this.noteEl, this.overlay, pauseOverlay]);
    this.app.ui.append(this.root);
    this.after(0.9, () => say('vo_orchard_arrive'));
  }

  exit(): void {
    this.left = true;
    hush();
    this.stopWorkSound();
  }

  // ───────────────────────────── Small machinery ─────────────────────────────

  /** Runs something later on the scene's own clock, so a pause holds it and leaving drops it. */
  private after(seconds: number, run: () => void): void {
    this.queue.push({ at: this.time + seconds, run });
  }

  private line(id: VoiceId, interrupt = false): void {
    say(id, { interrupt });
  }

  private stopWorkSound(): void {
    if (this.workSound) audio.fadeOut(this.workSound, .08);
    this.workSound = null;
  }

  private held(): Held {
    const down = (name: keyof Held): boolean => this.pointerHold === name || [...this.keys].some((code) => KEY_OF[code] === name);
    return { forward: down('forward'), left: down('left'), right: down('right'), act: down('act') };
  }

  private apply(turn: { orchard: Orchard; cues: readonly Cue[] }): void {
    this.orchard = turn.orchard;
    for (const cue of turn.cues) this.onCue(cue);
  }

  private send(key: Press): void {
    if (this.phase !== 'play' || this.paused) return;
    this.apply(press(this.orchard, key));
  }

  // ───────────────────────────── What happens, made seen and heard ─────────────────────────────

  private onCue(cue: Cue): void {
    switch (cue.type) {
      case 'arrived':
        if (cue.place === 'pole' && this.orchard.beat === 'watch' && !this.greeted) {
          this.greeted = true;
          this.line('vo_orchard_see', true);
        }
        break;
      case 'looked':
        this.line(cue.at === 'saw' ? 'vo_orchard_saw' : 'vo_orchard_rope');
        break;
      case 'clapped':
        this.line('vo_orchard_clap', true);
        this.clap = 0;
        this.after(CLAP_CONTACT, () => {
          audio.play('clap');
          this.shake = 6;
          this.atmo.gust(1.4);
        });
        this.after(CLAP_CONTACT + 0.08, () => audio.play('rabbit_bolt'));
        this.after(1.9, () => this.line('vo_orchard_clapped'));
        break;
      case 'turned':
        hush();
        audio.setMusic('none');
        // The sting lands on the face, not on the turn of the head: for a moment it is still a rabbit.
        this.after(0.92, () => {
          audio.play('rabbit_sting');
          this.red = 0.7;
          this.shake = 10;
        });
        this.after(1.08, () => this.line('vo_orchard_reveal', true));
        break;
      case 'lunge':
        audio.play('rabbit_screech');
        break;
      case 'guarded':
        hush();
        audio.play('bite');
        this.after(0.08, () => audio.play('scream'));
        audio.setMusic('panic');
        this.shake = 22;
        this.white = 0.9;
        this.armUp = 0;
        this.nextBeat = this.time + 0.3;
        this.atmo.spray(300, 430, 16, '#7a1408', { angle: -0.9, spread: 1.6, speed: 520, size: 4 });
        break;
      case 'tug':
        audio.play('yank');
        this.shake = Math.max(this.shake, 9);
        this.kick = 1;
        this.atmo.spray(300, 440, 5, '#7a1408', { angle: -1.1, spread: 1.4, speed: 380, size: 3.2 });
        break;
      case 'torn':
        audio.play('fling');
        this.shake = 16;
        this.fling = 0;
        this.armUp = 0;
        this.atmo.spray(330, 430, 14, '#7a1408', { angle: -0.5, spread: 1.2, speed: 600, size: 3.6 });
        this.atmo.spray(330, 430, 10, '#efe6d2', { angle: -0.6, spread: 1.6, speed: 420, size: 2.6, gravity: 500, life: 1.1 });
        this.after(0.8, () => this.line('vo_orchard_infected', true));
        break;
      case 'took':
        audio.play(cue.what === 'rope' ? 'rope_take' : 'saw_take');
        this.take = { what: cue.what, t: 0 };
        // Said once, and only if it still applies: the saw alone is how this ends badly.
        if (cue.what === 'saw' && !this.orchard.tied) this.after(0.35, () => !this.orchard.tied && this.orchard.beat === 'loose' && this.line('vo_orchard_no_tie', true));
        break;
      case 'tied':
        this.white = 0.25;
        this.shake = 6;
        this.line('vo_orchard_tied', true);
        break;
      case 'knelt':
        this.line('vo_orchard_kneel', true);
        break;
      case 'stood':
        break;
      case 'stroke':
        audio.play('saw');
        if (cue.left % 3 === 1) audio.play('pain');
        this.shake = Math.max(this.shake, 12);
        this.red = Math.max(this.red, 0.55);
        this.sawSide = cue.side;
        this.sawSwing = 1;
        // Every stroke shakes the tree he is leaning on.
        this.atmo.gust(0.5);
        break;
      case 'severed':
        hush();
        audio.setMusic('none');
        audio.play('scream');
        this.shake = 30;
        this.white = 1;
        this.atmo.gust(2);
        if (!cue.tied) {
          this.nextBeat = this.time + 0.4;
          this.after(3.4, () => audio.play('body_fall'));
        }
        break;
      case 'spliced':
        this.spliced = true;
        this.line('vo_orchard_mended', true);
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
    this.stopWorkSound();
    rememberEnding(ending);
    switch (ending) {
      case 'spared':
        break;
      case 'maimed':
        this.after(0.7, () => audio.play('body_fall'));
        this.after(1.5, () => this.line('vo_orchard_cut', true));
        break;
      case 'throat':
        hush();
        audio.setMusic('none');
        audio.play('bite');
        this.after(0.1, () => audio.play('scream'));
        this.after(1.0, () => audio.play('body_fall'));
        this.red = 1;
        this.shake = 34;
        break;
      case 'turned':
        hush();
        audio.setMusic('none');
        audio.play('groan');
        this.after(1.3, () => audio.play('body_fall'));
        break;
      case 'bled':
        audio.setMusic('none');
        break;
    }
  }

  /** Writes the outcome into the campaign and leaves. */
  private settle(): void {
    if (this.left || !this.ending) return;
    this.left = true;
    const result = settleOrchard(this.state, this.ending);
    if (!result.ok) {
      console.error('[orchard] could not settle the morning', result.error);
      goTitle(this.app);
      return;
    }
    this.app.state = result.value;
    this.app.save();
    if (result.value.phase === 'lost') goEnd(this.app);
    else goDay(this.app);
  }

  private showCard(): void {
    const ending = this.ending;
    if (ending !== 'spared' && ending !== 'maimed') return;
    this.phase = 'card';
    this.phaseTime = 0;
    audio.setMusic('morning');
    const s = S();
    const text = s.orchard.ending[ending];
    const seen = endingsTally('orchard');
    const cost = ending === 'maimed' ? fmt(text.cost, { faint: hours(ORCHARD.faintHours + ORCHARD.dressingHours), dressing: hours(ORCHARD.dressingHours) }) : text.cost;
    const card = el('div', { class: `card orchard-card ${ending}` }, [
      el('h2', { text: text.title }),
      el('p', { text: text.text }),
      el(
        'ol',
        { class: 'trail' },
        this.orchard.trail.map((step) => el('li', { text: s.orchard.step[step] })),
      ),
      el('p', { class: `cost ${ending === 'maimed' ? 'bad' : 'good'}`, text: cost }),
      // His last word on it is on the card itself, so it is not laid over the button as a subtitle.
      ending === 'maimed' ? el('p', { class: 'quote', text: `« ${s.voice.vo_orchard_one_arm} »` }) : null,
      el('div', { class: 'actions' }, [
        el('span', { class: 'paths', text: fmt(s.orchard.paths, { n: seen.seen, total: seen.total }) }),
        el('button', { class: 'btn btn-primary', text: fmt(s.orchard.next, { n: this.state.day + 1 }), onClick: () => this.settle() }),
      ]),
    ]);
    this.overlay.replaceChildren(el('div', { class: 'modal orchard-modal' }, [card]));
    if (ending === 'maimed') this.after(0.8, () => say('vo_orchard_one_arm', { subtitle: false }));
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
    if (this.phase === 'intro') {
      // Any of the scene's keys cuts the title short, once it has been readable.
      if (this.phaseTime > 0.8) this.phaseTime = INTRO_SECONDS;
    }
    const other = name === 'left' ? 'right' : name === 'right' ? 'left' : null;
    const bothHands = other !== null && this.held()[other] && this.orchard.beat === 'watch';
    this.keys.add(code);
    if (bothHands) this.send('clap');
    else if (name === 'act') this.send('act');
    else if (name === 'left' || name === 'right') this.send(name);
    else if (name === 'forward') this.send('up');
    else this.send('down');
  }

  onKeyUp(code: string): void {
    this.keys.delete(code);
  }

  onBlur(): void {
    this.keys.clear();
    this.pointerHold = null;
    if (!this.paused) this.togglePause(true);
  }

  private promptDown(id: PromptId): void {
    const spec = SPEC[id];
    if (spec.hold) this.pointerHold = spec.hold;
    else if (id === 'saw') this.send(this.orchard.lastStroke === 'left' ? 'right' : 'left');
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
    this.stopWorkSound();
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
    this.pulse = Math.max(0, this.pulse - dt * 3.2);
    this.kick = Math.max(0, this.kick - dt * 7);
    this.sawSwing = Math.max(0, this.sawSwing - dt * 6);
    this.chewing = Math.max(0, this.chewing - dt);
    if (this.clap !== null) this.clap += dt;
    if (this.fling !== null) this.fling += dt;
    if (this.take && (this.take.t += dt) >= TAKE_SECONDS) this.take = null;
    this.twitch = Math.max(0, this.twitch - dt);
    this.atmo.update(dt);
    // Cold morning: every breath shows, and they come faster once there is something to fear.
    if (this.phase !== 'card' && this.time >= this.nextBreath) {
      const o = this.orchard;
      const afraid = o.infection > 0 || o.beat === 'reveal' || o.beat === 'guard' || o.beat === 'clamped';
      this.nextBreath = this.time + (afraid ? 1.1 : 3.3);
      if (this.canopy < 0.5 && this.ending === null) this.atmo.puff(CX + 30, STAGE_H - 96, afraid ? 74 : 60, 'rgba(236, 240, 244, 0.5)', 14, -34);
    }
    this.armUp = Math.min(1, this.armUp + dt * 2.6);

    if (this.phase === 'intro' && this.phaseTime >= INTRO_SECONDS) {
      this.phase = 'play';
      this.phaseTime = 0;
    }
    if (this.phase === 'play') this.play(dt);
    if (this.phase === 'outro' && this.ending && this.phaseTime >= OUTRO[this.ending]) {
      if (isFate(this.ending)) this.settle();
      else this.showCard();
    }

    const up = this.orchard.beat === 'sawing' || this.orchard.beat === 'bleeding' || (this.phase === 'outro' && (this.ending === 'maimed' || this.ending === 'bled')) ? 1 : 0;
    this.canopy = clamp01(this.canopy + (up ? dt : -dt) * 2.4);
    this.follow(dt);
    this.reach(dt);
    this.syncHud();
  }

  private play(dt: number): void {
    const held = this.clap !== null && this.clap < CLAP_SECONDS ? NOTHING_HELD : this.held();
    const before = this.orchard;
    this.apply(tick(before, dt, held));
    const o = this.orchard;
    if (this.phase !== 'play') return;

    // Feet: whatever is held and actually gets somewhere.
    const moving =
      (o.beat === 'arrive' && held.forward) ||
      (o.beat === 'watch' && o.hold > before.hold) ||
      (o.heading !== null && o.walk > before.walk) ||
      (o.place !== before.place && before.heading !== null);
    this.walking = moving;
    if (moving) {
      const pace = o.infection > 0 ? 2.9 : 2.2;
      const stepsBefore = Math.floor(this.stride);
      this.stride += dt * pace;
      if (Math.floor(this.stride) !== stepsBefore) audio.play('step_grass', o.beat === 'watch' && o.hold > 0 ? 0.55 : 1);
    }

    // The rabbit at work, heard from the pole.
    if (o.beat === 'watch' && o.clapWait === ORCHARD.clapWaitSeconds && before.clapWait !== o.clapWait) {
      this.chewing = 0;
      this.twitch = .72;
      this.nextChew = this.time + .88;
      audio.fadeOut('chew', .07);
    }
    if (o.beat === 'watch' && o.place === 'pole' && o.hold < 0.75 && this.twitch <= 0 && this.time >= this.nextChew) {
      this.nextChew = this.time + 2.1 + Math.random() * 1.6;
      this.chewing = 0.9;
      audio.play('chew', 0.6 + o.hold * 0.5);
    }
    if (o.beat === 'watch' && this.chewing <= 0 && this.twitch <= 0 && Math.random() < dt * 0.35) this.twitch = 0.32;
    if (o.beat === 'watch' && o.hold > 0.3 && !this.coaxed) {
      this.coaxed = true;
      this.line('vo_orchard_approach', true);
    }

    // The knot and the splice are heard for as long as they are held.
    const working = held.act && o.hold > before.hold && (o.beat === 'loose' || o.beat === 'mend');
    if (working) {
      const sound = o.beat === 'loose' ? 'tie' : 'splice';
      if (this.workSound !== sound || this.time >= this.nextWorkStroke) {
        audio.play(sound);
        this.workSound = sound;
        this.nextWorkStroke = this.time + (sound === 'tie' ? 1.9 : .55);
      }
    } else this.stopWorkSound();

    // A heart that goes faster as it climbs, and slower as it empties.
    const beating = infectionPace(o) > 0 || o.beat === 'bleeding';
    if (beating && this.time >= this.nextBeat) {
      const gap = o.beat === 'bleeding' ? 0.55 + o.clock * 0.28 : lerp(0.92, 0.36, o.infection);
      this.nextBeat = this.time + gap;
      this.pulse = 1;
      audio.play('heartbeat', o.beat === 'bleeding' ? clamp01(1.1 - o.clock / ORCHARD.bleedSeconds) : 0.7 + o.infection * 0.5);
    }
  }

  /** Where a point of the current shot lands on screen, through the camera. */
  private onScreen(point: Point): Point {
    const shots = this.groundShots();
    const active = shots.find(layer => layer.place === this.orchard.place) ?? shots[0]!;
    return pointOnShot(active.shot, active.cam, point);
  }

  /** The right hand comes into view whenever it is doing something, and goes back out the way it came. */
  private reach(dt: number): void {
    const o = this.orchard;
    let wanted: { tip: Point; lean: number } | null = null;
    if (this.take) {
      // Out to the thing and back, in one movement.
      const target = this.onScreen(this.take.what === 'saw' ? { x: SPOT.saw.x - 70, y: SPOT.saw.y - 170 } : { x: SPOT.nail.x - 6, y: SPOT.nail.y + 150 });
      this.hand = { tip: target, lean: this.take.what === 'saw' ? -0.5 : -0.2 };
      this.handReach = Math.sin(Math.min(1, this.take.t / TAKE_SECONDS) * Math.PI);
      return;
    }
    if (o.place === 'pole' && o.heading === null && ((o.beat === 'watch' && o.hold > 0.04) || (o.beat === 'reveal' && o.clock < 0.92))) {
      // Held out to it, palm down, the way one does with something small and frightened.
      const rabbit = this.onScreen({ x: SPOT.rabbit.x, y: SPOT.rabbit.y - 120 });
      const h = smooth(o.hold);
      wanted = { tip: { x: lerp(860, rabbit.x + 150, h), y: lerp(600, rabbit.y + 150, h) }, lean: -0.46 };
    } else if (o.beat === 'loose' && o.hold > 0 && o.rope && !o.tied) {
      // Across to the other arm, pulling the rope tight.
      wanted = { tip: { x: 452 + Math.sin(this.time * 22) * 5, y: 548 - o.hold * 26 }, lean: -1.2 };
    } else if (o.beat === 'mend' && o.hold > 0) {
      // Gather the loose ends, tack the first turn towards the left sleeve, then wind to the right.
      const h = o.hold;
      const offset = -47 * (1 - smooth(h / .33)) - 64 * smooth((h - .35) / .23) + 121 * smooth((h - .58) / .36);
      const turn = Math.sin(smooth((h - .35) / .6) * Math.PI * 8);
      const tip = this.onScreen({ x: SPOT.splice.x + offset, y: SPOT.splice.y + offset * .29 + turn * 3 });
      wanted = { tip, lean: -.55 + turn * .065 };
    }
    if (wanted) this.hand = wanted;
    // Slow out, quick back: a hand is snatched away faster than it is offered.
    const k = 1 - Math.exp(-dt * (wanted ? 9 : 16));
    this.handReach = lerp(this.handReach, wanted ? 1 : 0, k);
    if (this.handReach < 0.004) this.handReach = 0;
  }

  /** The camera eases toward where the moment wants it. */
  private follow(dt: number): void {
    const o = this.orchard;
    const target: Cam = { zoom: 1.05, x: CX + Math.sin(this.time * 0.5) * 7, y: CY + Math.cos(this.time * 0.37) * 4 };
    if (o.place === 'pole' && o.heading === null) {
      if (o.beat === 'watch' && o.hold > 0) {
        const h = smooth(o.hold);
        target.zoom = 1.05 + 0.5 * h;
        target.x = lerp(target.x, SPOT.rabbit.x, h);
        target.y = lerp(target.y, SPOT.rabbit.y - 70, h);
      } else if (o.beat === 'reveal' || o.beat === 'guard') {
        target.zoom = o.beat === 'guard' ? 1.72 : o.clock > 0.62 ? 1.68 : 1.55;
        target.x = SPOT.rabbit.x;
        target.y = SPOT.rabbit.y - 80;
      } else if (o.beat === 'mend' || (this.spliced && this.phase === 'outro')) {
        // Settle in before the first wrap, then leave time to see the finished joint.
        const h = this.spliced ? 1 - smooth((this.phaseTime - .95) / 1.55) : smooth(o.hold / .55);
        target.zoom = 1.05 + .69 * h;
        target.x = lerp(target.x, SPOT.splice.x, h);
        target.y = lerp(target.y, SPOT.splice.y - 16, h);
      }
    }
    const k = 1 - Math.exp(-dt * (o.beat === 'reveal' || o.beat === 'guard' ? 9 : 5));
    this.cam.zoom = lerp(this.cam.zoom, target.zoom, k);
    this.cam.x = lerp(this.cam.x, target.x, k);
    this.cam.y = lerp(this.cam.y, target.y, k);
  }

  // ───────────────────────────── HUD ─────────────────────────────

  private syncHud(): void {
    const s = S();
    const o = this.orchard;

    const titleOn = this.phase === 'intro' && this.phaseTime > 0.3 && this.phaseTime < INTRO_SECONDS - 0.5;
    this.titleEl.classList.toggle('on', titleOn);

    const handsFree = this.clap === null || this.clap >= CLAP_SECONDS;
    const prompts = this.phase === 'play' && !this.paused && handsFree ? promptsOf(o) : [];
    const signature = prompts.map((p) => `${p.id}:${p.to ?? ''}`).join('|');
    if (signature !== this.promptSignature) {
      this.promptSignature = signature;
      this.promptEls.clear();
      this.promptsEl.replaceChildren(...prompts.map((prompt) => this.buildPrompt(prompt)));
    }
    const held = this.held();
    for (const prompt of prompts) {
      const node = this.promptEls.get(prompt.id);
      if (!node) continue;
      node.style.setProperty('--p', String(clamp01(prompt.progress ?? 0)));
      const spec = SPEC[prompt.id];
      node.classList.toggle('held', spec.hold !== undefined && held[spec.hold]);
      if (prompt.id === 'saw') {
        node.classList.toggle('next-left', o.lastStroke !== 'left');
        node.classList.toggle('next-right', o.lastStroke === 'left');
      }
    }

    const bitten = o.infection > 0 || o.beat === 'clamped';
    const meterOn = bitten && this.phase === 'play' && (o.beat === 'clamped' || o.beat === 'loose' || o.beat === 'sawing');
    this.meterEl.classList.toggle('on', meterOn);
    this.meterEl.classList.toggle('tied', o.tied);
    this.meterEl.classList.toggle('high', o.infection > 0.7);
    this.meterFill.style.width = `${o.infection * 100}%`;

    const note = o.beat === 'bleeding' && this.phase === 'play' ? s.orchard.bleeding : this.phase === 'outro' && this.ending === 'maimed' && this.phaseTime > 3 ? s.orchard.later : '';
    if (this.noteEl.textContent !== note) this.noteEl.textContent = note;
    this.noteEl.classList.toggle('on', note !== '');
  }

  private buildPrompt(prompt: Prompt): HTMLElement {
    const s = S();
    const spec = SPEC[prompt.id];
    const label = prompt.id === 'go_left' || prompt.id === 'go_right' ? fmt(s.orchard.prompt.go, { place: prompt.to ? s.orchard.place[prompt.to] : '' }) : s.orchard.prompt[prompt.id];
    const keys = spec.keys.map((key) => el('kbd', { class: `key-${key}`, text: s.orchard.key[key] }));
    const node = el(
      'button',
      {
        class: `qte qte-${prompt.id}${spec.how ? ` how-${spec.how}` : ''}${spec.big ? ' big' : ''}`,
        style: { left: `${spec.at.x}px`, top: `${spec.at.y}px` },
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

  /** Draws a plate through a camera, then whatever stands in it, in the same space. */
  private drawShot(ctx: CanvasRenderingContext2D, shot: Shot, cam: Cam, alpha: number, props?: () => void): void {
    if (alpha <= 0) return;
    const top = -OVER * shot.focusY;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.transform(...shotTransform(shot, cam));
    const art = sprite(shot.plate);
    if (art) ctx.drawImage(art.img, 0, top, PLATE.w, PLATE.h);
    else {
      ctx.fillStyle = '#2b3220';
      ctx.fillRect(0, top, PLATE.w, PLATE.h);
    }
    props?.();
    ctx.restore();
  }

  private shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, alpha: number): void {
    ctx.save();
    ctx.fillStyle = `rgba(24, 22, 10, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private propsOf(place: Place): () => void {
    return () => {
      const ctx = this.app.ctx;
      const o = this.orchard;
      const reaching = this.take && this.take.t < TAKE_SECONDS * 0.5 ? this.take.what : null;
      if (place === 'tree' && (!o.saw || reaching === 'saw')) {
        this.shadow(ctx, SPOT.saw.x - 34, SPOT.saw.y - 4, 74, 13, 0.4);
        // Propped against the root, where it has been since the last pruning.
        this.drawSprite(ctx, 'orchard_items_saw', SPOT.saw.x, SPOT.saw.y, 318, { ax: 0.14, ay: 0.975, flip: true, rot: -0.1 });
      }
      if (place === 'fence' && (!o.rope || reaching === 'rope')) {
        this.drawSprite(ctx, 'orchard_items_rope', SPOT.nail.x - 6, SPOT.nail.y - 4, 292, { ax: 0.42, ay: 0.03, rot: Math.sin(this.time * 0.9) * 0.012 });
      }
      if (place === 'pole') {
        if (this.spliced || (o.beat === 'mend' && o.hold > 0)) this.drawSplice(ctx, this.spliced ? 1 : o.hold);
        this.drawRabbit(ctx);
      }
    };
  }

  private drawRabbit(ctx: CanvasRenderingContext2D): void {
    const o = this.orchard;
    const { x, y } = SPOT.rabbit;
    if (this.clap !== null && this.clap >= CLAP_CONTACT) {
      const t = (this.clap - CLAP_CONTACT) / BOLT_SECONDS;
      if (t >= 1) return;
      // Three bounds into the mist, smaller each time.
      const hop = Math.abs(Math.sin(t * Math.PI * 3)) * 34 * (1 - t);
      this.shadow(ctx, x + 330 * t, y - 150 * t, 44 * (1 - t * 0.6), 8 * (1 - t * 0.6), 0.3 * (1 - t));
      this.drawSprite(ctx, 'orchard_rabbit_bolt', x + 330 * t, y - 150 * t - hop, lerp(150, 62, t), { alpha: 1 - t * t * t });
      return;
    }
    if (o.beat === 'arrive' || o.beat === 'watch' || (this.clap !== null && this.clap < CLAP_CONTACT)) {
      this.shadow(ctx, x, y - 3, 56, 11, 0.36);
      const chew = this.chewing > 0 ? Math.sin(this.time * 46) : 0;
      // Close up, it has stopped chewing. That should have been a warning.
      const still = o.hold > 0.75;
      if (still || this.twitch > 0) this.drawSprite(ctx, 'orchard_rabbit_more_ears', x, y, 172);
      else this.drawSprite(ctx, 'orchard_rabbit_back', x, y, 166 + chew * 1.6, { rot: chew * 0.012 });
      return;
    }
    if (o.beat === 'reveal') {
      this.shadow(ctx, x, y - 3, 56, 11, 0.36);
      const c = o.clock;
      // Ears up; the head comes round, and it is still a rabbit; then the rest of the face.
      if (c < 0.4) this.drawSprite(ctx, 'orchard_rabbit_more_ears', x, y, 172, { rot: Math.sin(this.time * 60) * 0.005 });
      else if (c < 0.82) this.drawSprite(ctx, 'orchard_rabbit_more_side', x + 6, y, 172 + smooth((c - 0.4) / 0.12) * 4);
      else if (c < 0.9) this.drawSprite(ctx, 'orchard_rabbit_more_side', x + 6, y, 176, { squash: Math.max(0.05, 1 - (c - 0.82) / 0.08) });
      else if (c < 1.3) {
        const tremble = Math.sin(this.time * 70) * 1.4;
        this.drawSprite(ctx, 'orchard_rabbit_infected', x + tremble, y, 182, { squash: Math.max(0.05, clamp01((c - 0.9) / 0.08)) });
      } else {
        // It gathers itself: lower, wider, shaking.
        const sink = smooth((c - 1.3) / 0.2);
        this.drawSprite(ctx, 'orchard_rabbit_more_snarl', x + Math.sin(this.time * 90) * 1.8, y + 2, lerp(150, 136, sink));
      }
    }
  }

  /** Each tile replaces only the working length of cable on the painted pole plate. */
  private drawSplice(ctx: CanvasRenderingContext2D, progress: number): void {
    const sheet = sprite('orchard_cable_repair');
    if (!sheet) return;
    const frame = Math.round(clamp01(progress) * 29);
    const w = sheet.w / 6;
    const h = sheet.h / 5;
    ctx.drawImage(sheet.img, (frame % 6) * w, Math.floor(frame / 6) * h, w, h, 740, 436 - OVER * SHOT.pole.focusY, w, h);
  }

  private groundShots(): ShotLayer<Place>[] {
    const o = this.orchard;
    const still = calmMotion();
    const bob = !still && this.walking ? Math.sin(this.stride * Math.PI) * 7 : 0;

    if (this.phase === 'intro' || o.beat === 'arrive') {
      // Out of the back door, toward the white dot at the foot of the pole.
      const w = smooth(o.walk);
      const zoom = 1.04 + this.time * 0.006 + w * 0.82;
      const cam: Cam = { zoom, x: lerp(CX, SPOT.far.x, w), y: lerp(CY, SPOT.far.y - 20, w) + bob };
      const arriving = clamp01((o.walk - 0.74) / 0.26);
      const shots: ShotLayer<Place>[] = [{ shot: WIDE, cam, alpha: 1 }];
      if (arriving > 0) shots.push({ shot: SHOT.pole, place: 'pole', cam: { zoom: 1.24 - 0.2 * arriving, x: CX, y: CY + bob }, alpha: arriving });
      return shots;
    }

    // A head is never level: it tips with each step, and it trembles once the arm has been bitten.
    const roll = still ? 0 : (this.walking ? Math.sin(this.stride * Math.PI) * 0.007 : 0) + (o.infection > 0 ? Math.sin(this.time * 9) * 0.0025 * (1 + o.infection * 2) : 0);
    // Zoomed in a little further when tilted, so the corners never show.
    const cam: Cam = { zoom: this.cam.zoom + Math.abs(roll) * 2.4, x: this.cam.x, y: this.cam.y + bob, roll };
    if (o.heading !== null && o.walk > 0) {
      // A few steps sideways: this place slides out, the next one comes in from where we are going.
      const direction = Math.sign(PLACES.indexOf(o.heading) - PLACES.indexOf(o.place));
      const e = smooth(o.walk);
      const incoming = clamp01((e - 0.4) / 0.45);
      return [
        { shot: SHOT[o.place], place: o.place, cam: { zoom: cam.zoom + 0.12 * e, x: cam.x + direction * e * 240, y: cam.y, roll }, alpha: 1 },
        { shot: SHOT[o.heading], place: o.heading, cam: { zoom: cam.zoom + 0.12 * (1 - e), x: CX - direction * (1 - e) * 240, y: CY + bob, roll }, alpha: incoming },
      ];
    }
    return [{ shot: SHOT[o.place], place: o.place, cam, alpha: 1 }];
  }

  private drawGround(ctx: CanvasRenderingContext2D): void {
    for (const layer of this.groundShots()) {
      const props = layer.place ? this.propsOf(layer.place) : undefined;
      this.drawShot(ctx, layer.shot, layer.cam, layer.alpha, props);
    }
  }

  /**
   * Grass and a branch between the eye and the picture. They slide further than the plate for the
   * same camera move, and sweep past when walking: that difference is what reads as depth.
   */
  private drawForeground(ctx: CanvasRenderingContext2D): void {
    const o = this.orchard;
    const alpha = 1 - this.canopy;
    if (alpha <= 0) return;
    const sway = Math.sin(this.time * 1.1) * 0.025 + Math.sin(this.time * 2.7) * 0.008;
    const bob = this.walking ? Math.sin(this.stride * Math.PI) * 12 : 0;
    const arriving = this.phase === 'intro' || o.beat === 'arrive';
    // Pushing in parts the grass; panning drags it the other way, faster than the ground behind.
    const push = arriving ? smooth(o.walk) * 420 : (this.cam.zoom - 1.05) * 520;
    const drag = arriving ? 0 : -(this.cam.x - CX) * 1.5;
    const sets: { shift: number; alpha: number }[] = [{ shift: 0, alpha }];
    if (!arriving && o.heading !== null && o.walk > 0) {
      const direction = Math.sign(PLACES.indexOf(o.heading) - PLACES.indexOf(o.place));
      const e = smooth(o.walk);
      sets[0] = { shift: -direction * e * 1500, alpha };
      sets.push({ shift: direction * (1 - e) * 1500, alpha });
    }
    for (const set of sets) {
      ctx.save();
      ctx.globalAlpha = set.alpha;
      this.drawSprite(ctx, 'orchard_fg_grass_a', 96 - push + drag + set.shift, STAGE_H + 84 + bob, 590, { rot: sway });
      this.drawSprite(ctx, 'orchard_fg_grass_b', 1196 + push + drag + set.shift, STAGE_H + 80 + bob, 560, { rot: -sway * 0.8 });
      this.drawSprite(ctx, 'orchard_fg_branch', 1072 + push * 0.5 + drag * 0.7 + set.shift, -34 + bob * 0.4, 268, { ay: 0, rot: sway * 0.8 });
      ctx.restore();
    }
  }

  /** Looking anywhere but down: the branches, swaying more with every stroke. */
  private drawCanopy(ctx: CanvasRenderingContext2D, alpha: number): void {
    if (calmMotion()) {
      this.drawShot(ctx, CANOPY, { zoom: 1.2, x: CX, y: CY }, alpha);
      return;
    }
    const o = this.orchard;
    const fall = o.beat === 'bleeding' ? clamp01(o.clock / ORCHARD.bleedSeconds) : this.ending === 'bled' ? 1 : 0;
    const sway = Math.sin(this.time * 1.3) * 0.02 + this.sawSwing * (this.sawSide === 'left' ? -0.02 : 0.02) + fall * 0.22;
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(sway);
    ctx.translate(-CX, -CY);
    this.drawShot(ctx, CANOPY, { zoom: 1.2 + fall * 0.35 + Math.sin(this.time * 0.8) * 0.01, x: CX + Math.sin(this.time * 0.9) * 14, y: CY + Math.cos(this.time * 0.7) * 10 }, alpha);
    ctx.restore();
  }

  /** The bitten arm with the infection drawn into it, clipped to the arm itself. */
  private armLayer(key: string, infection: number): HTMLCanvasElement | null {
    const art = sprite(key);
    if (!art) return null;
    const canvas = this.armCanvas;
    if (canvas.width !== art.w || canvas.height !== art.h) {
      canvas.width = art.w;
      canvas.height = art.h;
    }
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, art.w, art.h);
    g.drawImage(art.img, 0, 0);
    if (infection <= 0) return canvas;
    g.globalCompositeOperation = 'source-atop';
    const bite = art.h * 0.53;
    const down = bite + infection * (art.h - bite);
    const up = bite - infection * bite * 0.92;
    // The stain: darkest at the teeth marks, feathered at both fronts.
    const stain = g.createLinearGradient(0, up - 46, 0, down + 46);
    const span = down - up + 92;
    stain.addColorStop(0, 'rgba(22, 36, 20, 0)');
    stain.addColorStop(46 / span, 'rgba(22, 36, 20, 0.5)');
    stain.addColorStop(clamp01((bite - up + 46) / span), 'rgba(14, 24, 14, 0.78)');
    stain.addColorStop(1 - 46 / span, 'rgba(22, 36, 20, 0.55)');
    stain.addColorStop(1, 'rgba(22, 36, 20, 0)');
    g.fillStyle = stain;
    g.fillRect(0, up - 46, art.w, span);
    // The veins run ahead of it.
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const vein of this.veins) {
      const reach = infection * 1.12;
      g.beginPath();
      let drawn = 0;
      vein.points.forEach((point, i) => {
        const progress = Math.abs(point.y - 0.53) / 0.5;
        if (progress > reach) return;
        if (i === 0 || drawn === 0) g.moveTo(point.x * art.w, point.y * art.h);
        else g.lineTo(point.x * art.w, point.y * art.h);
        drawn++;
      });
      if (drawn < 2) continue;
      g.strokeStyle = 'rgba(12, 22, 12, 0.85)';
      g.lineWidth = 4.2;
      g.stroke();
      g.strokeStyle = 'rgba(124, 158, 72, 0.5)';
      g.lineWidth = 1.3;
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    return canvas;
  }

  /** What the player sees of himself: the arm, the rabbit on it, the saw. */
  private drawBody(ctx: CanvasRenderingContext2D): void {
    const o = this.orchard;
    const still = calmMotion();
    const jitter = (amount: number): number => still ? 0 : (Math.random() * 2 - 1) * amount;

    if (o.beat === 'guard' || this.ending === 'throat') {
      // Straight at the eyes, teeth first.
      const t = this.ending === 'throat' ? 1 + this.phaseTime * 2.2 : o.clock / ORCHARD.guardSeconds;
      const from = this.onScreen({ x: SPOT.rabbit.x, y: SPOT.rabbit.y - 70 });
      if (still) {
        // Leave the guard prompt unobstructed. The change of pose signals the attack.
        this.drawSprite(ctx, 'orchard_rabbit_more_leap', from.x, from.y - 36, 275, { ay: 0.5 });
        return;
      }
      const off = 0.26;
      if (t < off) {
        // Off the ground: small, still over there.
        const rise = smooth(t / off);
        this.drawSprite(ctx, 'orchard_rabbit_more_leap', from.x, from.y - rise * 70, lerp(210, 290, rise), { ay: 0.5 });
        return;
      }
      const e = Math.pow(clamp01((t - off) / (1 - off)), 2.1) + Math.max(0, t - 1);
      // Everything else streaks past: there is only the mouth.
      ctx.save();
      ctx.globalAlpha = clamp01(e * 1.4) * 0.5;
      ctx.strokeStyle = '#fff6e0';
      ctx.lineWidth = 3;
      for (let i = 0; i < 18; i++) {
        const angle = (i / 18) * Math.PI * 2 + this.time * 0.7;
        const inner = 260 + ((i * 53) % 90) + e * 120;
        ctx.beginPath();
        ctx.moveTo(CX + Math.cos(angle) * inner, CY + Math.sin(angle) * inner * 0.6);
        ctx.lineTo(CX + Math.cos(angle) * (inner + 140 + e * 260), CY + Math.sin(angle) * (inner + 140 + e * 260) * 0.6);
        ctx.stroke();
      }
      ctx.restore();
      this.drawSprite(ctx, 'orchard_rabbit_lunge', lerp(from.x, CX, clamp01(e)), lerp(from.y - 70, CY + 30, clamp01(e)), lerp(300, 1250, e), { ay: 0.5, rot: Math.sin(this.time * 31) * 0.03 });
      return;
    }

    if (o.beat === 'clamped') {
      const rise = 1 - smooth(this.armUp * 2.4);
      this.drawSprite(ctx, 'orchard_arm_guard', -34 + jitter(this.shake * 0.5), STAGE_H + 92 + rise * 300 + jitter(this.shake * 0.5), 810, {
        ax: 0,
        ay: 1,
        rot: still ? 0 : -this.kick * 0.07 + Math.sin(this.time * 37) * 0.008,
      });
      return;
    }

    if (this.fling !== null && this.fling < FLING_SECONDS) {
      // Torn off and thrown: the arm goes down, the rabbit goes over the grass.
      const t = this.fling / FLING_SECONDS;
      this.drawSprite(ctx, 'orchard_arm_guard', -34 - t * 220, STAGE_H + 92 + t * t * 520, 810, { ax: 0, ay: 1, rot: -t * 0.5 });
      this.drawSprite(ctx, 'orchard_rabbit_bolt', lerp(330, 1180, t), lerp(430, 300, t) - Math.sin(t * Math.PI) * 190, lerp(330, 90, t), { ay: 0.5, rot: t * 7, alpha: 1 - t * t });
    }

    if (o.beat === 'loose' || (o.beat === 'sawing' && this.canopy < 1) || this.ending === 'turned') {
      const rise = smooth(this.fling === null ? 1 : (this.fling - 0.35) / 0.5);
      const layer = this.armLayer(o.tied ? 'orchard_arm_tied' : 'orchard_arm_bitten', o.infection);
      if (layer && rise > 0) {
        const height = 610;
        const width = (layer.width / layer.height) * height;
        const tremble = 0.6 + o.infection * 2.2;
        const knot = o.hold > 0 && o.rope && !o.tied ? o.hold : 0;
        ctx.save();
        ctx.globalAlpha = 1 - this.canopy;
        ctx.translate(352 + knot * 60 + jitter(tremble), STAGE_H + 46 + (1 - rise) * 520 + (this.walking ? Math.sin(this.stride * Math.PI) * 14 : 0) - knot * 30);
        ctx.rotate(0.07 + Math.sin(this.time * 1.7) * 0.02 + knot * 0.16 + jitter(tremble * 0.002));
        ctx.drawImage(layer, -width / 2, -height, width, height);
        ctx.restore();
      }
    }

    // The right hand: offered, reaching, pulling, twisting.
    if (this.clap !== null && this.clap < CLAP_SECONDS) {
      this.drawClap(ctx, this.clap);
    } else if (this.handReach > 0 && this.canopy < 1) {
      const repairing = o.beat === 'mend' || this.spliced;
      const tapeHand = repairing && sprite('orchard_tape_hand');
      drawArm(ctx, tapeHand || sprite('desk_hand_open'), this.hand.tip, {
        height: repairing ? 515 : 610, lean: this.hand.lean, reach: this.handReach, alpha: 1 - this.canopy,
        // The tape tongue protrudes to the left of the fingers.
        ...(tapeHand ? { contact: { x: .035, y: .023 } } : {}),
      });
    }

    if (o.beat === 'sawing' || (this.phase === 'outro' && this.ending === 'maimed' && this.phaseTime < 0.5)) {
      // Only the top of the saw's frame comes into view, going one way and the other.
      const side = this.sawSide === 'left' ? -1 : this.sawSide === 'right' ? 1 : 0;
      const swing = side * (1 - this.sawSwing) * 86;
      ctx.save();
      ctx.globalAlpha = this.canopy;
      this.drawSprite(ctx, 'orchard_items_saw', CX + 60 + swing, STAGE_H + 214 + this.sawSwing * 12, 520, { ax: 0.5, ay: 1, rot: -1.15 + side * 0.03 });
      ctx.restore();
    }
  }

  private drawClap(ctx: CanvasRenderingContext2D, t: number): void {
    const hand = sprite('orchard_clap');
    const lift = smooth(t / CLAP_READY);
    const strike = smooth((t - CLAP_READY) / (CLAP_CONTACT - CLAP_READY));
    // Hold palm contact for a frame even at 20 fps, then let the wrists spring apart.
    const rebound = smooth((t - CLAP_CONTACT - 0.05) / 0.12);
    const lower = smooth((t - CLAP_CONTACT - 0.08) / (CLAP_SECONDS - CLAP_CONTACT - 0.08));
    const gap = 175 + 32 * lift - 184 * strike + 74 * rebound + 90 * lower;
    const y = 738 - 278 * lift - 38 * strike + 12 * rebound + 312 * lower;
    const lean = 0.38 - 0.35 * strike + 0.28 * rebound;
    drawArm(ctx, hand, { x: CX - gap, y: y + 4 }, { height: 590, lean, mirror: true });
    drawArm(ctx, hand, { x: CX + gap, y }, { height: 590, lean: -lean });
  }

  private drawVeil(ctx: CanvasRenderingContext2D): void {
    const o = this.orchard;
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

    // A little dread at the edges all along, more once it has turned round.
    edge(8, 10, 6, o.beat === 'reveal' || o.beat === 'guard' ? 0.75 : 0.34, 0.42);
    // The infection closes in on what can still be seen, with every heartbeat.
    if (o.infection > 0 && this.ending !== 'maimed') edge(10, 26, 12, 0.2 + o.infection * 0.72 + this.pulse * 0.14, 0.5 - o.infection * 0.28);
    edge(150, 12, 8, this.red * 0.75 + (o.beat === 'clamped' ? 0.18 + this.pulse * 0.1 : 0), 0.3);
    if (o.beat === 'sawing') flat('#1a0503', (o.strokes / ORCHARD.sawStrokes) * 0.34);
    if (o.beat === 'bleeding') {
      const t = clamp01(o.clock / ORCHARD.bleedSeconds);
      edge(0, 0, 0, 0.5 + t * 0.9, 0.5 - t * 0.48);
      flat('#000', t * t * 0.85);
    }
    if (calmMotion()) edge(103, 32, 15, this.white * .38, .38);
    else flat('#fff', this.white);

    if (this.phase === 'intro') flat('#000', 1 - this.phaseTime / 1.4);
    if (this.phase === 'outro' && this.ending) {
      const t = this.phaseTime;
      switch (this.ending) {
        case 'spared':
          break;
        case 'maimed':
          if (calmMotion()) flat('#000', clamp01(t / 2.8));
          else {
            flat('#fff', clamp01(t / 0.9) * (1 - clamp01((t - 1.6) / 1.2)));
            flat('#000', clamp01((t - 1.6) / 1.2));
          }
          break;
        case 'throat':
          flat('#3a0604', clamp01(t / 0.25));
          flat('#000', clamp01((t - 0.5) / 0.9));
          break;
        case 'turned':
          edge(6, 20, 8, 1, 0.5 - clamp01(t / 2) * 0.5);
          flat('#040c05', clamp01((t - 0.8) / 1.6));
          break;
        case 'bled':
          flat('#000', 0.85 + clamp01(t / 1.2) * 0.15);
          break;
      }
    }
    if (this.phase === 'card') flat('#0a0806', this.ending === 'maimed' ? 0.62 : 0.4);
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);

    const shown = !(this.phase === 'outro' && this.ending === 'throat' && this.phaseTime > 1.5);
    if (shown) {
      ctx.save();
      if (!calmMotion()) ctx.translate((Math.random() * 2 - 1) * this.shake, (Math.random() * 2 - 1) * this.shake);
      if (this.phase === 'card' && this.ending === 'maimed') this.drawShot(ctx, WIDE, { zoom: 1.08 + this.phaseTime * 0.004, x: CX, y: CY }, 1);
      else {
        if (this.canopy < 1) this.drawGround(ctx);
        if (this.canopy > 0) this.drawCanopy(ctx, this.canopy);
      }
      const slide = -(this.cam.x - CX) * 0.5;
      this.atmo.drawBack(ctx, slide, this.phase === 'card' ? 0.5 : 1 - this.canopy * 0.6);
      if (this.phase !== 'card') this.drawForeground(ctx);
      this.atmo.drawFront(ctx, slide * 1.6);
      ctx.restore();
      if (this.phase !== 'card') this.drawBody(ctx);
    }
    this.drawVeil(ctx);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, STAGE_W, BAR);
    ctx.fillRect(0, STAGE_H - BAR, STAGE_W, BAR);
  }
}
