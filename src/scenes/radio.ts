import { discover } from './scene-evidence';
import { chapterLook, chapterReport } from './chapter-look';
// The radio, the morning after night 6: a cut-scene that is played by listening.
//
// core/radio.ts decides what every input does. This file frames it (the desk from the chair, then close on
// the set), draws what the set shows — a needle, a trace, the readout, the knob turning, the microphone on its
// hook — makes it heard through the static, and puts the keys on screen. Nothing here changes the campaign
// except `settle`, once, at the very end.

import { PauseMenu } from './pause';
import { bindPromptPointer, promptLayer } from './prompt-pointer';
import { settleRadio } from '../core/game';
import { hasLeftArm } from '../core/orchard';
import { createRng } from '../core/rng';
import {
  RADIO,
  SCRIPTS,
  aftermathOf,
  callerAt,
  clarity,
  garble,
  heardShare,
  lineSeconds,
  promptsOf,
  press,
  resultOf,
  rivalOf,
  signalAt,
  startRadio,
  stockAfter,
  strength,
  tick,
  type Cue,
  type Ending,
  type Held,
  type LineId,
  type Press,
  type Prompt,
  type PromptId,
  type Radio,
  type Station,
} from '../core/radio';
import { endingId } from '../core/endings';
import { RESOURCE_IDS, type Cost, type GameState } from '../core/types';
import { STAGE_H, STAGE_W, type App, type Scene } from '../engine/app';
import { assetUrl, sprite } from '../engine/assets';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S, fmt, durationLabel, line } from '../engine/i18n';
import { endingsTally, rememberEnding as remember } from '../engine/progress';
import { hush, say, sayAny, type VoiceId } from '../engine/voice';
import { Atmosphere, drawArm } from './atmosphere';
import { describeCost } from './common';
import { goDay, goTitle } from './flow';

// ───────────────────────────── Framing ─────────────────────────────

const PLATE = { w: 1280, h: 853 } as const;
const OVER = PLATE.h - STAGE_H;
const BAR = 54;
const CX = STAGE_W / 2;
const CY = STAGE_H / 2;

interface Shot {
  readonly plate: string;
  readonly focusY: number;
}

/** The desk from the chair, and the set's front panel close up. */
const WIDE: Shot = { plate: 'plate_radio', focusY: 0.62 };
const SET: Shot = { plate: 'plate_radio_set', focusY: 0.42 };

interface Point {
  readonly x: number;
  readonly y: number;
}

/** A point of a plate, given as fractions of the picture, in stage units for that shot. */
const at = (shot: Shot, fx: number, fy: number): Point => ({ x: fx * PLATE.w, y: fy * PLATE.h - OVER * shot.focusY });

/** Where things are on the set's front panel. */
const SPOT = {
  /** The round signal meter: the centre of its face, and its radius. */
  meter: at(SET, 0.2005, 0.444),
  meterR: 0.088 * PLATE.w,
  /** The dark readout window. */
  readout: { a: at(SET, 0.326, 0.386), b: at(SET, 0.6, 0.52) },
  /** The tuning knob's dome. */
  knob: at(SET, 0.724, 0.494),
  knobR: 54,
  /** The bent-wire hook the microphone hangs on. */
  hook: at(SET, 0.903, 0.39),
  /** The set, seen from the chair. */
  wideSet: at(WIDE, 0.49, 0.68),
} as const;

interface Cam {
  zoom: number;
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number): number => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

/** The visible plate bounds are shared by the scenery and the hands touching it. */
function frameShot(shot: Shot, cam: Cam): Cam {
  const zoom = Math.max(1, cam.zoom);
  const top = -OVER * shot.focusY;
  return { zoom, x: clamp(cam.x, CX / zoom, PLATE.w - CX / zoom), y: clamp(cam.y, top + CY / zoom, top + PLATE.h - CY / zoom) };
}

/** The band, in megahertz, as the readout shows it. */
const mhz = (dial: number): string => (26.965 + dial * 0.44).toFixed(3);

// ───────────────────────────── Keys and prompts ─────────────────────────────

type KeyName = 'up' | 'down' | 'left' | 'right' | 'space' | '1' | '2' | '3';

interface PromptSpec {
  readonly keys: readonly KeyName[];
  readonly how?: 'hold';
  readonly hold?: keyof Held;
  readonly tap?: Press;
  readonly at: Point;
  readonly big?: boolean;
  /** One of the answers: laid out in a column. */
  readonly ask?: boolean;
}

const LOW = 604;
const askAt = (row: number): Point => ({ x: 404, y: 204 + row * 42 });

const SPEC: Readonly<Record<PromptId, PromptSpec>> = {
  lean: { keys: ['up'], how: 'hold', hold: 'forward', at: { x: CX, y: LOW } },
  tune: { keys: ['left', 'right'], how: 'hold', at: { x: 196, y: LOW } },
  hello: { keys: ['space'], tap: 'act', at: { x: 676, y: LOW }, big: true },
  answer_1: { keys: ['1'], tap: 'answer_1', at: askAt(0), ask: true },
  answer_2: { keys: ['2'], tap: 'answer_2', at: askAt(1), ask: true },
  answer_3: { keys: ['3'], tap: 'answer_3', at: askAt(2), ask: true },
  off: { keys: ['down'], how: 'hold', hold: 'back', at: { x: 1086, y: LOW } },
  hang_up: { keys: ['down'], how: 'hold', hold: 'back', at: { x: 1086, y: LOW } },
  hand: { keys: [], at: { x: CX, y: LOW } },
};

/** Physical keys, so the same fingers work on AZERTY and QWERTY. */
const KEY_OF: Readonly<Record<string, keyof Held | 'act' | 'answer_1' | 'answer_2' | 'answer_3'>> = {
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
  Digit1: 'answer_1',
  Numpad1: 'answer_1',
  Digit2: 'answer_2',
  Numpad2: 'answer_2',
  Digit3: 'answer_3',
  Numpad3: 'answer_3',
};
const HELD_KEYS: readonly (keyof Held)[] = ['forward', 'back', 'left', 'right'];
const isHeld = (name: string): name is keyof Held => (HELD_KEYS as readonly string[]).includes(name);

/** What else is on the band, line by line, looped: whatever the dial happens to pass over. */
const DECOY_LINES: Readonly<Record<Exclude<Station, 'caller'>, readonly VoiceId[]>> = {
  news: ['vo_cb_news_1', 'vo_cb_news_2', 'vo_cb_news_3'],
  baker: ['vo_cb_baker_1', 'vo_cb_baker_2', 'vo_cb_baker_3'],
};

