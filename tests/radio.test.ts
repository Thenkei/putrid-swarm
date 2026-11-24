import { describe, expect, it } from 'vitest';
import { chapterWaiting, dawnOf } from '../src/core/chapters';
import { DAY_HOURS } from '../src/core/data/locations';
import { LAST_NIGHT } from '../src/core/data/waves';
import { ALL_ENDINGS, ENDINGS, tallyOf } from '../src/core/endings';
import { concludeNight, newGame, retryChapter, settleRadio, settleShed, startNextDay, startNight } from '../src/core/game';
import { NightSim } from '../src/core/night';
import {
  ANSWERS,
  CALLERS,
  HELLO,
  LINE_SECONDS,
  LOOKOUT,
  NOTHING_HELD,
  QUIET_RADIO,
  RADIO,
  SCRIPTS,
  aftermathOf,
  allyFor,
  allyOf,
  awaitsRadio,
  callerAt,
  canTurn,
  clarity,
  epilogueOf,
  garble,
  guestOf,
  hearThreshold,
  heardShare,
  heardOf,
  hoursOnAir,
  lineSeconds,
  lookoutFor,
  openingOf,
  opensRadio,
  press,
  promptsOf,
  resultOf,
  rollCall,
  sightedOf,
  signalAt,
  startRadio,
  stockAfter,
  strength,
  tick,
  wordHeard,
  type AnswerId,
  type Call,
  type CallerId,
  type Cue,
  type Held,
  type Press,
  type Radio,
  type RadioChapter,
  type RadioResult,
} from '../src/core/radio';
import { createRng } from '../src/core/rng';
import { deserialize, serialize } from '../src/core/save';
import { nightBySector } from '../src/core/shed';
import type { GameState, Inventory, NightReport, Standing } from '../src/core/types';
import { en } from '../src/i18n/en';
import { fr } from '../src/i18n/fr';
import { layout, operate } from './operator';

