// The end of a run: every run ends with the village in the garden.
//
// A house lost before the fifth night is brief: the control room door gives way. From the fifth night
// on — and at the seventh dawn, when they do not leave — it goes out through the shed: a ride-on mower
// with a blade on the front and two amplifier stacks on the back, and the keyboard played like a
// guitar: a top-row key holds a chord, Space hits the strings. core/finale.ts holds the song, its chart
// and what a strum is worth; nothing played here changes how it ends. What it was worth is handed to
// the end screen, which is the last picture of this scene held still.

import { endingsOf, FINAL_CHORD, FINALE, JAM, JAM_MODES, SONG, chartOf, chordRate, chordsOf, finaleOf, recordMode, sectionAt, settle, startJam, strum, type FinaleKind, type Jam, type JamMode, type Note, type Verdict } from '../core/finale';
import { hasLeftArm } from '../core/orchard';
import type { GameState } from '../core/types';
import { STAGE_H, STAGE_W, type App, type Scene } from '../engine/app';
import { sprite } from '../engine/assets';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S, fmt } from '../engine/i18n';
import { keepJam, rememberEnding } from '../engine/progress';
import { hush, say } from '../engine/voice';
import { Atmosphere, drawArm } from './atmosphere';
import { TRAP_KEY_CODES, drawPlate, trapKeyLabels } from './common';
import type { EndOptions } from './end';
import { goEnd } from './flow';

type Stage = 'dawn' | 'fall' | 'devoured' | 'shed' | 'jam' | 'swarm';

const SECONDS: Readonly<Record<Exclude<Stage, 'jam'>, number>> = { dawn: 10.4, fall: 3, devoured: 5.6, shed: 9, swarm: 9 };
/** The seventh dawn: the quiet picture, then the same picture with everyone in it. */
const DAWN = { reveal: 4.4, dissolve: 1.8, line: 6.4 } as const;

export interface FinaleOptions {
  /** Straight back to the shed, from the end screen: the song again, for the record. */
  readonly encore?: boolean;
}

/** Where things are on the jam screen. */
const GROUND = 640;
const MOWER = { x: 300, height: 318 } as const;
const BLADE_X = 488;
const LANE = { y: 112, hitX: 236 } as const;
const MODE_KEY = 'putrid-swarm.jam';

/** The way the song was last played; the gentle one the first time. */
function storedMode(): JamMode {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    return JAM_MODES.find((mode) => mode === stored) ?? 'soft';
  } catch {
    return 'soft';
  }
}
const CHORD_COLORS = ['#f2a531', '#dc4330', '#a3cf5c', '#7fc4b8', '#c58be0', '#fff1c9'] as const;
const SCROLL = 430;
/** The cut between two pictures is a turn of the head: this long on each side of it. */
const WHIP = 0.2;
/** The infected arms that come into the picture at the desk: where the fingers end up, from which side, when. */
const GRABS = [
  { key: 'finale_hands_a', tip: { x: 430, y: 380 }, lean: 0.34, at: 1.0 },
  { key: 'finale_hands_b', tip: { x: 900, y: 350 }, lean: -0.38, at: 1.5 },
  { key: 'finale_hands_c', tip: { x: 660, y: 470 }, lean: 0.04, at: 2.0 },
] as const;
const GRAVITY = 1500;

const WALKERS = [
  { key: 'en_shambler', height: 128, speed: 150, weight: 6 },
  { key: 'en_runner', height: 124, speed: 250, weight: 3 },
  { key: 'en_dog', height: 74, speed: 300, weight: 2 },
  { key: 'en_brute', height: 168, speed: 120, weight: 1 },
] as const;
const WALK_CYCLE = ['a', 'p', 'b', 'p'] as const;

interface Walker {
  readonly kind: (typeof WALKERS)[number];
  x: number;
  y: number;
  phase: number;
  /** Null while on its feet; once hit it is a thing in the air. */
  thrown: { vx: number; vy: number; spin: number; angle: number } | null;
}

interface Ring {
  readonly x: number;
  readonly y: number;
  readonly color: string;
  readonly reach: number;
  age: number;
}

interface Pop {
  readonly text: string;
  readonly color: string;
  age: number;
  /** A moment of the song rather than a verdict: larger, and longer on screen. */
  readonly big?: boolean;
}

