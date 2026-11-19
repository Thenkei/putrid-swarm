// The night: a desk, four cameras, and traps fired by hand.
// The simulation runs on its own clock; this scene only chooses which part of it to look at.

import { BARRICADE, COMBAT, DEVICES, HOUSE_MAX_HP, isAuto, isManual } from '../core/data/devices';
import { concludeNight } from '../core/game';
import { HOUSE, sectorOf } from '../core/map';
import { NightSim, type DeskPress, type DeviceRuntime, type SimEvent, type TriggerError } from '../core/night';
import { deskFor, outageFor } from '../core/orchard';
import { allyFor } from '../core/radio';
import type { DeviceTypeId, GameState, NeighborId, SectorId } from '../core/types';
import { SECTOR_IDS } from '../core/types';
import { STAGE_H, STAGE_W, type App, type Pointer, type Scene } from '../engine/app';
import { assetUrl } from '../engine/assets';
import { audio, type Sfx } from '../engine/audio';
import { el } from '../engine/dom';
import { S, fmt, hours } from '../engine/i18n';
import { hush, LINES, pickLine, say, sayAny, sayOnce, type Moment, type VoiceId } from '../engine/voice';
import { BrushPassage } from '../render/brush';
import { DefenseMotion, deviceArt, floodlightEmitter } from '../render/defenses';
import { THRESHOLDS, doorStance, houseDamageStage } from '../render/house';
import { HOUSE_BREAK_SECONDS, type HouseBreak } from '../render/house-debris';
import { LogReactions } from '../render/log-sweep';
import { applyCctv, applyNight, cameraView, drawWorld, FALL_SECONDS, houseLights, pickDevice, prepareWorld, type DeviceVisual, type Fallen, type Light, type Particle, type Rot, type View, type WorldFrame } from '../render/world';
import { DIGIT_CODES, NUMPAD_CODES, TRAP_KEY_CODES, trapKeyLabels } from '../engine/keys';
import { drawPlate, oneArmed } from './common';
import { goFinale, goMorning, goNight, goTitle } from './flow';
import { HandGauge, cameraAwaitingHand, handCoachSeen, markHandCoachSeen, trapsAwaitingHand } from './hand';
import { PauseMenu } from './pause';

const MAIN = { x: 12, y: 54, w: 884, h: 497 } as const;
const MINI = { x: 906, w: 362, h: 159, ys: [54, 223, 392] } as const;
const MAIN_ZOOM = 1.22;
const STEP = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;
const END_HOLD_SECONDS = 3;
const COACH_KEY = 'putrid-swarm.coach';

/** What each neighbour still mutters, and the protagonist's reaction on seeing them. */
const BOSS_BARK: Readonly<Partial<Record<NeighborId, VoiceId>>> = { mechanic: 'bark_mechanic', mail: 'bark_mail', chief: 'bark_chief' };
const BOSS_SIGHTING: Readonly<Record<NeighborId, VoiceId>> = {
  mower: 'vo_boss_mower',
  mechanic: 'vo_boss_mechanic',
  mail: 'vo_boss_mail',
  chief: 'vo_boss_chief',
  mayor: 'vo_boss_mayor',
};

/** First-night guidance: the simulation holds still until the player has done the thing once. */
type Coach = { readonly kind: 'fire'; readonly deviceId: number } | { readonly kind: 'switch'; readonly sector: SectorId };
type CoachStep = Coach['kind'];

const TRIGGER_SOUND: Readonly<Record<string, Sfx>> = { spikes: 'spikes', log: 'log', net: 'net', barrier: 'barrier', horn: 'horn', floodlight: 'floodlight' };

export class NightfallScene implements Scene {
  private time = 0;

  constructor(private readonly app: App) {}

  enter(): void {
    audio.setAmbience('night');
    audio.setMusic('night');
    // The line is the screen's own text: no subtitle.
    const line = pickLine('nightfall', oneArmed(this.app.state));
    say(line, { subtitle: false });
    const s = S();
    const night = this.app.state?.day ?? 1;
    this.app.ui.append(
      el('div', { class: 'center-col' }, [
        el('h1', { text: `${s.night.nightfall} · ${fmt(s.night.night, { n: night })}` }),
        el('p', { text: s.voice[line] }),
        el('div', { class: 'row' }, [el('button', { class: 'btn btn-primary', text: s.night.begin, onClick: () => goNight(this.app) })]),
      ]),
    );
  }

  update(dt: number): void {
    this.time += dt;
  }

  render(ctx: CanvasRenderingContext2D): void {
    drawPlate(ctx, 'plate_control_room', { zoom: 1.02 + this.time * 0.004, focusY: 0.42, oneArmed: oneArmed(this.app.state) });
  }

  onKeyDown(code: string): void {
    if (code === 'Enter' || code === 'Space') goNight(this.app);
  }
}

interface TrapButton {
  readonly root: HTMLElement;
  readonly status: HTMLElement;
  readonly fill: HTMLElement;
  lastClass: string;
  lastStatus: string;
}

export class NightScene implements Scene {
  private readonly sim: NightSim;
  private readonly brushPassage = new BrushPassage();
  private readonly defenseMotion = new DefenseMotion();
  private cam: SectorId = 'portail';
  private accumulator = 0;
  private time = 0;
  private paused = false;
  private debug = false;
  /** Development only (F4): run the simulation several times faster to reach a phase transition. */
  private speed = 1;
  private ending: { survived: boolean; t: number } | null = null;
  private flash = 0;
  private readonly particles: Particle[] = [];
  private readonly fallen: Fallen[] = [];
  private readonly logReactions = new LogReactions();
  private readonly impactFeedback: SimEvent[] = [];
  private readonly houseBreaks: HouseBreak[] = [];
  private hoverDevice: number | null = null;

  private readonly minis = new Map<SectorId, HTMLCanvasElement>();
  private miniCursor = 0;
  private readonly lastAlert = new Map<SectorId, number>();
  private lastInsideBanner = -10;

  private root!: HTMLElement;
  private waveEl!: HTMLElement;
  private energyEl!: HTMLElement;
  private energyFill!: HTMLElement;
  private clockEl!: HTMLElement;
  private pipsEl!: HTMLElement;
  private camLabel!: HTMLElement;
  private camClock!: HTMLElement;
  private trapBar!: HTMLElement;
  private banners!: HTMLElement;
  private overlay!: HTMLElement;
  private pauseMenu!: PauseMenu;
  private readonly miniEls = new Map<SectorId, { root: HTMLElement; count: HTMLElement; door: HTMLElement }>();
  private readonly trapButtons = new Map<number, TrapButton>();
  private trapSignature = '';