const END_LINE: Readonly<Record<Ending, VoiceId>> = {
  trusted: 'vo_radio_end_trusted',
  bargained: 'vo_radio_end_bargained',
  lied: 'vo_radio_end_lied',
  refused: 'vo_radio_end_refused',
  silence: 'vo_radio_end_silence',
  off: 'vo_radio_off',
};

// ───────────────────────────── Timings of what the reducer does not time ─────────────────────────────

const INTRO_SECONDS = 2.8;
const OUTRO_SECONDS = 4.2;
/** Band crossed between two clicks of the knob. */
const DETENT = 0.022;
const KNOB_ARC = 4.6;
/** Arm sprite heights at the panel and at the player's mouth, in stage units. */
const PANEL_HAND = 730;
const NEAR_HAND = 860;
/** Fraction of the trip to the mouth at which the fingers close around the hanging mic. */
const MIC_PICKUP = 0.36;
const rememberEnding = (ending: Ending): boolean => remember(endingId('radio', ending));

type Phase = 'intro' | 'play' | 'outro' | 'card';

/** What the transcript shows: whose line, and which. */
interface Shown {
  readonly line: LineId;
  readonly who: string;
  /** A station other than the caller: heard at a flat level, not piece by piece. */
  readonly decoy: Exclude<Station, 'caller'> | null;
}

export class RadioScene implements Scene {
  private radio: Radio;
  private phase: Phase = 'intro';
  private opening!: ReturnType<typeof chapterLook>;
  private time = 0;
  private phaseTime = 0;
  private paused = false;
  private pausedCallerAt: number | null = null;
  private pausedFoleyAt: number | null = null;
  private foley: { sound: 'camper_zip' | 'camper_breath'; until: number; caption: string } | null = null;
  private left = false;
  private readonly oneArm: boolean;

  private readonly keys = new Set<string>();
  private pointerHold: keyof Held | null = null;

  private readonly cam: Cam = { zoom: 1.04, x: CX, y: CY };
  private shake = 0;
  private flicker = 0;
  private crackle = 0;
  /** How far the voice has come in, smoothed for the picture. */
  private glow = 0;
  /** The needle, with a little weight to it. */
  private needle = 0;
  private needleSpeed = 0;
  private turnedSince = 0;
  private grain = createRng(0).next;
  /** The set has been switched off: no more static, a dead needle. */
  private dead = false;
  private hungUp = false;

  private readonly decoyAt: Record<Exclude<Station, 'caller'>, number> = { news: 0, baker: 0 };
  private nextLost = 0;
  private readonly said = new Set<string>();
  private ending: Ending | null = null;
  private shown: Shown | null = null;
  private previous: Shown | null = null;

  private readonly atmo = new Atmosphere({ motes: 70 });
  private dialReach = 0;
  /** 0 at the dial (left hand offscreen), 1 holding the mic, in either direction. */
  private micTravel = 0;
  private micRaised = 0;

  private readonly queue: { at: number; run: () => void }[] = [];

  private root!: HTMLElement;
  private titleEl!: HTMLElement;
  private logEl!: HTMLElement;
  private logPrev!: HTMLElement;
  private logWho!: HTMLElement;
  private logLine!: HTMLElement;
  private logFoley!: HTMLElement;
  private waitEl!: HTMLElement;
  private waitFill!: HTMLElement;
  private weakEl!: HTMLElement;
  private answersEl!: HTMLElement;
  private promptsEl!: HTMLElement;
  private noteEl!: HTMLElement;
  private overlay!: HTMLElement;
  private pauseMenu!: PauseMenu;
  private promptSignature = '';
  private readonly promptEls = new Map<PromptId, HTMLElement>();

  constructor(private readonly app: App) {
    const state = this.state;
    this.oneArm = !hasLeftArm(state);
    const call = state.radio.call;
    if (!call) throw new Error('RadioScene needs a call waiting');
    this.radio = startRadio(call, this.oneArm);
  }

  private get state(): GameState {
    if (!this.app.state) throw new Error('RadioScene needs a running game');
    return this.app.state;
  }

  enter(): void {
    audio.setAmbience('room');
    audio.setMusic('none');
    const s = S();
    this.titleEl = el('div', { class: 'orchard-title' }, [el('h1', { text: s.radio.title }), el('p', { text: fmt(s.radio.when, { n: this.state.day + 1 }) })]);
    this.logPrev = el('p', { class: 'prev' });
    this.logWho = el('b');
    this.logLine = el('p', { class: 'line' });
    this.logFoley = el('p', { class: 'radio-foley' });
    this.logFoley.setAttribute('role', 'status');
    this.logEl = el('div', { class: 'radio-log' }, [this.logPrev, this.logWho, this.logLine, this.logFoley]);
    this.waitFill = el('i');
    this.waitEl = el('div', { class: 'radio-wait' }, [el('span', { text: s.radio.waiting }), el('span', { class: 'bar' }, [this.waitFill])]);
    this.weakEl = el('div', { class: 'radio-weak', text: s.radio.prompt.weak });
    // The answers sit on a panel of their own, under what was said, while they wait.
    this.answersEl = el('div', { class: 'radio-answers' });
    this.promptsEl = promptLayer(() => { this.pointerHold = null; });
    this.noteEl = el('div', { class: 'orchard-note' });
    this.overlay = el('div');
    const pauseOverlay = el('div');
    this.pauseMenu = new PauseMenu(pauseOverlay);
    this.root = el('div', { class: 'orchard radio' }, [this.titleEl, this.logEl, this.answersEl, this.waitEl, this.weakEl, this.promptsEl, this.noteEl, this.overlay, pauseOverlay]);
    this.opening = chapterLook(this.app, 'radio');
    this.opening.layer.hidden = true;
    this.root.append(this.opening.layer);
    this.app.ui.append(this.root);
    if (rivalOf(this.radio.call.caller) === 'camper') {
      void audio.prepareSample('camper_zip');
      if (this.radio.call.caller === 'camper_owes' && this.radio.call.secret) void audio.prepareSample('camper_breath');
    }
    this.after(1.2, () => this.once('vo_radio_arrive'));
  }

  exit(): void {
    this.left = true;
    hush();
    this.silence();
  }

  /** Every sound the set is making, faded. */
  private silence(): void {
    audio.hum('radio_static', 0);
    audio.hum('radio_whistle', 0);
    for (const channel of ['caller', 'news', 'baker']) audio.hushOn(channel, 0.3);
    audio.hushOn('radio-foley', .06);
  }

