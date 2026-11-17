// Audio: recorded effects, beds, music and voice lines from public/assets/audio, with the original
// WebAudio synthesis kept underneath as a fallback — a missing or still-loading file degrades to a
// synthesised sound (or to silence for music and voices), never to an error.
// Sound is a reinforcement only: every state it signals also has a visible equivalent.

import { Decks } from './deck';

export type Sfx =
  | 'click'
  | 'deny'
  | 'build'
  | 'rummage'
  | 'loot'
  | 'spikes'
  | 'log'
  | 'net'
  | 'barrier'
  | 'horn'
  | 'floodlight'
  | 'ready'
  | 'hit'
  | 'kill'
  | 'door'
  | 'breach'
  | 'inside'
  | 'alert'
  | 'boss'
  | 'mower'
  | 'whistle'
  | 'megaphone'
  | 'ram'
  | 'interrupt'
  | 'camera'
  /** The one hand going from the trap row to the camera keys, or back. */
  | 'hand'
  | 'engine'
  | 'news'
  | 'exhale'
  | 'dawn'
  | 'lost'
  | 'broken'
  | 'car_door'
  | 'groan'
  | 'engine_stop'
  | 'loot_wood'
  | 'loot_scrap'
  | 'loot_springs'
  | 'loot_wire'
  | 'loot_battery'
  | 'crt_off'
  | 'crt_on'
  | 'knob'
  | 'sip'
  | 'bulb'
  | 'washer'
  | 'tin'
  | 'scuffle'
  | 'crate'
  | 'signal_lost'
  | 'step_grass'
  | 'chew'
  | 'clap'
  | 'rabbit_bolt'
  | 'rabbit_sting'
  | 'rabbit_screech'
  | 'bite'
  | 'scream'
  | 'pain'
  | 'yank'
  | 'fling'
  | 'rope_take'
  | 'tie'
  | 'saw_take'
  | 'saw'
  | 'heartbeat'
  | 'splice'
  | 'body_fall'
  | 'devour'
  | 'shed_door'
  | 'amp_on'
  | 'mower_start'
  | 'chord'
  | 'chug'
  | 'scratch'
  | 'blast'
  | 'horde'
  | 'amp_die';

export type Ambience = 'none' | 'room' | 'day' | 'night' | 'car';
export type Music = 'none' | 'title' | 'day' | 'night' | 'boss' | 'morning' | 'won' | 'orchard' | 'panic' | 'finale';

const STORAGE_KEY = 'putrid-swarm.sound';
const MUSIC_KEY = 'putrid-swarm.music';
const VOLUME_KEY = 'putrid-swarm.volume';
const BASE = `${import.meta.env.BASE_URL}assets/audio/`;
const MASTER_GAIN = 0.7;

interface SampleEntry {
  readonly file: string;
  readonly kind: 'sfx' | 'loop' | 'music' | 'voice';
  readonly seconds: number;
  readonly gain: number;
}

interface Sample {
  readonly entry: SampleEntry;
  /** Encoded bytes, kept until an AudioContext exists to decode them. */
  data: ArrayBuffer | null;
  buffer: AudioBuffer | null;
}

interface Playing {
  readonly source: AudioBufferSourceNode;
  readonly amp: GainNode;
}

const numbered = (stem: string, count: number, firstIsBare = true): readonly string[] =>
  Array.from({ length: count }, (_, i) => (i === 0 && firstIsBare ? stem : `${stem}_${i + 1}`));