  private coach: Coach | null = null;
  /** The one hand on the trap bar, on a one-armed night. */
  private hand: HandGauge | null = null;
  private readonly coachPending = new Set<CoachStep>();
  private coachEl!: HTMLElement;
  private coachNoteUntil = 0;
  private bossAlive: NeighborId | null = null;
  private nextGroan = 5;
  private nextBark = 9;
  private mayorBark = 0;
  /** Last time each occasional line was spoken, so the protagonist does not repeat himself. */
  private readonly lastSaid = new Map<VoiceId | Moment, number>();

  constructor(private readonly app: App) {
    const state = this.state;
    this.sim = new NightSim(state.day, state.yard, state.seed, outageFor(state), deskFor(state), allyFor(state));
    this.defenseMotion.update(this.sim);
    try {
      // The evening as it stood, so a lost night can be replayed with the same yard.
      sessionStorage.setItem('putrid-swarm.evening', JSON.stringify(state));
    } catch {
      // Non-fatal: "replay this night" will simply not be offered.
    }
    if (this.sim.night === 1 && !coachSeen()) {
      this.coachPending.add('fire');
      this.coachPending.add('switch');
    }
  }

  private get state(): GameState {
    if (!this.app.state) throw new Error('NightScene needs a running game');
    return this.app.state;
  }

  enter(): void {
    audio.setAmbience('night');
    audio.setMusic('night');
    // Both sides of the house are on the monitors at once: painted now, while the screen is dark.
    prepareWorld(...SECTOR_IDS.map(sector => this.viewFor(sector, MAIN, MAIN_ZOOM)));
    const s = S();
    this.waveEl = el('span', { class: 'label-strong' });
    this.energyEl = el('span');
    this.energyFill = el('i');
    this.clockEl = el('span');
    this.pipsEl = el('span', { class: 'pips' });
    const pauseButton = el('button', { class: 'btn icon-btn', text: 'II', title: s.night.paused, onClick: () => this.togglePause() });
    const topbar = el('div', { class: 'topbar night-top' }, [
      el('span', { class: 'cell label-strong', text: fmt(s.night.night, { n: this.sim.night }) }),
      el('span', { class: 'sep' }),
      el('span', { class: 'cell' }, [this.waveEl]),
      el('span', { class: 'sep' }),
      el('span', { class: 'cell' }, [this.energyEl, el('span', { class: 'meter', style: { width: '110px' } }, [this.energyFill])]),
      el('span', { class: 'sep' }),
      el('span', { class: 'cell' }, [this.clockEl]),
      el('span', { class: 'sep' }),
      el('span', { class: 'cell' }, ['⌂', this.pipsEl]),
      pauseButton,
    ]);

    this.camLabel = el('span');
    this.camClock = el('div', { class: 'cam-clock' });
    const frame = el('div', { class: 'cam-frame', style: { left: `${MAIN.x - 3}px`, top: `${MAIN.y - 3}px`, width: `${MAIN.w + 6}px`, height: `${MAIN.h + 6}px` } }, [
      el('div', { class: 'cam-label' }, [el('span', { class: 'rec' }), this.camLabel]),
      this.camClock,
    ]);

    const minis: HTMLElement[] = [];
    // Keep the live thumbnails at camera-feed resolution. The selected monitor, controls and
    // text render at display density; supersampling three small video buffers competes with it.
    const miniPixelRatio = Math.min(1.25, this.app.pixelRatio);
    for (const sector of SECTOR_IDS) {
      const count = el('span', { class: 'count' });
      const door = el('i');
      const root = el(
        'div',
        { class: 'mini', style: { left: `${MINI.x - 3}px`, width: `${MINI.w + 6}px`, height: `${MINI.h + 6}px` }, onClick: () => this.switchCam(sector) },
        [
          el('span', { class: 'name', text: `${SECTOR_IDS.indexOf(sector) + 1} · ${s.sector[sector]}` }),
          el('span', { class: 'warn', text: '⚠', style: { fontSize: '30px', lineHeight: '30px' } }),
          el('span', { class: 'cue-tag', text: s.night.now }),
          count,
          el('span', { class: 'door-bar' }, [door]),
        ],
      );
      this.miniEls.set(sector, { root, count, door });
      minis.push(root);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(MINI.w * miniPixelRatio);
      canvas.height = Math.round(MINI.h * miniPixelRatio);
      this.minis.set(sector, canvas);
    }

    this.trapBar = el('div', { class: 'trap-bar' });
    this.banners = el('div', { class: 'banner' });
    this.overlay = el('div');
    const pauseOverlay = el('div');
    this.pauseMenu = new PauseMenu(pauseOverlay, pauseButton);
    this.coachEl = el('div', { class: 'coach' });
    this.root = el('div', {}, [topbar, frame, ...minis, this.trapBar, this.banners, this.coachEl, this.overlay, pauseOverlay]);
    this.app.ui.append(this.root);
    if (this.sim.handView()) this.hand = new HandGauge();
    this.layoutMinis();
    for (const sector of SECTOR_IDS) this.renderMini(sector);
    this.syncHud(true);
    if (this.sim.night === 1) {
      this.coachNote(s.night.coachIntro, 9);
      sayOnce('night1', 'vo_night1', { subtitle: false });
    }
    if (this.hand && !handCoachSeen()) {
      this.coachNote(fmt(s.night.hand.coachIntro, { s: hours(deskFor(this.state)?.crossSeconds ?? 0) }), 10);
      say('vo_one_hand', { subtitle: false });
    }
    // Someone from the radio came to hold a door.
    const ally = allyFor(this.state);
    if (ally && this.state.radio.call) this.coachNote(fmt(s.night.ally, { name: this.allyName(), sector: s.sector[ally.sector] }), 9);
  }

  exit(): void {
    hush();
  }

  /** Who came from the radio, as the night names him. */
  private allyName(): string {
    const call = this.state.radio.call;
    return call ? (S().radio.caller[call.caller].split(',')[0] ?? '') : '';
  }

  // ───────────────────────────── First-night coaching ─────────────────────────────

  private coachNote(text: string, seconds: number): void {
    this.coachEl.textContent = text;
    this.coachEl.className = 'coach on';
    this.coachNoteUntil = this.time + seconds;
  }