  // ───────────────────────────── Small machinery ─────────────────────────────

  private after(seconds: number, run: () => void): void {
    this.queue.push({ at: this.time + seconds, run });
  }

  /** A line said once in the scene, the first time it applies. */
  private once(id: VoiceId, interrupt = false): void {
    if (this.said.has(id)) return;
    if (say(id, { interrupt }) > 0 || interrupt) this.said.add(id);
  }

  private held(): Held {
    const down = (name: keyof Held): boolean => this.pointerHold === name || [...this.keys].some((code) => KEY_OF[code] === name);
    return { forward: down('forward'), back: down('back'), left: down('left'), right: down('right') };
  }

  private apply(turn: { radio: Radio; cues: readonly Cue[] }): void {
    this.radio = turn.radio;
    for (const cue of turn.cues) this.onCue(cue);
  }

  private send(key: Press): boolean {
    if (this.phase !== 'play' || this.paused) return false;
    const turn = press(this.radio, key);
    const changed = turn.radio !== this.radio;
    this.apply(turn);
    return changed;
  }

  private callerName(): string {
    return S().radio.caller[this.radio.call.caller];
  }

  // ───────────────────────────── What happens, made seen and heard ─────────────────────────────

  private onCue(cue: Cue): void {
    const o = this.radio;
    switch (cue.type) {
      case 'foley':
        // At the speaker Hugo stops talking to listen, even if he just crossed the news band.
        hush();
        this.foley = {
          sound: cue.sound, until: this.time + 2.1,
          caption: cue.sound === 'camper_zip'
            ? line('Une fermeture accroche. Au deuxième coup, elle cède.', 'A zip catches. The second pull frees it.')
            : line('Une manche frotte le micro. Son souffle se coupe.', 'A sleeve brushes the mic. His breath catches.'),
        };
        audio.receiveFoley(cue.sound, this.voiceLevel());
        break;
      case 'leaned':
        audio.play('radio_knob', 0.5);
        break;
      case 'found':
        discover(this.app, 'caller');
        this.flicker = 0.5;
        if (rivalOf(o.call.caller) !== 'camper') this.after(0.4, () => this.once(this.oneArm ? 'vo_radio_one_hand' : 'vo_radio_found'));
        break;
      case 'line': {
        const known = o.trail.includes('hailed') || o.beat === 'answer' || o.beat === 'response';
        this.previous = this.shown && !this.shown.decoy ? this.shown : this.previous;
        this.shown = { line: cue.line, who: known ? this.callerName() : S().radio.unknown, decoy: null };
        audio.sayOn('caller', cue.line, this.voiceLevel());
        break;
      }
      case 'line_end':
        audio.hushOn('caller', cue.cut ? 0.08 : 0.3);
        if (!cue.cut) audio.play('radio_squelch', 0.25 + 0.5 * clarity(o));
        if (!cue.cut && o.beat === 'hail' && rivalOf(o.call.caller) === 'camper') {
          this.once(this.oneArm ? 'vo_radio_one_hand' : 'vo_radio_found');
        }
        break;
      case 'tuned':
        this.after(0.7, () => {
          if (!this.foley) this.once(cue.station === 'news' ? 'vo_radio_news' : 'vo_radio_baker');
        });
        break;
      case 'losing':
        if (this.time >= this.nextLost && !audio.speaking) {
          this.nextLost = this.time + 8;
          sayAny('radioLost');
        }
        break;
      case 'hand':
        audio.play('hand', 0.6);
        break;
      case 'keyed':
        this.foley = null;
        audio.hushOn('radio-foley', .06);
        audio.play('radio_ptt');
        audio.hushOn('caller', 0.08);
        this.after(0.15, () => say(cue.line as VoiceId, { interrupt: true }));
        break;
      case 'unkeyed':
        audio.play('radio_squelch', 0.5);
        if (!cue.reached) this.note(S().radio.missed, 3);
        break;
      case 'ended':
        this.finish(cue.ending);
        break;
    }
  }

  private finish(ending: Ending): void {
    this.foley = null;
    audio.hushOn('radio-foley', .06);
    this.ending = ending;
    this.phase = 'outro';
    this.phaseTime = 0;
    this.keys.clear();
    this.pointerHold = null;
    rememberEnding(ending);
    this.hungUp = this.radio.trail.includes('hung_up') || ending === 'off';
    if (this.hungUp) {
      this.dead = true;
      audio.play('radio_off');
      this.silence();
      this.shake = 5;
    }
    this.after(this.hungUp ? 1 : 0.7, () => say(END_LINE[ending], { interrupt: true }));
  }

  private note(text: string, seconds: number): void {
    this.noteEl.textContent = text;
    this.noteEl.classList.add('on');
    this.after(seconds, () => this.noteEl.classList.remove('on'));
  }

  /** Writes the outcome into the campaign and leaves. */
  private settle(): void {
    if (this.left || !this.ending) return;
    const result = resultOf(this.radio);
    if (!result) return;
    this.left = true;
    const settled = settleRadio(this.state, result);
    if (!settled.ok) {
      console.error('[radio] could not settle the morning', settled.error);
      goTitle(this.app);
      return;
    }
    this.app.state = settled.value;
    this.app.save();
    goDay(this.app);
  }