/** Effects that have several recordings. They are dealt like a shuffled deck, so none comes twice in a row. */
const VARIANTS: Partial<Record<Sfx, readonly string[]>> = {
  groan: numbered('groan', 5, false),
  hit: numbered('hit', 3),
  kill: numbered('kill', 3),
  door: numbered('door', 3),
  build: numbered('build', 3),
  rummage: numbered('rummage', 4),
  loot: numbered('loot', 3),
  loot_wood: numbered('loot_wood', 2, false),
  loot_scrap: numbered('loot_scrap', 2, false),
  loot_springs: numbered('loot_springs', 2, false),
  loot_wire: numbered('loot_wire', 2, false),
  loot_battery: numbered('loot_battery', 2, false),
  engine: numbered('engine', 5),
  engine_stop: numbered('engine_stop', 3, false),
  car_door: numbered('car_door', 3),
  washer: numbered('washer', 3, false),
  tin: numbered('tin', 3, false),
  scuffle: numbered('scuffle', 3, false),
  crate: numbered('crate', 2, false),
  step_grass: numbered('step_grass', 4, false),
  chew: numbered('chew', 3, false),
  scream: numbered('scream', 2, false),
  pain: numbered('pain', 4, false),
  yank: numbered('yank', 3, false),
  saw: numbered('saw', 4, false),
  heartbeat: numbered('heartbeat', 2, false),
  hand: numbered('hand', 3, false),
};
/** Effects heard many times in a row: a little pitch drift keeps them from sounding stamped. */
const PITCH_DRIFT: Partial<Record<Sfx, number>> = { hit: 0.1, kill: 0.08, door: 0.06, spikes: 0.05, groan: 0.1, build: 0.05, rummage: 0.05, loot: 0.06, car_door: 0.04, engine: 0.03, washer: 0.08, tin: 0.06, scuffle: 0.05, step_grass: 0.08, chew: 0.06, pain: 0.05, yank: 0.06, saw: 0.06, heartbeat: 0.03, hand: 0.06 };
/** Minimum seconds between two plays of the same effect. */
const MIN_GAP: Partial<Record<Sfx, number>> = { hit: 0.09, kill: 0.14, door: 0.35, spikes: 0.08, groan: 1.5 };
const LOOPING_MUSIC: ReadonlySet<Music> = new Set<Music>(['title', 'day', 'night', 'boss', 'orchard', 'panic']);
const LOOP_CROSSFADE = 1.4;
const DUCK = 0.4;
/** Nothing stops dead: beds, voices and music are always faded out over these durations (seconds). */
const BED_FADE_IN = 0.6;
const BED_FADE_OUT = 1.1;
const VOICE_FADE_OUT = 0.14;
/** Music volume step per 50 ms tick: about 1.4 s up, 2.5 s down. */
const MUSIC_TICK_MS = 50;
const MUSIC_RISE = 0.035;
const MUSIC_FALL = 0.02;
/** A looping track starts again this long before its end, under its own tail. */
const MUSIC_LOOP_OVERLAP = 3;

interface Bed {
  readonly group: GainNode;
  readonly nodes: AudioNode[];
}

interface FadingTrack {
  readonly element: HTMLAudioElement;
  readonly base: number;
  level: number;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private bed: Bed | null = null;
  private ambienceKind: Ambience = 'none';
  private birdTimer: number | null = null;
  private lastPlayed = new Map<Sfx, number>();
  private readonly samples = new Map<string, Sample>();
  private sfxBus: GainNode | null = null;
  private bedBus: GainNode | null = null;
  private voiceBus: GainNode | null = null;
  private loopToken = 0;
  private voice: Playing | null = null;
  private readonly sounding = new Map<Sfx, Set<Playing>>();
  private readonly decks = new Decks<string>();
  private voiceEndsAt = 0;
  private musicKind: Music = 'none';
  private musicEl: HTMLAudioElement | null = null;
  private musicLevel = 0;
  private musicBase = 0;
  private musicTimer: number | null = null;
  private dying: FadingTrack[] = [];
  enabled = true;
  musicEnabled = true;
  /** Overall level, 0..1, on top of the on/off switch. */
  volume = 1;

  constructor() {
    try {
      this.enabled = localStorage.getItem(STORAGE_KEY) !== 'off';
      this.musicEnabled = localStorage.getItem(MUSIC_KEY) !== 'off';
      const stored = Number(localStorage.getItem(VOLUME_KEY) ?? '1');
      if (Number.isFinite(stored)) this.volume = Math.min(1, Math.max(0, stored));
    } catch {
      this.enabled = true;
    }
  }

  private get masterLevel(): number {
    return this.enabled ? MASTER_GAIN * this.volume : 0;
  }

  /**
   * Fetches the recorded sounds. Safe to call before any user gesture: bytes are only decoded once
   * an AudioContext exists. Music is streamed on demand and is not fetched here.
   */
  async preload(): Promise<void> {
    let manifest: Record<string, SampleEntry>;
    try {
      const response = await fetch(`${BASE}manifest.json`);
      if (!response.ok) {
        console.warn(`[audio] manifest.json returned ${response.status}; using synthesised sound only`);
        return;
      }
      manifest = (await response.json()) as Record<string, SampleEntry>;
    } catch (error) {
      console.warn('[audio] manifest.json unavailable; using synthesised sound only', error);
      return;
    }
    await Promise.all(
      Object.entries(manifest).map(async ([id, entry]) => {
        const sample: Sample = { entry, data: null, buffer: null };
        this.samples.set(id, sample);
        if (entry.kind === 'music') return;
        try {
          const response = await fetch(BASE + entry.file);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          sample.data = await response.arrayBuffer();
          if (this.ctx) await this.decode(id, sample);
        } catch (error) {
          console.warn(`[audio] ${id} unavailable`, error);
        }
      }),
    );
  }

  private async decode(id: string, sample: Sample): Promise<void> {
    if (!this.ctx || !sample.data || sample.buffer) return;
    const data = sample.data;
    sample.data = null;
    try {
      sample.buffer = await this.ctx.decodeAudioData(data);
      // A bed that was requested before its recording was ready takes over from the synthesised one.
      if (id === `amb_${this.ambienceKind}`) {
        const kind = this.ambienceKind;
        this.ambienceKind = 'none';
        this.setAmbience(kind);
      }
    } catch (error) {
      console.warn(`[audio] could not decode ${id}`, error);
    }
  }