  /** Holds the night still on the first occasion of each lesson, until the player acts. */
  private maybeCoach(): void {
    if (this.coach || this.coachPending.size === 0 || this.ending) return;
    const s = S();
    if (this.coachPending.has('fire')) {
      const index = this.camTraps().findIndex((d) => this.sim.opportunity(d.id).now);
      const device = this.camTraps()[index];
      if (device) {
        this.coach = { kind: 'fire', deviceId: device.id };
        this.coachEl.textContent = fmt(s.night.coachFire, { key: trapKeyLabels()[index] ?? '' });
        this.coachEl.className = 'coach on hold';
        say('vo_fire', { subtitle: false, interrupt: true });
        return;
      }
    }
    if (this.coachPending.has('switch')) {
      const sector = this.otherSectors().find((other) => this.sim.threat(other).count > 0);
      if (sector && this.sim.threat(this.cam).atDoor === 0) {
        this.coach = { kind: 'switch', sector };
        this.coachEl.textContent = fmt(s.night.coachSwitch, { sector: s.sector[sector], key: SECTOR_IDS.indexOf(sector) + 1 });
        this.coachEl.className = 'coach on hold';
        say('vo_switch', { subtitle: false, interrupt: true });
      }
    }
  }

  private endCoach(step: CoachStep): void {
    if (this.coach?.kind !== step) return;
    this.coach = null;
    this.coachPending.delete(step);
    if (this.coachPending.size > 0) {
      this.coachEl.className = 'coach';
      return;
    }
    this.coachNote(S().night.coachDone, 6);
    try {
      localStorage.setItem(COACH_KEY, '1');
    } catch {
      // Non-fatal: the lesson will simply be offered again.
    }
  }

  /** An occasional line: at most once every `gap` seconds. */
  /** Says a line, or one of a moment's lines, unless it was heard less than `gap` seconds ago. */
  private remark(id: VoiceId | Moment, gap: number, interrupt = false): void {
    if (this.time - (this.lastSaid.get(id) ?? -1e9) < gap) return;
    const seconds = id in LINES ? sayAny(id as Moment, { interrupt }) : say(id as VoiceId, { interrupt });
    if (seconds > 0) this.lastSaid.set(id, this.time);
  }

  // ───────────────────────────── Cameras ─────────────────────────────

  /** A camera that stopped sending: its feed is snow, and nothing on it can be counted or cued. */
  private isDark(sector: SectorId): boolean {
    return this.sim.cameraLost === sector;
  }

  private otherSectors(): SectorId[] {
    return SECTOR_IDS.filter((sector) => sector !== this.cam);
  }

  private layoutMinis(): void {
    const others = this.otherSectors();
    for (const [sector, mini] of this.miniEls) {
      const slot = others.indexOf(sector);
      mini.root.style.display = slot < 0 ? 'none' : 'block';
      if (slot >= 0) mini.root.style.top = `${(MINI.ys[slot] as number) - 3}px`;
    }
  }

  /** A camera key or a thumbnail: through the desk, which may have to wait for the one hand. */
  private switchCam(sector: SectorId): void {
    this.press({ kind: 'look', sector });
  }

  /** The desk now shows `sector`: the simulation says when. */
  private showCam(sector: SectorId): void {
    if (sector === this.cam) return;
    audio.play('camera');
    this.endCoach('switch');
    this.cam = sector;
    this.hoverDevice = null;
    this.flash = Math.max(this.flash, 0.12);
    this.layoutMinis();
    this.syncHud(true);
  }

  private mostThreatened(): SectorId {
    let best = this.cam;
    let bestScore = -1;
    for (const sector of SECTOR_IDS) {
      const threat = this.sim.threat(sector);
      const cue = this.sectorCue(sector) ? 8 : 0;
      // A dark camera only has its door to go by: the planks are heard, not seen.
      const score = this.isDark(sector) ? threat.atDoor * 3 : threat.atDoor * 3 + threat.count + (threat.boss ? 6 : 0) + (threat.breached && threat.count > 0 ? 4 : 0) + cue;
      if (score > bestScore) {
        bestScore = score;
        best = sector;
      }
    }
    return best;
  }

  /** True when a manual trap watched by that camera has enough under it to be worth firing. */
  private sectorCue(sector: SectorId): boolean {
    return !this.isDark(sector) && this.sim.manualDevicesIn(sector).some((d) => this.sim.opportunity(d.id).now);
  }

  private viewFor(sector: SectorId, rect: { x: number; y: number; w: number; h: number }, zoom: number): View {
    return cameraView(sector, rect, zoom);
  }

  // ───────────────────────────── HUD sync ─────────────────────────────

  private camTraps(): DeviceRuntime[] {
    return this.sim.manualDevicesIn(this.cam).slice(0, TRAP_KEY_CODES.length);
  }

  private buildTrapBar(): void {
    const s = S();
    const labels = trapKeyLabels();
    this.trapButtons.clear();
    const traps = this.camTraps();
    const rot = this.viewFor(this.cam, MAIN, MAIN_ZOOM).rot;
    const children: HTMLElement[] = traps.map((device, index) => {
      const art = deviceArt(device.type, device.facing, 'armed', rot);
      const url = assetUrl(art.key);
      const img = el('img');
      if (url) img.src = url;
      if (art.flip) img.style.transform = 'scaleX(-1)';
      const status = el('span', { class: 'status' });
      const fill = el('span', { class: 'fill' });
      const root = el(
        'button',
        { class: 'trap', onClick: () => this.fire(device.id), onEnter: () => (this.hoverDevice = device.id), onLeave: () => (this.hoverDevice = null) },
        [el('span', { class: 'key' }, [el('b', { text: labels[index] ?? '' }), s.device[device.type].name]), img, status, fill],
      );
      this.trapButtons.set(device.id, { root, status, fill, lastClass: '', lastStatus: '' });
      return root;
    });
    if (traps.length === 0) children.push(el('div', { class: 'trap-empty', text: s.night.noTraps }));
    // The traps that need no attention are listed, not keyed: they are part of the defence, not of the hands.
    const autos = new Map<DeviceTypeId, number>();
    for (const d of this.sim.devices) if (isAuto(d.type) && d.state !== 'broken' && sectorOf(d.x, d.y) === this.cam) autos.set(d.type, (autos.get(d.type) ?? 0) + 1);
    const autoLines = autos.size > 0 ? [...autos].map(([type, n]) => el('span', { text: `${s.device[type].name} ×${n}` })) : [el('span', { text: s.night.autoNone })];
    children.push(el('div', { class: 'trap-auto' }, [el('b', { text: s.night.autoTraps }), ...autoLines]));
    if (this.hand) children.push(this.hand.root);
    children.push(el('div', { class: 'trap-hint' }, [el('span', { text: s.night.cameras }), el('span', { text: getSpaceHint() })]));
    this.trapBar.replaceChildren(...children);
  }

