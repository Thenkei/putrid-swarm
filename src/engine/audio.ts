// Audio: recorded effects, beds, music and voice lines from public/assets/audio, with the original
// WebAudio synthesis kept underneath as a fallback — a missing or still-loading file degrades to a
// synthesised sound (or to silence for music and voices), never to an error.
// Sound is a reinforcement only: every state it signals also has a visible equivalent.

import { Decks } from './deck';

export type Sfx =
  | 'epic_flare' | 'moped_door' | 'moped_blade_contact' | 'epic_mob' | 'epic_mob_blast' | 'epic_tape' | 'epic_pack'
  | 'bolt_slide' | 'bolt_seat' | 'photo_dip' | 'photo_lift' | 'vhs_play' | 'vhs_eject' | 'vhs_knock'
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
  | 'tracker_ping'
  | 'siren_test'
  | 'hit'
  | 'kill'
  | 'door'
  | 'breach'
  | 'house_shotgun'
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
  | 'engine_depart'
  | 'news'
  | 'exhale'
  | 'dawn'
  | 'lost'
  | 'broken'
  | 'car_door'
  | 'car_latch'
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
  /** Testing a container in a rummage puzzle, by the spot's verb (see `ProbeSound`). */
  | 'probe_shake'
  | 'probe_weigh'
  | 'probe_feel'
  | 'signal_lost'
  | 'step_grass'
  | 'step_gravel'
  | 'yard_cat'
  | 'cat_bonnet'
  | 'village_bell' | 'shop_keys' | 'well_plop' | 'dawn_swallows'
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
  | 'step_shed'
  | 'chain'
  | 'snarl'
  | 'chain_snap'
  | 'zap'
  | 'cry'
  | 'pour'
  | 'gulp'
  | 'flour'
  | 'knead'
  | 'clamp'
  | 'unlock'
  | 'thud'
  | 'devour'
  | 'shed_door'
  | 'amp_on'
  | 'mower_start'
  | 'chord'
  | 'chug'
  | 'scratch'
  | 'blast'
  | 'horde'
  | 'amp_die'
  /** The CB at the desk: static between stations (also held as a bed, see `hum`), the dial, the microphone, the squelch, the switch. */
  | 'radio_static'
  | 'radio_knob'
  | 'radio_ptt'
  | 'radio_squelch'
  | 'radio_off';

export type Ambience = 'none' | 'room' | 'day' | 'night' | 'car';
export type Music = 'none' | 'title' | 'day' | 'night' | 'boss' | 'morning' | 'won' | 'orchard' | 'shed' | 'panic' | 'finale' | 'credits';