  /** Browsers only allow audio after a user gesture; call this from the first click or key press. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      this.resumeMusic();
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterLevel;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.bedBus = this.ctx.createGain();
      this.voiceBus = this.ctx.createGain();
      for (const bus of [this.sfxBus, this.bedBus, this.voiceBus]) bus.connect(this.master);
      for (const [id, sample] of this.samples) void this.decode(id, sample);
      const length = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      const pending = this.ambienceKind;
      this.ambienceKind = 'none';
      this.setAmbience(pending);
      this.resumeMusic();
    } catch (error) {
      console.warn('[audio] unavailable', error);
      this.ctx = null;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {
      // Non-fatal.
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.masterLevel, this.ctx.currentTime, 0.05);
    this.applyMusicVolume();
    if (enabled) this.resumeMusic();
  }

  /** Sets the overall level (0..1) and remembers it. */
  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, Math.round(volume * 100) / 100));
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume));
    } catch {
      // Non-fatal.
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.masterLevel, this.ctx.currentTime, 0.05);
    this.applyMusicVolume();
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    try {
      localStorage.setItem(MUSIC_KEY, enabled ? 'on' : 'off');
    } catch {
      // Non-fatal.
    }
    this.applyMusicVolume();
    if (enabled) this.resumeMusic();
  }

  // ───────────────────────────── Building blocks ─────────────────────────────

  private tone(type: OscillatorType, from: number, to: number, duration: number, gain: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(amp).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  private noise(filter: BiquadFilterType, from: number, to: number, duration: number, gain: number, delay = 0, q = 0.8): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    const t = this.ctx.currentTime + delay;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const biquad = this.ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.Q.value = q;
    biquad.frequency.setValueAtTime(from, t);
    biquad.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(biquad).connect(amp).connect(this.master);
    source.start(t, Math.random());
    source.stop(t + duration + 0.05);
  }

  // ───────────────────────────── Effects ─────────────────────────────

  /**
   * Plays an effect: the recording when it is loaded, the synthesised version otherwise.
   * `volume` scales it (1 = normal); `rate` replays it faster and higher, for one recording played as several notes.
   */
  play(name: Sfx, volume = 1, rate = 1): void {
    if (!this.ctx || !this.enabled) return;
    // Collapse bursts of the same sound (twenty hits in one frame should not clip).
    const now = this.ctx.currentTime;
    const last = this.lastPlayed.get(name) ?? -1;
    if (now - last < (MIN_GAP[name] ?? 0.045)) return;
    this.lastPlayed.set(name, now);

    const sample = this.deal(name, VARIANTS[name] ?? [name]);
    if (sample?.buffer && this.sfxBus) {
      const drift = PITCH_DRIFT[name] ?? 0;
      const playing = this.playBuffer(sample.buffer, this.sfxBus, sample.entry.gain * volume, rate * (1 + (Math.random() * 2 - 1) * drift));
      if (playing) this.track(name, playing);
      return;
    }
    this.synth(name, rate);
  }

  /** Seconds into the music track that is playing, or null when there is none to go by (sound off, not started). */
  musicTime(): number | null {
    const element = this.musicEl;
    if (!element || element.paused || !this.enabled || !this.musicEnabled) return null;
    return element.currentTime;
  }

  /** Whether the current music track has played to its end. */
  get musicEnded(): boolean {
    return this.musicEl?.ended ?? false;
  }

  /** Fades out every recording of an effect that is still sounding (a long sound outliving its scene). */
  fadeOut(name: Sfx, seconds = 0.5): void {
    for (const playing of this.sounding.get(name) ?? []) this.release(playing, seconds);
  }

  /** Next recording of a sound that has several, among the ones that are loaded (see Decks). */
  private deal(key: string, ids: readonly string[]): Sample | undefined {
    const id = this.decks.next(
      key,
      ids.filter((candidate) => this.samples.get(candidate)?.buffer),
    );
    return id === undefined ? undefined : this.samples.get(id);
  }

  private track(name: Sfx, playing: Playing): void {
    let set = this.sounding.get(name);
    if (!set) this.sounding.set(name, (set = new Set()));
    const owner = set;
    owner.add(playing);
    playing.source.addEventListener('ended', () => owner.delete(playing), { once: true });
  }

  private playBuffer(buffer: AudioBuffer, bus: AudioNode, gain: number, rate = 1): Playing | null {
    if (!this.ctx) return null;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const amp = this.ctx.createGain();
    amp.gain.value = gain;
    source.connect(amp).connect(bus);
    source.start();
    return { source, amp };
  }

  /** Fades a playing buffer to silence, then stops it. */
  private release(playing: Playing, seconds: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    try {
      playing.amp.gain.cancelScheduledValues(t);
      playing.amp.gain.setValueAtTime(playing.amp.gain.value, t);
      playing.amp.gain.linearRampToValueAtTime(0, t + seconds);
      playing.source.stop(t + seconds + 0.02);
    } catch {
      // Already ended.
    }
  }

  // ───────────────────────────── Voices ─────────────────────────────

  /**
   * Speaks a recorded line and returns how long it lasts in seconds, so the caller can time a
   * subtitle; 0 when there is no recording. The duration is returned even with the sound off.
   * A line never talks over another unless `interrupt` is set.
   */
  say(id: string, interrupt = false): number {
    const sample = this.samples.get(id);
    if (!sample || sample.entry.kind !== 'voice') return 0;
    const seconds = sample.entry.seconds;
    if (!this.ctx || !this.enabled || !sample.buffer || !this.voiceBus) return seconds;
    if (this.ctx.currentTime < this.voiceEndsAt) {
      if (!interrupt) return 0;
      this.stopVoice();
    }
    this.voice = this.playBuffer(sample.buffer, this.voiceBus, sample.entry.gain);
    this.voiceEndsAt = this.ctx.currentTime + seconds;
    this.duck(seconds);
    return seconds;
  }

  /** True while a line is being spoken. */
  get speaking(): boolean {
    return this.ctx !== null && this.ctx.currentTime < this.voiceEndsAt;
  }

  stopVoice(): void {
    if (this.voice) this.release(this.voice, VOICE_FADE_OUT);
    this.voice = null;
    this.voiceEndsAt = 0;
    this.duck(0);
  }

  /** Pulls the beds and the music down under a spoken line, then lets them back up. */
  private duck(seconds: number): void {
    if (!this.ctx || !this.bedBus) return;
    const t = this.ctx.currentTime;
    this.bedBus.gain.cancelScheduledValues(t);
    this.bedBus.gain.setTargetAtTime(seconds > 0 ? 0.55 : 1, t, 0.08);
    if (seconds > 0) this.bedBus.gain.setTargetAtTime(1, t + seconds, 0.25);
    this.applyMusicVolume();
    if (seconds > 0) window.setTimeout(() => this.applyMusicVolume(), seconds * 1000 + 60);
  }

  // ───────────────────────────── Music ─────────────────────────────

  /** Streams a music track, cross-fading from whatever was playing. */
  setMusic(kind: Music): void {
    if (kind === this.musicKind) return;
    this.musicKind = kind;
    this.retireMusic();
    const sample = kind === 'none' ? undefined : this.samples.get(`mus_${kind}`);
    if (sample) {
      this.musicBase = sample.entry.gain;
      this.startMusic(BASE + sample.entry.file);
    }
    if (this.musicTimer === null) this.musicTimer = window.setInterval(() => this.fadeMusic(), MUSIC_TICK_MS);
  }

  private startMusic(url: string): void {
    const element = new Audio(url);
    element.volume = 0;
    element.preload = 'auto';
    this.musicEl = element;
    this.musicLevel = 0;
    this.resumeMusic();
  }

  /** Hands the current track to the fade-out list. */
  private retireMusic(): void {
    if (this.musicEl) this.dying.push({ element: this.musicEl, base: this.musicBase, level: this.musicLevel });
    this.musicEl = null;
    this.musicLevel = 0;
  }

  private resumeMusic(): void {
    const element = this.musicEl;
    if (!element || !element.paused || element.ended || !this.enabled || !this.musicEnabled) return;
    // Rejected until the first user gesture; unlock() calls back here.
    element.play().catch(() => undefined);
  }

  private musicVolumeFor(base: number, level: number): number {
    if (!this.enabled || !this.musicEnabled) return 0;
    return Math.max(0, Math.min(1, base * level * (this.speaking ? DUCK : 1) * MASTER_GAIN * this.volume));
  }

  private applyMusicVolume(): void {
    if (this.musicEl) this.musicEl.volume = this.musicVolumeFor(this.musicBase, this.musicLevel);
    for (const track of this.dying) track.element.volume = this.musicVolumeFor(track.base, track.level);
  }

  private fadeMusic(): void {
    // A looping track is restarted under its own tail: `loop = true` on an MP3 jumps audibly, and
    // the generated tracks do not all end where they begin.
    const current = this.musicEl;
    const loops = LOOPING_MUSIC.has(this.musicKind);
    if (current && loops && !current.paused && Number.isFinite(current.duration) && current.duration - current.currentTime < MUSIC_LOOP_OVERLAP) {
      const url = current.src;
      this.retireMusic();
      this.startMusic(url);
    }
    this.musicLevel = Math.min(1, this.musicLevel + MUSIC_RISE);
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const track = this.dying[i] as FadingTrack;
      track.level = Math.max(0, track.level - MUSIC_FALL);
      if (track.level <= 0 || track.element.ended) {
        track.element.pause();
        track.element.removeAttribute('src');
        this.dying.splice(i, 1);
      }
    }
    this.applyMusicVolume();
    const settled = this.musicLevel >= 1 && this.dying.length === 0;
    if (settled && (!this.musicEl || !loops) && this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  // ───────────────────────────── Synthesised fallback ─────────────────────────────

  private synth(name: Sfx, rate = 1): void {
    switch (name) {
      case 'click':
        this.tone('square', 660, 440, 0.05, 0.08);
        break;
      case 'deny':
        this.tone('sawtooth', 150, 110, 0.16, 0.14);
        this.tone('sawtooth', 157, 112, 0.16, 0.1);
        break;
      case 'build':
        for (let i = 0; i < 3; i++) {
          this.noise('bandpass', 1800, 900, 0.06, 0.4, i * 0.13, 2);
          this.tone('triangle', 220, 140, 0.07, 0.2, i * 0.13);
        }
        break;
      case 'rummage':
        for (let i = 0; i < 4; i++) this.noise('bandpass', 900 + Math.random() * 1600, 500, 0.12, 0.22, i * 0.11, 1.5);
        break;
      case 'loot':
      case 'loot_wood':
      case 'loot_scrap':
      case 'loot_springs':
      case 'loot_wire':
      case 'loot_battery':
        this.tone('triangle', 520, 520, 0.09, 0.16);
        this.tone('triangle', 780, 780, 0.14, 0.16, 0.09);
        break;
      case 'spikes':
        this.noise('highpass', 3000, 1200, 0.12, 0.45, 0, 1);
        this.tone('square', 180, 60, 0.14, 0.25);
        break;
      case 'log':
        this.noise('lowpass', 500, 120, 0.45, 0.5);
        this.tone('sine', 110, 38, 0.4, 0.55, 0.22);
        this.noise('bandpass', 1400, 400, 0.18, 0.35, 0.24, 1.2);
        break;
      case 'net':
        this.noise('bandpass', 600, 2400, 0.3, 0.35, 0, 1.2);
        this.noise('lowpass', 900, 300, 0.2, 0.25, 0.26);
        break;
      case 'barrier':
        this.tone('square', 90, 220, 0.12, 0.28);
        this.noise('bandpass', 2200, 1200, 0.07, 0.4, 0.1, 2);
        this.tone('square', 880, 880, 0.07, 0.07, 0.2);
        break;
      case 'horn':
        this.tone('square', 392, 392, 0.75, 0.16);
        this.tone('square', 494, 494, 0.75, 0.14);
        this.tone('sawtooth', 196, 196, 0.75, 0.1);
        break;
      case 'floodlight':
        this.noise('highpass', 5000, 5000, 0.04, 0.4);
        this.tone('sine', 120, 120, 0.5, 0.1, 0.03);
        break;
      case 'ready':
        this.tone('sine', 880, 1320, 0.08, 0.07);
        break;
      case 'hit':
        this.tone('sine', 150, 60, 0.09, 0.3);
        this.noise('lowpass', 800, 200, 0.07, 0.25);
        break;
      case 'kill':
        this.tone('sawtooth', 130, 45, 0.3, 0.16);
        this.noise('lowpass', 500, 100, 0.25, 0.25, 0.04);
        break;
      case 'door':
        this.tone('sine', 85, 45, 0.16, 0.5);
        this.noise('lowpass', 400, 120, 0.12, 0.3);
        break;
      case 'breach':
        this.noise('lowpass', 2400, 150, 0.9, 0.7);
        this.tone('sawtooth', 110, 30, 0.8, 0.35);
        for (let i = 0; i < 4; i++) this.noise('bandpass', 1500 + i * 400, 500, 0.12, 0.35, 0.1 + i * 0.12, 2);
        break;
      case 'inside':
        this.tone('sawtooth', 220, 70, 0.5, 0.25);
        this.tone('square', 233, 74, 0.5, 0.14);
        break;
      case 'alert':
        this.tone('square', 740, 740, 0.09, 0.1);
        this.tone('square', 740, 740, 0.09, 0.1, 0.16);
        break;
      case 'boss':
        this.tone('sawtooth', 55, 52, 1.6, 0.3);
        this.tone('sawtooth', 82, 78, 1.6, 0.2);
        this.tone('sine', 110, 104, 1.6, 0.22, 0.2);
        break;
      case 'mower':
        // A reel mower pushed far too hard: a rising clatter.
        for (let i = 0; i < 14; i++) {
          const at = i * (0.13 - i * 0.004);
          this.noise('bandpass', 1400 + i * 120, 900, 0.05, 0.3, at, 3);
          this.tone('square', 70 + i * 6, 60, 0.05, 0.12, at);
        }
        break;
      case 'whistle':
        this.tone('sine', 2500, 2900, 0.28, 0.14);
        this.tone('sine', 2900, 2500, 0.3, 0.14, 0.3);
        break;
      case 'megaphone':
        for (let i = 0; i < 4; i++) {
          this.tone('square', 260 + Math.random() * 120, 200 + Math.random() * 80, 0.22, 0.13, i * 0.27);
          this.noise('bandpass', 1300, 900, 0.2, 0.2, i * 0.27, 4);
        }
        break;
      case 'ram':
        this.tone('sawtooth', 60, 110, 0.5, 0.22);
        this.noise('bandpass', 700, 1500, 0.5, 0.2, 0, 2);
        break;
      case 'interrupt':
        this.tone('square', 900, 300, 0.12, 0.12);
        this.noise('highpass', 2500, 2500, 0.06, 0.2, 0.02);
        break;
      case 'camera':
        this.noise('highpass', 3500, 6000, 0.07, 0.22);
        this.tone('square', 1200, 1200, 0.025, 0.05);
        break;
      case 'hand':
        // A sleeve brushing across the desk.
        this.noise('bandpass', 1800, 900, 0.22, 0.12, 0, 0.8);
        this.noise('bandpass', 900, 1400, 0.16, 0.08, 0.08, 0.8);
        break;
      case 'engine':
        // The old break: three laboured turns of the starter, then it catches.
        for (let i = 0; i < 3; i++) {
          this.tone('sawtooth', 65, 48, 0.3, 0.22, i * 0.42);
          this.noise('lowpass', 500, 200, 0.28, 0.22, i * 0.42);
        }
        this.tone('sawtooth', 50, 95, 1.1, 0.26, 1.3);
        this.noise('lowpass', 300, 700, 1.1, 0.25, 1.3);
        break;
      case 'engine_stop':
        this.tone('sawtooth', 80, 34, 0.9, 0.2);
        this.noise('lowpass', 500, 120, 0.9, 0.2);
        break;
      case 'crt_off':
        this.noise('highpass', 6000, 1500, 0.12, 0.25);
        this.tone('sine', 9000, 300, 0.35, 0.05);
        break;
      case 'crt_on':
        this.tone('sine', 60, 60, 0.5, 0.25);
        this.tone('sine', 400, 9000, 0.6, 0.04, 0.1);
        break;
      case 'knob':
        this.noise('highpass', 3000, 3000, 0.02, 0.2);
        break;
      case 'washer':
        this.tone('triangle', 2600, 2200, 0.05, 0.14);
        this.noise('highpass', 4000, 4000, 0.04, 0.12, 0.05);
        break;
      case 'tin':
        this.tone('square', 900, 620, 0.16, 0.1);
        this.tone('triangle', 1900, 1500, 0.12, 0.1, 0.03);
        break;
      case 'scuffle':
        for (let i = 0; i < 3; i++) this.noise('bandpass', 500 + Math.random() * 600, 300, 0.12, 0.3, i * 0.14, 1.2);
        break;
      case 'crate':
        this.noise('bandpass', 700, 300, 0.25, 0.3, 0, 1.4);
        this.noise('highpass', 3000, 3000, 0.08, 0.15, 0.12);
        break;
      case 'sip':
        this.noise('bandpass', 2400, 900, 0.5, 0.12, 0, 1.2);
        break;
      case 'bulb':
        this.noise('highpass', 5000, 5000, 0.03, 0.08);
        this.noise('highpass', 5000, 5000, 0.03, 0.08, 0.09);
        break;
      case 'news':
        this.tone('triangle', 523, 523, 0.14, 0.14);
        this.tone('triangle', 659, 659, 0.14, 0.14, 0.15);
        this.tone('triangle', 784, 784, 0.34, 0.14, 0.3);
        break;
      case 'exhale':
        this.noise('bandpass', 1400, 400, 2.4, 0.3, 0, 0.6);
        break;
      case 'dawn':
        this.tone('sine', 392, 392, 1.6, 0.12);
        this.tone('sine', 494, 494, 1.6, 0.1, 0.25);
        this.tone('sine', 587, 587, 1.8, 0.1, 0.5);
        break;
      case 'lost':
        this.tone('sawtooth', 196, 49, 2.2, 0.22);
        this.tone('sine', 98, 41, 2.4, 0.3, 0.2);
        break;
      case 'broken':
        this.noise('bandpass', 1600, 500, 0.3, 0.4, 0, 1.5);
        this.tone('square', 160, 60, 0.2, 0.2, 0.05);
        break;
      case 'car_door':
        this.tone('sine', 120, 50, 0.14, 0.4);
        this.noise('lowpass', 600, 200, 0.1, 0.3);
        break;
      case 'groan':
        this.tone('sawtooth', 95 + Math.random() * 30, 70, 0.9, 0.06);
        break;
      case 'signal_lost':
        this.noise('highpass', 3000, 1200, 0.9, 0.3);
        this.tone('sawtooth', 1400, 180, 0.5, 0.08);
        break;
      case 'step_grass':
        this.noise('bandpass', 1400 + Math.random() * 500, 600, 0.16, 0.14, 0, 0.9);
        break;
      case 'chew':
        for (let i = 0; i < 5; i++) this.noise('highpass', 3600, 3000, 0.03, 0.09, i * 0.09);
        break;
      case 'clap':
        this.noise('bandpass', 1900, 1500, 0.07, 0.6, 0, 1.2);
        this.noise('bandpass', 1900, 1500, 0.07, 0.6, 0.2, 1.2);
        break;
      case 'rabbit_bolt':
        for (let i = 0; i < 4; i++) this.noise('bandpass', 1500, 700, 0.09, 0.2 - i * 0.04, i * 0.12, 1);
        break;
      case 'rabbit_sting':
        this.tone('sawtooth', 1480, 1560, 1.1, 0.12);
        this.tone('sawtooth', 1568, 1500, 1.1, 0.1);
        this.tone('sine', 70, 34, 1.8, 0.4);
        break;
      case 'rabbit_screech':
        this.tone('sawtooth', 2100, 1300, 0.5, 0.14);
        this.noise('bandpass', 3200, 1800, 0.5, 0.2, 0, 3);
        break;
      case 'bite':
        this.noise('bandpass', 700, 250, 0.2, 0.5, 0, 1.4);
        this.tone('square', 150, 60, 0.14, 0.2);
        break;
      case 'scream':
      case 'pain':
        this.tone('sawtooth', 300, 190, name === 'scream' ? 0.7 : 0.4, 0.1);
        break;
      case 'yank':
        this.noise('bandpass', 900, 400, 0.14, 0.3, 0, 1.2);
        break;
      case 'fling':
        this.noise('bandpass', 1300, 300, 0.4, 0.35, 0, 1);
        this.tone('sine', 110, 50, 0.16, 0.3, 0.38);
        break;
      case 'rope_take':
        this.noise('bandpass', 800, 500, 0.3, 0.2, 0, 1.4);
        break;
      case 'tie':
        for (let i = 0; i < 6; i++) this.noise('bandpass', 500 + i * 60, 420 + i * 60, 0.22, 0.14, i * 0.33, 4);
        break;
      case 'saw_take':
        this.tone('triangle', 1700, 1500, 0.4, 0.08);
        this.noise('highpass', 2600, 2600, 0.15, 0.14);
        break;
      case 'saw':
        this.noise('bandpass', 1100, 700, 0.3, 0.4, 0, 2.5);
        break;
      case 'heartbeat':
        this.tone('sine', 62, 40, 0.14, 0.5);
        this.tone('sine', 56, 36, 0.16, 0.36, 0.2);
        break;
      case 'splice':
        for (let i = 0; i < 4; i++) this.noise('highpass', 3200, 2800, 0.05, 0.1, i * 0.4);
        this.tone('square', 880, 880, 0.1, 0.07, 2);
        break;
      case 'body_fall':
        this.tone('sine', 90, 38, 0.3, 0.45);
        this.noise('lowpass', 500, 160, 0.5, 0.3, 0.1);
        break;
      case 'devour':
        for (let i = 0; i < 5; i++) this.noise('bandpass', 500 + Math.random() * 500, 240, 0.3, 0.3, i * 0.4, 1.4);
        break;
      case 'shed_door':
        this.tone('sine', 110, 46, 0.2, 0.5);
        this.noise('lowpass', 900, 260, 0.3, 0.4, 0.05);
        break;
      case 'amp_on':
        this.tone('sawtooth', 50, 100, 1.2, 0.08);
        this.tone('sine', 1800, 2600, 0.5, 0.05, 1.1);
        break;
      case 'mower_start':
        for (let i = 0; i < 3; i++) this.tone('sawtooth', 70, 150, 0.5, 0.14, 0.4 + i * 0.6);
        break;
      case 'chord':
      case 'chug': {
        // A fifth, square and loud: a power chord in spirit.
        const root = 82.4 * rate;
        const length = name === 'chord' ? 0.9 : 0.16;
        this.tone('sawtooth', root, root, length, 0.16);
        this.tone('sawtooth', root * 1.5, root * 1.5, length, 0.12);
        this.tone('square', root * 2, root * 2, length, 0.06);
        break;
      }
      case 'scratch':
        this.noise('bandpass', 2400, 1800, 0.06, 0.3, 0, 1.6);
        break;
      case 'blast':
        this.tone('sine', 90, 30, 0.6, 0.5);
        this.noise('lowpass', 1400, 200, 0.5, 0.4);
        break;
      case 'horde':
        for (let i = 0; i < 7; i++) this.tone('sawtooth', 80 + Math.random() * 50, 60, 1.6, 0.05, i * 0.4);
        break;
      case 'amp_die':
        this.tone('sine', 2400, 180, 1.8, 0.1);
        this.noise('highpass', 3000, 3000, 0.08, 0.3, 1.9);
        break;
    }
  }

  // ───────────────────────────── Ambience ─────────────────────────────

  /** Switches the background bed. The old one fades out while the new one fades in over `fadeIn` seconds. */
  setAmbience(kind: Ambience, fadeIn = BED_FADE_IN): void {
    if (kind === this.ambienceKind) return;
    this.ambienceKind = kind;
    this.retireBed();
    this.loopToken++;
    if (this.birdTimer !== null) {
      window.clearInterval(this.birdTimer);
      this.birdTimer = null;
    }
    if (!this.ctx || !this.master || !this.noiseBuffer || kind === 'none') return;

    const group = this.ctx.createGain();
    group.gain.setValueAtTime(0, this.ctx.currentTime);
    group.gain.linearRampToValueAtTime(1, this.ctx.currentTime + fadeIn);
    const current: Bed = { group, nodes: [] };
    this.bed = current;

    const recorded = this.samples.get(`amb_${kind}`);
    if (recorded?.buffer && this.bedBus) {
      group.connect(this.bedBus);
      this.startLoop(recorded.buffer, recorded.entry.gain, this.loopToken, current);
      return;
    }
    group.connect(this.master);

    const bed = (frequency: number, gain: number, lfoRate: number): void => {
      if (!this.ctx || !this.noiseBuffer) return;
      const source = this.ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      source.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = frequency;
      const amp = this.ctx.createGain();
      amp.gain.value = gain;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = lfoRate;
      const depth = this.ctx.createGain();
      depth.gain.value = frequency * 0.45;
      lfo.connect(depth).connect(filter.frequency);
      source.connect(filter).connect(amp).connect(group);
      source.start();
      lfo.start();
      current.nodes.push(source, lfo, amp, filter, depth);
    };

    if (kind === 'room') {
      bed(220, 0.05, 0.07);
      const hum = this.ctx.createOscillator();
      hum.frequency.value = 100;
      const amp = this.ctx.createGain();
      amp.gain.value = 0.012;
      hum.connect(amp).connect(group);
      hum.start();
      current.nodes.push(hum, amp);
    } else if (kind === 'day') {
      bed(700, 0.035, 0.11);
      this.birdTimer = window.setInterval(() => {
        if (!this.enabled || Math.random() > 0.55) return;
        const base = 2200 + Math.random() * 1600;
        this.tone('sine', base, base * 1.25, 0.09, 0.03);
        this.tone('sine', base * 1.2, base * 0.95, 0.11, 0.03, 0.12);
      }, 1700);
    } else if (kind === 'night') {
      bed(320, 0.09, 0.05);
      bed(1200, 0.012, 0.13);
    } else if (kind === 'car') {
      bed(160, 0.12, 0.9);
    }
  }

  /**
   * Loops a recorded bed by overlapping each pass with the next: MP3 padding makes a plain
   * `loop = true` click, a cross-fade does not. Stops when `token` is no longer current.
   */
  /** Fades the current bed out, then stops and disconnects everything it was made of. */
  private retireBed(): void {
    const bed = this.bed;
    this.bed = null;
    if (!bed || !this.ctx) return;
    const t = this.ctx.currentTime;
    bed.group.gain.cancelScheduledValues(t);
    bed.group.gain.setValueAtTime(bed.group.gain.value, t);
    bed.group.gain.linearRampToValueAtTime(0, t + BED_FADE_OUT);
    window.setTimeout(() => {
      for (const node of bed.nodes) {
        try {
          (node as AudioScheduledSourceNode).stop?.();
          node.disconnect();
        } catch {
          // Already stopped.
        }
      }
      bed.group.disconnect();
    }, BED_FADE_OUT * 1000 + 80);
  }

  private startLoop(buffer: AudioBuffer, gain: number, token: number, bed: Bed, first = true): void {
    if (!this.ctx || token !== this.loopToken) return;
    const fade = Math.min(LOOP_CROSSFADE, buffer.duration / 4);
    const t = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    // The first pass starts at full level: the bed's group gain is what fades it in.
    amp.gain.linearRampToValueAtTime(gain, t + (first ? 0.02 : fade));
    amp.gain.setValueAtTime(gain, t + buffer.duration - fade);
    amp.gain.linearRampToValueAtTime(0, t + buffer.duration);
    source.connect(amp).connect(bed.group);
    source.start(t);
    bed.nodes.push(source, amp);
    // Passes that have played out are finished and silent: keep only the last three.
    if (bed.nodes.length > 6) bed.nodes.splice(0, 2);
    window.setTimeout(() => this.startLoop(buffer, gain, token, bed, false), (buffer.duration - fade) * 1000);
  }
}

export const audio = new AudioEngine();