  private syncHud(force = false): void {
    const s = S();
    const sim = this.sim;

    setText(this.waveEl, fmt(s.night.wave, { i: Math.max(1, sim.waveIndex), n: sim.waveCount }));
    setText(this.energyEl, fmt(s.night.energy, { p: Math.round(sim.energy) }));
    this.energyFill.style.width = `${(sim.energy / COMBAT.nightEnergy) * 100}%`;

    // 21:00 at dusk, 06:00 at dawn.
    const minutes = Math.round(21 * 60 + sim.progress() * 9 * 60) % (24 * 60);
    const clock = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    setText(this.clockEl, `${clock} → ${s.night.dawn}`);
    setText(this.camClock, `${clock}:${String(Math.floor((this.time * 7) % 60)).padStart(2, '0')}`);

    const lit = Math.ceil((sim.houseHp / HOUSE_MAX_HP) * 5);
    const pipSignature = `${lit}`;
    if (this.pipsEl.dataset['v'] !== pipSignature) {
      this.pipsEl.dataset['v'] = pipSignature;
      this.pipsEl.className = `pips ${lit <= 2 ? 'low' : ''}`;
      this.pipsEl.replaceChildren(...Array.from({ length: 5 }, (_, i) => el('i', { class: i < lit ? 'on' : '' })));
    }

    setText(this.camLabel, fmt(s.night.cam, { i: String(SECTOR_IDS.indexOf(this.cam) + 1).padStart(2, '0'), name: s.sector[this.cam] }));

    const handView = sim.handView();
    if (this.hand && handView) this.hand.sync(handView, sim);
    const lookAwaited = cameraAwaitingHand(handView);
    const fireAwaited = trapsAwaitingHand(handView, sim);
    for (const [sector, mini] of this.miniEls) {
      const threat = sim.threat(sector);
      const barricade = sim.barricades[sector];
      const ratio = Math.max(0, barricade.hp / BARRICADE.maxHp[barricade.level]);
      const dark = this.isDark(sector);
      const danger = dark ? threat.atDoor > 0 : threat.atDoor > 0 || threat.boss !== null || (threat.breached && threat.count > 0);
      const cls = `mini ${danger ? 'danger' : !dark && threat.count > 0 ? 'alert' : ''}${this.sectorCue(sector) ? ' cue' : ''}${dark ? ' dark' : ''}${lookAwaited === sector ? ' queued' : ''}`;
      if (mini.root.className !== cls) mini.root.className = cls;
      setText(mini.count, dark ? '' : threat.count > 0 ? `${threat.count}${threat.boss ? ` · ${s.enemy[threat.boss]}` : ''}` : '');
      mini.door.style.width = `${ratio * 100}%`;
      mini.door.style.background = ratio > 0.5 ? '#a3cf5c' : ratio > 0.2 ? '#f2a531' : '#dc4330';

      // A sector we are not watching just started taking hits on its door: say so, once in a while.
      if (sector !== this.cam && threat.atDoor > 0 && this.time - (this.lastAlert.get(sector) ?? -10) > 5) {
        this.lastAlert.set(sector, this.time);
        audio.play('alert');
      }
    }

    const blind = this.isDark(this.cam);
    const signature = `${this.cam}:${this.camTraps()
      .map((d) => d.id)
      .join(',')}:${sim.devices.filter((d) => d.state === 'broken').length}`;
    if (force || signature !== this.trapSignature) {
      this.trapSignature = signature;
      this.buildTrapBar();
    }
    for (const [id, button] of this.trapButtons) {
      const device = sim.device(id);
      if (!device) continue;
      const def = DEVICES[device.type];
      let cls = 'trap';
      let status = '';
      let fill = 0;
      if (device.state === 'broken') {
        cls += ' broken';
        status = s.night.broken;
      } else if (device.state === 'active') {
        cls += ' active';
        status = s.night.active;
        fill = def.activeSeconds > 0 ? device.timer / def.activeSeconds : 0;
      } else if (device.state === 'rearming') {
        status = fmt(s.night.seconds, { s: String(Math.ceil(device.timer)).padStart(2, '0') });
        fill = 1 - device.timer / def.rearmSeconds;
      } else if (sim.energy < def.energy) {
        status = s.night.noEnergy;
      } else if (blind) {
        // The trap still answers; what is under it is anyone's guess.
        cls += ' ready';
        status = s.night.blind;
      } else {
        const opportunity = sim.opportunity(id);
        cls += opportunity.now ? ' ready now' : ' ready';
        status = opportunity.now ? s.night.now : opportunity.targets > 0 ? `${s.night.ready} ×${opportunity.targets}` : s.night.ready;
      }
      if (fireAwaited.has(id)) {
        cls += ' queued';
        status = s.night.hand.coming;
      }
      if (this.hoverDevice === id) cls += ' focus';
      if (button.root.classList.contains('shake')) cls += ' shake';
      if (button.lastClass !== cls) {
        button.root.className = cls;
        button.lastClass = cls;
      }
      if (button.lastStatus !== status) {
        button.status.textContent = status;
        button.lastStatus = status;
      }
      button.fill.style.width = `${Math.max(0, Math.min(1, fill)) * 100}%`;
    }
  }

  private banner(text: string, kind: '' | 'bad' | 'good' = ''): void {
    const node = el('div', { class: kind, text });
    this.banners.append(node);
    while (this.banners.children.length > 3) this.banners.firstElementChild?.remove();
    window.setTimeout(() => node.remove(), 3300);
  }

  private bossCard(boss: NeighborId, name: string, tip: string): void {
    const url = assetUrl(`por_${boss}_infected`);
    const img = el('img');
    if (url) img.src = url;
    const card = el('div', { class: 'card boss-card' }, [img, el('div', {}, [el('h2', { text: name }), el('p', { text: tip })])]);
    this.overlay.append(card);
    window.setTimeout(() => card.remove(), 7100);
  }

  // ───────────────────────────── Input ─────────────────────────────

  private fire(deviceId: number): void {
    this.press({ kind: 'fire', deviceId });
  }

  /** Everything the desk does goes through the simulation, which knows whether a hand is free for it. */
  private press(press: DeskPress): void {
    if (this.paused || this.ending) return;
    this.sim.act(press);
    this.defenseMotion.update(this.sim);
    // Feedback is produced from the simulation's own events, so it cannot disagree with what happened.
    this.consume(this.sim.drainEvents());
  }