const STORAGE_KEY = 'putrid-swarm.sound';
const MUSIC_KEY = 'putrid-swarm.music';
const VOLUME_KEY = 'putrid-swarm.volume';
const BASE = `${import.meta.env.BASE_URL}assets/audio/`;
const MASTER_GAIN = 0.7;
const AUDIO_LOAD_LIMIT = 6;
const OPENING_SAMPLES = new Set(['amb_room', 'news', 'vo_broadcast', 'vo_later', 'crt_on', 'crt_off', 'knob', 'exhale']);

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
  download: Promise<void> | null;
  decoding: Promise<void> | null;
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
  vhs_knock: ['door'],
  build: numbered('build', 3),
  rummage: numbered('rummage', 4),
  loot: numbered('loot', 3),
  loot_wood: numbered('loot_wood', 2, false),
  loot_scrap: numbered('loot_scrap', 2, false),
  loot_springs: numbered('loot_springs', 2, false),
  loot_wire: numbered('loot_wire', 2, false),
  loot_battery: numbered('loot_battery', 2, false),
  engine: numbered('engine', 5),
  engine_depart: ['engine_2'],
  engine_stop: numbered('engine_stop', 3, false),
  car_door: numbered('car_door', 3),
  car_latch: ['car_door'],
  washer: numbered('washer', 3, false),
  tin: numbered('tin', 3, false),
  scuffle: numbered('scuffle', 3, false),
  crate: numbered('crate', 2, false),
  probe_shake: numbered('probe_shake', 4, false),
  probe_weigh: numbered('probe_weigh', 4, false),
  probe_feel: numbered('probe_feel', 4, false),
  step_grass: numbered('step_grass', 4, false),
  chew: numbered('chew', 3, false),
  scream: numbered('scream', 2, false),
  pain: numbered('pain', 4, false),
  yank: numbered('yank', 3, false),
  saw: numbered('saw', 4, false),
  heartbeat: numbered('heartbeat', 2, false),
  hand: numbered('hand', 3, false),
  step_shed: numbered('step_shed', 4, false),
  chain: numbered('chain', 3, false),
  snarl: numbered('snarl', 3, false),
  zap: numbered('zap', 2, false),
  cry: numbered('cry', 2, false),
  gulp: numbered('gulp', 2, false),
  radio_knob: numbered('radio_knob', 3, false),
  radio_ptt: numbered('radio_ptt', 3, false),
  radio_squelch: numbered('radio_squelch', 3, false),
};
/** Effects heard many times in a row: a little pitch drift keeps them from sounding stamped. */
const PITCH_DRIFT: Partial<Record<Sfx, number>> = { hit: 0.1, kill: 0.08, door: 0.06, spikes: 0.05, groan: 0.1, build: 0.05, rummage: 0.05, loot: 0.06, car_door: 0.04, engine: 0.03, washer: 0.08, tin: 0.06, scuffle: 0.05, probe_shake: 0.07, probe_weigh: 0.05, probe_feel: 0.07, step_grass: 0.08, chew: 0.06, pain: 0.05, yank: 0.06, saw: 0.06, heartbeat: 0.03, hand: 0.06, step_shed: 0.08, chain: 0.06, snarl: 0.06, cry: 0.04, gulp: 0.05, radio_knob: 0.08, radio_ptt: 0.04, radio_squelch: 0.06 };
/** Minimum seconds between two plays of the same effect. */
const MIN_GAP: Partial<Record<Sfx, number>> = { hit: 0.09, kill: 0.14, door: 0.35, spikes: 0.08, groan: 1.5 };
const LOOPING_MUSIC: ReadonlySet<Music> = new Set<Music>(['title', 'day', 'night', 'boss', 'orchard', 'shed', 'panic']);
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

/** Something that sounds for as long as it is held, at a level set every frame: static under a radio. */
interface Hum {
  readonly source: AudioScheduledSourceNode;
  readonly amp: GainNode;
  readonly base: number;
  readonly pitch: AudioParam | null;
}

/** Sounds held at a level: the recording of the same name, or a synthesised stand-in. */
export type HumId = 'radio_static' | 'radio_whistle';