  private showCard(): void {
    const result = resultOf(this.radio);
    if (!this.ending || !result) return;
    this.phase = 'card';
    this.phaseTime = 0;
    this.silence();
    audio.setMusic('morning');
    const s = S();
    const o = this.radio;
    const caller = o.call.caller;
    const state = this.state;
    const said = result.answer ? (s.radio.said[caller] as Record<string, string>)[result.answer] ?? '' : this.ending === 'silence' ? s.radio.said.silence : s.radio.said.off;

    // What came through of what they said: every line once answered, piece by piece.
    const script = SCRIPTS[caller];
    const heard = o.heard.filter((h) => !script.calls.includes(h.line));
    const transcript = heard.map((h) => {
      const text = s.voice[h.line as VoiceId] ?? '';
      return el('li', {}, [el('span', { text: garble(text, h.slots) }), el('small', { text: fmt(s.radio.heardShare, { p: Math.round(heardShare(text, h.slots) * 100) }) })]);
    });

    const follows = this.follows(result.answer, result.sighted.length);
    const seen = endingsTally('radio');
    const portrait = assetUrl(rivalOf(caller) ? `por_rival_${rivalOf(caller)}` : 'por_ham');
    const face = el('img', { class: 'radio-face' });
    if (portrait) (face as HTMLImageElement).src = portrait;
    const card = el('div', { class: `card orchard-card radio-card ${this.ending}` }, [
      portrait ? face : null,
      el('h2', { text: s.radio.ending[this.ending].title }),
      el('p', { class: 'who', text: this.callerName() }),
      el('p', { text: said }),
      el('ol', { class: 'trail' }, o.trail.map((step) => el('li', { text: s.radio.step[step] }))),
      transcript.length > 0 ? el('div', { class: 'radio-heard' }, [el('b', { text: s.radio.heard }), el('ol', {}, transcript)]) : null,
      el('div', { class: 'radio-follows' }, [el('b', { text: s.radio.follows }), el('ul', {}, follows.map((line) => el('li', { text: line })))]),
      el('p', { class: 'cost bad', text: fmt(s.radio.cost, { duration: durationLabel(result.hours) }) }),
      el('div', { class: 'actions' }, [
        el('span', { class: 'paths', text: fmt(s.radio.paths, { n: seen.seen, total: seen.total }) }),
        el('button', { class: 'btn btn-primary', text: fmt(s.radio.next, { n: state.day + 1 }), onClick: () => this.settle() }),
      ]),
    ]);
    chapterReport(card, line('Revoir le poste', 'Look at the set'));
    this.overlay.replaceChildren(el('div', { class: 'modal orchard-modal' }, [card]));
  }