  private deniedFeedback(deviceId: number, reason: TriggerError): void {
    audio.play('deny');
    const button = this.trapButtons.get(deviceId);
    if (button) {
      button.root.classList.add('shake');
      window.setTimeout(() => button.root.classList.remove('shake'), 230);
    }
    const device = this.sim.device(deviceId);
    const text = S().night.denied[reason];
    if (reason === 'no_energy') this.remark('vo_battery', 20);
    if (!device || !text) return;
    // One refusal note per trap at a time: hammering a key must not bury the feed in text.
    const x = device.x + 0.5;
    const y = device.y + 0.5;
    if (this.particles.some((p) => p.kind === 'text' && p.x === x && p.y === y && p.age < 0.6)) return;
    this.particles.push({ kind: 'text', x, y, age: 0, life: 0.9, text, color: '#ff9a88' });
  }

  private togglePause(auto = false): void {
    if (this.ending) return;
    this.paused = !this.paused;
    if (this.paused) this.pauseMenu.open(() => this.togglePause(), () => goTitle(this.app), auto, S().night.abandon);
    else this.pauseMenu.close();
  }

  onBlur(): void {
    if (!this.paused) this.togglePause(true);
  }

  onKeyLabels(): void {
    // The trap bar is rebuilt on the next sync; the yard reads the labels afresh every frame.
    this.trapSignature = '';
  }

  onKeyDown(code: string, event: KeyboardEvent): void {
    if (code === 'Escape' || code === 'KeyP') {
      this.togglePause();
      return;
    }
    if (code === 'F3') {
      this.debug = !this.debug;
      event.preventDefault();
      return;
    }
    if (code === 'F4' && import.meta.env.DEV) {
      this.speed = this.speed === 1 ? 8 : 1;
      event.preventDefault();
      return;
    }
    if (this.paused) return;
    const digit = (DIGIT_CODES as readonly string[]).indexOf(code);
    const numpad = (NUMPAD_CODES as readonly string[]).indexOf(code);
    const camIndex = digit >= 0 ? digit : numpad;
    if (camIndex >= 0) {
      this.switchCam(SECTOR_IDS[camIndex] as SectorId);
      return;
    }
    if (code === 'Tab') {
      event.preventDefault();
      this.switchCam(SECTOR_IDS[(SECTOR_IDS.indexOf(this.cam) + (event.shiftKey ? SECTOR_IDS.length - 1 : 1)) % SECTOR_IDS.length] as SectorId);
      return;
    }
    if (code === 'Space') {
      event.preventDefault();
      this.switchCam(this.mostThreatened());
      return;
    }
    const trapIndex = (TRAP_KEY_CODES as readonly string[]).indexOf(code);
    // A trap key stands for a trap of the camera on screen when the hand gets to it.
    if (trapIndex >= 0) this.press({ kind: 'key', slot: trapIndex });
  }

  private deviceVisuals(sector: SectorId | null): DeviceVisual[] {
    const labels = trapKeyLabels();
    const keyed = sector ? this.sim.manualDevicesIn(sector).slice(0, TRAP_KEY_CODES.length) : [];
    return this.sim.devices.map((d) => {
      const def = DEVICES[d.type];
      const slot = keyed.findIndex((k) => k.id === d.id);
      const label = slot >= 0 ? labels[slot] : undefined;
      return {
        id: d.id,
        type: d.type,
        x: d.x,
        y: d.y,
        facing: d.facing,
        state: d.state,
        activeAge: d.state === 'active' ? Math.min(def.activeSeconds, def.activeSeconds - d.timer + (d.type === 'log' ? this.ending?.t ?? 0 : 0)) : 0,
        ...(d.logTarget && (d.state === 'active' || d.state === 'broken') && { logTarget: d.logTarget }),
        hpRatio: Math.max(0, d.hp / def.maxHp),
        rearm: d.state === 'rearming' ? 1 - d.timer / def.rearmSeconds : 0,
        highlight: sector !== null && d.id === this.hoverDevice,
        cue: slot >= 0 && sector !== null && !this.isDark(sector) && this.sim.opportunity(d.id).now,
        ...(label ? { label } : {}),
      };
    });
  }

  onPointerMove(pointer: Pointer): void {
    if (this.paused || this.ending || this.isDark(this.cam)) return;
    const view = this.viewFor(this.cam, MAIN, MAIN_ZOOM);
    const picked = pickDevice(view, this.deviceVisuals(null).filter((d) => isManual(d.type)), pointer.x, pointer.y);
    this.hoverDevice = picked?.id ?? null;
  }

  onPointerDown(pointer: Pointer): void {
    if (this.paused || this.ending) return;
    const view = this.viewFor(this.cam, MAIN, MAIN_ZOOM);
    // Nothing can be picked out of snow: on a dark camera the traps are fired from the keys.
    const picked = this.isDark(this.cam) ? undefined : pickDevice(view, this.deviceVisuals(null).filter((d) => isManual(d.type)), pointer.x, pointer.y);
    if (picked) {
      this.fire(picked.id);
      return;
    }
    // Clicking a thumbnail painted on the canvas (the DOM tile above normally catches this).
    const others = this.otherSectors();
    others.forEach((sector, slot) => {
      const y = MINI.ys[slot] as number;
      if (pointer.x >= MINI.x && pointer.x <= MINI.x + MINI.w && pointer.y >= y && pointer.y <= y + MINI.h) this.switchCam(sector);
    });
  }

  // ───────────────────────────── Events → feedback ─────────────────────────────