/** A voice heard through something, at a level that follows it: a radio, tuned or not. */
interface Channel {
  readonly playing: Playing;
  readonly gain: number;
  readonly endsAt: number;
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
  private manifestReady: Promise<string[]> | null = null;
  private sfxBus: GainNode | null = null;
  private bedBus: GainNode | null = null;
  private voiceBus: GainNode | null = null;
  private loopToken = 0;
  private voice: Playing | null = null;
  private readonly sounding = new Map<Sfx, Set<Playing>>();
  private readonly decks = new Decks<string>();
  private voiceEndsAt = 0;
  private musicKind: Music = 'none';
  private musicPaused = false;
  private musicEl: HTMLAudioElement | null = null;
  private musicLevel = 0;
  private musicBase = 0;
  private musicTimer: number | null = null;
  private dying: FadingTrack[] = [];
  private readonly hums = new Map<HumId, Hum>();
  private readonly channels = new Map<string, Channel>();
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
    const queue = await (this.manifestReady ??= this.readManifest());
    let next = 0;
    async function worker(engine: AudioEngine): Promise<void> {
      for (let id = queue[next++]; id !== undefined; id = queue[next++]) {
        await engine.loadSample(id);
      }
    }
    await Promise.all(Array.from({ length: AUDIO_LOAD_LIMIT }, () => worker(this)));
  }

  private async readManifest(): Promise<string[]> {
    let manifest: Record<string, SampleEntry>;
    try {
      const response = await fetch(`${BASE}manifest.json`);
      if (!response.ok) {
        console.warn(`[audio] manifest.json returned ${response.status}; using synthesised sound only`);
        return [];
      }
      manifest = (await response.json()) as Record<string, SampleEntry>;
    } catch (error) {
      console.warn('[audio] manifest.json unavailable; using synthesised sound only', error);
      return [];
    }
    const opening: string[] = [];
    const later: string[] = [];
    for (const [id, entry] of Object.entries(manifest)) {
      this.samples.set(id, { entry, data: null, buffer: null, download: null, decoding: null });
      if (entry.kind !== 'music') (OPENING_SAMPLES.has(id) ? opening : later).push(id);
    }
    // The title may already be visible. Start whichever track the current scene asked for.
    this.startRequestedMusic();
    return [...opening, ...later];
  }

  private async loadSample(id: string, priority: 'high' | 'low' = OPENING_SAMPLES.has(id) ? 'high' : 'low'): Promise<void> {
    const sample = this.samples.get(id);
    if (!sample) return;
    await (sample.download ??= this.downloadSample(id, sample, priority));
    await this.decode(id, sample);
  }

  private async downloadSample(id: string, sample: Sample, priority: 'high' | 'low'): Promise<void> {
    try {
      const response = await fetch(BASE + sample.entry.file, { priority });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      sample.data = await response.arrayBuffer();
    } catch (error) {
      console.warn(`[audio] ${id} unavailable`, error);
    }
  }

  private decode(id: string, sample: Sample): Promise<void> | undefined {
    if (sample.decoding) return sample.decoding;
    const ctx = this.ctx;
    if (!ctx || !sample.data || sample.buffer) return;
    const data = sample.data;
    sample.data = null;
    sample.decoding = Promise.resolve()
      .then(() => ctx.decodeAudioData(data))
      .then((buffer) => {
        sample.buffer = buffer;
        // A bed requested before its recording was ready takes over from the synthesised one.
        if (id === `amb_${this.ambienceKind}`) {
          const kind = this.ambienceKind;
          this.ambienceKind = 'none';
          this.setAmbience(kind);
        }
      })
      .catch((error) => console.warn(`[audio] could not decode ${id}`, error))
      .finally(() => { sample.decoding = null; });
    return sample.decoding;
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

  private playBuffer(buffer: AudioBuffer, bus: AudioNode, gain: number, rate = 1, offset = 0): Playing | null {
    if (!this.ctx) return null;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const amp = this.ctx.createGain();
    amp.gain.value = gain;
    source.connect(amp).connect(bus);
    source.start(0, offset);
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

  /** Prepare a scene cue before the background audio queue reaches it. */
  async prepareSample(id: string): Promise<void> {
    if (!this.enabled) return;
    await this.manifestReady;
    await this.loadSample(id, 'high');
  }

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

  // ───────────────────────────── Held sounds and tuned voices ─────────────────────────────

  /**
   * Holds a sound at `level` (0 lets it go, faded, never cut), with `pitch` in hertz for a synthesised
   * whistle. Called every frame by whoever holds it; starts it the first time.
   */
  hum(name: HumId, level: number, pitch = 0): void {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    let held = this.hums.get(name);
    if (level <= 0.002 || !this.enabled) {
      if (held) {
        this.hums.delete(name);
        held.amp.gain.cancelScheduledValues(t);
        held.amp.gain.setValueAtTime(held.amp.gain.value, t);
        held.amp.gain.linearRampToValueAtTime(0, t + 0.4);
        held.source.stop(t + 0.45);
      }
      return;
    }
    if (!held) {
      const started = this.startHum(name);
      if (!started) return;
      this.hums.set(name, started);
      held = started;
    }
    held.amp.gain.setTargetAtTime(held.base * Math.min(1, level), t, 0.05);
    if (held.pitch && pitch > 0) held.pitch.setTargetAtTime(pitch, t, 0.04);
  }

  private startHum(name: HumId): Hum | null {
    if (!this.ctx || !this.sfxBus) return null;
    const amp = this.ctx.createGain();
    amp.gain.value = 0;
    amp.connect(this.sfxBus);
    const recorded = this.samples.get(name);
    if (recorded?.buffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = recorded.buffer;
      source.loop = true;
      source.connect(amp);
      source.start(this.ctx.currentTime, Math.random() * recorded.buffer.duration);
      return { source, amp, base: recorded.entry.gain, pitch: null };
    }
    if (name === 'radio_whistle') {
      // The whistle of two carriers beating: a thin sine whose pitch is how far off the dial is.
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 900;
      osc.connect(amp);
      osc.start();
      return { source: osc, amp, base: 0.035, pitch: osc.frequency };
    }
    if (!this.noiseBuffer) return null;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1900;
    band.Q.value = 0.5;
    source.connect(band).connect(amp);
    source.start();
    return { source, amp, base: 0.22, pitch: null };
  }

  /**
   * Speaks a recorded line on a channel of its own, at `level`, alongside the protagonist's lines and
   * whatever else is tuned in. Returns its duration (0 with no recording); a line already on that
   * channel is faded out first.
   */
  sayOn(channel: string, id: string, level: number, offset = 0): number {
    const sample = this.samples.get(id);
    if (!sample || sample.entry.kind !== 'voice') return 0;
    const seconds = sample.entry.seconds;
    if (!this.ctx || !this.enabled || !sample.buffer || !this.voiceBus) return seconds;
    this.hushOn(channel);
    const remaining = sample.buffer.duration - offset;
    if (remaining <= 0) return seconds;
    const playing = this.playBuffer(sample.buffer, this.voiceBus, sample.entry.gain * Math.max(0, level), 1, offset);
    if (playing) this.channels.set(channel, { playing, gain: sample.entry.gain, endsAt: this.ctx.currentTime + remaining });
    return seconds;
  }

  /** Follows the tuning: the line on that channel, louder or fainter. */
  levelOn(channel: string, level: number): void {
    const on = this.channels.get(channel);
    if (!on || !this.ctx) return;
    on.playing.amp.gain.setTargetAtTime(on.gain * Math.max(0, level), this.ctx.currentTime, 0.04);
  }

  /** Whether that channel is still speaking. */
  speakingOn(channel: string): boolean {
    const on = this.channels.get(channel);
    return on !== undefined && this.ctx !== null && this.ctx.currentTime < on.endsAt;
  }

  /** Current playhead in the decoded recording, or null when the channel is silent. */
  positionOn(channel: string): number | null {
    const on = this.channels.get(channel);
    const buffer = on?.playing.source.buffer;
    if (!on || !buffer || !this.ctx || this.ctx.currentTime >= on.endsAt) return null;
    return Math.max(0, buffer.duration - (on.endsAt - this.ctx.currentTime));
  }

  /** Fades out whatever that channel is saying. */
  hushOn(channel: string, seconds = VOICE_FADE_OUT): void {
    const on = this.channels.get(channel);
    if (!on) return;
    this.channels.delete(channel);
    this.release(on.playing, seconds);
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
    this.musicPaused = false;
    this.retireMusic();
    this.startRequestedMusic();
    if (this.dying.length > 0) this.ensureMusicTimer();
  }

  /** Hold this track's playhead, including while waiting for a gesture or the manifest. */
  setMusicPaused(paused: boolean): void {
    this.musicPaused = paused;
    if (paused) this.musicEl?.pause();
    else this.resumeMusic();
  }

  private startRequestedMusic(): void {
    if (this.musicEl || this.musicKind === 'none') return;
    const sample = this.samples.get(`mus_${this.musicKind}`);
    if (!sample) return;
    this.musicBase = sample.entry.gain;
    this.startMusic(BASE + sample.entry.file);
    this.ensureMusicTimer();
  }

  private ensureMusicTimer(): void {
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
    if (!element || !element.paused || element.ended || this.musicPaused || !this.enabled || !this.musicEnabled) return;
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
      case 'house_shotgun':
        this.noise('lowpass', 3100, 180, .29, .48);
        this.tone('triangle', 154, 61, .26, .35);
        this.noise('bandpass', 1400, 680, .09, .10, .40);
        this.noise('bandpass', 2300, 880, .055, .14, .54);
        break;
      case 'epic_flare': this.noise('lowpass', 2000, 420, .42, .2); break;
      case 'moped_door':
        this.noise('bandpass', 2100, 1300, .045, .07);
        this.noise('bandpass', 840, 630, .052, .052, .048);
        this.noise('bandpass', 510, 910, .35, .045, .105, 9);
        this.tone('triangle', 290, 395, .24, .023, .135);
        break;
      case 'moped_blade_contact':
        this.noise('bandpass', 3100, 800, .17, .10, 0, 2);
        this.tone('triangle', 420, 135, .065, .055, .12);
        break;
      case 'epic_mob':
        for (let i = 0; i < 13; i++) {
          const rev = 53 + i * 8;
          const onset = i * .16 - i * i * .003;
          this.tone('sawtooth', rev, rev * 1.24, .19, .054, onset);
          this.noise('bandpass', 340 + i * 42, 520 + i * 62, .085, .058, onset);
        }
        break;
      case 'epic_mob_blast':
        this.tone('sine', 114, 43, .34, .20);
        this.noise('lowpass', 2900, 230, .45, .25);
        this.noise('bandpass', 2900, 1700, .065, .08, .13, 2);
        this.noise('bandpass', 1800, 950, .085, .055, .28, 3);
        break;
      case 'epic_tape':
        this.noise('highpass', 1500, 1500, .026, .13);
        this.tone('sine', 105, 105, .062, .095);
        this.noise('bandpass', 2300, 2300, .023, .07, .026, 1.6);
        break;
      case 'epic_pack': this.tone('sine', 430, 575, .55, .045); break;
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
      case 'tracker_ping':
        this.tone('triangle', 940, 760, 0.12, 0.1);
        break;
      case 'siren_test':
        this.tone('triangle', 165, 275, 0.65, 0.15);
        this.tone('sine', 280, 135, 0.8, 0.12, 0.62);
        break;
      case 'hit':
        this.tone('sine', 150, 60, 0.09, 0.3);
        this.noise('lowpass', 800, 200, 0.07, 0.25);
        break;
      case 'kill':
        this.tone('sawtooth', 130, 45, 0.3, 0.16);
        this.noise('lowpass', 500, 100, 0.25, 0.25, 0.04);
        break;
      case 'vhs_knock':
        for (const delay of [0, .32, .62]) {
          this.noise('lowpass', 620, 110, .12, .19, delay / rate);
          this.tone('triangle', 104, 51, .13, .17, delay / rate);
        }
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
      case 'engine_depart':
        this.noise('bandpass', 500, 160, 0.28, 0.22);
        this.tone('sawtooth', 66, 54, 0.85, 0.18, 0.22);
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
      case 'probe_shake':
        for (let i = 0; i < 2; i++) this.noise('bandpass', 2400 + Math.random() * 1200, 1600, 0.08, 0.12, i * 0.14, 2);
        break;
      case 'probe_weigh':
        this.noise('lowpass', 900, 300, 0.18, 0.1);
        this.tone('sine', 120, 70, 0.12, 0.12, 0.1);
        break;
      case 'probe_feel':
        for (let i = 0; i < 4; i++) this.noise('highpass', 4500, 3500, 0.04, 0.06, i * 0.07 + Math.random() * 0.03);
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
      case 'bolt_slide':
        this.noise('bandpass', 1250, 480, .24, .07);
        break;
      case 'bolt_seat':
        this.noise('bandpass', 1900, 610, .055, .16);
        this.tone('triangle', 210, 113, .10, .10);
        break;
      case 'photo_dip':
        this.noise('lowpass', 850, 340, .19, .065);
        break;
      case 'photo_lift':
        this.noise('highpass', 530, 1100, .11, .035);
        this.tone('sine', 710, 420, .045, .045, .20);
        this.tone('sine', 800, 540, .035, .035, .37);
        break;
      case 'vhs_play':
        this.noise('bandpass', 1300, 430, .05, .09);
        this.tone('triangle', 95, 170, .3, .048, .045);
        break;
      case 'vhs_eject':
        this.tone('triangle', 170, 88, .22, .055);
        this.noise('bandpass', 1400, 410, .07, .12, .22);
        this.noise('lowpass', 1000, 310, .08, .10, .30);
        break;
      case 'car_latch':
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
      case 'step_shed':
        this.noise('bandpass', 900 + Math.random() * 400, 500, 0.12, 0.14, 0, 0.9);
        break;
      case 'step_gravel':
        this.noise('lowpass', 790, 270, .075, .065);
        this.noise('highpass', 2600, 1100, .11, .045, .024);
        break;
      case 'yard_cat':
        this.tone('triangle', 420, 610, .12, .024);
        this.tone('triangle', 605, 448, .14, .022, .10);
        break;
      case 'cat_bonnet':
        this.noise('lowpass', 850, 260, .08, .035);
        this.tone('sine', 153, 110, .12, .025, .035);
        break;
      case 'well_plop':
        this.tone('sine', 440, 178, .11, .05);
        this.noise('bandpass', 2200, 750, .14, .022, .025);
        break;
      case 'shop_keys':
        this.tone('triangle', 2580, 2350, .08, .022);
        this.tone('sine', 1620, 1580, .12, .015, .08);
        break;
      case 'dawn_swallows':
        this.tone('sine', 2450, 3300, .105, .028);
        this.tone('sine', 3000, 2600, .09, .024, .16);
        this.tone('sine', 2340, 2890, .13, .015, .88);
        break;
      case 'village_bell':
        this.tone('sine', 348, 345, 1.4, .04);
        this.tone('sine', 829, 822, .87, .022);
        break;
      case 'chain':
        for (let i = 0; i < 6; i++) this.tone('triangle', 1800 + Math.random() * 900, 1500, 0.05, 0.05, i * 0.09);
        break;
      case 'snarl':
        this.tone('sawtooth', 110 + Math.random() * 30, 80, 0.7, 0.1);
        this.noise('bandpass', 700, 400, 0.6, 0.12, 0, 1.5);
        break;
      case 'chain_snap':
        this.tone('square', 1400, 600, 0.12, 0.12);
        this.noise('bandpass', 2600, 1200, 0.2, 0.3, 0, 2);
        this.tone('sawtooth', 120, 70, 0.4, 0.1, 0.05);
        break;
      case 'zap':
        // Buzz and spit, faded in and out like everything else: it is cut by fadeOut when let go.
        this.tone('sawtooth', 100, 100, 1.4, 0.07);
        for (let i = 0; i < 7; i++) this.noise('highpass', 4000, 2500, 0.05, 0.16, i * 0.19, 2);
        break;
      case 'cry':
        this.tone('sawtooth', 260, 170, 1.1, 0.06);
        break;
      case 'pour':
        this.noise('bandpass', 1800, 1300, 1.1, 0.12, 0, 1.4);
        break;
      case 'gulp':
        for (let i = 0; i < 3; i++) this.tone('sine', 220, 120, 0.12, 0.18, i * 0.38);
        break;
      case 'flour':
      case 'knead':
        for (let i = 0; i < 3; i++) this.noise('lowpass', 700, 300, 0.2, 0.14, i * (name === 'knead' ? 0.5 : 0.22));
        break;
      case 'clamp':
        this.tone('square', 2200, 1600, 0.04, 0.12);
        this.tone('square', 2100, 1500, 0.04, 0.12, 0.2);
        break;
      case 'unlock':
        this.tone('triangle', 1600, 1300, 0.06, 0.12);
        this.tone('square', 900, 500, 0.08, 0.12, 0.25);
        for (let i = 0; i < 5; i++) this.tone('triangle', 1400 + Math.random() * 700, 1100, 0.06, 0.05, 0.5 + i * 0.1);
        break;
      case 'thud':
        this.tone('sine', 80, 40, 0.3, 0.4);
        this.noise('lowpass', 400, 140, 0.4, 0.25, 0.08);
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
      case 'radio_static':
        this.noise('bandpass', 2000, 1600, 0.5, 0.25, 0, 0.5);
        break;
      case 'radio_knob':
        for (let i = 0; i < 3; i++) this.noise('highpass', 3500, 3500, 0.02, 0.18, i * 0.07, 2);
        break;
      case 'radio_ptt':
        this.tone('square', 900, 700, 0.03, 0.08);
        this.noise('bandpass', 2400, 2000, 0.05, 0.12, 0.02, 1);
        break;
      case 'radio_squelch':
        this.noise('bandpass', 2600, 1400, 0.22, 0.28, 0, 0.7);
        this.tone('square', 700, 500, 0.03, 0.06, 0.22);
        break;
      case 'radio_off':
        this.tone('square', 300, 200, 0.04, 0.12);
        this.tone('sine', 1800, 120, 1.2, 0.06, 0.04);
        this.noise('bandpass', 1800, 300, 0.8, 0.18, 0.04, 0.6);
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