const STEP = 1 / 60;
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.error)}`);
  return r.value;
};

/** What has a recording: the audio pipeline's own list of processed files. */
const recorded: Record<string, { seconds: number }> = Object.values(import.meta.glob<Record<string, { seconds: number }>>('../public/assets/audio/manifest.json', { eager: true, import: 'default' }))[0] ?? {};

const callOf = (caller: CallerId, secret = false, extra: Partial<Call> = {}): Call => ({ caller, secret, at: 0.7, phase: 0, news: 0.26, baker: null, ...extra });

/** Plays the scene: time passing with keys held, and key presses, collecting what it says happened. */
class Player {
  radio: Radio;
  readonly cues: Cue[] = [];

  constructor(call: Call, oneArmed = false) {
    this.radio = startRadio(call, oneArmed);
  }

  hold(seconds: number, held: Partial<Held> = {}): this {
    const keys: Held = { ...NOTHING_HELD, ...held };
    for (let t = 0; t < Math.round(seconds / STEP); t++) this.apply(tick(this.radio, STEP, keys));
    return this;
  }

  /** Holds until `done`, and fails rather than spin if it never comes. */
  until(done: (radio: Radio) => boolean, held: Partial<Held> | (() => Partial<Held>) = {}, limit = 90): this {
    for (let t = 0; t < limit / STEP && !done(this.radio); t++) this.apply(tick(this.radio, STEP, { ...NOTHING_HELD, ...(typeof held === 'function' ? held() : held) }));
    if (!done(this.radio)) throw new Error(`never got there: beat ${this.radio.beat}, dial ${this.radio.dial}, voice ${callerAt(this.radio.call, this.radio.elapsed)}`);
    return this;
  }

  /** The keys a careful player holds to keep the dial on the voice. */
  steer = (): Partial<Held> => {
    const off = callerAt(this.radio.call, this.radio.elapsed) - this.radio.dial;
    return Math.abs(off) < 0.003 ? {} : off > 0 ? { right: true } : { left: true };
  };

  /** Keeps the dial on the voice, for a while or until something happens. */
  tuned(seconds: number): this {
    for (let t = 0; t < Math.round(seconds / STEP); t++) this.apply(tick(this.radio, STEP, { ...NOTHING_HELD, ...this.steer() }));
    return this;
  }
  tunedUntil(done: (radio: Radio) => boolean, limit = 90): this {
    return this.until(done, this.steer, limit);
  }

  press(...keys: Press[]): this {
    for (const key of keys) this.apply(press(this.radio, key));
    return this;
  }

  private apply(turn: { radio: Radio; cues: readonly Cue[] }): void {
    this.radio = turn.radio;
    this.cues.push(...turn.cues);
  }

  said(type: Cue['type']): boolean {
    return this.cues.some((cue) => cue.type === type);
  }

  // The scene's set pieces, as a player would do them.
  leanIn(): this {
    return this.until((r) => r.beat === 'search', { forward: true });
  }
  find(): this {
    return this.leanIn().tunedUntil((r) => r.beat === 'hail');
  }
  /** Found, answered — again if they did not hear it — and listened to on the voice until they ask. */
  hear(): this {
    this.find();
    return this.tunedUntil((r) => {
      if (r.beat === 'hail' && r.pending === null && r.said === null && r.hand === 'dial') this.press('act');
      return this.radio.beat === 'answer';
    });
  }
  /** Says the n-th answer, kept on the voice — again if it did not reach them — and listens to the end. */
  answer(n: 1 | 2 | 3): this {
    return this.tunedUntil((r) => {
      if (r.beat === 'answer' && r.answer === null && promptsOf(r).some((q) => q.id === `answer_${n}`)) this.press(`answer_${n}`);
      return this.radio.beat === 'over';
    });
  }
}

const words = (id: string): number => fr.voice[id as keyof typeof fr.voice].split(' ').length;

describe('the camper on the CB', () => {
  it.each(['camper_owes', 'camper_grudge'] as const)('receives the two pulls before %s identifies himself, once per call', caller => {
    const p = new Player(callOf(caller)).leanIn().hold(8);
    expect(p.said('foley')).toBe(false);
    p.tunedUntil(() => p.said('foley'));
    expect(p.said('line')).toBe(false);
    expect(p.cues.at(-1)).toEqual({ type: 'foley', sound: 'camper_zip' });
    p.tuned(18);
    expect(p.cues.filter(cue => cue.type === 'foley')).toHaveLength(1);
    expect(p.said('line')).toBe(true);
  });

  it('hears his breath after the bite admission, never for the healthy camper or either grudge secret', () => {
    for (const [caller, secret, breath] of [
      ['camper_owes', true, true], ['camper_owes', false, false],
      ['camper_grudge', true, false], ['camper_grudge', false, false],
      ['dealer_owes', true, false], ['ham', false, false],
    ] as const) {
      const p = new Player(callOf(caller, secret)).hear();
      const foley = p.cues.filter(cue => cue.type === 'foley');
      expect(foley.some(cue => cue.sound === 'camper_zip')).toBe(caller.startsWith('camper'));
      expect(foley.some(cue => cue.sound === 'camper_breath')).toBe(breath);
    }
  });

  it('does not explain a missed admission when the dial returns at the end of the line', () => {
    const p = new Player(callOf('camper_owes', true)).find().press('act');
    p.tunedUntil(r => r.on?.line === 'vo_cb_camper_owes_2a');
    p.radio = { ...p.radio, dial: .02 };
    p.hold(2.5);
    p.radio = { ...p.radio, dial: callerAt(p.radio.call, p.radio.elapsed) };
    p.tunedUntil(r => r.beat === 'answer');
    expect(p.cues).not.toContainEqual({ type: 'foley', sound: 'camper_breath' });
  });
});

// ───────────────────────────── Finding the voice ─────────────────────────────

describe('the radio: finding the voice', () => {
  it('leans in only while ↑ is held, and leans back when it is let go', () => {
    const p = new Player(callOf('ham')).hold(0.6, { forward: true });
    expect(p.radio.lean).toBeGreaterThan(0.3);
    p.hold(2);
    expect(p.radio.lean).toBe(0);
    expect(p.radio.beat).toBe('arrive');
    p.leanIn();
    expect(p.said('leaned')).toBe(true);
    expect(promptsOf(p.radio).map((q) => q.id)).toEqual(['tune', 'off']);
  });

  it('gives static away from the voice, and a needle that peaks on it', () => {
    const r = startRadio(callOf('ham'), false);
    expect(signalAt(r, callerAt(r.call, 0))).toBeCloseTo(1, 5);
    expect(signalAt(r, RADIO.dialStart)).toBeLessThan(0.01);
    expect(strength(r, 'caller')).toBeLessThan(0.01);
    expect(signalAt(r, r.call.news)).toBeCloseTo(1, 5);
  });

  it('turns with ← and →, at its own pace, and stops at the ends of the band', () => {
    const p = new Player(callOf('ham')).leanIn();
    const from = p.radio.dial;
    p.hold(1, { right: true });
    expect(p.radio.dial - from).toBeCloseTo(RADIO.turnRate, 2);
    p.hold(3, { left: true });
    expect(p.radio.dial).toBe(0);
    p.hold(1, { left: true, right: true });
    expect(p.radio.dial).toBe(0);
  });

  it('finds the voice only when held on it, not by sweeping past it', () => {
    const p = new Player(callOf('ham')).leanIn();
    p.hold(9, { right: true });
    expect(p.radio.dial).toBeGreaterThan(0.9);
    expect(p.radio.beat).toBe('search');
    p.tunedUntil((r) => r.beat === 'hail');
    expect(p.said('found')).toBe(true);
    expect(p.radio.trail).toEqual(['found']);
  });

  it('drifts: a dial left alone loses the voice it was on', () => {
    const p = new Player(callOf('ham')).find();
    expect(strength(p.radio, 'caller')).toBeGreaterThan(RADIO.lock);
    const lost: number[] = [];
    for (let i = 0; i < 20; i++) lost.push(p.hold(1).radio.dial === p.radio.dial ? strength(p.radio, 'caller') : 0);
    expect(Math.min(...lost)).toBeLessThan(RADIO.hearFloor);
  });

  it('keeps calling while nobody answers, through its three calls in turn', () => {
    const p = new Player(callOf('dealer_owes')).find().tuned(30);
    const calls = p.cues.filter((c): c is Extract<Cue, { type: 'line' }> => c.type === 'line').map((c) => c.line);
    expect(new Set(calls)).toEqual(new Set(SCRIPTS.dealer_owes.calls));
    expect(calls.slice(0, 3)).toEqual([...SCRIPTS.dealer_owes.calls]);
  });

  it('notices the broadcast on the way, and the baker’s round only when he was let go', () => {
    const plain = new Player(callOf('ham')).leanIn().hold(6, { right: true });
    expect(plain.cues.filter((c) => c.type === 'tuned').map((c) => (c as { station: string }).station)).toEqual(['news']);
    const baker = new Player(callOf('ham', false, { baker: 0.4 })).leanIn().hold(6, { right: true });
    expect(baker.cues.filter((c) => c.type === 'tuned').map((c) => (c as { station: string }).station)).toEqual(['news', 'baker']);
  });
});

// ───────────────────────────── Talking ─────────────────────────────

describe('the radio: talking', () => {
  it('is not heard when the microphone is keyed off the voice: they keep calling', () => {
    const p = new Player(callOf('ham')).find();
    p.hold(0.1, { left: true }).hold(1.2, { left: true });
    expect(strength(p.radio, 'caller')).toBeLessThan(RADIO.reachThem);
    expect(promptsOf(p.radio).find((q) => q.id === 'hello')?.weak).toBe(true);
    p.press('act');
    expect(p.radio.beat).toBe('hello');
    expect(p.radio.said?.reached).toBe(false);
    p.until((r) => r.said === null);
    expect(p.radio.beat).toBe('hail');
    expect(p.radio.trail).toContain('missed');
  });

  it('starts the conversation when answered on the voice: who they are, their secret as it is, and what they want', () => {
    for (const secret of [true, false]) {
      const p = new Player(callOf('camper_owes', secret)).find().press('act');
      expect(p.radio.said).toMatchObject({ line: HELLO, reached: true });
      p.tunedUntil((r) => r.beat === 'answer');
      const said = p.cues.filter((c): c is Extract<Cue, { type: 'line' }> => c.type === 'line').map((c) => c.line).filter((l) => !SCRIPTS.camper_owes.calls.includes(l));
      expect(said).toEqual([...openingOf(p.radio.call), SCRIPTS.camper_owes.ask]);
      expect(said[1]).toBe(secret ? 'vo_cb_camper_owes_2a' : 'vo_cb_camper_owes_2b');
      expect(p.radio.trail).toEqual(['found', 'hailed']);
    }
  });

  it('cuts their call short when the microphone is keyed over it', () => {
    const p = new Player(callOf('ham')).find().tunedUntil((r) => r.on !== null);
    p.press('act');
    expect(p.cues.at(-2)).toMatchObject({ type: 'line_end', cut: true });
    expect(p.radio.on).toBeNull();
  });

  it('gets most words through on the voice, a few lost when it fades, and pieces of it as it drifts', () => {
    const held = new Player(callOf('ham')).hear();
    for (const line of openingOf(held.radio.call)) {
      const heard = heardOf(held.radio, line);
      expect(heard && heardShare(fr.voice[line as keyof typeof fr.voice], heard.slots)).toBeGreaterThanOrEqual(0.85);
    }
    const loose = new Player(callOf('ham')).find().press('act').until((r) => r.beat === 'answer');
    const shares = openingOf(loose.radio.call).map((line) => heardShare(fr.voice[line as keyof typeof fr.voice], heardOf(loose.radio, line)?.slots ?? []));
    expect(Math.min(...shares)).toBeLessThan(0.6);
    expect(loose.said('losing')).toBe(true);
  });

  it('asks whether anyone is there, then gives up and leaves: nothing said is silence', () => {
    const p = new Player(callOf('dealer_grudge')).hear();
    expect(promptsOf(p.radio).map((q) => q.id)).toEqual(['answer_1', 'answer_2', 'answer_3', 'tune', 'off']);
    p.tuned(RADIO.nudgeAt + 0.1);
    expect(p.radio.on?.line).toBe(SCRIPTS.dealer_grudge.nudge);
    expect(p.radio.trail).toContain('nudged');
    p.tunedUntil((r) => r.beat === 'over');
    expect(p.radio.ending).toBe('silence');
    expect(heardOf(p.radio, SCRIPTS.dealer_grudge.gone)).toBeDefined();
    expect(resultOf(p.radio)).toMatchObject({ ending: 'silence', answer: null });
    expect(p.radio.trail.at(-1)).toBe('gave_up');
  });

  it('leaves them waiting when an answer does not reach them, and they ask at once', () => {
    const p = new Player(callOf('ham')).hear().hold(1, { left: true });
    expect(strength(p.radio, 'caller')).toBeLessThan(RADIO.reachThem);
    p.press('answer_1').until((r) => r.said === null);
    expect(p.radio.beat).toBe('answer');
    expect(p.radio.answer).toBeNull();
    expect(p.radio.on?.line).toBe(SCRIPTS.ham.nudge);
    expect(p.radio.trail).toContain('missed');
  });

  it('answers each of the three ways, hears what they say back, and ends as that answer is', () => {
    for (const caller of CALLERS) {
      SCRIPTS[caller].options.forEach((option, i) => {
        const p = new Player(callOf(caller)).hear().answer((i + 1) as 1 | 2 | 3);
        expect(p.radio.ending).toBe(option.kind);
        expect(p.radio.answer).toBe(option.id);
        for (const reply of option.replies) expect(heardOf(p.radio, reply)).toBeDefined();
        expect(resultOf(p.radio)).toMatchObject({ ending: option.kind, answer: option.id });
        expect(p.radio.trail).toEqual(['found', 'hailed', 'answered']);
      });
    }
  });

  it('can be switched off whenever nobody is speaking into it, and nothing comes of that', () => {
    for (const reach of ['search', 'hail', 'talk', 'answer'] as const) {
      const p = new Player(callOf('camper_grudge')).leanIn();
      if (reach !== 'search') p.tunedUntil((r) => r.beat === 'hail');
      if (reach === 'talk' || reach === 'answer') p.press('act').tunedUntil((r) => r.beat === reach);
      p.hold(0.5, { back: true }).hold(1);
      expect(p.radio.off).toBe(0);
      p.until((r) => r.beat === 'over', { back: true }, 3);
      expect(p.radio.ending).toBe('off');
      expect(resultOf(p.radio)?.answer).toBeNull();
      expect(p.radio.trail.at(-1)).toBe('switched_off');
    }
    const speaking = new Player(callOf('ham')).find().press('act');
    expect(promptsOf(speaking.radio).some((q) => q.id === 'off')).toBe(false);
    speaking.hold(0.5, { back: true });
    expect(speaking.radio.off).toBe(0);
  });

  it('can be hung up once answered: the answer stands, what was still to come is not heard', () => {
    const p = new Player(callOf('ham')).hear().press('answer_1').tunedUntil((r) => r.beat === 'response');
    expect(promptsOf(p.radio).some((q) => q.id === 'hang_up')).toBe(true);
    p.until((r) => r.beat === 'over', { back: true }, 3);
    expect(p.radio.ending).toBe('trusted');
    expect(p.radio.trail.at(-1)).toBe('hung_up');
    expect(resultOf(p.radio)?.sighted).toEqual([]);
  });

  it('lets through the doors of the last night that the man on the hill names while the voice is held', () => {
    const held = new Player(callOf('ham')).hear().answer(1);
    const sighted = resultOf(held.radio)?.sighted ?? [];
    expect(sighted.length).toBeGreaterThanOrEqual(3);
    // In his order, whatever got lost.
    expect(LOOKOUT.stay?.marks.map((m) => m.sector).filter((s) => sighted.includes(s))).toEqual(sighted);
    for (let phase = 0; phase < 4; phase++) {
      const curt = new Player(callOf('ham', false, { phase })).hear().answer(2);
      expect(['portail'], `phase ${phase}`).toEqual(expect.arrayContaining([...(resultOf(curt.radio)?.sighted ?? [])]));
    }
    // Answered, then left to drift: he says it all to a dial that is no longer on him.
    const lost = new Player(callOf('ham')).hear().press('answer_1').until((r) => r.beat === 'over');
    expect(resultOf(lost.radio)?.sighted.length).toBeLessThan(sighted.length);
  });

  it('ignores everything once it is over', () => {
    const p = new Player(callOf('ham')).hear().answer(3);
    const over = p.radio;
    p.hold(2, { right: true, back: true }).press('act', 'answer_1');
    expect(p.radio).toBe(over);
    expect(promptsOf(over)).toEqual([]);
  });
});

// ───────────────────────────── One arm ─────────────────────────────

describe('the radio: with one arm', () => {
  it('sends the one hand from the dial to the microphone and back: no turning on the way, or while it speaks', () => {
    const p = new Player(callOf('ham'), true).find().press('act');
    expect(p.radio.hand).toBe('to_mic');
    expect(p.radio.beat).toBe('hail');
    expect(canTurn(p.radio)).toBe(false);
    expect(promptsOf(p.radio).map((q) => q.id)).toEqual(['hand', 'off'].filter((id) => id !== 'off'));
    const dial = p.radio.dial;
    p.hold(RADIO.crossSeconds * 0.9, { right: true });
    expect(p.radio.dial).toBe(dial);
    p.hold(RADIO.crossSeconds * 0.2, { right: true });
    expect(p.radio.hand).toBe('mic');
    expect(p.radio.beat).toBe('hello');
    expect(p.said('hand')).toBe(true);
    p.hold(1, { right: true });
    expect(p.radio.dial).toBe(dial);
    p.until((r) => r.said === null);
    expect(p.radio.hand).toBe('to_dial');
    p.until((r) => r.hand === 'dial');
    expect(canTurn(p.radio)).toBe(true);
  });

  it('keeps nothing in the other hand: two arms can tune while they speak', () => {
    const p = new Player(callOf('ham')).find().press('act');
    expect(p.radio.hand).toBe('dial');
    expect(canTurn(p.radio)).toBe(true);
    const dial = p.radio.dial;
    p.hold(0.5, { right: true });
    expect(p.radio.dial).toBeGreaterThan(dial);
  });

  it('hears less, with the voice drifting while the hand is away, than a careful player with two', () => {
    const share = (oneArmed: boolean, phase: number): number => {
      const p = new Player(callOf('dealer_owes', false, { phase }), oneArmed).hear();
      const first = openingOf(p.radio.call)[0] as string;
      return heardShare(fr.voice[first as keyof typeof fr.voice], heardOf(p.radio, first)?.slots ?? []);
    };
    const phases = [0, 1, 2, 3, 4, 5];
    const two = phases.map((phase) => share(false, phase));
    const one = phases.map((phase) => share(true, phase));
    expect(one.reduce((a, b) => a + b, 0)).toBeLessThan(two.reduce((a, b) => a + b, 0));
    expect(Math.min(...one)).toBeLessThan(0.9);
  });

  it('can still answer, the hand going to the microphone first', () => {
    const p = new Player(callOf('camper_owes'), true).hear();
    p.press('answer_2');
    expect(p.radio.pending).toBe('shed');
    expect(promptsOf(p.radio).some((q) => q.id.startsWith('answer'))).toBe(false);
    p.answer(2);
    expect(p.radio.ending).toBe('bargained');
  });
});

// ───────────────────────────── Hearing in pieces ─────────────────────────────

describe('the radio: what gets through', () => {
  const text = 'Ce soir, ils viennent surtout par le portail.';

  it('shows a line whole, or with static where the words did not get through', () => {
    expect(garble(text, null)).toBe(text);
    expect(garble(text, Array.from({ length: RADIO.slots }, () => 1))).toBe(text);
    const none = garble(text, Array.from({ length: RADIO.slots }, () => 0));
    expect(none).not.toMatch(/[a-z]/i);
    expect(none.length).toBe(text.length);
    expect(none.split(' ').length).toBe(text.split(' ').length);
    expect(none).toContain(',');
  });

  it('picks out the doors of the last night from what was heard of the line that names them', () => {
    const line = LOOKOUT.stay?.line ?? '';
    const all = Array.from({ length: RADIO.slots }, () => 1);
    const first = Array.from({ length: RADIO.slots }, (_, i) => (i < RADIO.slots * 0.5 ? 1 : 0));
    expect(sightedOf({ heard: [{ line, slots: all }], answer: 'stay' })).toEqual(['portail', 'arriere', 'verger', 'grange']);
    expect(sightedOf({ heard: [{ line, slots: first }], answer: 'stay' })).toEqual(['portail']);
    expect(sightedOf({ heard: [{ line, slots: all }], answer: 'many' })).toEqual([]);
    expect(sightedOf({ heard: [], answer: 'stay' })).toEqual([]);
  });

  it('lets the first half through when only the first half was tuned, and shows nothing not yet said', () => {
    const half = Array.from({ length: RADIO.slots }, (_, i) => (i < RADIO.slots / 2 ? 1 : 0));
    const shown = garble(text, half);
    expect(shown.startsWith('Ce soir, ils')).toBe(true);
    expect(shown.endsWith('portail.')).toBe(false);
    expect(garble(text, half, 0.3).split(' ').length).toBeLessThan(text.split(' ').length);
    expect(heardShare(text, half)).toBeGreaterThan(0.3);
    expect(heardShare(text, half)).toBeLessThan(0.8);
  });

  it('needs a stronger signal for some words than for others, always between the floor and the sure', () => {
    const levels = Array.from({ length: 200 }, (_, i) => hearThreshold(i / 200));
    expect(Math.min(...levels)).toBeGreaterThanOrEqual(RADIO.hearFloor);
    expect(Math.max(...levels)).toBeLessThanOrEqual(RADIO.hearSure);
    expect(new Set(levels.map((l) => l.toFixed(2))).size).toBeGreaterThan(10);
    const at = 0.5;
    expect(wordHeard(Array.from({ length: RADIO.slots }, () => RADIO.hearSure), at)).toBe(true);
    expect(wordHeard(Array.from({ length: RADIO.slots }, () => RADIO.hearFloor - 0.01), at)).toBe(false);
  });
});

// ───────────────────────────── Who calls ─────────────────────────────

const standing = (dealer: Standing | null, camper: Standing | null): GameState['people'] => ({
  ...(dealer ? { dealer: { standing: dealer, met: 2, fought: dealer === 'grudge' } } : {}),
  ...(camper ? { camper: { standing: camper, met: 1, fought: false } } : {}),
});

describe('the radio: who calls', () => {
  const roll = (people: GameState['people'], shed: GameState['shed'] = 'quiet', seed = 1): Call => rollCall({ people, shed }, createRng(seed));

  it('is the man on the hill for a run that met nobody, or nobody who remembers', () => {
    expect(roll({}).caller).toBe('ham');
    expect(roll(standing('stranger', 'stranger')).caller).toBe('ham');
    expect(roll({}).secret).toBe(false);
  });

  it('is whoever owes the player or holds a grudge, and the call follows how they stand', () => {
    expect(roll(standing('owes', null)).caller).toBe('dealer_owes');
    expect(roll(standing('grudge', 'stranger')).caller).toBe('dealer_grudge');
    expect(roll(standing(null, 'owes')).caller).toBe('camper_owes');
    expect(roll(standing('stranger', 'grudge')).caller).toBe('camper_grudge');
  });

  it('picks either of two who remember, by the run’s own luck, and their secret too', () => {
    const callers = new Set<CallerId>();
    const secrets = new Set<boolean>();
    for (let seed = 1; seed < 40; seed++) {
      const call = roll(standing('owes', 'grudge'), 'quiet', seed);
      callers.add(call.caller);
      secrets.add(call.secret);
      expect(call.at).toBeGreaterThanOrEqual(RADIO.callerBand[0]);
      expect(call.at).toBeLessThanOrEqual(RADIO.callerBand[1]);
      expect(roll(standing('owes', 'grudge'), 'quiet', seed)).toEqual(call);
    }
    expect(callers).toEqual(new Set(['dealer_owes', 'camper_grudge']));
    expect(secrets).toEqual(new Set([true, false]));
  });

  it('puts the baker’s round on the band only if he was let go', () => {
    expect(roll({}, 'freed').baker).not.toBeNull();
    for (const shed of ['quiet', 'chained', 'finished', 'emptied'] as const) expect(roll({}, shed).baker).toBeNull();
  });
});

// ───────────────────────────── The campaign ─────────────────────────────

const report = (night: number, survived = true): NightReport => ({
  night,
  survived,
  kills: {},
  breaches: 0,
  houseDamage: 0,
  devicesBroken: 0,
  barricadeDamage: { portail: 0, grange: 0, arriere: 0, verger: 0 },
  triggers: 0,
  autoTriggers: 0,
  bossDefeated: null,
  durationSeconds: 60,
  cameraLost: null,
  traps: {},
});

const STOCK: Inventory = { wood: 10, scrap: 6, springs: 3, wire: 4, battery: 2 };
const base = (people: GameState['people'] = {}): GameState => ({ ...layout(newGame(5), 4), day: RADIO.night, orchard: 'spared', shed: 'finished', people, inventory: STOCK });
const waiting = (call: Call, people: GameState['people'] = {}): GameState => ({ ...base(people), phase: 'morning', hoursLeft: 0, lastNight: report(RADIO.night), radio: { ...QUIET_RADIO, stage: 'waiting', call } });
const result = (ending: RadioResult['ending'], answer: AnswerId | null, hours = 1, sighted: RadioResult['sighted'] = []): RadioResult => ({ ending, answer, hours, sighted });

describe('the radio: in the campaign', () => {
  it('is opened by night 6 and only by night 6, once, if it was won, and rolls who calls then', () => {
    const state = base(standing('owes', null));
    for (let night = 1; night <= 7; night++) {
      const opened = opensRadio({ ...state, day: night }, report(night));
      expect(opened.radio.stage).toBe(night === RADIO.night ? 'waiting' : 'quiet');
    }
    expect(opensRadio(state, report(RADIO.night, false)).radio.stage).toBe('quiet');
    const opened = opensRadio(state, report(RADIO.night));
    expect(opened.radio.call?.caller).toBe('dealer_owes');
    expect(opened.rng).not.toBe(state.rng);
    expect(opensRadio(opened, report(RADIO.night))).toBe(opened);
  });

  it('is opened by the night itself, through the chapters, and holds the next day back until the call is taken', () => {
    let state: GameState = unwrap(startNight({ ...base(), phase: 'day', where: 'home', hoursLeft: 2 }));
    const sim = new NightSim(state.day, state.yard, state.seed);
    for (let t = 0; t < 60 * 900 && sim.outcome === 'ongoing'; t++) {
      operate(sim);
      sim.step(STEP);
    }
    expect(sim.outcome).toBe('survived');
    state = concludeNight(state, sim);
    expect(state.phase).toBe('morning');
    expect(chapterWaiting(state)).toBe('radio');
    expect(awaitsRadio(state)).toBe(true);
    expect(startNextDay(state)).toBe(state);
  });

  it('touches no other morning, and nothing ends a run on it', () => {
    const later = { ...base(), shed: 'chained' as const, day: LAST_NIGHT };
    expect(dawnOf({ ...later, radio: { ...QUIET_RADIO, stage: 'done', call: callOf('camper_owes'), ending: 'bargained', answer: 'shed' } })).toEqual(dawnOf(later));
    expect(retryChapter({ ...waiting(callOf('ham')), phase: 'lost' }).ok).toBe(false);
  });

  it('starts the last day short of the daylight the morning took, and of what the answer takes', () => {
    const day = unwrap(settleRadio(waiting(callOf('dealer_owes')), result('bargained', 'landmark', 1.25)));
    expect(day.phase).toBe('day');
    expect(day.day).toBe(LAST_NIGHT);
    expect(day.hoursLeft).toBe(DAY_HOURS - 1.25 - RADIO.fetchHours);
    expect(day.inventory).toEqual({ wood: 14, scrap: 9, springs: 5, wire: 4, battery: 3 });
    expect(day.radio).toMatchObject({ stage: 'done', ending: 'bargained', answer: 'landmark' });
    expect(chapterWaiting({ ...day, phase: 'morning' })).toBeNull();
  });

  it('never starts a day with less than nothing, nor with more than a day', () => {
    expect(unwrap(settleRadio(waiting(callOf('dealer_grudge', true)), result('trusted', 'address', 12))).hoursLeft).toBe(0);
    expect(unwrap(settleRadio(waiting(callOf('camper_owes')), result('bargained', 'shed', 0.25))).hoursLeft).toBe(DAY_HOURS);
  });

  it('writes down how the caller stands with the player afterwards, for the last day’s outings', () => {
    expect(unwrap(settleRadio(waiting(callOf('dealer_owes'), standing('owes', null)), result('trusted', 'address'))).people.dealer?.standing).toBe('stranger');
    expect(unwrap(settleRadio(waiting(callOf('dealer_owes'), standing('owes', null)), result('refused', 'keep'))).people.dealer?.standing).toBe('owes');
    expect(unwrap(settleRadio(waiting(callOf('camper_grudge'), standing(null, 'grudge')), result('trusted', 'invite'))).people.camper?.standing).toBe('owes');
    expect(unwrap(settleRadio(waiting(callOf('dealer_grudge'), standing('grudge', null)), result('lied', 'lie'))).people.dealer?.standing).toBe('grudge');
    expect(unwrap(settleRadio(waiting(callOf('ham')), result('trusted', 'stay'))).people).toEqual({});
  });

  it('refuses a morning that is not waiting for it, and the shed refuses the radio’s', () => {
    expect(settleRadio(base(), result('off', null)).ok).toBe(false);
    expect(settleShed(waiting(callOf('ham')), { ending: 'chained', learned: [], hours: 1 }).ok).toBe(false);
  });

  it('counts the morning to the quarter hour, within bounds', () => {
    expect(hoursOnAir(0)).toBe(0.25);
    expect(hoursOnAir(30)).toBe(0.75);
    expect(hoursOnAir(61)).toBe(1.5);
    expect(hoursOnAir(9999)).toBe(RADIO.maxHours);
  });
});

// ───────────────────────────── What follows ─────────────────────────────

describe('the radio: what each answer leads to', () => {
  const after = (caller: CallerId, answer: AnswerId | null, secret = false, stock = STOCK) => aftermathOf(callOf(caller, secret), answer, stock);

  it('brings La Brocanteuse’s load to the gate, and the committee with it if it was listening', () => {
    expect(after('dealer_owes', 'address')).toMatchObject({ gift: RADIO.load, toll: 0, hours: 0, standing: 'stranger' });
    expect(after('dealer_owes', 'address', true)).toMatchObject({ gift: RADIO.load, toll: RADIO.toll.listening, hours: RADIO.gateHours });
    const visited = stockAfter(STOCK, after('dealer_owes', 'address', true));
    expect(Object.values(visited.took).reduce((a, b) => a + (b ?? 0), 0)).toBe(RADIO.toll.listening);
    expect(after('dealer_owes', 'landmark', true)).toMatchObject({ gift: RADIO.load, toll: 0, hours: RADIO.fetchHours, standing: 'stranger' });
    expect(after('dealer_owes', 'keep')).toMatchObject({ gift: {}, toll: 0, hours: 0, standing: null });
  });

  it('puts the camper at the back door tonight, or in the shed by day, or nowhere', () => {
    expect(after('camper_owes', 'shelter').ally).toEqual({ sector: RADIO.ally.door, factor: RADIO.ally.factor, turnsAtWave: null, loss: RADIO.ally.turnLoss });
    expect(after('camper_owes', 'shelter', true).ally?.turnsAtWave).toBe(RADIO.ally.turnWave);
    expect(after('camper_owes', 'shed', true)).toMatchObject({ ally: null, guest: true, hours: -RADIO.helperHours });
    expect(after('camper_owes', 'no')).toMatchObject({ ally: null, guest: false, hours: 0, standing: null });
  });

  it('sends the committee to the gate for what they asked, more if they are many, settled either way', () => {
    expect(after('dealer_grudge', 'address')).toMatchObject({ toll: RADIO.toll.few, standing: 'stranger', hours: RADIO.gateHours });
    expect(after('dealer_grudge', 'address', true)).toMatchObject({ toll: RADIO.toll.many, standing: 'stranger' });
    expect(after('dealer_grudge', 'planks')).toMatchObject({ pay: { wood: RADIO.planks }, toll: 0, standing: 'stranger', hours: RADIO.crossroadsHours });
    expect(after('dealer_grudge', 'planks', true)).toMatchObject({ pay: { wood: RADIO.planks }, toll: RADIO.toll.refusedOffer, standing: null });
    expect(after('dealer_grudge', 'planks', false, { ...STOCK, wood: 1 }).pay).toEqual({ wood: 1 });
    expect(after('dealer_grudge', 'lie', true)).toMatchObject({ toll: 0, hours: 0, standing: null });
  });

  it('settles the van people with a battery, or brings them, or brings the camper alone', () => {
    expect(after('camper_grudge', 'battery')).toMatchObject({ pay: { battery: 1 }, toll: 0, standing: 'stranger' });
    expect(after('camper_grudge', 'battery', false, { ...STOCK, battery: 0 })).toMatchObject({ pay: {}, toll: RADIO.toll.unpaid, standing: null });
    expect(after('camper_grudge', 'refuse')).toMatchObject({ toll: 0, standing: null });
    expect(after('camper_grudge', 'refuse', true)).toMatchObject({ toll: RADIO.toll.refused });
    expect(after('camper_grudge', 'invite', true)).toMatchObject({ toll: RADIO.toll.invited, ally: null });
    expect(after('camper_grudge', 'invite')).toMatchObject({ toll: 0, standing: 'owes', ally: { sector: RADIO.ally.door, turnsAtWave: null } });
    // The van lot take no planks.
    const visit = stockAfter({ wood: 20, scrap: 0, springs: 0, wire: 0, battery: 0 }, after('camper_grudge', 'refuse', true));
    expect(visit.took).toEqual({});
  });

  it('gives the man on the hill’s doors for staying or asking, nothing for a lie, and nothing for silence', () => {
    expect(after('ham', 'stay').lookout).toBe('stay');
    expect(after('ham', 'info').lookout).toBe('info');
    expect(after('ham', 'many')).toMatchObject({ lookout: null, gift: {}, toll: 0 });
    for (const caller of CALLERS) expect(after(caller, null, true)).toMatchObject({ gift: {}, toll: 0, hours: 0, ally: null, guest: false, standing: null });
  });

  it('stays bounded whatever the call: a visit takes six pieces at most, nothing goes below zero, an hour and a half at most', () => {
    for (const caller of CALLERS) {
      for (const answer of ANSWERS) {
        for (const secret of [true, false]) {
          for (const stock of [STOCK, { wood: 0, scrap: 0, springs: 0, wire: 0, battery: 0 }]) {
            const a = after(caller, answer, secret, stock);
            const visit = stockAfter(stock, a);
            expect(a.toll).toBeLessThanOrEqual(6);
            expect(a.hours).toBeLessThanOrEqual(RADIO.fetchHours);
            for (const n of Object.values(visit.stock)) expect(n).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it('takes the visit out of the stock that day, and keeps what was taken for the card', () => {
    const day = unwrap(settleRadio(waiting(callOf('dealer_grudge', true)), result('trusted', 'address', 1)));
    const taken = Object.values(day.radio.took).reduce((a, b) => a + (b ?? 0), 0);
    expect(taken).toBe(RADIO.toll.many);
    expect(Object.values(day.inventory).reduce((a, b) => a + b, 0)).toBe(Object.values(STOCK).reduce((a, b) => a + b, 0) - RADIO.toll.many);
    expect(day.hoursLeft).toBe(DAY_HOURS - 1 - RADIO.gateHours);
  });
});

// ───────────────────────────── The last day and the last night ─────────────────────────────

const done = (call: Call, answer: AnswerId | null, ending: RadioChapter['ending'], extra: Partial<RadioChapter> = {}): RadioChapter => ({ ...QUIET_RADIO, stage: 'done', call, answer, ending, ...extra });

describe('the radio: the last day and the last night', () => {
  it('hands the night the door held only on the last night, after someone said to come', () => {
    const radio = done(callOf('camper_owes'), 'shelter', 'trusted');
    expect(allyFor({ day: LAST_NIGHT, radio })).toEqual(allyOf(radio.call as Call, 'shelter'));
    expect(allyFor({ day: LAST_NIGHT - 1, radio })).toBeNull();
    expect(allyFor({ day: LAST_NIGHT, radio: done(callOf('camper_owes'), 'no', 'refused') })).toBeNull();
    expect(allyFor({ day: LAST_NIGHT, radio: QUIET_RADIO })).toBeNull();
  });

  it('halves what the held door takes, and changes nothing else of the night', () => {
    const state = layout(newGame(9), 3);
    const run = (ally: Parameters<typeof allyOf>[1] | null, bitten = false) => {
      const sim = new NightSim(LAST_NIGHT, state.yard, 9, null, null, ally ? allyOf(callOf('camper_owes', bitten), ally) : null);
      for (let t = 0; t < 60 * 120; t++) sim.step(STEP);
      return sim;
    };
    const alone = run(null);
    const held = run('shelter');
    const door = RADIO.ally.door;
    const lost = (sim: NightSim) => state.yard.barricades[door].hp - sim.barricades[door].hp;
    expect(lost(alone)).toBeGreaterThan(0);
    expect(lost(held)).toBeLessThan(lost(alone));
    expect(held.heldDoor).toBe(door);
    const same = new NightSim(LAST_NIGHT, state.yard, 9);
    for (let t = 0; t < 60 * 120; t++) same.step(STEP);
    expect(same.barricades).toEqual(alone.barricades);
  });

  it('turns, if he was bitten, as the second wave starts: half that barricade gone, and the door no longer held', () => {
    const state = layout(newGame(9), 3);
    const sim = new NightSim(LAST_NIGHT, state.yard, 9, null, null, allyOf(callOf('camper_owes', true), 'shelter'));
    let before = 0;
    let turned = false;
    for (let t = 0; t < 60 * 400 && !turned; t++) {
      before = sim.barricades[RADIO.ally.door].hp;
      sim.step(STEP);
      turned = sim.drainEvents().some((e) => e.type === 'ally_turned' && e.sector === RADIO.ally.door);
    }
    expect(turned).toBe(true);
    expect(sim.waveIndex).toBe(RADIO.ally.turnWave);
    expect(sim.barricades[RADIO.ally.door].hp).toBeLessThanOrEqual(Math.round(before * (1 - RADIO.ally.turnLoss)) + 1);
    expect(sim.heldDoor).toBeNull();
  });

  it.each([[0.8, 1], [0, 0]])('counts the camper’s blow exactly once with %s HP left on the rear jamb', (hp, breaches) => {
    const { yard } = newGame(11);
    const ally = allyOf(callOf('camper_owes', true), 'shelter')!;
    const injured = { ...yard, barricades: { ...yard.barricades, arriere: { ...yard.barricades.arriere, hp } } };
    const sim = new NightSim(LAST_NIGHT, injured, 11, null, null, { ...ally, turnsAtWave: 1 });
    while (!sim.waveIndex) sim.step(STEP);
    const events = sim.drainEvents().filter(e => e.type === 'ally_turned' || e.type === 'breach');
    expect(events.map(e => e.type)).toEqual(breaches ? ['ally_turned', 'breach'] : ['ally_turned']);
    expect(sim.barricades.arriere.hp).toBe(0);
    expect(sim.report().breaches).toBe(breaches);
  });

  it('lays out the last night door by door from the wave table, only the doors that got through', () => {
    const marks = LOOKOUT.stay?.marks.map((m) => m.sector);
    expect(marks).toEqual(nightBySector(LAST_NIGHT).map((row) => row.sector));
    const radio = done(callOf('ham'), 'stay', 'trusted', { sighted: ['arriere', 'grange'] });
    const seen = lookoutFor({ day: LAST_NIGHT, phase: 'day', radio });
    expect(seen?.rows.map((r) => r.sector)).toEqual(['arriere', 'grange']);
    expect(seen?.missed).toBe(2);
    expect(lookoutFor({ day: LAST_NIGHT, phase: 'day', radio: { ...radio, sighted: [] } })).toEqual({ rows: [], missed: 4 });
    expect(lookoutFor({ day: LAST_NIGHT, phase: 'night', radio })).toBeNull();
    expect(lookoutFor({ day: LAST_NIGHT, phase: 'day', radio: done(callOf('ham'), 'many', 'lied') })).toBeNull();
  });

  it('keeps the camper in the shed for the end, turned or not', () => {
    expect(guestOf({ radio: done(callOf('camper_owes'), 'shed', 'bargained') })).toBe('guest');
    expect(guestOf({ radio: done(callOf('camper_owes', true), 'shed', 'bargained') })).toBe('turned');
    expect(guestOf({ radio: done(callOf('camper_owes'), 'shelter', 'trusted') })).toBeNull();
  });

  it('leaves a last line for the end of the run, by what the call led to', () => {
    const cases: [RadioChapter, ReturnType<typeof epilogueOf>][] = [
      [done(callOf('camper_owes'), 'shelter', 'trusted'), 'held'],
      [done(callOf('camper_owes', true), 'shelter', 'trusted'), 'turned'],
      [done(callOf('camper_owes'), 'shed', 'bargained'), 'guest'],
      [done(callOf('camper_owes', true), 'shed', 'bargained'), 'guest_turned'],
      [done(callOf('ham'), 'info', 'bargained'), 'lookout'],
      [done(callOf('ham'), null, 'silence'), 'silence'],
      [done(callOf('dealer_grudge'), 'lie', 'lied'), 'lied'],
      [done(callOf('dealer_grudge'), 'address', 'trusted', { took: { wood: 3 } }), 'visited'],
      [done(callOf('dealer_owes'), 'landmark', 'bargained'), 'load'],
      [done(callOf('camper_owes'), 'no', 'refused'), null],
      [done(callOf('ham'), null, 'off'), null],
      [QUIET_RADIO, null],
    ];
    for (const [radio, epilogue] of cases) expect(epilogueOf({ radio })).toBe(epilogue);
  });
});

// ───────────────────────────── Saves ─────────────────────────────

describe('the radio: in saves', () => {
  it('survives a round trip, waiting or done', () => {
    const wait = waiting(callOf('camper_owes', true, { baker: 0.4 }));
    expect(deserialize(serialize(wait))?.radio).toEqual(wait.radio);
    const after = unwrap(settleRadio(waiting(callOf('dealer_grudge', true)), result('trusted', 'address', 1)));
    expect(deserialize(serialize(after))?.radio).toEqual(after.radio);
    const ham = { ...after, radio: done(callOf('ham'), 'stay', 'trusted', { sighted: ['portail', 'verger'] }) };
    expect(deserialize(serialize(ham))?.radio).toEqual(ham.radio);
  });

  it('reads a save made before the radio existed as a quiet one: that morning goes straight to the day', () => {
    const { radio: _gone, ...legacy } = waiting(callOf('ham'));
    const loaded = deserialize(JSON.stringify(legacy));
    expect(loaded?.radio).toEqual(QUIET_RADIO);
    expect(loaded && chapterWaiting(loaded)).toBeNull();
  });

  it('drops a radio it cannot read, and an answer or doors that do not belong to the call', () => {
    const state = waiting(callOf('ham'));
    const load = (radio: unknown) => deserialize(JSON.stringify({ ...state, radio }))?.radio;
    expect(load({ stage: 'ringing' })).toEqual(QUIET_RADIO);
    expect(load('done')).toEqual(QUIET_RADIO);
    expect(load({ ...done(callOf('ham'), 'stay', 'trusted'), call: { caller: 'mayor' } })).toEqual(QUIET_RADIO);
    expect(load({ ...done(callOf('ham'), 'stay', 'trusted'), ending: 'won' })).toEqual(QUIET_RADIO);
    expect(load(done(callOf('ham'), 'address', 'trusted'))?.answer).toBeNull();
    expect(load(done(callOf('ham'), 'stay', 'off'))?.answer).toBeNull();
    expect(load({ ...done(callOf('ham'), 'stay', 'trusted'), sighted: ['portail', 'cellar', 7, 'portail'] })?.sighted).toEqual(['portail']);
    expect(load({ ...done(callOf('ham'), 'stay', 'trusted'), took: { wood: -3 } })?.took).toEqual({});
  });

  it('rolls a call again from the run’s seed when the one waiting is unreadable, rather than losing the morning', () => {
    const state = waiting(callOf('ham'), standing('owes', null));
    const load = () => deserialize(JSON.stringify({ ...state, radio: { stage: 'waiting', call: { caller: 'ham', at: 'here' } } }));
    const loaded = load();
    expect(loaded?.radio.stage).toBe('waiting');
    expect(loaded?.radio.call?.caller).toBe('dealer_owes');
    expect(load()?.radio).toEqual(loaded?.radio);
    expect(loaded && chapterWaiting(loaded)).toBe('radio');
  });
});

// ───────────────────────────── Its lines, endings and records ─────────────────────────────

describe('the radio: its lines and its endings', () => {
  const allLines = (): string[] => {
    const lines = new Set<string>([HELLO]);
    for (const caller of CALLERS) {
      const script = SCRIPTS[caller];
      for (const line of [...script.calls, ...script.opening.flat(), script.ask, script.nudge, script.gone]) lines.add(line);
      for (const option of script.options) for (const line of [option.says, ...option.replies]) lines.add(line);
    }
    return [...lines];
  };

  it('has every line written in both languages and recorded', () => {
    for (const line of allLines()) {
      expect(fr.voice[line as keyof typeof fr.voice], line).toBeTruthy();
      expect(en.voice[line as keyof typeof en.voice], line).toBeTruthy();
      expect(recorded[line], `${line} is not recorded`).toBeDefined();
    }
    for (const id of ['vo_cb_news_1', 'vo_cb_news_2', 'vo_cb_news_3', 'vo_cb_baker_1', 'vo_cb_baker_2', 'vo_cb_baker_3', 'vo_radio_one_hand', 'vo_radio_found', 'vo_radio_arrive', 'vo_radio_end_silence']) {
      expect(recorded[id], id).toBeDefined();
    }
  });

  it('times every line by its recording, give or take a little', () => {
    for (const line of allLines()) {
      const seconds = recorded[line]?.seconds ?? 0;
      expect(LINE_SECONDS[line], line).toBeDefined();
      expect(lineSeconds(line), line).toBeGreaterThanOrEqual(seconds);
      expect(lineSeconds(line), line).toBeLessThanOrEqual(seconds + 0.6);
    }
  });

  it('says each door of the last night where the line says it, in the night’s own order', () => {
    for (const answer of ['stay', 'info'] as const) {
      const said = LOOKOUT[answer];
      if (!said) throw new Error(answer);
      const text = fr.voice[said.line as keyof typeof fr.voice].toLowerCase();
      for (const mark of said.marks) {
        const word = fr.sector[mark.sector].toLowerCase();
        const index = text.indexOf(word);
        expect(index, word).toBeGreaterThan(0);
        expect(Math.abs((index + word.length / 2) / text.length - mark.at), word).toBeLessThan(0.04);
      }
    }
    expect(words(LOOKOUT.stay?.line ?? '')).toBeGreaterThan(20);
  });

  it('offers three answers in every call, each of its own kind or not, and none twice', () => {
    for (const caller of CALLERS) {
      const ids = SCRIPTS[caller].options.map((o) => o.id);
      expect(new Set(ids).size).toBe(3);
      for (const id of ids) expect(fr.radio.answer[id]).toBeTruthy();
      for (const id of ids) expect((fr.radio.said[caller] as Record<string, string>)[id]).toBeTruthy();
    }
  });

  it('counts its six endings with the rest of the game', () => {
    expect(ENDINGS.radio).toEqual(['trusted', 'bargained', 'lied', 'refused', 'silence', 'off']);
    expect(ALL_ENDINGS).toContain('radio.silence');
    expect(tallyOf(['radio.off', 'radio.lied'], 'radio')).toEqual({ seen: 2, total: 6 });
  });

  it('can reach every one of them', () => {
    const reached = new Set<string>();
    for (const caller of CALLERS) SCRIPTS[caller].options.forEach((o) => reached.add(o.kind));
    reached.add('silence');
    reached.add('off');
    expect([...reached].sort()).toEqual([...ENDINGS.radio].sort());
  });

  it('has the voice clear only while it is on the dial, and none while the microphone is keyed', () => {
    const p = new Player(callOf('ham')).find();
    expect(clarity(p.radio)).toBeGreaterThan(RADIO.lock);
    p.press('act');
    expect(clarity(p.radio)).toBe(0);
  });
});