  private consume(events: readonly SimEvent[]): void {
    const s = S();
    const now = this.sim.time + (this.ending?.t ?? 0);
    for (const event of events) {
      if (event.showAt !== undefined && event.showAt > now) {
        this.impactFeedback.push(event);
        continue;
      }
      switch (event.type) {
        case 'wave':
          this.banner(fmt(s.night.wave, { i: event.index, n: event.total }));
          break;
        case 'boss_spawn':
          audio.play('boss');
          audio.setMusic('boss');
          this.bossAlive = event.boss;
          this.nextBark = this.time + 8;
          say(BOSS_SIGHTING[event.boss], { interrupt: true });
          this.banner(fmt(s.night.bossArrives, { name: s.enemy[event.boss], sector: s.sector[event.sector] }), 'bad');
          this.bossCard(event.boss, s.enemy[event.boss], s.neighbor[event.boss].boss);
          break;
        case 'boss_dead':
          audio.setMusic('night');
          this.bossAlive = null;
          this.banner(s.enemy[event.boss], 'good');
          break;
        case 'trigger': {
          const sound = TRIGGER_SOUND[event.device];
          // Automatic traps are part of the background; the ones fired by hand are louder.
          if (sound && event.device !== 'log') audio.play(sound, event.auto ? 0.6 : 1);
          if (!event.auto) this.endCoach('fire');
          if (!event.auto && event.kills >= 2) this.remark('praise', 14);
          const def = DEVICES[event.device];
          const cx = event.x + 0.5;
          const cy = event.y + 0.5;
          if (event.device === 'horn' || event.device === 'net') this.particles.push({ kind: 'ring', x: cx, y: cy, age: 0, life: event.device === 'horn' ? 1.1 : 0.45, radius: def.radius, color: event.device === 'net' ? '#e2ca96' : '#f2b960' });
          if (event.device === 'spikes') this.particles.push({ kind: 'burst', x: cx, y: cy, age: 0, life: 0.35, radius: 1.1 });
          if (event.device === 'barrier') this.particles.push({ kind: 'dust', x: cx, y: cy, age: 0, life: 0.5, radius: 1 });
          break;
        }
        case 'log_release':
          this.logReactions.release(event.contactAt, event.sweeps, now);
          break;
        case 'log_contact': {
          audio.play('log');
          const foot = event.target ? doorStance(event.target) : event;
          this.particles.push({ kind: 'dust', x: foot.x, y: foot.y, age: now - (event.showAt ?? now), life: 0.42, radius: 1.1 });
          break;
        }
        case 'trigger_denied':
          this.deniedFeedback(event.deviceId, event.reason);
          break;
        case 'device_ready':
          audio.play('ready');
          break;
        case 'device_broken':
          audio.play('broken');
          if (event.device !== 'fence') this.remark('vo_trap_broken', 30);
          this.particles.push({ kind: 'dust', x: event.x + 0.5, y: event.y + 0.5, age: 0, life: 0.7, radius: 1.4 });
          break;
        case 'enemy_hit': {
          if (event.amount >= 30) {
            const p = doorStance(event.pose);
            this.particles.push({ kind: 'text', x: p.x, y: p.y, age: 0, life: 0.7, text: `-${event.amount}` });
          }
          audio.play('hit');
          break;
        }
        case 'enemy_dead': {
          audio.play('kill');
          const pose = doorStance(event.pose);
          if (event.showAt === undefined) this.logReactions.cancel(event.id);
          this.fallen.push({ id: event.id, type: event.enemy, x: pose.x, y: pose.y, fx: pose.fx, fy: pose.fy, crawlDepth: pose.crawlDepth, age: now - (event.showAt ?? now),
            ...(pose.threshold && { threshold: pose.threshold }) });
          break;
        }
        case 'barricade_hit':
          audio.play('door');
          this.particles.push({ kind: 'dust', x: THRESHOLDS[event.sector].gx, y: THRESHOLDS[event.sector].gy, age: 0, life: 0.4, radius: 0.8 });
          break;
        case 'breach':
          audio.play('breach');
          this.remark('vo_breach', 8, true);
          this.banner(fmt(s.night.breach, { sector: s.sector[event.sector] }), 'bad');
          this.flash = 0.5;
          break;
        case 'entered':
          audio.play('inside');
          this.remark('vo_inside', 18);
          this.flash = Math.max(this.flash, 0.3);
          if (this.time - this.lastInsideBanner > 4) {
            this.lastInsideBanner = this.time;
            this.banner(fmt(s.night.inside, { sector: s.sector[event.sector] }), 'bad');
          }
          break;
        case 'telegraph':
          audio.play(event.kind === 'mower' ? 'mower' : event.kind === 'speech' ? 'megaphone' : event.kind === 'whistle' ? 'whistle' : 'ram');
          if (event.kind === 'mower') this.banner(`${s.night.lane} · ${s.sector[event.sector]}`, 'bad');
          // The mayor is still campaigning; the megaphone carries.
          if (event.kind === 'speech') say(this.mayorBark++ % 2 === 0 ? 'bark_mayor_1' : 'bark_mayor_2');
          break;
        case 'interrupt':
          audio.play('interrupt');
          this.particles.push({ kind: 'text', x: event.x, y: event.y, age: 0, life: 0.8, text: '✕', color: '#ffe58a' });
          break;
        case 'reinforcements':
          audio.play('alert');
          this.banner(fmt(s.night.reinforcements, { sector: s.sector[event.sector] }), 'bad');
          break;
        case 'jump':
          this.particles.push({ kind: 'dust', x: event.x, y: event.y, age: 0, life: 0.4, radius: 0.7 });
          break;
        case 'camera_lost':
          audio.play('signal_lost');
          this.remark('vo_cam_lost', 60, true);
          this.banner(fmt(s.night.cameraLost, { i: String(SECTOR_IDS.indexOf(event.sector) + 1).padStart(2, '0'), name: s.sector[event.sector] }), 'bad');
          this.hoverDevice = null;
          this.lostAt = this.time;
          this.syncHud(true);
          break;
        case 'ally_turned':
          audio.play('breach');
          this.banner(fmt(s.night.allyTurned, { name: this.allyName(), sector: s.sector[event.sector] }), 'bad');
          break;
        case 'outcome':
          this.ending = { survived: event.survived, t: 0 };
          this.coach = null;
          this.coachEl.className = 'coach';
          audio.setMusic('none');
          audio.play(event.survived ? 'dawn' : 'lost');
          if (event.survived) sayAny('dawn', { interrupt: true, oneArmed: oneArmed(this.state) });
          else say('vo_lost', { interrupt: true });
          this.banner(event.survived ? s.night.dawn : s.end.lostTitle, event.survived ? 'good' : 'bad');
          break;
        case 'look':
          this.showCam(event.sector);
          break;
        case 'hand_wait':
          audio.play('hand');
          if (handCoachSeen()) this.remark('hand', 45);
          else {
            this.coachNote(s.night.hand.coachWait, 7);
            markHandCoachSeen();
            // The note says it already: no aside on top of it for a while.
            this.lastSaid.set('hand', this.time);
          }
          break;
        case 'hand_full':
          audio.play('deny');
          this.hand?.refuse();
          break;
        case 'spawn':
          break;
      }
    }
  }

  // ───────────────────────────── Loop ─────────────────────────────

  private advanceEffects(dt: number): void {
    this.flash = Math.max(0, this.flash - dt);
    for (const hit of this.houseBreaks) hit.age += dt;
    while (this.houseBreaks[0] && this.houseBreaks[0].age >= HOUSE_BREAK_SECONDS) this.houseBreaks.shift();
    for (const fallen of this.fallen) fallen.age += dt;
    for (let i = this.fallen.length - 1; i >= 0; i--) if ((this.fallen[i] as Fallen).age >= FALL_SECONDS) this.fallen.splice(i, 1);
    for (const particle of this.particles) particle.age += dt;
    for (let i = this.particles.length - 1; i >= 0; i--) if ((this.particles[i] as Particle).age >= (this.particles[i] as Particle).life) this.particles.splice(i, 1);
  }