const CENTRE = { x: STAGE_W / 2, y: STAGE_H / 2 } as const;
const popLife = (pop: Pop): number => (pop.big ? 1.4 : 0.7);
/** The horde picture of each ending, and how dark it ends: the end screen takes it up from there. */
export const SWARMED = { night: 'plate_finale_swarmed', dawn: 'plate_finale_swarmed_dawn', veil: 0.6, zoom: (t: number): number => 1.03 + t * 0.012 } as const;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export class FinaleScene implements Scene {
  private readonly kind: FinaleKind;
  private readonly oneArmed: boolean;
  private stage: Stage = 'fall';
  private time = 0;
  private stageTime = 0;
  private left = false;
  private shake = 0;
  private red = 0;
  private readonly queue: { at: number; run: () => void }[] = [];
  /** Embers, dust, smoke and whatever the blade throws up. */
  private readonly atmo = new Atmosphere({ embers: 30, motes: 16 });
  private flicker = 0;
  private smokeDue = 0;

  // The jam.
  private mode: JamMode = storedMode();
  private chart: readonly Note[] = chartOf(this.mode);
  private readonly modeEls = new Map<JamMode, HTMLElement>();
  private jam: Jam = startJam();
  /** Seconds since the song was started, off the wall clock: a slow frame must not put the notes late. */
  private clock = 0;
  private startedAt = 0;
  private drift = 0;
  /** Chord keys held, oldest first: the last one pressed is the one that sounds. */
  private readonly chords: number[] = [];
  private readonly walkers: Walker[] = [];
  private readonly rings: Ring[] = [];
  private readonly pops: Pop[] = [];
  private spawnDue = 0;
  private passive = 0;
  private scroll = 0;
  private punch = 0;
  private flash = 0;
  private playedOut = false;
  /** Every way the song was played this time: switching halfway decides which record it counts for. */
  private readonly played = new Set<JamMode>();
  /** What goes on to the end screen. */
  private ending: EndOptions = {};
  /** The section of the song last seen, and whether the last chord has been announced. */
  private section: string | null = null;
  private warned = false;

  private root!: HTMLElement;
  private countEl!: HTMLElement;
  private comboEl!: HTMLElement;
  private outEl!: HTMLElement;
  private hintEl!: HTMLElement;
  private readonly keyEls: HTMLElement[] = [];
  private spaceEl!: HTMLElement;

  constructor(
    private readonly app: App,
    private readonly options: FinaleOptions = {},
  ) {
    const state = this.state;
    // A run that is not over has no business here; it is shown the short way out.
    this.kind = finaleOf(state) ?? 'desk';
    this.oneArmed = !hasLeftArm(state);
  }

  private get dawn(): boolean {
    return this.kind === 'dawn';
  }

  private get state(): GameState {
    if (!this.app.state) throw new Error('FinaleScene needs a finished game');
    return this.app.state;
  }

  private get now(): number {
    return this.clock + this.drift;
  }

  private get tally(): number {
    return this.jam.mown + this.passive;
  }

  enter(): void {
    audio.setAmbience(this.dawn ? 'day' : 'night');
    audio.setMusic('none');
    this.root = el('div', { class: 'finale' });
    this.app.ui.append(this.root);
    if (this.options.encore && this.kind !== 'desk') {
      this.go('shed');
      return;
    }
    if (this.dawn) {
      this.go('dawn');
      return;
    }
    audio.play('breach');
    this.shake = 20;
    this.red = 0.8;
    this.after(0.5, () => audio.play('inside'));
    this.after(0.7, () => say(this.kind === 'desk' ? 'vo_finale_desk' : 'vo_finale_no', { interrupt: true }));
    this.skipNote();
  }

  exit(): void {
    this.left = true;
    hush();
    audio.setMusic('none');
  }

  private after(seconds: number, run: () => void): void {
    this.queue.push({ at: this.time + seconds, run });
  }

  private skipNote(): void {
    this.root.replaceChildren(el('div', { class: 'finale-skip', text: S().finale.skip }));
  }

  // ───────────────────────────── Stages ─────────────────────────────

  private go(stage: Stage): void {
    this.stage = stage;
    this.stageTime = 0;
    this.queue.length = 0;
    const s = S();
    switch (stage) {
      case 'dawn': {
        // The quiet that winning used to be: its picture, its music, its line. Then they are all there.
        audio.setMusic('won');
        this.after(0.9, () => say('vo_won', { interrupt: true }));
        const card = (text: { title: string; sub: string }): HTMLElement => el('div', { class: 'finale-title dawn' }, [el('h1', { text: text.title }), el('p', { text: text.sub })]);
        this.root.replaceChildren(card(s.finale.calm), el('div', { class: 'finale-skip', text: s.finale.skip }));
        this.after(DAWN.reveal, () => {
          audio.setMusic('none');
          audio.play('groan');
          this.root.replaceChildren(card(s.finale.still), el('div', { class: 'finale-skip', text: s.finale.skip }));
        });
        this.after(DAWN.reveal + 0.9, () => audio.play('groan', 0.7));
        this.after(DAWN.line, () => say('vo_finale_dawn', { interrupt: true }));
        break;
      }
      case 'fall':
        break;
      case 'devoured':
        this.shake = 26;
        this.red = 1;
        audio.play('devour');
        this.after(0.3, () => audio.play('groan'));
        this.after(2.6, () => audio.play('lost'));
        this.skipNote();
        this.ending = { firstTime: this.remember() };
        break;
      case 'shed':
        audio.setMusic('none');
        audio.play('shed_door');
        this.shake = 10;
        this.after(0.9, () => say(this.dawn ? 'vo_finale_shed_dawn' : 'vo_finale_shed', { interrupt: true }));
        this.after(1.6, () => audio.play('amp_on'));
        this.after(3.4, () => audio.play('mower_start'));
        if (this.oneArmed) this.after(3.6, () => say('vo_finale_one_arm', { interrupt: true }));
        this.modeEls.clear();
        this.root.replaceChildren(
          el('div', { class: 'finale-title' }, [el('h1', { text: s.finale.shed }), el('p', { text: s.finale.shedSub })]),
          // How to play it is chosen here, before the engine drowns everything out.
          el('div', { class: 'jam-modes' }, [
            el('span', { class: 'pick', text: s.finale.pick }),
            ...JAM_MODES.map((mode) => {
              const node = el('button', { class: 'jam-mode', onClick: () => this.pickMode(mode) }, [el('b', { text: s.finale.mode[mode].name }), el('small', { text: s.finale.mode[mode].note })]);
              this.modeEls.set(mode, node);
              return node;
            }),
          ]),
          el('div', { class: 'finale-skip', text: s.finale.start }),
        );
        this.pickMode(this.mode);
        break;
      case 'jam':
        this.startJam();
        break;
      case 'swarm': {
        hush();
        audio.setMusic('none');
        audio.play('amp_die');
        audio.play('horde');
        this.shake = 14;
        const last = this.dawn ? 'vo_finale_end_dawn' : 'vo_finale_end';
        this.after(1.8, () => say(last, { subtitle: false }));
        this.after(4.2, () => audio.play('devour', 0.7));
        this.keepSong();
        // No numbers here: the tally waits on the end screen, over this same picture.
        this.root.replaceChildren(
          el('div', { class: 'finale-swarm' }, [
            el('h1', { text: s.finale.swarmTitle }),
            el('p', { text: this.playedOut ? s.finale.swarmFull : s.finale.swarmEarly }),
            el('p', { class: 'quote', text: `« ${s.voice[last]} »` }),
          ]),
          el('div', { class: 'finale-skip', text: s.finale.skip }),
        );
        break;
      }
    }
  }

  private get chordCount(): number {
    return chordsOf(this.mode);
  }

  /** Pixels a note travels per second: slower when it is given longer to cross the screen. */
  private get laneSpeed(): number {
    return (STAGE_W - LANE.hitX) / JAM[this.mode].lead;
  }

  private pickMode(mode: JamMode): void {
    this.mode = mode;
    for (const [id, node] of this.modeEls) node.classList.toggle('on', id === mode);
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // Non-fatal: the choice simply will not be remembered.
    }
  }

  /** Counts the endings this last scene reached. Says whether its scene was seen for the first time. */
  private remember(): boolean {
    const [scene, ...more] = endingsOf(this.kind, this.playedOut);
    const first = scene ? rememberEnding(scene) : false;
    for (const id of more) rememberEnding(id);
    return first;
  }

  /** The song is over, one way or the other: weigh it against the record, and keep it for the end screen. */
  private keepSong(): void {
    const result = { mode: recordMode([...this.played]), mown: this.tally, best: this.jam.best, perfect: this.jam.perfect, full: this.playedOut };
    this.ending = { song: { result, record: keepJam(result) }, firstTime: this.remember() };
  }

  /** Changing one's mind mid-song: the other chart takes over from the next bar, the tally carries on. */
  private switchMode(): void {
    this.pickMode(this.mode === 'soft' ? 'hard' : 'soft');
    this.played.add(this.mode);
    this.chart = chartOf(this.mode);
    const resume = this.now + 60 / FINALE.bpm;
    const next = this.chart.findIndex((note) => note.time > resume);
    this.jam = { ...this.jam, next: next < 0 ? this.chart.length : next, combo: 0 };
    this.chords.length = 0;
    this.buildJamHud();
    const text = S().finale.mode[this.mode].name.toUpperCase();
    this.pops.push({ text, color: '#fff6e0', age: 0 });
  }

  /** The stage that follows the current one, or the end screen. */
  private advance(): void {
    if (this.left) return;
    switch (this.stage) {
      case 'dawn':
        this.go('shed');
        break;
      case 'fall':
        this.go(this.kind === 'desk' ? 'devoured' : 'shed');
        break;
      case 'shed':
        this.go('jam');
        break;
      case 'jam':
        this.go('swarm');
        break;
      case 'devoured':
      case 'swarm':
        this.left = true;
        goEnd(this.app, this.ending);
        break;
    }
  }

  // ───────────────────────────── The jam ─────────────────────────────

  private startJam(): void {
    audio.setMusic('finale');
    say('vo_finale_go', { interrupt: true });
    this.clock = 0;
    this.startedAt = performance.now();
    this.drift = 0;
    this.shake = 12;
    this.chart = chartOf(this.mode);
    this.jam = startJam();
    this.played.clear();
    this.played.add(this.mode);
    this.buildJamHud();
    for (let i = 0; i < 26; i++) this.spawn(640 + Math.random() * 760);
  }

  /** The keys of the mode being played, the tally, and the ways out. */
  private buildJamHud(): void {
    const s = S();
    const labels = trapKeyLabels();
    this.keyEls.length = 0;
    const keys = Array.from({ length: this.chordCount }, (_, i) => {
      const key = el('kbd', { text: labels[i] ?? '', style: { borderColor: CHORD_COLORS[i] ?? '#fff' } });
      this.keyEls.push(key);
      return key;
    });
    this.spaceEl = el('kbd', { class: 'space', text: s.finale.space });
    this.countEl = el('b', { text: '0' });
    this.comboEl = el('div', { class: 'jam-combo' });
    this.hintEl = el('div', { class: 'jam-hint', text: fmt(s.finale.hint, { keys: labels.slice(0, this.chordCount).join(' '), space: s.finale.space }) });
    const other = s.finale.mode[this.mode === 'soft' ? 'hard' : 'soft'].name;
    const swap = el('button', { class: 'jam-swap', onClick: () => this.switchMode() }, [el('kbd', { text: 'TAB' }), el('span', { text: fmt(s.finale.swap, { mode: other }) })]);
    this.outEl = el('button', { class: 'jam-out', onClick: () => this.bowOut() }, [el('kbd', { text: s.finale.enter }), el('span', {}, [s.finale.out, el('small', { text: s.finale.outNote })])]);
    this.root.replaceChildren(
      el('div', { class: 'jam' }, [el('div', { class: 'jam-count' }, [this.countEl, el('span', { text: s.finale.mown })]), this.comboEl, el('div', { class: 'jam-keys' }, [...keys, this.spaceEl]), this.hintEl, swap, this.outEl]),
    );
  }

  /** Leaving before the end of the song, once it has been offered. */
  private bowOut(): void {
    if (this.stage === 'jam' && this.now >= FINALE.skipAfter) this.go('swarm');
  }

  private spawn(x = STAGE_W + 40 + Math.random() * 160): void {
    const total = WALKERS.reduce((sum, w) => sum + w.weight, 0);
    let pick = Math.random() * total;
    const kind = WALKERS.find((w) => (pick -= w.weight) < 0) ?? WALKERS[0];
    this.walkers.push({ kind, x, y: GROUND - 40 + Math.random() * 112, phase: Math.random() * 4, thrown: null });
  }

  private throwWalker(walker: Walker, power: number): void {
    walker.thrown = { vx: 160 + Math.random() * 420 * power, vy: -(420 + Math.random() * 520) * power, spin: (Math.random() * 2 - 1) * 14, angle: 0 };
  }

  private hitStrings(): void {
    const chord = this.chords.at(-1) ?? null;
    const result = strum(this.jam, this.chart, this.now, chord, this.mode);
    this.jam = result.jam;
    const verdict: Verdict = result.verdict;
    const s = S();
    this.spaceEl.classList.add('hit');
    window.setTimeout(() => this.spaceEl.classList.remove('hit'), 90);

    if (chord === null) {
      audio.play('scratch');
      return;
    }
    const rate = chordRate(chord, this.mode);
    const color = CHORD_COLORS[chord] ?? '#fff';
    if (verdict === 'perfect' || verdict === 'good') audio.play('chord', verdict === 'perfect' ? 1 : 0.85, rate);
    else audio.play('chug', verdict === 'wrong' ? 0.7 : 0.9, rate);
    if (verdict === 'perfect' && this.jam.combo % 8 === 0) audio.play('blast');

    // The amplifiers do the rest: the better the note, the further it carries.
    const reach = verdict === 'perfect' ? Math.min(620, 400 + this.jam.combo * 3) : verdict === 'good' ? 330 : 230;
    this.rings.push({ x: MOWER.x - 60, y: GROUND - 150, color, reach, age: 0 });
    this.punch = verdict === 'perfect' ? 1 : 0.6;
    // The valves spit when they are pushed that hard.
    if (verdict === 'perfect') this.atmo.spray(MOWER.x - 120, GROUND - 290, 8, color, { angle: -Math.PI / 2, spread: 2, speed: 380, size: 2.6, gravity: 600, life: 0.6 });
    this.shake = Math.max(this.shake, verdict === 'perfect' ? 9 : 5);
    this.flash = verdict === 'perfect' ? 0.22 : 0.1;
    // However good the note, there are always more of them than it knocks over.
    let toThrow = Math.min(result.mown, 7);
    for (const walker of [...this.walkers].sort((a, b) => a.x - b.x)) {
      if (toThrow <= 0) break;
      if (walker.thrown || walker.x > BLADE_X + reach) continue;
      this.throwWalker(walker, verdict === 'perfect' ? 1.25 : 1);
      toThrow--;
    }
    const text = s.finale.verdict[verdict];
    if (text) this.pops.push({ text, color: verdict === 'wrong' ? '#ff9a88' : color, age: 0 });
  }

  private updateJam(dt: number): void {
    this.clock = (performance.now() - this.startedAt) / 1000;
    const heard = audio.musicTime();
    // The song is the clock when it can be heard; the scene's own clock otherwise, eased onto it.
    if (heard !== null && heard > 0.05) this.drift = lerp(this.drift, heard - this.clock, 0.08);
    const now = this.now;
    this.jam = settle(this.jam, this.chart, now, this.mode);
    const progress = clamp01(now / FINALE.seconds);

    this.scroll += SCROLL * dt;
    this.punch = Math.max(0, this.punch - dt * 5);
    this.flash = Math.max(0, this.flash - dt * 1.4);

    // They keep coming, and more of them, whatever is played.
    this.spawnDue -= dt;
    while (this.spawnDue <= 0 && this.walkers.length < 170) {
      this.spawnDue += 1 / lerp(9, 30, progress);
      this.spawn();
    }
    if (this.spawnDue < 0) this.spawnDue = 0;
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const walker = this.walkers[i] as Walker;
      if (walker.thrown) {
        walker.thrown.vy += GRAVITY * dt;
        walker.x += walker.thrown.vx * dt;
        walker.y += walker.thrown.vy * dt;
        walker.thrown.angle += walker.thrown.spin * dt;
        if (walker.y > STAGE_H + 220 || walker.x > STAGE_W + 300) this.walkers.splice(i, 1);
        continue;
      }
      walker.x -= (walker.kind.speed + SCROLL * 0.45) * dt;
      walker.phase += dt * (walker.kind.speed / 26);
      if (walker.x < BLADE_X) {
        // What the sound does not reach, the blade does.
        this.throwWalker(walker, 0.8);
        this.passive++;
        audio.play('kill', 0.5);
        this.atmo.spray(BLADE_X + 8, walker.y - 34, 5, '#55702a', { angle: -0.7, spread: 1.3, speed: 460, size: 3.4 });
        if (Math.random() < 0.4) this.atmo.spray(BLADE_X, walker.y - 10, 4, '#ffd27a', { angle: -0.4, spread: 1.6, speed: 620, size: 2, gravity: 800, life: 0.4 });
      }
    }
    // Exhaust behind, earth off the back wheel.
    if ((this.smokeDue -= dt) <= 0) {
      this.smokeDue = 0.11;
      this.atmo.puff(MOWER.x - 168, GROUND - 46, 34, 'rgba(190, 190, 196, 0.4)', -260, -40);
      this.atmo.spray(MOWER.x - 96, GROUND + 6, 2, '#4a3a22', { angle: Math.PI + 0.5, spread: 0.6, speed: 380, size: 3, life: 0.5 });
    }
    for (const ring of this.rings) ring.age += dt;
    for (let i = this.rings.length - 1; i >= 0; i--) if ((this.rings[i] as Ring).age > 0.5) this.rings.splice(i, 1);
    for (const pop of this.pops) pop.age += dt;
    for (let i = this.pops.length - 1; i >= 0; i--) if ((this.pops[i] as Pop).age > popLife(this.pops[i] as Pop)) this.pops.splice(i, 1);

    // HUD.
    const count = String(this.tally);
    if (this.countEl.textContent !== count) this.countEl.textContent = count;
    const combo = this.jam.combo >= 4 ? `${S().finale.combo} ×${this.jam.combo}` : '';
    if (this.comboEl.textContent !== combo) this.comboEl.textContent = combo;
    const sounding = this.chords.at(-1);
    this.keyEls.forEach((key, i) => key.classList.toggle('held', i === sounding));
    this.outEl.classList.toggle('on', now >= FINALE.skipAfter);
    this.hintEl.classList.toggle('on', now < 14);
    this.markTheSong(now);

    // Once the last chord has rung out, the song is over.
    if (now >= SONG.finalChord.silence || (audio.musicEnded && now > FINALE.skipAfter)) {
      this.playedOut = true;
      this.go('swarm');
    }
  }

  /** What the song is doing, said once as it happens: the solo comes in, and the last chord is next. */
  private markTheSong(now: number): void {
    const s = S().finale;
    const section = sectionAt(now)?.kind ?? null;
    if (section !== this.section) {
      if (section === 'solo') {
        this.pops.push({ text: s.solo, color: '#fff1c9', age: 0, big: true });
        this.flash = Math.max(this.flash, 0.3);
        this.shake = Math.max(this.shake, 10);
      }
      this.section = section;
    }
    const warn = FINAL_CHORD - 2 * (60 / FINALE.bpm);
    if (!this.warned && now >= warn) {
      this.warned = true;
      this.pops.push({ text: s.last, color: '#f2a531', age: 0, big: true });
    }
  }

  // ───────────────────────────── Input ─────────────────────────────

  onKeyDown(code: string, event: KeyboardEvent): void {
    if (this.stage === 'jam') {
      const chord = (TRAP_KEY_CODES as readonly string[]).indexOf(code);
      if (chord >= 0 && chord < this.chordCount) {
        event.preventDefault();
        if (!this.chords.includes(chord)) this.chords.push(chord);
        return;
      }
      if (code === 'Tab') {
        event.preventDefault();
        this.switchMode();
      } else if (code === 'Space') {
        event.preventDefault();
        this.hitStrings();
      } else if (code === 'Enter') this.bowOut();
      return;
    }
    if (this.stage === 'shed' && (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'Tab')) {
      event.preventDefault();
      this.pickMode(this.mode === 'soft' ? 'hard' : 'soft');
      audio.play('click');
      return;
    }
    // The pictures can be cut short, once they have been seen for a moment.
    if ((code === 'Space' || code === 'Enter' || code === 'Escape') && this.stageTime > 0.9) {
      event.preventDefault();
      this.advance();
    }
  }

  onKeyUp(code: string): void {
    const chord = (TRAP_KEY_CODES as readonly string[]).indexOf(code);
    const held = this.chords.indexOf(chord);
    if (held >= 0) this.chords.splice(held, 1);
  }

  onBlur(): void {
    this.chords.length = 0;
  }

  // ───────────────────────────── Loop ─────────────────────────────

  update(dt: number): void {
    if (this.left) return;
    this.time += dt;
    this.stageTime += dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.red = Math.max(0, this.red - dt * 0.9);
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const job = this.queue[i];
      if (job && job.at <= this.time) {
        this.queue.splice(i, 1);
        job.run();
      }
    }
    if (this.stage === 'jam') this.updateJam(dt);
    else if (this.stageTime >= SECONDS[this.stage]) this.advance();
    // The door goes on being hit while it holds.
    if (this.stage === 'fall' && Math.floor(this.stageTime / 0.55) !== Math.floor((this.stageTime - dt) / 0.55)) {
      audio.play('door');
      this.shake = Math.max(this.shake, 8);
      // Every blow brings dust down from the beams and makes the bulb dip.
      for (let i = 0; i < 4; i++) this.atmo.spray(120 + Math.random() * 1040, 20, 6, '#cdbf9f', { angle: Math.PI / 2, spread: 0.7, speed: 150, size: 2, gravity: 420, life: 1.5 });
      this.flicker = 0.3;
    }
    this.atmo.update(dt);
    this.flicker = Math.max(0, this.flicker - dt * 2.2);
    if (this.stage === 'devoured') {
      for (const grab of GRABS) {
        if (this.stageTime >= grab.at && this.stageTime - dt < grab.at) {
          this.shake = Math.max(this.shake, 16);
          this.red = Math.max(this.red, 0.7);
          audio.play('hit');
        }
      }
    }
    if (this.stage === 'shed' && this.stageTime > 3.5) {
      // The engine has caught: the whole shed shakes with it, and it smokes.
      this.shake = Math.max(this.shake, 2.5);
      if ((this.smokeDue -= dt) <= 0) {
        this.smokeDue = 0.16;
        this.atmo.puff(930 + Math.random() * 40, 560, 46, 'rgba(200, 200, 205, 0.45)', 60, -60);
      }
    }
    if (this.stage === 'swarm' && Math.random() < dt * 3) {
      this.atmo.spray(920, 250, 14, '#ffd27a', { angle: -Math.PI / 2, spread: 2.4, speed: 420, size: 2.4, gravity: 700, life: 0.9 });
      this.flicker = 0.25;
    }
  }

  // ───────────────────────────── Drawing ─────────────────────────────

  private veil(ctx: CanvasRenderingContext2D, color: string, alpha: number): void {
    if (alpha <= 0) return;
    ctx.globalAlpha = clamp01(alpha);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    ctx.globalAlpha = 1;
  }

  /**
   * The night pictures of the shed and the lane, at seven in the morning: a warm sky laid over them
   * (soft light) and a rose haze lifting the shadows (screen). Blend modes, not filters.
   */
  private daybreak(ctx: CanvasRenderingContext2D, strength: number): void {
    ctx.save();
    ctx.globalAlpha = strength;
    ctx.globalCompositeOperation = 'soft-light';
    const sky = ctx.createLinearGradient(0, 0, 0, STAGE_H);
    sky.addColorStop(0, '#ffc98a');
    sky.addColorStop(0.55, '#f0a070');
    sky.addColorStop(1, '#8a6a58');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = strength * 0.28;
    const haze = ctx.createLinearGradient(0, 0, 0, STAGE_H);
    haze.addColorStop(0, '#ffb48c');
    haze.addColorStop(1, '#3a2a30');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    ctx.restore();
  }

  private drawJam(ctx: CanvasRenderingContext2D): void {
    const now = this.now;
    const beat = 60 / FINALE.bpm;
    const onBeat = 1 - (((now - FINALE.offset) % beat) + beat) % beat / beat;

    // The lane, scrolled past: the picture and its mirror image, side by side for ever.
    const art = sprite('plate_finale_run');
    const scale = 1.08;
    const width = STAGE_W * scale;
    const height = width * (art ? art.h / art.w : 0.666);
    const top = STAGE_H - height;
    const offset = this.scroll % (width * 2);
    for (let tile = 0; tile < 3; tile++) {
      const x = tile * width - offset;
      if (x > STAGE_W || x + width < 0 || !art) continue;
      ctx.save();
      if (tile % 2 === 1) {
        ctx.translate(x + width, top);
        ctx.scale(-1, 1);
      } else ctx.translate(x, top);
      ctx.drawImage(art.img, 0, 0, width, height);
      ctx.restore();
    }
    if (this.dawn) this.daybreak(ctx, 0.75);
    else this.veil(ctx, '#06070d', 0.22);

    // Headlights.
    const cone = ctx.createLinearGradient(BLADE_X - 60, 0, BLADE_X + 620, 0);
    cone.addColorStop(0, 'rgba(255, 226, 150, 0.34)');
    cone.addColorStop(1, 'rgba(255, 226, 150, 0)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(BLADE_X - 70, GROUND - 96);
    ctx.lineTo(BLADE_X + 640, GROUND - 200);
    ctx.lineTo(BLADE_X + 640, GROUND + 70);
    ctx.lineTo(BLADE_X - 70, GROUND - 60);
    ctx.fill();

    // Everything standing on the lane, the furthest first.
    const walking = (walker: Walker): void => {
      const frame = WALK_CYCLE[Math.floor(walker.phase) % WALK_CYCLE.length] as string;
      const pose = sprite(`${walker.kind.key}_front_${frame}`) ?? sprite(`${walker.kind.key}_front`);
      if (!pose) return;
      const h = walker.kind.height * (0.9 + (walker.y - GROUND) / 500);
      const w = (pose.w / pose.h) * h;
      ctx.save();
      ctx.translate(walker.x, walker.y);
      if (walker.thrown) {
        ctx.translate(0, -h / 2);
        ctx.rotate(walker.thrown.angle);
        ctx.drawImage(pose.img, -w / 2, -h / 2, w, h);
      } else {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
        ctx.beginPath();
        ctx.ellipse(0, 0, w * 0.34, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.drawImage(pose.img, -w / 2, -h + Math.abs(Math.sin(walker.phase * Math.PI)) * -3, w, h);
      }
      ctx.restore();
    };
    const behind = this.walkers.filter((w) => !w.thrown && w.y <= GROUND + 6).sort((a, b) => a.y - b.y);
    const ahead = this.walkers.filter((w) => !w.thrown && w.y > GROUND + 6).sort((a, b) => a.y - b.y);
    behind.forEach(walking);

    // The mower: shaking with its engine, nodding with the beat, kicked forward by a good chord.
    const rider = sprite(this.oneArmed ? 'finale_mower_rider_one_arm' : 'finale_mower_rider');
    if (rider) {
      const h = MOWER.height * (1 + this.punch * 0.035);
      const w = (rider.w / rider.h) * h;
      ctx.save();
      ctx.translate(MOWER.x + this.punch * 10, GROUND + 14 + Math.sin(this.time * 46) * 1.4);
      ctx.rotate(-0.012 * onBeat * onBeat - this.punch * 0.02);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(10, -4, w * 0.44, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(rider.img, -w / 2, -h, w, h);
      ctx.restore();
    }
    ahead.forEach(walking);
    this.walkers.filter((w) => w.thrown).forEach(walking);

    // What the amplifiers throw out.
    for (const ring of this.rings) {
      const t = ring.age / 0.5;
      ctx.strokeStyle = ring.color;
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.lineWidth = 10 * (1 - t) + 2;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, 60 + ring.reach * t, -0.62, 0.62);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    this.atmo.drawFront(ctx);
    this.veil(ctx, '#fff', this.flash);

    // The notes: coming in from the right along the top, due at the ring.
    ctx.fillStyle = 'rgba(6, 6, 10, 0.62)';
    ctx.fillRect(0, LANE.y - 36, STAGE_W, 72);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    for (let b = Math.ceil((now - FINALE.offset) / beat); ; b++) {
      const x = LANE.hitX + (FINALE.offset + b * beat - now) * this.laneSpeed;
      if (x > STAGE_W) break;
      ctx.fillRect(x - 1, LANE.y - 36, 2, 72);
    }
    const labels = trapKeyLabels();
    ctx.font = "700 26px 'DIN Condensed', 'Bahnschrift Condensed', 'Arial Narrow', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = this.jam.next; i < this.chart.length; i++) {
      const note = this.chart[i] as Note;
      const x = LANE.hitX + (note.time - now) * this.laneSpeed;
      if (x > STAGE_W + 30) break;
      // The last one is the final chord: bigger, and ringed.
      const size = i === this.chart.length - 1 ? 30 : 21;
      ctx.fillStyle = CHORD_COLORS[note.chord] ?? '#fff';
      ctx.beginPath();
      ctx.roundRect(x - size, LANE.y - size, size * 2, size * 2, 9);
      ctx.fill();
      if (size > 21) {
        ctx.strokeStyle = '#fff6e0';
        ctx.lineWidth = 3 + onBeat * 3;
        ctx.beginPath();
        ctx.roundRect(x - size - 7, LANE.y - size - 7, size * 2 + 14, size * 2 + 14, 13);
        ctx.stroke();
      }
      ctx.fillStyle = '#17130d';
      ctx.fillText(labels[note.chord] ?? '', x, LANE.y + 2);
    }
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4 + onBeat * onBeat * 4;
    ctx.beginPath();
    ctx.roundRect(LANE.hitX - 27, LANE.y - 27, 54, 54, 12);
    ctx.stroke();
    for (const pop of this.pops) {
      const t = pop.age / popLife(pop);
      ctx.globalAlpha = 1 - t * t;
      ctx.fillStyle = pop.color;
      if (pop.big) {
        // Across the middle of the picture, growing as it fades.
        ctx.font = `700 ${Math.round(78 + t * 26)}px 'DIN Condensed', 'Bahnschrift Condensed', 'Arial Narrow', sans-serif`;
        // A hard drop shadow: no blur.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillText(pop.text, STAGE_W / 2 + 124, 276 - t * 20);
        ctx.fillStyle = pop.color;
        ctx.fillText(pop.text, STAGE_W / 2 + 120, 272 - t * 20);
      } else {
        ctx.font = "700 34px 'DIN Condensed', 'Bahnschrift Condensed', 'Arial Narrow', sans-serif";
        ctx.fillText(pop.text, LANE.hitX + 40, LANE.y + 62 + t * 18);
      }
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // How much of the song is left.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(0, STAGE_H - 5, STAGE_W, 5);
    ctx.fillStyle = '#f2a531';
    ctx.fillRect(0, STAGE_H - 5, STAGE_W * clamp01(now / FINALE.seconds), 5);
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    ctx.save();
    ctx.translate((Math.random() * 2 - 1) * this.shake, (Math.random() * 2 - 1) * this.shake);
    const t = this.stageTime;
    // Leaving the desk (or the garden at dawn) and landing on the next picture is one turn of the head, not a cut.
    const out = this.stage === 'fall' || this.stage === 'dawn' ? clamp01((t - (SECONDS[this.stage] - WHIP)) / WHIP) : 0;
    const into = this.stage === 'devoured' || this.stage === 'shed' ? 1 - clamp01(t / WHIP) : 0;
    const whip = out > 0 ? -out * out * STAGE_W : into * into * STAGE_W;
    const smeared = (draw: () => void): void => {
      if (whip === 0) {
        draw();
        return;
      }
      // The picture and two ghosts of itself, trailing: a blur with no blur filter.
      for (const [lag, alpha] of [[0.36, 0.3], [0.18, 0.5], [0, 1]] as const) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(whip * (1 - lag), 0);
        draw();
        ctx.restore();
      }
    };
    switch (this.stage) {
      case 'dawn': {
        // The same garden twice: empty, then — without a cut — full.
        const zoom = 1.02 + t * 0.008;
        const full = clamp01((t - DAWN.reveal) / DAWN.dissolve);
        smeared(() => {
          drawPlate(ctx, 'plate_victory', { zoom, focusY: 0.45 });
          if (full > 0) drawPlate(ctx, 'plate_finale_dawn', { zoom, focusY: 0.45, alpha: full * full * (3 - 2 * full) });
        });
        break;
      }
      case 'fall':
        smeared(() => drawPlate(ctx, 'plate_control_room', { zoom: 1.06 + t * 0.02, focusY: 0.42, oneArmed: this.oneArmed }));
        this.atmo.drawFront(ctx);
        break;
      case 'devoured': {
        // Turned round in the chair, and they are already at arm's length.
        smeared(() => drawPlate(ctx, 'plate_finale_desk', { zoom: 1.04 + t * 0.07, focusX: 0.55, focusY: 0.4 }));
        this.atmo.drawFront(ctx);
        for (const grab of GRABS) {
          const since = t - grab.at;
          if (since <= 0) continue;
          // In fast, then closer and closer.
          const reach = 1 - Math.pow(1 - clamp01(since / 0.32), 3);
          const closing = Math.min(1, since / 3);
          drawArm(ctx, sprite(grab.key), { x: lerp(grab.tip.x, CENTRE.x, closing * 0.5) + Math.sin(this.time * 31 + grab.at * 9) * 4, y: lerp(grab.tip.y, CENTRE.y, closing * 0.4) }, { height: 720 + closing * 520, lean: grab.lean, reach, travel: 900 });
        }
        break;
      }
      case 'shed': {
        const start = clamp01((t - 3.5) / 0.6);
        smeared(() => drawPlate(ctx, 'plate_finale_shed', { zoom: 1.2 - Math.min(1, t / 5) * 0.16, focusX: 0.55, focusY: 0.55 }));
        if (this.dawn) this.daybreak(ctx, 0.6);
        // The headlights come up with the engine.
        if (start > 0) this.veil(ctx, '#ffdf9a', start * (0.1 + Math.sin(this.time * 38) * 0.03));
        this.atmo.drawFront(ctx);
        // The two doors, thrown open from the middle.
        const open = 1 - Math.pow(1 - clamp01((t - 0.15) / 0.55), 3);
        if (open < 1) {
          ctx.fillStyle = '#060403';
          ctx.fillRect(0, 0, CENTRE.x * (1 - open), STAGE_H);
          ctx.fillRect(STAGE_W - CENTRE.x * (1 - open), 0, CENTRE.x * (1 - open), STAGE_H);
        }
        break;
      }
      case 'jam':
        this.drawJam(ctx);
        break;
      case 'swarm':
        drawPlate(ctx, this.dawn ? SWARMED.dawn : SWARMED.night, { zoom: SWARMED.zoom(t), focusY: 0.5, oneArmed: this.oneArmed });
        this.atmo.drawFront(ctx);
        break;
    }
    ctx.restore();
    this.veil(ctx, '#000', this.flicker * 0.5);

    this.veil(ctx, '#7a0d06', this.red * 0.55);
    if (this.stage === 'devoured') {
      this.veil(ctx, '#5a0804', clamp01((t - 1.2) / 2.6) * 0.75);
      this.veil(ctx, '#000', clamp01((t - 3.6) / 1.6));
    }
    if (this.stage === 'shed') this.veil(ctx, '#fff', clamp01((t - (SECONDS.shed - 0.35)) / 0.35));
    if (this.stage === 'jam') this.veil(ctx, '#fff', 1 - this.clock / 0.4);
    if (this.stage === 'dawn') this.veil(ctx, '#fff8e8', 1 - t / 0.9);
    if (this.stage === 'swarm') {
      this.veil(ctx, '#fff', 1 - t / 0.5);
      // It does not go to black: the end screen holds this picture, this dark.
      this.veil(ctx, '#0a0604', 0.3 + clamp01((t - 5.5) / 3.2) * (SWARMED.veil - 0.3));
    }
  }
}