  /** What the day will bring, as far as anyone can say this morning. */
  private follows(answer: Radio['answer'], sighted: number): string[] {
    const s = S();
    const state = this.state;
    const call = this.radio.call;
    const after = aftermathOf(call, answer, state.inventory);
    const { took } = stockAfter(state.inventory, after);
    const has = (cost: Cost): boolean => RESOURCE_IDS.some((id) => (cost[id] ?? 0) > 0);
    const name = this.callerName().split(',')[0] ?? '';
    const lines: string[] = [];
    if (has(after.gift)) lines.push(fmt(answer === 'landmark' ? s.radio.follow.fetched : s.radio.follow.gift, { list: describeCost(after.gift) }));
    if (has(after.pay)) lines.push(fmt(s.radio.follow.paid, { list: describeCost(after.pay) }));
    if (has(took)) lines.push(fmt(s.radio.follow.took, { who: call.caller.startsWith('dealer') ? s.radio.who.committee : s.radio.who.van, list: describeCost(took) }));
    if (after.hours > 0) lines.push(fmt(s.radio.follow.hours, { duration: durationLabel(after.hours) }));
    if (after.hours < 0) lines.push(fmt(s.radio.follow.helper, { duration: durationLabel(-after.hours) }));
    if (after.ally) lines.push(fmt(s.radio.follow.ally, { name, sector: s.sector[after.ally.sector] }));
    if (after.guest) lines.push(fmt(s.radio.follow.guest, { name }));
    if (after.lookout) lines.push(sighted > 0 ? s.radio.follow.lookout : s.radio.follow.lookoutNone);
    const before = rivalOf(call.caller) ? state.people[rivalOf(call.caller) as 'dealer' | 'camper']?.standing : undefined;
    if (after.standing && after.standing !== before) {
      lines.push(fmt(after.standing === 'owes' ? s.radio.follow.owes : before === 'grudge' ? s.radio.follow.settled : s.radio.follow.quits, { name }));
    }
    return lines.length > 0 ? lines : [s.radio.follow.nothing];
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
      if (!event.repeat) this.send(name);
      return;
    }
    this.keys.add(code);
  }

  onKeyUp(code: string): void {
    this.keys.delete(code);
  }

  onBlur(): void {
    this.keys.clear();
    this.pointerHold = null;
    if (!this.paused) this.togglePause(true);
  }

  private promptDown(id: PromptId, event: PointerEvent): void {
    const spec = SPEC[id];
    if (id === 'tune') {
      const leftKey = (event.currentTarget as HTMLElement).querySelector('.key-left');
      this.pointerHold = leftKey && event.clientX <= leftKey.getBoundingClientRect().right ? 'left' : 'right';
    } else if (spec.hold) this.pointerHold = spec.hold;
    else if (spec.tap) this.send(spec.tap);
  }

  private togglePause(auto = false): void {
    if (this.phase === 'card' || this.left) return;
    this.paused = !this.paused;
    this.keys.clear();
    this.pointerHold = null;
    if (!this.paused) {
      this.pauseMenu.close();
      if (this.radio.on && this.pausedCallerAt !== null) {
        audio.sayOn('caller', this.radio.on.line, this.voiceLevel(), this.pausedCallerAt);
      }
      this.pausedCallerAt = null;
      if (this.foley && this.pausedFoleyAt !== null) audio.receiveFoley(this.foley.sound, this.voiceLevel(), this.pausedFoleyAt);
      this.pausedFoleyAt = null;
      return;
    }
    this.pausedCallerAt = audio.positionOn('caller');
    this.pausedFoleyAt = audio.positionOn('radio-foley');
    hush();
    this.silence();
    this.pauseMenu.open(() => this.togglePause(), () => goTitle(this.app), auto);
  }

  // ───────────────────────────── Loop ─────────────────────────────

  update(dt: number): void {
    if (this.opening.dialog.open) return;
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

    this.shake = Math.max(0, this.shake - dt * 30);
    this.flicker = Math.max(0, this.flicker - dt * 2.5);
    this.crackle = Math.max(0, this.crackle - dt * 6);
    this.atmo.update(dt);

    if (this.phase === 'intro' && this.phaseTime >= INTRO_SECONDS) {
      this.phase = 'play';
      this.phaseTime = 0;
    }
    if (this.phase === 'play') this.play(dt);
    if (this.phase === 'outro' && this.phaseTime >= OUTRO_SECONDS) this.showCard();

    this.listen(dt);
    this.reach(dt);
    this.follow(dt);
    this.syncHud();
  }

  private play(dt: number): void {
    const before = this.radio.dial;
    this.apply(tick(this.radio, dt, this.held()));
    // Carry the fraction of the last detent into the next turn.
    const moved = this.radio.dial - before;
    this.turnedSince += Math.abs(moved);
    if (this.turnedSince >= DETENT) {
      this.turnedSince %= DETENT;
      audio.play('radio_knob', 0.45);
    }
  }

  /** How loud their voice comes out of the set: a little of it even off-tune, the rest with the dial. */
  private voiceLevel(): number {
    const c = clarity(this.radio);
    return c < 0.02 ? 0 : 0.08 + 0.92 * Math.pow(c, 0.8);
  }

  /** The set as heard: static where nothing comes in, a whistle near a carrier, voices as tuned. */
  private listen(dt: number): void {
    if (this.paused || this.left || this.phase === 'card') return;
    const o = this.radio;
    const signal = signalAt(o, o.dial);
    const glowTarget = this.dead ? 0 : this.phase === 'intro' ? 0 : signal;
    this.glow = lerp(this.glow, glowTarget, 1 - Math.exp(-dt * 6));
    // The needle has weight: it overshoots a little and settles, and static makes it tremble.
    const target = this.dead ? 0 : clamp01(signal * 0.94 + (1 - signal) * 0.06 * Math.random());
    this.needleSpeed += (target - this.needle) * 70 * dt - this.needleSpeed * 9 * dt;
    this.needle = clamp(this.needle + this.needleSpeed * dt, 0, 1.05);
    if (this.dead) return;

    const intro = this.phase === 'intro' ? clamp01(this.phaseTime / 1.6) * 0.7 : 1;
    audio.hum('radio_static', (0.18 + 0.82 * (1 - signal)) * intro);
    // Two carriers beating: the closer the dial, the lower the whistle, until the voice drowns it.
    const near = Math.max(...(['caller', 'news', 'baker'] as const).map((station) => strength(o, station)));
    const whistle = near > 0.03 && near < 0.75 ? near * (1 - near) * 1.6 : 0;
    audio.hum('radio_whistle', whistle * intro, 180 + (1 - near) * 1500);
    if (Math.random() < dt * (1 - signal) * 2.5) this.crackle = 0.6 + Math.random() * 0.4;

    audio.levelOn('caller', this.voiceLevel());
    if (this.foley) audio.levelOn('radio-foley', this.voiceLevel());
    for (const station of ['news', 'baker'] as const) {
      const level = strength(o, station);
      if (station === 'baker' && o.call.baker === null) continue;
      if (level > 0.03 && !audio.speakingOn(station) && this.phase === 'play') {
        const lines = DECOY_LINES[station];
        audio.sayOn(station, lines[this.decoyAt[station]++ % lines.length] as VoiceId, level);
      }
      audio.levelOn(station, level > 0.02 ? 0.05 + 0.95 * level : 0);
    }
  }

  /** The hands: on the knob, on the microphone, or on their way from one to the other. */
  private reach(dt: number): void {
    const o = this.radio;
    const playing = this.phase === 'play' || (this.phase === 'outro' && this.phaseTime < 1.4 && !this.hungUp);
    const onSet = playing && o.beat !== 'arrive';
    if (this.oneArm && onSet) {
      switch (o.hand) {
        case 'dial': this.micTravel = 0; break;
        case 'to_mic': this.micTravel = o.reach; break;
        case 'mic': this.micTravel = 1; break;
        case 'to_dial': this.micTravel = 1 - o.reach; break;
      }
    } else {
      const pickup = onSet && o.beat !== 'search';
      this.micTravel = clamp01(this.micTravel + (pickup ? dt : -dt) / RADIO.crossSeconds);
    }
    const atDesk = onSet || (this.oneArm && this.micTravel > 0);
    this.dialReach = lerp(this.dialReach, atDesk ? 1 : 0, 1 - Math.exp(-dt * 7));
    this.micRaised = lerp(this.micRaised, o.said ? 1 : 0, 1 - Math.exp(-dt * 9));
  }

  /** The camera eases toward where the moment wants it. */
  private follow(dt: number): void {
    const o = this.radio;
    const target: Cam = { zoom: 1.04, x: CX + Math.sin(this.time * 0.4) * 5, y: CY + Math.cos(this.time * 0.31) * 3 };
    if (o.beat === 'talk' || o.beat === 'response') {
      // Leaning in to a voice that comes through.
      target.zoom = 1.06 + 0.06 * this.glow;
      target.y -= 10 * this.glow;
    }
    if (o.beat === 'answer') target.zoom = 1.03;
    if (this.phase === 'outro') {
      target.zoom = 1.04 + this.phaseTime * 0.012;
      target.x = lerp(target.x, SPOT.meter.x + 200, clamp01(this.phaseTime / 4));
    }
    const k = 1 - Math.exp(-dt * 2.5);
    this.cam.zoom = lerp(this.cam.zoom, target.zoom, k);
    this.cam.x = lerp(this.cam.x, target.x, k);
    this.cam.y = lerp(this.cam.y, target.y, k);
  }

  private onScreen(point: Point): Point {
    const { zoom, x, y } = frameShot(SET, this.cam);
    return { x: (point.x - x) * zoom + CX, y: (point.y - y) * zoom + CY };
  }

  // ───────────────────────────── HUD ─────────────────────────────

  private syncHud(): void {
    this.opening.layer.hidden = this.phase !== 'play' || this.radio.beat !== 'arrive' || this.radio.lean > .01;
    const s = S();
    const o = this.radio;
    this.titleEl.classList.toggle('on', this.phase === 'intro' && this.phaseTime > 0.3 && this.phaseTime < INTRO_SECONDS - 0.5);

    const prompts = this.phase === 'play' && !this.paused ? promptsOf(o) : [];
    const signature = prompts.map((p) => `${p.id}:${p.answer ?? ''}`).join('|');
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
      if (prompt.id === 'tune') {
        node.classList.toggle('turn-left', held.left && !held.right);
        node.classList.toggle('turn-right', held.right && !held.left);
      } else {
        node.classList.toggle('held', spec.hold !== undefined && held[spec.hold]);
      }
      node.classList.toggle('weak', prompt.weak === true);
    }
    const weak = prompts.some((p) => p.weak);
    this.weakEl.classList.toggle('on', weak);
    this.weakEl.classList.toggle('low', prompts.some((p) => p.id === 'hello'));

    // Whose voice is on the set, and what of it comes through.
    this.updateShown();
    const shown = this.shown;
    if (this.foley && this.time >= this.foley.until) this.foley = null;
    const caption = this.foley && clarity(o) >= RADIO.hearFloor ? this.foley.caption : '';
    if (this.logFoley.textContent !== caption) this.logFoley.textContent = caption;
    const on = (shown !== null || caption !== '') && this.phase !== 'card' && !this.dead;
    this.logEl.classList.toggle('on', on);
    if (!shown && this.logWho.textContent) {
      this.logWho.textContent = '';
      this.logLine.textContent = '';
      this.logPrev.textContent = '';
    }
    if (shown && on) {
      const text = s.voice[shown.line as VoiceId] ?? '';
      let line: string;
      if (shown.decoy) {
        const level = strength(o, shown.decoy);
        line = garble(text, Array.from({ length: RADIO.slots }, () => level));
      } else {
        const heard = o.heard.find((h) => h.line === shown.line);
        const progress = o.on && o.on.line === shown.line ? o.on.clock / lineSeconds(shown.line) : 1;
        line = heard ? garble(text, heard.slots, progress) : '';
      }
      if (this.logWho.textContent !== shown.who) this.logWho.textContent = shown.who;
      if (this.logLine.textContent !== line) this.logLine.textContent = line;
      const prev = this.previous && !shown.decoy ? this.previous : null;
      const prevText = prev ? garble(s.voice[prev.line as VoiceId] ?? '', o.heard.find((h) => h.line === prev.line)?.slots ?? null) : '';
      if (this.logPrev.textContent !== prevText) this.logPrev.textContent = prevText;
      this.logEl.classList.toggle('decoy', shown.decoy !== null);
    }

    // For tools/radio-shots.mjs, which tunes by ear like anyone else: how well the voice comes in, and what is going on.
    this.root.dataset['voice'] = clarity(o).toFixed(3);
    // Where the voice's peak is on the trace, against the dial's line: what the eye reads off the readout.
    this.root.dataset['peak'] = (callerAt(o.call, o.elapsed) - o.dial).toFixed(4);
    this.root.dataset['beat'] = this.phase === 'play' ? o.beat : this.phase;

    const waiting = this.phase === 'play' && o.beat === 'answer' && o.said === null;
    this.waitEl.classList.toggle('on', waiting);
    this.answersEl.classList.toggle('on', prompts.some((p) => SPEC[p.id].ask));
    this.logEl.classList.toggle('asking', o.beat === 'answer');
    if (waiting) this.waitFill.style.width = `${(1 - clamp01(o.clock / RADIO.answerWindow)) * 100}%`;
  }

  /** The line to show: theirs while they are on air or were last, or another station when the dial sits on one. */
  private updateShown(): void {
    const o = this.radio;
    const s = S();
    const caller = clarity(o);
    for (const station of ['news', 'baker'] as const) {
      if (station === 'baker' && o.call.baker === null) continue;
      const level = strength(o, station);
      if (level > 0.3 && level > caller && !(o.on && caller > 0.3)) {
        const lines = DECOY_LINES[station];
        const line = lines[(this.decoyAt[station] + lines.length - 1) % lines.length] as VoiceId;
        if (!this.shown || this.shown.line !== line) this.shown = { line, who: s.radio.station[station], decoy: station };
        return;
      }
    }
    if (this.shown?.decoy && !(o.on && this.shown.line === o.on.line)) {
      this.shown = o.on ? { line: o.on.line, who: o.trail.includes('hailed') ? this.callerName() : s.radio.unknown, decoy: null } : null;
    }
  }

  private buildPrompt(prompt: Prompt): HTMLElement {
    const s = S();
    const spec = SPEC[prompt.id];
    const label = prompt.answer ? s.radio.answer[prompt.answer] : s.radio.prompt[prompt.id as keyof typeof s.radio.prompt];
    const keys = spec.keys.map((key) => el('kbd', { class: `key-${key}`, text: key in s.orchard.key ? s.orchard.key[key as keyof typeof s.orchard.key] : key }));
    const row = spec.ask ? Number(prompt.id.slice(-1)) - 1 : 0;
    const node = el(
      'button',
      {
        class: `qte qte-${prompt.id}${spec.how ? ` how-${spec.how}` : ''}${spec.big ? ' big' : ''}${spec.ask ? ' ask' : ''}${prompt.id === 'tune' ? ' how-both' : ''}`,
        style: { left: `${spec.at.x}px`, top: `${spec.ask ? askAt(row).y : spec.at.y}px` },
      },
      [keys.length > 0 ? el('span', { class: 'keys' }, keys) : null, el('span', { class: 'what' }, [label, spec.how ? el('small', { text: s.orchard.how.hold }) : null])],
    );
    bindPromptPointer(node, this.promptsEl, !!spec.hold || prompt.id === 'tune', event => this.promptDown(prompt.id, event));
    this.promptEls.set(prompt.id, node);
    return node;
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private drawShot(ctx: CanvasRenderingContext2D, shot: Shot, cam: Cam, alpha: number, props?: () => void): void {
    if (alpha <= 0) return;
    const { x, y, zoom } = frameShot(shot, cam);
    const top = -OVER * shot.focusY;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(CX, CY);
    ctx.scale(zoom, zoom);
    ctx.translate(-x, -y);
    const art = sprite(shot.plate);
    if (art) ctx.drawImage(art.img, 0, top, PLATE.w, PLATE.h);
    else {
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(0, top, PLATE.w, PLATE.h);
    }
    props?.();
    ctx.restore();
  }

  /** The round meter: its scale, its backlight, and a needle with some weight to it. */
  private drawMeter(ctx: CanvasRenderingContext2D): void {
    const { x, y } = SPOT.meter;
    const r = SPOT.meterR;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.98, 0, Math.PI * 2);
    ctx.clip();
    // The lamp behind the face, brighter as the voice comes in.
    const light = ctx.createRadialGradient(x, y + r * 0.2, r * 0.1, x, y, r);
    light.addColorStop(0, `rgba(255, 214, 140, ${0.18 + this.glow * 0.45})`);
    light.addColorStop(1, 'rgba(255, 190, 110, 0)');
    ctx.fillStyle = light;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    const pivot = { x, y: y + r * 0.62 };
    const radius = r * 1.22;
    const angle = (v: number): number => -Math.PI / 2 - 0.78 + v * 1.56;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#3a2614';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, radius, angle(0), angle(1));
    ctx.stroke();
    ctx.strokeStyle = '#a42618';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, radius, angle(0.72), angle(1));
    ctx.stroke();
    ctx.fillStyle = '#3a2614';
    ctx.font = `700 ${Math.round(r * 0.13)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 10; i++) {
      const a = angle(i / 10);
      const long = i % 2 === 0;
      ctx.strokeStyle = i / 10 >= 0.72 ? '#a42618' : '#3a2614';
      ctx.lineWidth = long ? 2.4 : 1.4;
      ctx.beginPath();
      ctx.moveTo(pivot.x + Math.cos(a) * radius, pivot.y + Math.sin(a) * radius);
      ctx.lineTo(pivot.x + Math.cos(a) * (radius - (long ? 12 : 7)), pivot.y + Math.sin(a) * (radius - (long ? 12 : 7)));
      ctx.stroke();
      if (long && i < 10) {
        ctx.fillStyle = i / 10 >= 0.72 ? '#a42618' : '#3a2614';
        ctx.fillText(String(i + 1), pivot.x + Math.cos(a) * (radius - 24), pivot.y + Math.sin(a) * (radius - 24));
      }
    }
    ctx.fillStyle = '#a42618';
    ctx.fillText('+20', pivot.x + Math.cos(angle(1)) * (radius - 26), pivot.y + Math.sin(angle(1)) * (radius - 26));
    ctx.fillStyle = 'rgba(58, 38, 20, 0.75)';
    ctx.font = `700 ${Math.round(r * 0.12)}px sans-serif`;
    ctx.fillText('S', x, y + r * 0.18);
    // The needle.
    const a = angle(this.needle);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pivot.x + 3, pivot.y + 3);
    ctx.lineTo(pivot.x + 3 + Math.cos(a) * radius * 1.04, pivot.y + 3 + Math.sin(a) * radius * 1.04);
    ctx.stroke();
    ctx.strokeStyle = '#1b130b';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(pivot.x, pivot.y);
    ctx.lineTo(pivot.x + Math.cos(a) * radius * 1.04, pivot.y + Math.sin(a) * radius * 1.04);
    ctx.stroke();
    ctx.fillStyle = '#2a1d10';
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** The readout: the frequency in amber, and the band around it as a green trace that lives. */
  private drawReadout(ctx: CanvasRenderingContext2D): void {
    const { a, b } = SPOT.readout;
    const w = b.x - a.x;
    const h = b.y - a.y;
    const o = this.radio;
    ctx.save();
    ctx.beginPath();
    ctx.rect(a.x, a.y, w, h);
    ctx.clip();
    ctx.fillStyle = 'rgba(4, 10, 6, 0.55)';
    ctx.fillRect(a.x, a.y, w, h);
    if (!this.dead && this.phase !== 'intro') {
      // A span of the band either side of the dial: peaks are stations.
      const span = 0.16;
      const base = a.y + h * 0.84;
      const tall = h * 0.58;
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(120, 255, 150, ${0.55 + this.glow * 0.4})`;
      ctx.shadowColor = 'rgba(120, 255, 150, 0.8)';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      const steps = 90;
      for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        const band = o.dial - span / 2 + f * span;
        const level = band < 0 || band > 1 ? 0 : signalAt(o, band);
        const grass = (this.grain() - 0.5) * (0.06 + (1 - level) * 0.08);
        const py = base - (level * 0.9 + 0.05 + grass) * tall;
        if (i === 0) ctx.moveTo(a.x + f * w, py);
        else ctx.lineTo(a.x + f * w, py);
      }
      ctx.stroke();
      // Where the dial is.
      ctx.strokeStyle = 'rgba(255, 190, 90, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x + w / 2, a.y + h * 0.3);
      ctx.lineTo(a.x + w / 2, a.y + h * 0.95);
      ctx.stroke();
      // The frequency.
      ctx.fillStyle = `rgba(255, 176, 64, ${0.85 + this.flicker * 0.15})`;
      ctx.font = `700 ${Math.round(h * 0.22)}px "Courier New", monospace`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(`${mhz(o.dial)} ${S().radio.mhz}`, b.x - 10, a.y + 6);
      ctx.textAlign = 'left';
      ctx.fillStyle = `rgba(255, 176, 64, ${0.35 + this.glow * 0.6})`;
      ctx.fillText(o.said ? 'TX' : 'RX', a.x + 10, a.y + 6);
    }
    // The glass, and the grain of a cheap tube on it.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(a.x, a.y, w, h * 0.35);
    if (!this.dead) {
      ctx.fillStyle = 'rgba(200, 255, 210, 0.08)';
      for (let i = 0; i < 26; i++) ctx.fillRect(a.x + this.grain() * w, a.y + this.grain() * h, 2, 1);
    }
    ctx.restore();
  }

  /** The scale and collar stay on the panel. The scalloped face turns around the shaft. */
  private drawKnob(ctx: CanvasRenderingContext2D): void {
    const { x, y } = SPOT.knob;
    const r = SPOT.knobR;
    const art = sprite('radio_tuning_knob');
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(0.94, 1);
    ctx.strokeStyle = '#d4b17c';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const a = -Math.PI / 2 + (i / 12 - 0.5) * KNOB_ARC;
      const outer = r + (i % 3 === 0 ? 16 : 11);
      ctx.moveTo(Math.cos(a) * (r + 7), Math.sin(a) * (r + 7));
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    }
    ctx.stroke();
    ctx.fillStyle = '#32251c';
    ctx.strokeStyle = '#947245';
    ctx.beginPath();
    ctx.arc(-3, -4, r + 1, 0, Math.PI * 2);
    ctx.shadowColor = 'rgba(20, 12, 8, 0.7)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 5;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.stroke();
    ctx.rotate((this.radio.dial - 0.5) * KNOB_ARC);
    if (art) ctx.drawImage(art.img, -r, -r, 2 * r, 2 * r);
    else {
      ctx.fillStyle = '#efe2c4';
      ctx.fillRect(-2, -r + 4, 4, r - 10);
    }
    ctx.restore();
  }

  /** The microphone on its hook, and its curly cord. */
  private drawMic(ctx: CanvasRenderingContext2D): void {
    const art = sprite('radio_parts_mic');
    if (!art || this.micTravel >= MIC_PICKUP) return;
    const height = 252;
    const width = (art.w / art.h) * height;
    const sway = Math.sin(this.time * 1.3) * 0.02;
    const top = { x: SPOT.hook.x, y: SPOT.hook.y - 20 };
    ctx.save();
    ctx.translate(top.x, top.y);
    ctx.rotate(sway);
    ctx.drawImage(art.img, -width / 2, 0, width, height);
    ctx.restore();
  }

  private drawSet(ctx: CanvasRenderingContext2D, cam: Cam, alpha: number): void {
    this.drawShot(ctx, SET, cam, alpha, () => {
      this.drawMeter(ctx);
      this.drawReadout(ctx);
      this.drawKnob(ctx);
      this.drawMic(ctx);
    });
  }

  private drawGround(ctx: CanvasRenderingContext2D): void {
    const o = this.radio;
    if (this.phase === 'intro' || o.beat === 'arrive') {
      // From the chair, leaning in toward the set.
      const w = smooth(o.lean);
      const cam: Cam = { zoom: 1.02 + this.time * 0.004 + w * 0.7, x: lerp(CX, SPOT.wideSet.x, w), y: lerp(CY, SPOT.wideSet.y - 40, w) };
      this.drawShot(ctx, WIDE, cam, 1);
      const arriving = clamp01((o.lean - 0.7) / 0.3);
      if (arriving > 0) this.drawSet(ctx, { zoom: 1.2 - 0.16 * arriving, x: CX, y: CY }, arriving);
      return;
    }
    const jitter = this.crackle > 0.5 && !this.dead ? (this.grain() - 0.5) * 2 : 0;
    this.drawSet(ctx, { zoom: this.cam.zoom, x: this.cam.x + jitter, y: this.cam.y }, 1);
  }

  /** The hands that come into the picture. */
  private drawBody(ctx: CanvasRenderingContext2D): void {
    if (this.phase === 'card') return;
    const knob = this.onScreen(SPOT.knob);
    // Turn through eight detents with the knob, then slide the fingers back around its rim.
    const phase = (this.radio.dial / (10 * DETENT)) % 1;
    const grip = phase < 0.8 ? phase / 0.8 : 1 - smooth((phase - 0.8) / 0.2);
    const twist = (grip - 0.5) * (8 * DETENT * KNOB_ARC);
    const slip = phase > 0.8 ? Math.sin(Math.PI * (phase - 0.8) / 0.2) : 0;
    const height = PANEL_HAND * this.cam.zoom;
    const dialLean = -0.32 + twist;
    // Offset from the arm's drawing pivot to the centre of the opening between thumb and index.
    const gripX = -0.096 * height;
    const gripY = 0.077 * height;
    const dial = {
      x: knob.x - gripX * Math.cos(dialLean) + gripY * Math.sin(dialLean) + slip * 12,
      y: knob.y - gripX * Math.sin(dialLean) - gripY * Math.cos(dialLean) - slip * 7,
    };
    const tuningHand = sprite('radio_hands_dial') ?? sprite('desk_hand_open');
    if ((!this.oneArm || this.micTravel === 0) && this.dialReach > 0.01) {
      drawArm(ctx, tuningHand, dial, { height, lean: dialLean, reach: this.dialReach });
    }

    if (this.micTravel > 0) this.drawMicHand(ctx, dial, dialLean);
  }

  private drawMicHand(ctx: CanvasRenderingContext2D, dial: Point, dialLean: number): void {
    const t = this.micTravel;
    const left = !this.oneArm;
    const panelHeight = PANEL_HAND * this.cam.zoom;
    const hook = this.onScreen({ x: SPOT.hook.x, y: SPOT.hook.y - 20 });
    // The held grille sits to one side of the arm sprite, 4% of its height above drawArm's pivot.
    const dock = { x: hook.x + (left ? -1 : 1) * panelHeight * 0.067, y: hook.y + panelHeight * 0.04 };
    const held = t >= MIC_PICKUP;
    const start = left ? { x: 770, y: STAGE_H + 100 } : dial;
    const end = left ? { x: lerp(330, 500, this.micRaised), y: lerp(554, 405, this.micRaised) } : { x: 580, y: 405 };
    const from = held ? dock : start;
    const to = held ? end : dock;
    const turn = smooth(held ? (t - MIC_PICKUP) / (1 - MIC_PICKUP) : t / MIC_PICKUP);
    const height = held ? lerp(panelHeight, NEAR_HAND, turn) : panelHeight;
    const tip = { x: lerp(from.x, to.x, turn), y: lerp(from.y, to.y, turn) - Math.sin(turn * Math.PI) * (held ? 52 : 20) };
    const lean = held ? lerp(0, left ? lerp(0.42, 0.16, this.micRaised) : -0.12, turn) : lerp(left ? 0.70 : dialLean, 0, turn);
    const art = sprite(held ? 'radio_hands_mic' : left ? 'desk_hand_open' : 'radio_hands_dial') ?? sprite('desk_hand_open');
    drawArm(ctx, art, tip, { height, lean, mirror: left });
  }

  private drawVeil(ctx: CanvasRenderingContext2D): void {
    const flat = (color: string, alpha: number): void => {
      if (alpha <= 0) return;
      ctx.globalAlpha = clamp01(alpha);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, STAGE_W, STAGE_H);
      ctx.globalAlpha = 1;
    };
    const edge = (r: number, g: number, b: number, alpha: number, inner: number): void => {
      if (alpha <= 0) return;
      const gradient = ctx.createRadialGradient(CX, CY, STAGE_H * inner, CX, CY, STAGE_W * 0.62);
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    };
    // A dim room at dawn; colder while only static comes out of the set, warmer when a voice does.
    edge(8, 6, 4, 0.5, 0.4);
    const statics = this.dead ? 0.6 : 1 - this.glow;
    flat('#4a5a6a', statics * 0.08);
    flat('#ffb050', this.glow * 0.06);
    // The lamp, flickering with the crackle.
    const lamp = ctx.createRadialGradient(150, 40, 10, 150, 40, 520);
    lamp.addColorStop(0, `rgba(255, 200, 120, ${0.16 + this.flicker * 0.08 - this.crackle * 0.05})`);
    lamp.addColorStop(1, 'rgba(255, 200, 120, 0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    // A burst of interference, when the static spits.
    if (this.crackle > 0.6 && !this.dead) {
      ctx.fillStyle = 'rgba(230, 240, 255, 0.05)';
      for (let i = 0; i < 4; i++) ctx.fillRect(0, this.grain() * STAGE_H, STAGE_W, 1 + this.grain() * 2);
    }
    if (this.phase === 'intro') flat('#000', 1 - this.phaseTime / 1.4);
    if (this.phase === 'outro') flat('#000', clamp01((this.phaseTime - (OUTRO_SECONDS - 1.6)) / 1.4) * 0.6);
    if (this.phase === 'card') flat('#0a0806', 0.5);
  }

  render(ctx: CanvasRenderingContext2D): void {
    // Sample the tube noise at a fixed rate. A paused scene redraws exactly the same glass and static.
    this.grain = createRng(Math.floor(this.time * 30)).next;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    ctx.save();
    ctx.translate((this.grain() * 2 - 1) * this.shake, (this.grain() * 2 - 1) * this.shake);
    this.drawGround(ctx);
    this.atmo.drawFront(ctx, -(this.cam.x - CX) * 0.4, 0.8);
    ctx.restore();
    this.drawBody(ctx);
    this.drawVeil(ctx);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, STAGE_W, BAR);
    ctx.fillRect(0, STAGE_H - BAR, STAGE_W, BAR);
  }
}