  private advanceImpacts(): void {
    const now = this.sim.time + (this.ending?.t ?? 0);
    this.logReactions.advance(now);
    // Releases enter the queue in simulation order, including presses queued by the one hand.
    while (this.impactFeedback.length && this.impactFeedback[0]!.showAt! <= now) {
      this.consume([this.impactFeedback.shift()!]);
    }
  }

  update(dt: number): void {
    if (this.paused) return;
    this.time += dt;
    if (this.ending) {
      this.advanceEffects(dt);
      this.ending.t += dt;
      this.advanceImpacts();
      if (this.ending.t >= END_HOLD_SECONDS) this.finish();
      return;
    }
    if (this.coachNoteUntil > 0 && this.time >= this.coachNoteUntil && !this.coach) {
      this.coachNoteUntil = 0;
      this.coachEl.className = 'coach';
    }
    if (this.coach) {
      // The lesson holds the night still; the desk stays live so the player can act.
      this.syncHud();
      return;
    }
    this.murmur();

    const previousTime = this.sim.time;
    const previousStage = houseDamageStage(this.sim.houseHp / HOUSE_MAX_HP);
    this.accumulator += dt * this.speed;
    let steps = 0;
    while (this.accumulator >= STEP && steps < MAX_STEPS_PER_FRAME * this.speed) {
      this.sim.step(STEP);
      this.brushPassage.update(this.sim.time, this.sim.enemies);
      this.accumulator -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME * this.speed) this.accumulator = 0;
    this.advanceEffects(this.sim.time - previousTime);
    const stage = houseDamageStage(this.sim.houseHp / HOUSE_MAX_HP);
    if (stage > previousStage) this.houseBreaks.push({ from: previousStage, to: stage, age: 0 });
    this.defenseMotion.update(this.sim);
    this.advanceImpacts();
    this.consume(this.sim.drainEvents());
    this.syncHud();
    this.maybeCoach();
  }

  /** The lot is never silent while something is walking on it. */
  private murmur(): void {
    const count = this.sim.enemies.length;
    if (count > 0 && this.time >= this.nextGroan) {
      audio.play('groan', 0.5 + Math.min(count, 12) / 24);
      this.nextGroan = this.time + 2.5 + Math.random() * 5;
    }
    const bark = this.bossAlive ? BOSS_BARK[this.bossAlive] : undefined;
    if (bark && this.time >= this.nextBark) {
      say(bark);
      this.nextBark = this.time + 13 + Math.random() * 6;
    }
  }

  private finished = false;
  /** When the camera went dark, for the moment its picture tears before the snow settles. */
  private lostAt = -10;

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.app.state = concludeNight(this.state, this.sim);
    this.app.save();
    if (this.app.state.phase === 'morning') goMorning(this.app);
    // A house that fell, or the seventh dawn, is not shown the door straight away: it gets its last scene first.
    else goFinale(this.app);
  }

  private frame(sector: SectorId, main: boolean): WorldFrame {
    const hovered = main && this.hoverDevice !== null ? this.sim.device(this.hoverDevice) : undefined;
    const time = this.sim.time + (this.ending?.t ?? 0);
    return {
      time,
      night: true,
      carPresent: true,
      houseHpRatio: this.sim.houseHp / HOUSE_MAX_HP,
      houseBreaks: this.houseBreaks,
      devices: this.deviceVisuals(main ? sector : null),
      barricades: this.sim.barricades,
      defenseMotion: this.defenseMotion,
      decals: this.impactFeedback.length ? this.sim.decals.filter(d => !this.impactFeedback.some(e => e.type === 'enemy_dead' && e.stain === d)) : this.sim.decals,
      enemies: this.logReactions.enemies(this.sim.enemies, time),
      brushPassage: this.brushPassage,
      fallen: this.logReactions.bodies(this.fallen, time),
      particles: main ? this.particles : this.particles.filter((particle) => particle.kind !== 'text'),
      lanes: this.sim.telegraphedLanes(),
      focusSector: sector,
      hoverCell: hovered ? { x: hovered.x, y: hovered.y } : null,
      hoverRadius: hovered ? DEVICES[hovered.type].radius : 0,
    };
  }

  /** Everything that gives light on the lot, as seen from one side of the house. */
  private lights(rot: Rot): Light[] {
    const lights: Light[] = [
      // What spills out of the house on every side, then its windows and its lantern.
      { gx: (HOUSE.x0 + HOUSE.x1 + 1) / 2, gy: (HOUSE.y0 + HOUSE.y1 + 1) / 2, radius: 4.4, color: 'rgba(255,214,150,0.5)', lift: 40 },
      ...houseLights(rot, this.sim.barricades, this.sim.houseHp / HOUSE_MAX_HP),
    ];
    // A lamp over each door: the doorsteps are where the night is decided.
    for (const sector of SECTOR_IDS) lights.push({ gx: THRESHOLDS[sector].gx, gy: THRESHOLDS[sector].gy, radius: 2.6, color: 'rgba(255,196,120,0.72)', lift: 10, flicker: 0.35 });
    for (const device of this.sim.devices) {
      if (device.state === 'broken') continue;
      if (device.type === 'floodlight' && device.state === 'active') {
        // The pool it throws on the ground, and the lamp itself at the top of its pole.
        lights.push({ gx: device.x + 0.5, gy: device.y + 0.5, radius: DEVICES.floodlight.radius, color: 'rgba(255,244,214,1)' });
        lights.push({ gx: device.x + 0.5, gy: device.y + 0.5, radius: 1.2, color: 'rgba(255,244,214,0.6)',
          ...floodlightEmitter(device.facing, rot), glow: 1, round: true });
      }
      else if (device.state === 'active') lights.push({ gx: device.x + 0.5, gy: device.y + 0.5, radius: 1.6, color: 'rgba(255,180,90,0.6)' });
      else if (device.state === 'armed') lights.push({ gx: device.x + 0.5, gy: device.y + 0.5, radius: 0.9, color: 'rgba(255,170,70,0.35)', lift: 20 });
    }
    return lights;
  }

  private renderMini(sector: SectorId): void {
    const canvas = this.minis.get(sector);
    if (!canvas) return;
    const mctx = canvas.getContext('2d');
    if (!mctx) return;
    const ratio = canvas.width / MINI.w;
    mctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const rect = { x: 0, y: 0, w: MINI.w, h: MINI.h };
    if (this.isDark(sector)) {
      drawNoSignal(mctx, rect, this.time + SECTOR_IDS.indexOf(sector) * 1.7, S().night.noSignal, 17, 0);
      return;
    }
    const view = this.viewFor(sector, rect, (MAIN_ZOOM * MINI.w) / MAIN.w);
    const frame = this.frame(sector, false);
    drawWorld(mctx, view, frame);
    applyNight(mctx, view, this.lights(view.rot), frame.time);
    applyCctv(mctx, view, frame.time + SECTOR_IDS.indexOf(sector) * 1.7, 1);
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#0d0b09';
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);

    // Main feed.
    if (this.isDark(this.cam)) {
      drawNoSignal(ctx, MAIN, this.time, S().night.noSignal, 34, Math.max(0, 1 - (this.time - this.lostAt) / 0.9));
    } else {
      const view = this.viewFor(this.cam, MAIN, MAIN_ZOOM);
      const frame = this.frame(this.cam, true);
      drawWorld(ctx, view, frame);
      applyNight(ctx, view, this.lights(view.rot), frame.time);
      applyCctv(ctx, view, frame.time, 0.85);
    }

    if (this.flash > 0) {
      ctx.save();
      ctx.translate(MAIN.x + MAIN.w / 2, MAIN.y + MAIN.h / 2);
      ctx.scale(MAIN.w / 2, MAIN.h / 2);
      const edges = ctx.createRadialGradient(0, 0, 0.45, 0, 0, 1.38);
      edges.addColorStop(0, 'rgba(204,57,37,0)');
      edges.addColorStop(1, `rgba(220,58,40,${Math.min(0.64, this.flash * 1.5)})`);
      ctx.fillStyle = edges;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }
    if (this.ending) {
      const t = Math.min(1, this.ending.t / END_HOLD_SECONDS);
      ctx.fillStyle = this.ending.survived ? `rgba(255, 190, 110, ${t * 0.5})` : `rgba(10, 0, 0, ${t * 0.8})`;
      ctx.fillRect(MAIN.x, MAIN.y, MAIN.w, MAIN.h);
    }

    // Thumbnails: one is refreshed per frame; all of them keep showing the same running simulation.
    const others = this.otherSectors();
    if (!this.paused) {
      const refresh = others[this.miniCursor % others.length];
      this.miniCursor++;
      if (refresh) this.renderMini(refresh);
    }
    others.forEach((sector, slot) => {
      const canvas = this.minis.get(sector);
      if (canvas) ctx.drawImage(canvas, MINI.x, MINI.ys[slot] as number, MINI.w, MINI.h);
    });

    if (this.debug) this.drawDebug(ctx);
  }

  /** Development view (F3): phase, wave, balances, per-sector counts, trap states. */
  private drawDebug(ctx: CanvasRenderingContext2D): void {
    const sim = this.sim;
    const lines = [
      `phase=night  night=${sim.night}  t=${sim.time.toFixed(1)}s  dawn@${sim.dawnAt.toFixed(0)}s  outcome=${sim.outcome}`,
      `wave=${sim.waveIndex}/${sim.waveCount}  pending=${sim.remainingSpawns()}  next=${sim.secondsToNextSpawn()?.toFixed(1) ?? '-'}s`,
      `energy=${sim.energy.toFixed(0)}  house=${sim.houseHp.toFixed(0)}  cam=${this.cam}`,
      `inventory=${JSON.stringify(this.state.inventory)}`,
      ...SECTOR_IDS.map((sector) => {
        const threat = sim.threat(sector);
        return `${sector.padEnd(8)} enemies=${threat.count} atDoor=${threat.atDoor} door=${sim.barricades[sector].hp.toFixed(0)} boss=${threat.boss ?? '-'}`;
      }),
      `traps: ${sim.devices
        .filter((d) => d.state !== 'passive')
        .map((d) => `${d.type}#${d.id}:${d.state}${d.timer > 0 ? `(${d.timer.toFixed(1)})` : ''}`)
        .join(' ')}`,
    ];
    ctx.font = '12px Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(MAIN.x + 8, MAIN.y + 44, 720, lines.length * 15 + 10);
    ctx.fillStyle = '#9fe8c8';
    lines.forEach((line, i) => ctx.fillText(line.slice(0, 118), MAIN.x + 14, MAIN.y + 60 + i * 15));
  }
}

/**
 * A feed with nothing on it: snow, a rolling bar and the words. `tear` (1 → 0) is the moment the
 * picture breaks up, right after the signal goes.
 */
function drawNoSignal(ctx: CanvasRenderingContext2D, rect: { x: number; y: number; w: number; h: number }, time: number, label: string, fontPx: number, tear: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.fillStyle = '#0a0e0f';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  // Snow: redrawn every frame, so it never looks like a texture.
  const grain = Math.max(2, fontPx / 9);
  const flecks = Math.round((rect.w * rect.h) / 520);
  for (let i = 0; i < flecks; i++) {
    const light = 150 + Math.random() * 90;
    ctx.fillStyle = `rgba(${light}, ${light + 12}, ${light + 6}, ${0.06 + Math.random() * (0.3 + tear * 0.5)})`;
    ctx.fillRect(rect.x + Math.random() * rect.w, rect.y + Math.random() * rect.h, grain * (1 + Math.random() * 4), grain * 0.55);
  }
  // The bar that rolls down a picture with no sync.
  const barH = rect.h * 0.16;
  const barY = rect.y + ((time * rect.h * 0.22) % (rect.h + barH)) - barH;
  const bar = ctx.createLinearGradient(0, barY, 0, barY + barH);
  bar.addColorStop(0, 'rgba(190, 215, 205, 0)');
  bar.addColorStop(0.5, 'rgba(190, 215, 205, 0.16)');
  bar.addColorStop(1, 'rgba(190, 215, 205, 0)');
  ctx.fillStyle = bar;
  ctx.fillRect(rect.x, barY, rect.w, barH);
  if (tear > 0) {
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = `rgba(232, 239, 233, ${tear * (0.15 + Math.random() * 0.5)})`;
      ctx.fillRect(rect.x, rect.y + Math.random() * rect.h, rect.w, 1 + Math.random() * rect.h * 0.035);
    }
  }
  if (Math.floor(time * 1.6) % 4 !== 3) {
    ctx.font = `700 ${fontPx}px 'Courier New', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const width = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(8, 11, 12, 0.72)';
    ctx.fillRect(cx - width / 2 - fontPx * 0.6, cy - fontPx * 0.9, width + fontPx * 1.2, fontPx * 1.8);
    ctx.fillStyle = 'rgba(232, 239, 233, 0.92)';
    ctx.fillText(label, cx, cy + 1);
  }
  ctx.restore();
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

function coachSeen(): boolean {
  try {
    return localStorage.getItem(COACH_KEY) === '1';
  } catch {
    return false;
  }
}

function getSpaceHint(): string {
  return document.documentElement.lang === 'fr' ? 'Espace · Alerte' : 'Space · Alert';
}
