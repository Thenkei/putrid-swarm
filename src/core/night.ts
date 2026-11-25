// The night defense simulation. One authoritative, deterministic state: cameras only look at it.
// Mutable on purpose (it steps 60 times a second); everything it reports back is a snapshot.

import { BARRICADE, COMBAT, DEVICES, isManual, isTrap } from './data/devices';
import { BOSS, ENEMIES, type EnemyDef } from './data/enemies';
import { BOSS_NIGHT } from './data/locations';
import { NIGHT_LEAD_IN, planForNight, type SirenSector, type SpawnGroup } from './data/waves';
import type { DefenseTake } from './cassette';
import { ENTRIES, GRID_H, GRID_W, LANES, SPAWN_CELLS, idx, inGrid, isStaticBlocked, sectorOf } from './map';
import type { CameraOutage } from './orchard';
import type { Ally } from './radio';
import { computeField, nextStep, type Field } from './pathing';
import { mopedImpact, mopedPath, MOPED_BLAST_RADIUS, MOPED_EXIT_SECONDS, MOPED_RUN_SECONDS } from './epics';
import { createRng, type Rng } from './rng';
import { DOOR_REACH, doorStance } from '../house-layout';
import type { Cell, Decal, DeviceTypeId, EnemyTypeId, Facing, GroundContact, NeighborId, NightHighlight, NightReport, Result, SectorId, TrapTally, YardState } from './types';
import { SECTOR_IDS, err, ok } from './types';

export type DeviceRuntimeState = 'passive' | 'armed' | 'active' | 'rearming' | 'broken';

export interface DeviceRuntime {
  readonly id: number;
  readonly type: DeviceTypeId;
  readonly x: number;
  readonly y: number;
  readonly facing: Facing;
  hp: number;
  state: DeviceRuntimeState;
  /** Seconds left in `active` or `rearming`. */
  timer: number;
  /** The nearest shoulder caught by this release, recorded before any victim is shoved. */
  logTarget?: LogTarget;
}

interface LightDetours {
  readonly lights: readonly DeviceRuntime[];
  readonly fences: ReadonlySet<number>;
  readonly blocked: ReadonlySet<number>;
  readonly fields: Map<SectorId, Field | null>;
}

export type EnemyAction = 'walk' | 'crawl' | 'attack' | 'windup' | 'charge' | 'rev' | 'jam' | 'speech' | 'idle';

export const HIT_REACTION_SECONDS = 0.36;
export const BLOW_RECOVERY_SECONDS = 0.32;
/** Time from releasing the rope to the bottom of the timber's swing. */
export const LOG_CONTACT_SECONDS = 0.20;

interface BossRuntime {
  phase: string;
  timer: number;
  sector: SectorId;
  laneIndex: number;
  waypoints: Cell[];
  knocks: number;
  ability: number;
  speechTarget: SectorId | null;
}

export interface Enemy {
  readonly id: number;
  readonly type: EnemyTypeId;
  readonly def: EnemyDef;
  x: number;
  y: number;
  /** Last movement direction in grid space, for sprite facing. */
  fx: number;
  fy: number;
  hp: number;
  target: SectorId;
  action: EnemyAction;
  /** The rig being crossed. A second, nearby log still sweeps this enemy from the side. */
  crawlLog: DeviceRuntime | null;
  /** 0 standing, 1 belly-down. Vulnerable while lowering or climbing back up. */
  crawlDepth: number;
  /** Animation clocks use simulation time. Shoves and knockback do not count as steps. */
  travel: number;
  moveSpeed: number;
  /** Distance interval for rendering a fence vault. Collision stays on the route. */
  vault?: { readonly start: number; readonly length: number };
  /** Painted sill offset at the start of the postman's stride to his next door. */
  mailExit?: { readonly sector: SectorId; readonly dx: number; readonly dy: number; readonly atTravel: number };
  actionSeconds: number;
  blowRecovery: number;
  /** The door or device actually being gripped, including the recovery from a single blow. */
  gripTarget: SectorId | number | null;
  nettedFor: number;
  stunnedFor: number;
  hasteFor: number;
  lureFor: number;
  lureDevice: number | null;
  lit: boolean;
  shielded: boolean;
  /** Position in the three-person column entering with the Chief. */
  fileRank?: number;
  windup: number;
  cooldown: number;
  hitFlash: number;
  /** Posture when a hit landed, even if a stun interrupts the crawl on the next tick. */
  hitCrawlDepth?: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly trampled: Set<number>;
  boss: BossRuntime | null;
  alive: boolean;
}

export type TelegraphKind = 'mower' | 'ram' | 'hoist' | 'speech' | 'watch' | 'whistle' | 'boar';

/** Elapsed time in a blow that the log can still interrupt. */
export function hoistAge(e: Enemy): number | null {
  return e.alive && e.type === 'mechanic' && e.action === 'windup' && e.windup > 0
    ? e.def.windupSeconds - e.windup : null;
}

/** Position and approach at the instant of impact, before a shove or the end-of-step sweep. */
export type EnemyImpact = Pick<Enemy, 'x' | 'y' | 'fx' | 'fy' | 'type' | 'def' | 'target' | 'action' | 'offsetX' | 'offsetY' | 'lureDevice' | 'crawlDepth' | 'mailExit'>
  & Partial<Pick<Enemy, 'travel' | 'gripTarget'>>;

const clearsLog = (e: Enemy, log: DeviceRuntime): boolean =>
  e.action === 'crawl' && e.crawlLog === log && e.crawlDepth >= 1 && e.nettedFor <= 0 && e.stunnedFor <= 0;

export interface LogSweep {
  readonly before: Enemy;
  readonly landingX: number;
  readonly landingY: number;
}

export type LogTarget = EnemyImpact & Pick<Enemy, 'id'>;

function impactPose(enemy: Enemy): EnemyImpact {
  const { x, y, fx, fy, type, def, action, offsetX, offsetY, lureDevice, crawlDepth } = enemy;
  const target = type === 'mower' && enemy.boss ? enemy.boss.sector : enemy.target;
  return { x, y, fx, fy, type, def, action, offsetX, offsetY, lureDevice, crawlDepth, target,
    ...(enemy.mailExit && { mailExit: enemy.mailExit, travel: enemy.travel, gripTarget: enemy.gripTarget }) };
}

export type SimEvent = (
  | { readonly type: 'wave'; readonly index: number; readonly total: number }
  | { readonly type: 'spawn'; readonly enemy: EnemyTypeId; readonly sector: SectorId }
  | { readonly type: 'rattle'; readonly sector: SectorId }
  | { readonly type: 'moped_blast'; readonly sector: SectorId; readonly kills: number }
  | { readonly type: 'moped_departure' }
  | { readonly type: 'moped_blade_contact' }
  | { readonly type: 'boss_spawn'; readonly boss: NeighborId; readonly sector: SectorId }
  | { readonly type: 'boss_dead'; readonly boss: NeighborId; readonly x: number; readonly y: number }
  | { readonly type: 'trigger'; readonly deviceId: number; readonly device: DeviceTypeId; readonly x: number; readonly y: number; readonly hits: number; readonly kills: number; readonly auto: boolean }
  | { readonly type: 'log_release'; readonly contactAt: number; readonly sweeps: readonly LogSweep[] }
  | { readonly type: 'log_contact'; readonly x: number; readonly y: number; readonly target?: LogTarget }
  | { readonly type: 'trigger_denied'; readonly deviceId: number; readonly reason: TriggerError }
  | { readonly type: 'device_ready'; readonly deviceId: number; readonly device: DeviceTypeId; readonly x: number; readonly y: number }
  | { readonly type: 'device_broken'; readonly deviceId: number; readonly device: DeviceTypeId; readonly x: number; readonly y: number }
  | { readonly type: 'enemy_hit'; readonly x: number; readonly y: number; readonly amount: number; readonly pose: EnemyImpact }
  | { readonly type: 'enemy_dead'; readonly id: number; readonly enemy: EnemyTypeId; readonly x: number; readonly y: number; readonly fx: number; readonly fy: number; readonly pose: EnemyImpact; readonly stain?: Decal }
  | { readonly type: 'barricade_hit'; readonly sector: SectorId }
  | { readonly type: 'breach'; readonly sector: SectorId }
  | { readonly type: 'house_defense'; readonly sector: SectorId }
  | { readonly type: 'house_shot'; readonly sector: SectorId }
  | { readonly type: 'desk_return' }
  | { readonly type: 'entered'; readonly sector: SectorId; readonly enemy: EnemyTypeId; readonly damage: number }
  | { readonly type: 'telegraph'; readonly kind: TelegraphKind; readonly enemyId: number; readonly x: number; readonly y: number; readonly sector: SectorId; readonly seconds: number }
  | { readonly type: 'interrupt'; readonly x: number; readonly y: number; readonly pose: EnemyImpact }
  | { readonly type: 'registered_letter'; readonly stage: 'knock' | 'waiting' | 'delivered' | 'missed' }
  | { readonly type: 'reinforcements'; readonly sector: SectorId }
  | { readonly type: 'jump'; readonly x: number; readonly y: number }
  | { readonly type: 'camera_lost'; readonly sector: SectorId }
  /** Whoever was holding a door has turned, at the start of a wave: the door loses part of its barricade and is held no more. */
  | { readonly type: 'ally_turned'; readonly sector: SectorId }
  /** The desk now shows this camera. */
  | { readonly type: 'look'; readonly sector: SectorId }
  /** A press has to wait for the one hand to get to its row; it will be done in `seconds`. */
  | { readonly type: 'hand_wait'; readonly row: HandRow; readonly seconds: number }
  /** A press the hand had no room left for. */
  | { readonly type: 'hand_full' }
  | { readonly type: 'outcome'; readonly survived: boolean }
) & { /** A log captures its victims on release. Its impact is shown when the timber reaches them. */ readonly showAt?: number };

export type TriggerError = 'unknown' | 'passive' | 'automatic' | 'broken' | 'busy' | 'rearming' | 'no_energy' | 'away' | 'over';

// ───────────────────────────── The desk ─────────────────────────────

/** The two rows of keys a hand works at the desk: the trap row, and the camera keys. */
export type HandRow = 'traps' | 'cameras';

/** What the desk is asked to do: fire a trap picked in the feed, fire whatever a trap key stands for, show a camera. */
export type DeskPress =
  | { readonly kind: 'fire'; readonly deviceId: number }
  /** A trap key: the `slot`-th hand-fired trap of the camera on screen when the press is carried out. */
  | { readonly kind: 'key'; readonly slot: number }
  | { readonly kind: 'look'; readonly sector: SectorId };

/** Done now; waiting for the hand; or refused because too much is already waiting for it. */
export type DeskOutcome = 'done' | 'waiting' | 'refused';

/** The desk with a single hand. Passed in by whoever runs the night, like the outage; null is two hands. */
export interface OneHand {
  readonly crossSeconds: number;
  readonly queueLimit: number;
}

/** The one hand as the desk shows it. */
export interface HandView {
  /** The row it last pressed on; null before the first press. */
  readonly row: HandRow | null;
  /** 0 right after a press, 1 once the other row can be reached. */
  readonly ready: number;
  /** Presses waiting for it, in the order they will be carried out. */
  readonly queue: readonly DeskPress[];
}

export const rowOf = (press: DeskPress): HandRow => (press.kind === 'look' ? 'cameras' : 'traps');
/** The camera the desk will show once it has carried out all waiting camera changes. */
export const cameraAwaitingHand = (hand: Pick<HandView, 'queue'> | null): SectorId | null =>
  hand?.queue.reduce<SectorId | null>((last, press) => press.kind === 'look' ? press.sector : last, null) ?? null;

function alreadyQueued(hand: Pick<HandView, 'queue'>, camera: SectorId, press: DeskPress): boolean {
  if (press.kind === 'fire') return hand.queue.some(p => p.kind === 'fire' && p.deviceId === press.deviceId);
  const nextCamera = cameraAwaitingHand(hand);
  if (press.kind === 'look') return nextCamera === press.sector;
  const targetCamera = nextCamera ?? camera;
  for (const waiting of hand.queue) {
    if (waiting.kind === 'look') camera = waiting.sector;
    else if (waiting.kind === 'key' && waiting.slot === press.slot && camera === targetCamera) return true;
  }
  return false;
}

const CHIEF_FOOTSTEP = 0.45;

/** What firing a manual trap right now would catch. `now` is the desk's cue: enough is under it to be worth it. */
export interface Opportunity {
  readonly targets: number;
  readonly now: boolean;
  /** This log's cue is for the bodies under it while the mechanic is on the approach. */
  readonly group?: true;
}

export type Outcome = 'ongoing' | 'survived' | 'overrun';

interface PendingSpawn {
  time: number;
  readonly wave: number;
  readonly sector: SectorId;
  readonly type: EnemyTypeId;
  readonly approach?: SpawnGroup['approach'];
  readonly fileRank?: number;
}

export interface SectorThreat {
  readonly count: number;
  readonly atDoor: number;
  readonly boss: NeighborId | null;
  readonly breached: boolean;
}

const SECTOR_CYCLE: readonly SectorId[] = ['portail', 'grange', 'arriere', 'verger'];
const CORNER_AFTER: Readonly<Record<SectorId, Cell>> = {
  portail: { x: GRID_W - 1, y: GRID_H - 1 },
  grange: { x: GRID_W - 1, y: 0 },
  arriere: { x: 0, y: 0 },
  verger: { x: 0, y: GRID_H - 1 },
};
const nextSector = (sector: SectorId): SectorId => SECTOR_CYCLE[(SECTOR_CYCLE.indexOf(sector) + 1) % SECTOR_CYCLE.length] as SectorId;

export { DOOR_REACH };
const FENCE_BLOW_FACTOR = 2.5;
const TRAMPLE_DAMAGE = 45;
const LURE_GNAW_DPS = 2;
const GRACE_AFTER_CLEAR = 2;
const FAST_FORWARD_GAP = 3;
const MAX_DECALS = 90;
/** Seconds after the last arrival before first light: whatever is still standing wanders off. */
const DAWN_MARGIN = 55;

const HOUSE_ROUNDS = [2.5, 3.35, 4.2] as const;
export const HOUSE_RETURN_SECONDS = 4.95;
const DESK_RECOVERY_SECONDS = 12;

interface HouseDefense {
  readonly started: number;
  nextRound: number;
  readonly intruders: { type: EnemyTypeId; sector: SectorId }[];
}

export class NightSim {
  readonly night: number;
  time = 0;
  energy: number = COMBAT.nightEnergy;
  houseHp: number;
  outcome: Outcome = 'ongoing';
  waveIndex = 0;
  readonly waveCount: number;
  readonly devices: DeviceRuntime[];
  private readonly logs: readonly DeviceRuntime[];
  readonly enemies: Enemy[] = [];
  readonly barricades: Record<SectorId, { hp: number; level: 0 | 1 }>;
  readonly decals: Decal[];

  private readonly rng: Rng;
  private readonly pending: PendingSpawn[] = [];
  private events: SimEvent[] = [];
  private nextEnemyId = 1;
  private clearFor = 0;
  private closingOutcome: 'survived' | 'overrun' | null = null;
  /** Simulation time at which dawn breaks. Moves earlier when quiet gaps are skipped. */
  dawnAt = 0;
  private readonly nightLength: number;
  private fences = new Set<number>();
  private raised = new Set<number>();
  private walkFields!: Record<SectorId, Field>;
  private breachFields!: Record<SectorId, Field>;
  private readonly lureFields = new Map<number, Field>();
  private lightDetours: LightDetours | null = null;
  private fieldsDirty = true;

  private readonly kills: Partial<Record<EnemyTypeId, number>> = {};
  private killCount = 0;
  private indoorKills = 0;
  private defense: HouseDefense | null = null;
  private nextDefenseAt = 0;
  private operatorOutside = false;
  lastHouseShot: { at: number; sector: SectorId } | null = null;

  get awayFromDesk(): boolean { return this.defense !== null; }
  get deskReturnIn(): number {
    return this.defense ? Math.max(0, this.defense.started + HOUSE_RETURN_SECONDS - this.time) : 0;
  }
  firstHouseDefense: DefenseTake | undefined;
  private highlight: NightHighlight | undefined;
  private breaches = 0;
  private houseDamage = 0;
  private devicesBroken = 0;
  private triggers = 0;
  private autoTriggers = 0;
  /** What each trap of the yard did tonight, by device id. Every trap has an entry, fired or not. */
  private readonly tallies = new Map<number, { fired: number; hits: number; kills: number }>();
  private letterDelivered = false;
  private mechanicStoppedAt?: SectorId;
  private chiefFellAt?: GroundContact;
  private readonly chiefTracks: Cell[] = [];
  private bossDefeated: NeighborId | null = null;
  /** A camera that stopped sending. The lot goes on without it: only the desk is blind. */
  cameraLost: SectorId | null = null;
  private outageAt: number | null = null;
  /** Someone is holding this door from inside: until they turn, if they do. */
  heldDoor: SectorId | null;
  private readonly barricadeStart: Record<SectorId, number>;
  private readonly houseStart: number;

  /** The camera on the desk's main screen. Only what is watched changes: the lot goes on regardless. */
  camera: SectorId = 'portail';
  rattleAt: number | null = null;
  /** The one hand, when there is only one: the row it last pressed on, when, and what waits for it. */
  private hand: { row: HandRow | null; at: number; queue: DeskPress[] } | null;

  constructor(
    night: number,
    yard: YardState,
    seed: number,
    private readonly outage: CameraOutage | null = null,
    private readonly oneHand: OneHand | null = null,
    /** Someone holding a door, from the radio (core/radio.ts). Null is nobody. */
    private readonly ally: Ally | null = null,
    siren: SirenSector | null = null,
    readonly rattleSector: SectorId | null = null,
  ) {
    this.hand = oneHand ? { row: null, at: -Infinity, queue: [] } : null;
    this.heldDoor = ally?.sector ?? null;
    this.night = night;
    this.rng = createRng(seed ^ (night * 0x9e3779b1));
    this.houseHp = yard.houseHp;
    this.houseStart = yard.houseHp;
    this.decals = [...yard.decals];
    this.devices = yard.devices.map((d) => ({
      id: d.id,
      type: d.type,
      x: d.x,
      y: d.y,
      facing: d.facing,
      hp: d.hp,
      state: d.broken ? 'broken' : isTrap(d.type) ? 'armed' : 'passive',
      timer: 0,
    }));
    this.logs = this.devices.filter((d) => d.type === 'log');
    for (const d of this.devices) if (isTrap(d.type)) this.tallies.set(d.id, { fired: 0, hits: 0, kills: 0 });
    this.barricades = {
      portail: { ...yard.barricades.portail },
      grange: { ...yard.barricades.grange },
      arriere: { ...yard.barricades.arriere },
      verger: { ...yard.barricades.verger },
    };
    this.barricadeStart = {
      portail: yard.barricades.portail.hp,
      grange: yard.barricades.grange.hp,
      arriere: yard.barricades.arriere.hp,
      verger: yard.barricades.verger.hp,
    };

    const plan = planForNight(night, siren);
    this.waveCount = plan.waves.length;
    let waveStart = NIGHT_LEAD_IN;
    plan.waves.forEach((wave, waveIndex) => {
      waveStart += wave.after;
      for (const group of wave.groups) {
        for (let n = 0; n < group.count; n++) {
          this.pending.push({ time: waveStart + group.delay + n * group.every, wave: waveIndex + 1, sector: group.sector,
            type: group.type, approach: group.approach, ...(group.approach === 'file' && !ENEMIES[group.type].boss && { fileRank: n + 1 }) });
        }
      }
    });
    this.pending.sort((a, b) => a.time - b.time);
    this.dawnAt = (this.pending.at(-1)?.time ?? 0) + DAWN_MARGIN;
    this.nightLength = this.dawnAt;
    this.rebuildFields();
  }

  // ───────────────────────────── Queries ─────────────────────────────

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  device(id: number): DeviceRuntime | undefined {
    return this.devices.find((d) => d.id === id);
  }

  /** Manual devices watched by a camera, in a stable order (drives the hotkey bar). */
  manualDevicesIn(sector: SectorId): DeviceRuntime[] {
    return this.devices
      .filter((d) => isManual(d.type) && sectorOf(d.x, d.y) === sector)
      .sort((a, b) => a.id - b.id);
  }

  threat(sector: SectorId): SectorThreat {
    let count = 0;
    let atDoor = 0;
    let boss: NeighborId | null = null;
    const entry = ENTRIES[sector];
    for (const e of this.enemies) {
      if (!e.alive || sectorOf(Math.floor(e.x), Math.floor(e.y)) !== sector) continue;
      count++;
      if (e.def.boss) boss = e.def.boss;
      if (Math.hypot(e.x - (entry.x + 0.5), e.y - (entry.y + 0.5)) < DOOR_REACH + 0.4) atDoor++;
    }
    return { count, atDoor, boss, breached: this.barricades[sector].hp <= 0 };
  }

  /** 0 at dusk, 1 at dawn. Drives the night clock on the camera desk. */
  progress(): number {
    return Math.min(1, Math.max(0, 1 - (this.dawnAt - this.time) / this.nightLength));
  }

  remainingSpawns(): number {
    return this.pending.length;
  }

  secondsToNextSpawn(): number | null {
    const next = this.pending[0];
    return next ? Math.max(0, next.time - this.time) : null;
  }

  /** The lane a revving mower is about to charge down, for the camera overlay. */
  telegraphedLanes(): { sector: SectorId; cells: readonly Cell[]; seconds: number }[] {
    return this.enemies
      .filter((e) => e.alive && e.boss && e.type === 'mower' && (e.boss.phase === 'rev' || e.boss.phase === 'charge'))
      .map((e) => ({ sector: (e.boss as BossRuntime).sector, cells: LANES[(e.boss as BossRuntime).sector], seconds: e.boss?.phase === 'rev' ? (e.boss?.timer ?? 0) : 0 }));
  }

  isRaised(x: number, y: number): boolean {
    return this.raised.has(idx(x, y));
  }

  // ───────────────────────────── Player input ─────────────────────────────

  /**
   * Everything the desk does goes through here. With two hands it is done at once. With one, a press
   * on the other row than the last one waits until the hand gets there — it is never dropped — and
   * presses are carried out in the order they were made.
   */
  act(press: DeskPress): DeskOutcome {
    if (this.awayFromDesk) return 'refused';
    const hand = this.hand;
    if (!hand || !this.oneHand) {
      this.carryOut(press);
      return 'done';
    }
    if (hand.queue.length === 0 && this.canReach(rowOf(press))) {
      this.carryOut(press);
      return 'done';
    }
    const tail = hand.queue.at(-1);
    // Changing one's mind about a camera while the hand is on its way: only the last one counts.
    if (press.kind === 'look' && tail?.kind === 'look') {
      hand.queue[hand.queue.length - 1] = press;
      return 'waiting';
    }
    // Hammering a key while the hand is on its way changes nothing.
    if (alreadyQueued(hand, this.camera, press)) return 'waiting';
    if (hand.queue.length >= this.oneHand.queueLimit) {
      this.events.push({ type: 'hand_full' });
      return 'refused';
    }
    const first = hand.queue.length === 0;
    hand.queue.push(press);
    if (first) this.events.push({ type: 'hand_wait', row: rowOf(press), seconds: Math.max(0, hand.at + this.oneHand.crossSeconds - this.time) });
    return 'waiting';
  }

  /** The one hand, for the desk to show; null with two. */
  handView(): HandView | null {
    if (!this.hand || !this.oneHand) return null;
    const since = this.time - this.hand.at;
    return { row: this.hand.row, ready: Math.min(1, Math.max(0, since / this.oneHand.crossSeconds)), queue: [...this.hand.queue] };
  }

  /** Whether the one hand can press on `row` right now. */
  private canReach(row: HandRow): boolean {
    if (!this.hand || !this.oneHand) return true;
    return this.hand.row === null || this.hand.row === row || this.time - this.hand.at >= this.oneHand.crossSeconds;
  }

  /** Carries out whatever waits for the hand and can now be reached, in order. */
  private serveHand(): void {
    const hand = this.hand;
    if (!hand || !this.oneHand) return;
    while (hand.queue.length > 0 && this.canReach(rowOf(hand.queue[0] as DeskPress))) {
      this.carryOut(hand.queue.shift() as DeskPress);
      const next = hand.queue[0];
      if (next && !this.canReach(rowOf(next))) this.events.push({ type: 'hand_wait', row: rowOf(next), seconds: this.oneHand.crossSeconds });
    }
  }

  private carryOut(press: DeskPress): void {
    if (this.hand) {
      this.hand.row = rowOf(press);
      this.hand.at = this.time;
    }
    switch (press.kind) {
      case 'look':
        if (press.sector === this.camera) return;
        this.camera = press.sector;
        this.events.push({ type: 'look', sector: press.sector });
        return;
      case 'key': {
        const device = this.manualDevicesIn(this.camera)[press.slot];
        if (device) this.trigger(device.id);
        return;
      }
      case 'fire':
        this.trigger(press.deviceId);
        return;
    }
  }

  /**
   * The one way a trap fires. A device only leaves `armed` here, so hammering the key during the
   * effect or the re-arm can never apply the effect twice or spend energy twice.
   */
  trigger(deviceId: number): Result<DeviceRuntime, TriggerError> {
    const device = this.device(deviceId);
    const deny = (reason: TriggerError): Result<DeviceRuntime, TriggerError> => {
      this.events.push({ type: 'trigger_denied', deviceId, reason });
      return err(reason);
    };
    if (this.outcome !== 'ongoing' || this.closingOutcome) return deny('over');
    if (!device) return deny('unknown');
    const def = DEVICES[device.type];
    if (def.mode === 'passive') return deny('passive');
    if (def.mode === 'auto') return deny('automatic');
    if (this.awayFromDesk) return deny('away');
    if (device.state === 'broken') return deny('broken');
    if (device.state === 'active') return deny('busy');
    if (device.state === 'rearming') return deny('rearming');
    if (this.energy < def.energy) return deny('no_energy');

    this.triggers++;
    this.fire(device, false);
    return ok(device);
  }

  /** An armed trap goes off: by hand from the desk, or by itself for an automatic one. */
  private fire(device: DeviceRuntime, auto: boolean): void {
    const def = DEVICES[device.type];
    this.energy -= def.energy;
    device.state = 'active';
    device.timer = def.activeSeconds;
    const before = this.killCount;
    // A barrier hurts nobody: what it is worth is what was standing at it when it went up.
    const waiting = device.type === 'barrier' ? this.underTrap(device).count : 0;
    const hits = this.applyTrigger(device);
    const kills = this.killCount - before;
    if (kills > 0 && (!this.highlight || (this.highlight.kind === 'catch' && kills > this.highlight.kills))) {
      this.highlight = { kind: 'catch', deviceId: device.id, kills };
    }
    const tally = this.tallies.get(device.id);
    if (tally) {
      tally.fired++;
      tally.hits += device.type === 'barrier' ? waiting : hits;
      tally.kills += kills;
    }
    this.events.push({ type: 'trigger', deviceId: device.id, device: device.type, x: device.x, y: device.y, hits, kills, auto });
  }

  /**
   * Infected standing within a trap's reach. `pressing` when one of them is worth the trap alone:
   * a heavy one, or — for a trap that hurts — anything already at work on a door or a palisade.
   */
  private underTrap(device: DeviceRuntime): { count: number; pressing: boolean; hoistSet: boolean } {
    const def = DEVICES[device.type];
    const cx = device.x + 0.5;
    const cy = device.y + 0.5;
    let count = 0;
    let pressing = false;
    let hoistSet = false;
    for (const e of this.enemies) {
      // The raised engine can be caught at the outer edge of the timber's actual sweep.
      const hoist = device.type === 'log' && e.type === 'mechanic';
      const pull = hoist ? hoistAge(e) : null;
      const reach = pull !== null ? def.radius + e.def.size * 0.15 : def.reach;
      if (!e.alive || Math.hypot(e.x - cx, e.y - cy) > reach) continue;
      if (device.type === 'log' && clearsLog(e, device)) continue;
      // The horn means nothing to a boss or to the chief's file; the floodlight adds nothing to the already dazzled.
      if (device.type === 'horn' && (e.def.boss || e.shielded || e.lureDevice !== null)) continue;
      if (device.type === 'floodlight' && e.lit) continue;
      count++;
      if (device.type === 'barrier') continue;
      // A lone mechanic walking through still takes damage. The desk calls the counter
      // after the last link seats; a crowd beneath the timber counts throughout the pull.
      if (hoist) {
        if (pull === null || pull < BOSS.mechanic.chainSeconds) continue;
        hoistSet = true;
      }
      if (e.def.boss || e.def.tramples) pressing = true;
      if (def.damage > 0 && (e.action === 'attack' || e.action === 'windup')) pressing = true;
    }
    return { count, pressing, hoistSet };
  }

  /** The desk's cue for a manual trap: what is under it, and whether that is worth firing now. */
  opportunity(deviceId: number): Opportunity {
    const device = this.device(deviceId);
    if (!device || device.state !== 'armed' || !isManual(device.type) || this.outcome !== 'ongoing' || this.closingOutcome) return { targets: 0, now: false };
    const def = DEVICES[device.type];
    if (this.energy < def.energy) return { targets: 0, now: false };
    const { count, pressing, hoistSet } = this.underTrap(device);
    if (device.type === 'log' && count >= def.targets && !hoistSet && this.night === BOSS_NIGHT.mechanic &&
      this.threat(sectorOf(device.x, device.y)).boss === 'mechanic') return { targets: count, now: true, group: true };
    return { targets: count, now: count >= def.targets || pressing };
  }

  private applyTrigger(device: DeviceRuntime): number {
    const def = DEVICES[device.type];
    const cx = device.x + 0.5;
    const cy = device.y + 0.5;
    const inRange = this.enemies.filter((e) => e.alive && Math.hypot(e.x - cx, e.y - cy) <= def.radius + e.def.size * 0.15);

    switch (device.type) {
      case 'spikes':
        for (const e of inRange) {
          this.interrupt(e);
          this.damage(e, def.damage);
        }
        return inRange.length;
      case 'log': {
        const swept = inRange.filter((e) => !clearsLog(e, device));
        const sweeps: LogSweep[] = [];
        delete device.logTarget;
        let nearest = Infinity;
        const contactAt = this.time + LOG_CONTACT_SECONDS;
        const feedbackStart = this.events.length;
        for (const e of swept) {
          const before = { ...e, boss: e.boss && { ...e.boss } };
          const distance = Math.hypot(e.x - cx, e.y - cy);
          if (distance < nearest) {
            nearest = distance;
            device.logTarget = { id: before.id, ...impactPose(before) };
          }
          if (this.night === BOSS_NIGHT.mechanic && e.boss && hoistAge(e) !== null) this.mechanicStoppedAt ??= e.boss.sector;
          this.interrupt(e);
          const control = e.def.boss ? COMBAT.bossControlFactor : 1;
          e.stunnedFor = Math.max(e.stunnedFor, COMBAT.logStunSeconds * control);
          this.knockback(e, cx, cy, COMBAT.logKnockbackCells * control);
          sweeps.push({ before, landingX: e.x, landingY: e.y });
          this.damage(e, def.damage, before);
        }
        const feedback = this.events.splice(feedbackStart);
        this.events.push({ type: 'log_release', contactAt, sweeps },
          { type: 'log_contact', x: cx, y: cy, showAt: contactAt, ...(device.logTarget && { target: device.logTarget }) });
        for (const event of feedback) this.events.push({ ...event, showAt: contactAt });
        return swept.length;
      }
      case 'net':
        for (const e of inRange) {
          this.interrupt(e);
          e.nettedFor = Math.max(e.nettedFor, def.activeSeconds * (e.def.boss ? COMBAT.bossControlFactor : 1));
        }
        return inRange.length;
      case 'barrier':
        this.raised.add(idx(device.x, device.y));
        return 0;
      case 'horn':
        this.lureFields.set(device.id, computeField({ x: device.x, y: device.y }, { blocked: this.fences }));
        return inRange.filter((e) => !e.def.boss && !e.shielded).length;
      case 'floodlight':
        return inRange.length;
      case 'fence':
        return 0;
    }
  }

  // ───────────────────────────── Simulation step ─────────────────────────────

  step(dt: number, operatorOutside = false): void {
    this.operatorOutside = operatorOutside;
    if (this.outcome !== 'ongoing') return;
    this.time += dt;
    if (this.closingOutcome) {
      // Finish the accepted ride without giving the horde extra time after first light.
      this.sweepMoped(dt);
      this.resolveOutcome(dt);
      return;
    }
    this.spawnDue();
    if (this.outage && this.outageAt !== null && this.time >= this.outageAt) {
      this.outageAt = null;
      this.cameraLost = this.outage.sector;
      this.events.push({ type: 'camera_lost', sector: this.outage.sector });
    }
    this.serveHand();
    if (this.fieldsDirty) this.rebuildFields();
    this.updateDevices(dt);
    this.updateAuras();
    this.sweepMoped(dt);
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const previous = enemy.action;
      const restrained = enemy.nettedFor > 0 || enemy.stunnedFor > 0;
      this.updateEnemy(enemy, dt);
      enemy.actionSeconds = previous === enemy.action ? enemy.actionSeconds + dt : 0;
      if (enemy.action === 'crawl') {
        enemy.crawlDepth = Math.min(1, enemy.crawlDepth + dt / COMBAT.logCrawlLowerSeconds);
      } else if (enemy.crawlDepth > 0 && !restrained) {
        enemy.crawlDepth = Math.max(0, enemy.crawlDepth - dt / COMBAT.logCrawlLowerSeconds);
        enemy.crawlLog = null;
      }
    }
    this.separate();
    if (this.houseHp > 0) this.advanceHouseDefense();
    this.resolveOutcome(dt);
  }

  private spawnDue(): void {
    // If the lot is clear, do not make the player wait out the rest of the gap.
    const alive = this.enemies.some((e) => e.alive);
    const next = this.pending[0];
    if (!alive && next && next.time - this.time > FAST_FORWARD_GAP) {
      const skip = next.time - this.time - FAST_FORWARD_GAP;
      for (const p of this.pending) p.time -= skip;
      this.dawnAt -= skip;
    }
    while (this.pending.length > 0 && (this.pending[0] as PendingSpawn).time <= this.time) {
      const spawn = this.pending.shift() as PendingSpawn;
      if (spawn.wave > this.waveIndex) {
        this.waveIndex = spawn.wave;
        this.events.push({ type: 'wave', index: spawn.wave, total: this.waveCount });
        if (this.outage && spawn.wave === this.outage.wave && this.cameraLost === null) this.outageAt = this.time + this.outage.delay;
        if (this.ally && this.heldDoor !== null && spawn.wave === this.ally.turnsAtWave) this.allyTurns(this.ally);
      }
      this.spawn(spawn.type, spawn.sector, true, spawn);
    }
  }

  private spawn(type: EnemyTypeId, sector: SectorId, announce = true, group?: PendingSpawn): Enemy {
    const def = ENEMIES[type];
    const lane = LANES[sector][0]!;
    const edges = SPAWN_CELLS[sector];
    const cell = type === 'mower' || group?.approach === 'file' ? lane
      : this.rng.pick(group?.approach === 'verge' ? edges.filter(c => Math.hypot(c.x - lane.x, c.y - lane.y) >= 5) : edges);
    const enemy: Enemy = {
      id: this.nextEnemyId++,
      type,
      def,
      x: cell.x + 0.5,
      y: cell.y + 0.5,
      fx: 0,
      fy: 0,
      hp: def.hp,
      target: sector,
      action: 'walk',
      crawlLog: null,
      crawlDepth: 0,
      travel: 0,
      moveSpeed: def.speed,
      actionSeconds: 0,
      blowRecovery: 0,
      gripTarget: null,
      nettedFor: 0,
      stunnedFor: 0,
      hasteFor: 0,
      lureFor: 0,
      lureDevice: null,
      lit: false,
      shielded: false,
      ...(group?.fileRank && { fileRank: group.fileRank }),
      windup: 0,
      cooldown: 0,
      hitFlash: 0,
      offsetX: (this.rng.next() - 0.5) * 0.5,
      offsetY: (this.rng.next() - 0.5) * 0.5,
      trampled: new Set(),
      boss: null,
      alive: true,
    };
    if (def.boss) {
      enemy.boss = {
        phase: type === 'mower' ? 'rev' : 'advance',
        timer: type === 'mower' ? def.windupSeconds : 0,
        sector,
        laneIndex: 0,
        waypoints: [],
        knocks: 0,
        ability: type === 'mayor' ? BOSS.mayor.speechEvery * 0.6 : type === 'chief' ? BOSS.chief.whistleEvery * 0.5 : 0,
        speechTarget: null,
      };
      this.events.push({ type: 'boss_spawn', boss: def.boss, sector });
      if (type === 'mower') this.telegraph('mower', enemy, sector, def.windupSeconds);
    } else {
      enemy.target = this.chooseTarget(enemy, sector);
    }
    this.enemies.push(enemy);
    // The wire spans the entry hedge. Use the edge the creature crossed, even when it flanks a different door.
    // Save the audible warning for the blind feed. Older saves can have a wire on another hedge.
    if (sector === this.rattleSector && this.rattleAt === null && (this.outage?.sector !== sector || this.cameraLost === sector)) {
      this.rattleAt = this.time;
      this.events.push({ type: 'rattle', sector });
    }
    if (announce) this.events.push({ type: 'spawn', enemy: type, sector });
    return enemy;
  }

  private chooseTarget(enemy: Enemy, home: SectorId): SectorId {
    if (enemy.def.flanks) {
      // Prowlers go for the least defended door of the whole lot.
      const scored = SECTOR_IDS.map((sector) => {
        const barricade = this.barricades[sector];
        const strength = barricade.hp / BARRICADE.maxHp[0];
        const traps = this.devices.filter((d) => d.state !== 'broken' && isTrap(d.type) && sectorOf(d.x, d.y) === sector).length;
        return { sector, score: strength + traps * 0.6 + (sector === home ? -0.25 : 0) + this.rng.next() * 0.2 };
      });
      scored.sort((a, b) => a.score - b.score);
      return (scored[0] as { sector: SectorId }).sector;
    }
    const fields = enemy.def.breaksFences || enemy.def.jumps ? this.breachFields : this.walkFields;
    const cell = idx(Math.floor(enemy.x), Math.floor(enemy.y));
    const homeDistance = fields[home][cell] as number;
    let best = home;
    let bestDistance = homeDistance;
    for (const sector of SECTOR_IDS) {
      const d = fields[sector][cell] as number;
      // Leave the home door only for a clearly shorter walk (e.g. the home door is fenced off).
      if (d * 1.35 < bestDistance) {
        best = sector;
        bestDistance = d;
      }
    }
    return best;
  }

  private rebuildFields(): void {
    this.fences = new Set(this.devices.filter((d) => DEVICES[d.type].blocks && d.state !== 'broken').map((d) => idx(d.x, d.y)));
    const walk = {} as Record<SectorId, Field>;
    const breach = {} as Record<SectorId, Field>;
    for (const sector of SECTOR_IDS) {
      walk[sector] = computeField(ENTRIES[sector], { blocked: this.fences });
      breach[sector] = computeField(ENTRIES[sector], { costly: this.fences, costlyPenalty: 3 });
    }
    this.walkFields = walk;
    this.breachFields = breach;
    for (const id of this.lureFields.keys()) {
      const device = this.device(id);
      if (device) this.lureFields.set(id, computeField({ x: device.x, y: device.y }, { blocked: this.fences }));
    }
    this.fieldsDirty = false;
  }

  private updateDevices(dt: number): void {
    for (const device of this.devices) {
      if (device.state === 'armed' && DEVICES[device.type].mode === 'auto') {
        const { count, pressing } = this.underTrap(device);
        if (count >= DEVICES[device.type].targets || pressing) {
          this.autoTriggers++;
          this.fire(device, true);
        }
        continue;
      }
      if (device.state !== 'active' && device.state !== 'rearming') continue;
      device.timer -= dt;
      if (device.timer > 0) continue;
      if (device.state === 'active') {
        device.state = 'rearming';
        device.timer = DEVICES[device.type].rearmSeconds;
        if (device.type === 'barrier') this.raised.delete(idx(device.x, device.y));
        if (device.type === 'horn') this.lureFields.delete(device.id);
      } else {
        device.state = 'armed';
        device.timer = 0;
        this.events.push({ type: 'device_ready', deviceId: device.id, device: device.type, x: device.x, y: device.y });
      }
    }
  }

  /** Recomputes per-tick statuses that depend on position: floodlights, the chief's order, horns. */
  private updateAuras(): void {
    const lights = this.devices.filter((d) => d.type === 'floodlight' && d.state === 'active');
    this.updateLightDetours(lights);
    const horns = this.devices.filter((d) => d.type === 'horn' && d.state === 'active');
    const chiefs = this.enemies.filter((e) => e.alive && e.type === 'chief');
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.lit = lights.some((l) => Math.hypot(e.x - (l.x + 0.5), e.y - (l.y + 0.5)) <= DEVICES.floodlight.radius);
      e.shielded = !e.def.boss && chiefs.some((c) => Math.hypot(e.x - c.x, e.y - c.y) <= BOSS.chief.auraRadius);
      if (e.shielded && e.lureDevice !== null) {
        e.lureDevice = null;
        e.lureFor = 0;
      }
      if (e.def.boss || e.shielded) continue;
      for (const horn of horns) {
        if (Math.hypot(e.x - (horn.x + 0.5), e.y - (horn.y + 0.5)) <= DEVICES.horn.radius) {
          e.lureDevice = horn.id;
          e.lureFor = horn.timer;
        }
      }
    }
  }

  private updateLightDetours(lights: readonly DeviceRuntime[]): void {
    if (lights.length === 0) {
      this.lightDetours = null;
      return;
    }
    const current = this.lightDetours;
    if (current?.fences === this.fences && current.lights.length === lights.length &&
        lights.every((light, i) => current.lights[i] === light)) return;
    const blocked = new Set(this.fences);
    const radius = DEVICES.floodlight.radius;
    const span = Math.floor(radius + 0.5);
    for (const light of lights) {
      for (let dy = -span; dy <= span; dy++) {
        for (let dx = -span; dx <= span; dx++) {
          // Keep whole tiles clear so following the rim doesn't graze the light when a walker is off centre.
          if (inGrid(light.x + dx, light.y + dy) &&
              Math.hypot(Math.max(0, Math.abs(dx) - 0.5), Math.max(0, Math.abs(dy) - 0.5)) <= radius) {
            blocked.add(idx(light.x + dx, light.y + dy));
          }
        }
      }
    }
    this.lightDetours = { lights, fences: this.fences, blocked, fields: new Map() };
  }

  private updateEnemy(e: Enemy, dt: number): void {
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    if (e.hitCrawlDepth && e.hitFlash === 0 && e.nettedFor <= 0 && e.stunnedFor <= 0) e.hitCrawlDepth = 0;
    e.blowRecovery = Math.max(0, e.blowRecovery - dt);
    if (e.blowRecovery === 0) e.gripTarget = null;
    e.hasteFor = Math.max(0, e.hasteFor - dt);
    e.lureFor = Math.max(0, e.lureFor - dt);
    e.cooldown = Math.max(0, e.cooldown - dt);
    if (e.lureFor <= 0) e.lureDevice = null;

    if (e.nettedFor > 0 || e.stunnedFor > 0) {
      delete e.vault;
      e.nettedFor = Math.max(0, e.nettedFor - dt);
      e.stunnedFor = Math.max(0, e.stunnedFor - dt);
      if (e.boss && e.type === 'mower' && e.boss.phase === 'charge') this.jamMower(e);
      if (!(e.boss && e.type === 'mower')) e.action = 'idle';
      if (!e.boss || e.type !== 'mower') return;
    }

    this.trample(e);

    if (e.boss) {
      switch (e.type) {
        case 'mower':
          this.updateMower(e, e.boss, dt);
          return;
        case 'mail':
          this.updateMail(e, e.boss, dt);
          return;
        case 'mayor':
          if (this.updateMayorSpeech(e, e.boss, dt)) return;
          break;
        case 'chief':
          this.updateChiefWhistle(e, e.boss, dt);
          break;
        default:
          break;
      }
    }

    if (e.lureDevice !== null && this.followLure(e, dt)) return;
    if (e.fileRank && e.shielded && this.followChief(e, e.fileRank, dt)) return;
    this.advance(e, dt);
  }

  /** Walk in the Chief's own footprints. Yield to ordinary pathfinding around obstructions
   * and once the Chief reaches the barricade so the people at the back can attack. */
  private followChief(e: Enemy, rank: number, dt: number): boolean {
    const chief = this.enemies.find(other => other.alive && other.type === 'chief');
    if (!chief || chief.action !== 'walk' || chief.target !== e.target || this.chiefTracks.length === 0) return false;
    const first = this.chiefTracks[0]!;
    const stride = e.hasteFor > 0 ? 1.48 : 2;
    const between = Math.min(1, Math.hypot(chief.x - first.x, chief.y - first.y) / CHIEF_FOOTSTEP);
    const along = Math.min(this.chiefTracks.length - 1, rank * stride - between);
    const lead = this.chiefTracks[Math.floor(along)]!;
    const back = this.chiefTracks[Math.ceil(along)]!;
    const blend = along % 1;
    const mark = { x: lead.x + (back.x - lead.x) * blend, y: lead.y + (back.y - lead.y) * blend };
    const cx = Math.floor(e.x), cy = Math.floor(e.y), tx = Math.floor(mark.x), ty = Math.floor(mark.y);
    if (Math.abs(cx - tx) > 1 || Math.abs(cy - ty) > 1) return false;
    const blocked = (x: number, y: number) => isStaticBlocked(x, y) || this.fences.has(idx(x, y)) || this.raised.has(idx(x, y));
    if (blocked(tx, ty) || (cx !== tx && cy !== ty && (blocked(cx, ty) || blocked(tx, cy)))) return false;
    if ((mark.x - e.x) * chief.fx + (mark.y - e.y) * chief.fy < 0 || Math.hypot(mark.x - e.x, mark.y - e.y) < 0.025) {
      e.action = 'idle';
      e.fx = chief.fx;
      e.fy = chief.fy;
    } else {
      e.action = 'walk';
      this.moveToward(e, mark.x, mark.y, this.speedOf(e), dt);
    }
    return true;
  }

  /** Walk toward the target door, dealing with whatever stands in the way. */
  private advance(e: Enemy, dt: number): void {
    const entry = ENTRIES[e.target];
    const doorDistance = Math.hypot(e.x - (entry.x + 0.5), e.y - (entry.y + 0.5));
    if (doorDistance <= DOOR_REACH) {
      this.assaultDoor(e, dt);
      return;
    }

    const breaker = e.def.breaksFences || e.def.jumps;
    const field = (breaker ? this.breachFields : this.walkFields)[e.target];
    const blocked = breaker ? undefined : this.fences;
    const cx = Math.floor(e.x);
    const cy = Math.floor(e.y);
    const step = this.lightDetourStep(e, cx, cy) ?? nextStep(field, cx, cy, blocked);
    if (!step) {
      e.action = 'idle';
      return;
    }

    this.followStep(e, step, dt);
  }

  private lightDetourStep(e: Enemy, x: number, y: number): Cell | null {
    const detours = this.lightDetours;
    if (!detours || e.lit || e.def.boss) return null;
    let field = detours.fields.get(e.target);
    if (field === undefined) {
      const entry = ENTRIES[e.target];
      field = detours.blocked.has(idx(entry.x, entry.y)) ? null : computeField(entry, { blocked: detours.blocked });
      detours.fields.set(e.target, field);
    }
    // A door inside the pool or a yard with no clear bypass keeps its usual route.
    return field ? nextStep(field, x, y, detours.blocked) : null;
  }

  /** A standing palisade or a raised barrier on that cell, if any. */
  private obstacleAt(cellIndex: number): DeviceRuntime | undefined {
    if (!this.fences.has(cellIndex) && !this.raised.has(cellIndex)) return undefined;
    return this.devices.find((d) => idx(d.x, d.y) === cellIndex && d.state !== 'broken' && (DEVICES[d.type].blocks || d.state === 'active'));
  }

  private speedOf(e: Enemy): number {
    let speed = e.def.speed;
    if (e.lit) speed *= COMBAT.litSpeedMultiplier;
    if (e.hasteFor > 0) speed *= BOSS.chief.whistleSpeed;
    return speed;
  }

  private followStep(e: Enemy, step: Cell, dt: number): void {
    // Doors and horns both lead through the same yard. A raised barrier intercepts either route.
    const obstacle = this.obstacleAt(idx(step.x, step.y));
    if (obstacle) {
      if (!e.def.jumps) {
        this.attackDevice(e, obstacle, dt);
        return;
      }
      if (!e.trampled.has(-obstacle.id)) {
        e.trampled.add(-obstacle.id);
        const approach = Math.hypot(step.x + 0.5 - e.x, step.y + 0.5 - e.y);
        e.vault = { start: e.travel, length: approach + 0.52 };
        this.events.push({ type: 'jump', x: step.x + 0.5, y: step.y + 0.5 });
      }
    }
    e.windup = 0;
    const cx = Math.floor(e.x);
    const cy = Math.floor(e.y);
    // Duck through intact rigs even while the winch hoists the load. A rig in
    // the next lane can swing across the route, but it has no overhead cover here.
    const log = e.def.crawlsUnderLogs && this.logs.find((d) =>
      d.state !== 'broken' &&
      (d === e.crawlLog || (d.x === cx && d.y === cy) || (d.x === step.x && d.y === step.y)) &&
      Math.hypot(e.x - d.x - 0.5, e.y - d.y - 0.5) <= COMBAT.logCrawlReach);
    e.crawlLog = log || null;
    e.action = log ? 'crawl' : 'walk';
    const speed = this.speedOf(e) * (log ? COMBAT.logCrawlSpeedMultiplier : 1);
    this.moveToward(e, step.x + 0.5 + e.offsetX * 0.6, step.y + 0.5 + e.offsetY * 0.6, speed, dt);
  }

  private moveToward(e: Enemy, tx: number, ty: number, speed: number, dt: number): boolean {
    const dx = tx - e.x;
    const dy = ty - e.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1e-4) return true;
    const travel = Math.min(distance, speed * dt);
    e.travel += travel;
    e.moveSpeed = speed;
    e.x += (dx / distance) * travel;
    e.y += (dy / distance) * travel;
    e.fx = dx / distance;
    e.fy = dy / distance;
    return travel >= distance - 1e-6;
  }

  /** Blow-by-blow attackers telegraph; the rest gnaw continuously. Returns true when a blow lands. */
  private strike(e: Enemy, dt: number, sector: SectorId, kind: TelegraphKind, interval: number): boolean {
    if (e.def.windupSeconds <= 0) {
      e.action = 'attack';
      return true;
    }
    if (e.cooldown > 0) {
      e.action = 'idle';
      return false;
    }
    if (e.windup <= 0) {
      e.windup = e.def.windupSeconds;
      e.action = 'windup';
      if (kind === 'hoist' && e.boss) e.boss.sector = sector;
      this.telegraph(kind, e, sector, e.def.windupSeconds);
      return false;
    }
    e.windup -= dt;
    e.action = 'windup';
    if (e.windup > 0) return false;
    e.windup = 0;
    e.cooldown = interval;
    e.blowRecovery = BLOW_RECOVERY_SECONDS;
    e.action = 'attack';
    return true;
  }

  private telegraphKind(e: Enemy): TelegraphKind {
    if (e.type === 'mechanic') return 'hoist';
    return e.type === 'boar' ? 'boar' : 'ram';
  }

  private enterHouse(type: EnemyTypeId, sector: SectorId, damage: number): void {
    // The first intruder gets through. Once the hero is inside, he can intercept
    // one more intruder for each unclaimed shot left in this short sortie.
    const defense = this.defense;
    if (defense && defense.intruders.length < HOUSE_ROUNDS.length - defense.nextRound) {
      defense.intruders.push({ type, sector });
      return;
    }
    this.loseHouse(damage);
    this.events.push({ type: 'entered', sector, enemy: type, damage });
    if (defense || this.houseHp <= 0 || this.time < this.nextDefenseAt || this.operatorOutside) return;

    this.lastHouseShot = null;
    this.defense = { started: this.time, nextRound: 0, intruders: [{ type, sector }] };
    if (this.hand) this.hand.queue.length = 0;
    // Leave a live picture of the breach on the monitor as the operator gets up.
    let feed = sector;
    if (feed === this.cameraLost) feed = this.camera === this.cameraLost
      ? SECTOR_IDS.find(other => other !== this.cameraLost)! : this.camera;
    this.firstHouseDefense ??= { kind: 'defense', sector, feed, started: this.time };
    this.carryOut({ kind: 'look', sector: feed });
    this.events.push({ type: 'house_defense', sector });
  }

  private advanceHouseDefense(): void {
    const defense = this.defense;
    if (!defense) return;
    const age = this.time - defense.started;
    while (defense.nextRound < HOUSE_ROUNDS.length && age >= HOUSE_ROUNDS[defense.nextRound]!) {
      defense.nextRound++;
      const target = defense.intruders.shift();
      if (!target) continue;
      this.kills[target.type] = (this.kills[target.type] ?? 0) + 1;
      this.killCount++;
      this.indoorKills++;
      this.lastHouseShot = { at: this.time, sector: target.sector };
      this.events.push({ type: 'house_shot', sector: target.sector, showAt: this.time });
    }
    if (age >= HOUSE_RETURN_SECONDS) {
      this.defense = null;
      this.nextDefenseAt = this.time + DESK_RECOVERY_SECONDS;
      this.events.push({ type: 'desk_return' });
    }
  }

  private assaultDoor(e: Enemy, dt: number): void {
    const sector = e.target;
    const barricade = this.barricades[sector];
    const entry = ENTRIES[sector];
    this.face(e, entry.x + 0.5, entry.y + 0.5);

    if (barricade.hp > 0) {
      const continuous = e.def.windupSeconds <= 0;
      if (!this.strike(e, dt, sector, this.telegraphKind(e), e.type === 'mechanic' ? BOSS.mechanic.blowInterval : 1.2)) return;
      e.gripTarget = sector;
      this.hitBarricade(sector, continuous ? e.def.barricadeDamage * dt : e.def.barricadeDamage, !continuous);
      return;
    }

    // The door is open.
    if (!e.def.boss) {
      e.alive = false;
      this.enterHouse(e.type, sector, e.def.houseDamage);
      return;
    }
    // Bosses stay on the doorstep and keep hammering the house itself.
    if (e.def.windupSeconds <= 0) {
      if (e.cooldown > 0) return;
      e.cooldown = 2.5;
      e.action = 'attack';
      e.blowRecovery = BLOW_RECOVERY_SECONDS;
    } else if (!this.strike(e, dt, sector, this.telegraphKind(e), 3)) {
      return;
    }
    this.loseHouse(e.def.houseDamage);
    this.events.push({ type: 'entered', sector, enemy: e.type, damage: e.def.houseDamage });
  }

  /** What was bitten turns, from inside: the planks he was holding are pulled half off. */
  private allyTurns(ally: Ally): void {
    this.heldDoor = null;
    const barricade = this.barricades[ally.sector];
    this.events.push({ type: 'ally_turned', sector: ally.sector });
    // The last splinter can give way from the hall. Count that breach exactly as a blow from outside.
    this.hitBarricade(ally.sector, barricade.hp - Math.round(barricade.hp * (1 - ally.loss)), false);
  }

  private hitBarricade(sector: SectorId, amount: number, announce: boolean): void {
    const barricade = this.barricades[sector];
    if (barricade.hp <= 0) return;
    // Someone on the other side of the planks, leaning on them.
    if (this.ally && this.heldDoor === sector) amount *= this.ally.factor;
    barricade.hp = Math.max(0, barricade.hp - amount);
    if (announce) this.events.push({ type: 'barricade_hit', sector });
    if (barricade.hp <= 0) {
      this.breaches++;
      if (this.highlight?.kind !== 'breach') this.highlight = { kind: 'breach', sector };
      this.events.push({ type: 'breach', sector });
      this.addDecal('debris', ENTRIES[sector].x, ENTRIES[sector].y);
    }
  }

  private loseHouse(amount: number): void {
    this.houseHp = Math.max(0, this.houseHp - amount);
    this.houseDamage += amount;
  }

  private attackDevice(e: Enemy, device: DeviceRuntime, dt: number): void {
    this.face(e, device.x + 0.5, device.y + 0.5);
    const continuous = e.def.windupSeconds <= 0;
    if (!this.strike(e, dt, sectorOf(device.x, device.y), this.telegraphKind(e), 0.7)) return;
    e.gripTarget = device.id;
    const amount = continuous ? Math.max(6, e.def.barricadeDamage * 1.5) * dt : e.def.barricadeDamage * FENCE_BLOW_FACTOR;
    this.damageDevice(device, amount);
  }

  private damageDevice(device: DeviceRuntime, amount: number): void {
    if (device.state === 'broken') return;
    device.hp -= amount;
    if (device.hp > 0) return;
    device.hp = 0;
    const wasBlocking = DEVICES[device.type].blocks;
    device.state = 'broken';
    device.timer = 0;
    this.raised.delete(idx(device.x, device.y));
    this.lureFields.delete(device.id);
    this.devicesBroken++;
    if (!this.highlight || this.highlight.kind === 'catch') this.highlight = { kind: 'broken', deviceId: device.id };
    this.events.push({ type: 'device_broken', deviceId: device.id, device: device.type, x: device.x, y: device.y });
    this.addDecal('debris', device.x, device.y);
    if (wasBlocking) this.fieldsDirty = true;
  }

  private trample(e: Enemy): void {
    if (!e.def.tramples || (e.type === 'mower' && e.boss?.phase === 'charge')) return;
    const cx = Math.floor(e.x);
    const cy = Math.floor(e.y);
    for (const device of this.devices) {
      if (device.x !== cx || device.y !== cy || device.state === 'broken') continue;
      if (DEVICES[device.type].blocks || e.trampled.has(device.id)) continue;
      if (device.type === 'barrier' && device.state === 'active') continue;
      e.trampled.add(device.id);
      this.damageDevice(device, TRAMPLE_DAMAGE * e.def.size);
    }
  }

  private followLure(e: Enemy, dt: number): boolean {
    const horn = e.lureDevice === null ? undefined : this.device(e.lureDevice);
    const field = e.lureDevice === null ? undefined : this.lureFields.get(e.lureDevice);
    if (!horn || !field || horn.state !== 'active') {
      e.lureDevice = null;
      e.lureFor = 0;
      return false;
    }
    const distance = Math.hypot(e.x - (horn.x + 0.5), e.y - (horn.y + 0.5));
    if (distance < 0.95) {
      e.action = 'attack';
      this.face(e, horn.x + 0.5, horn.y + 0.5);
      this.damageDevice(horn, LURE_GNAW_DPS * dt);
      return true;
    }
    const step = nextStep(field, Math.floor(e.x), Math.floor(e.y), this.fences);
    if (!step) return false;
    this.followStep(e, step, dt);
    return true;
  }

  // ───────────────────────────── Bosses ─────────────────────────────

  private updateMower(e: Enemy, boss: BossRuntime, dt: number): void {
    const lane = LANES[boss.sector];
    if ((e.nettedFor > 0 || e.stunnedFor > 0) && (boss.phase === 'relocate' || boss.phase === 'reverse')) {
      e.action = 'idle';
      return;
    }
    switch (boss.phase) {
      case 'relocate': {
        e.action = 'walk';
        const waypoint = boss.waypoints[0];
        if (!waypoint) {
          boss.phase = 'rev';
          boss.timer = e.def.windupSeconds;
          this.telegraph('mower', e, boss.sector, e.def.windupSeconds);
          return;
        }
        if (this.moveToward(e, waypoint.x + 0.5, waypoint.y + 0.5, BOSS.mower.relocateSpeed, dt)) boss.waypoints.shift();
        return;
      }
      case 'rev': {
        e.action = 'rev';
        const entry = ENTRIES[boss.sector];
        e.fx = Math.sign(entry.x + 0.5 - e.x);
        e.fy = Math.sign(entry.y + 0.5 - e.y);
        if (e.nettedFor > 0 || e.stunnedFor > 0) return;
        boss.timer -= dt;
        if (boss.timer <= 0) {
          boss.phase = 'charge';
          boss.laneIndex = 0;
        }
        return;
      }
      case 'charge': {
        e.action = 'charge';
        const cell = lane[Math.min(boss.laneIndex + 1, lane.length - 1)] as Cell;
        const wasInCell = Math.floor(e.x) === cell.x && Math.floor(e.y) === cell.y;
        const reached = this.moveToward(e, cell.x + 0.5, cell.y + 0.5, BOSS.mower.chargeSpeed * (e.lit ? 0.8 : 1), dt);
        const enteredCell = !wasInCell && Math.floor(e.x) === cell.x && Math.floor(e.y) === cell.y;
        if (!enteredCell && !reached) return;
        this.addDecal('mown', cell.x, cell.y);
        const device = this.devices.find((d) => d.x === cell.x && d.y === cell.y && d.state !== 'broken');
        if (device) {
          const raisedBarrier = device.type === 'barrier' && device.state === 'active';
          this.damageDevice(device, Infinity);
          if (raisedBarrier) {
            // Blades meet a striped wall: the wall loses, but so does the momentum.
            this.damage(e, 80);
            this.jamMower(e);
            return;
          }
        }
        if (!reached) return;
        boss.laneIndex = Math.min(boss.laneIndex + 1, lane.length - 1);
        if (boss.laneIndex >= lane.length - 1) {
          const barricade = this.barricades[boss.sector];
          if (barricade.hp > 0) {
            e.gripTarget = boss.sector;
            e.blowRecovery = BLOW_RECOVERY_SECONDS;
            this.hitBarricade(boss.sector, e.def.barricadeDamage, true);
          } else {
            this.loseHouse(e.def.houseDamage);
            this.events.push({ type: 'entered', sector: boss.sector, enemy: e.type, damage: e.def.houseDamage });
          }
          this.jamMower(e);
        }
        return;
      }
      case 'jam': {
        e.action = 'jam';
        boss.timer -= dt;
        if (boss.timer <= 0 && e.nettedFor <= 0 && e.stunnedFor <= 0) boss.phase = 'reverse';
        return;
      }
      case 'reverse': {
        e.action = 'walk';
        const start = lane[0] as Cell;
        if (this.moveToward(e, start.x + 0.5, start.y + 0.5, e.def.speed, dt)) {
          const from = boss.sector;
          boss.sector = nextSector(from);
          boss.waypoints = [CORNER_AFTER[from], LANES[boss.sector][0] as Cell];
          boss.phase = 'relocate';
        }
        return;
      }
      default:
        boss.phase = 'reverse';
    }
  }

  private jamMower(e: Enemy): void {
    if (!e.boss) return;
    e.boss.phase = 'jam';
    e.boss.timer = BOSS.mower.jamSeconds;
    e.action = 'jam';
    this.events.push({ type: 'interrupt', x: e.x, y: e.y, pose: impactPose(e) });
  }

  private updateMail(e: Enemy, boss: BossRuntime, dt: number): void {
    if (e.target !== boss.sector) {
      const foot = doorStance(e);
      if (foot.threshold) e.mailExit = { sector: foot.threshold, dx: foot.x - e.x, dy: foot.y - e.y, atTravel: e.travel };
    }
    e.target = boss.sector;
    const entry = ENTRIES[boss.sector];
    const distance = Math.hypot(e.x - (entry.x + 0.5), e.y - (entry.y + 0.5));
    if (distance > DOOR_REACH) {
      this.advance(e, dt);
      return;
    }
    if (boss.phase === 'signature') {
      e.action = 'idle';
      boss.timer -= dt;
      if (boss.timer <= 0) {
        this.letterDelivered = true;
        this.events.push({ type: 'registered_letter', stage: 'delivered' });
        boss.phase = 'round';
        boss.sector = nextSector(boss.sector);
      }
      return;
    }
    // On the doorstep: two brisk knocks, then on with the round.
    e.action = 'attack';
    this.face(e, entry.x + 0.5, entry.y + 0.5);
    if (e.cooldown > 0) return;
    e.cooldown = BOSS.mail.knockInterval;
    e.blowRecovery = BLOW_RECOVERY_SECONDS;
    const barricade = this.barricades[boss.sector];
    const registered = this.night === BOSS.mail.deliveryNight && boss.sector === 'portail' && boss.phase === 'advance';
    if (registered) {
      e.gripTarget = boss.sector;
      this.events.push({ type: 'registered_letter', stage: 'knock' });
    } else if (barricade.hp > 0) {
      e.gripTarget = boss.sector;
      this.hitBarricade(boss.sector, e.def.barricadeDamage, true);
    } else {
      this.loseHouse(e.def.houseDamage);
      this.events.push({ type: 'entered', sector: boss.sector, enemy: e.type, damage: e.def.houseDamage });
    }
    boss.knocks++;
    if (boss.knocks >= BOSS.mail.knocksPerDoor) {
      boss.knocks = 0;
      if (registered) {
        boss.phase = 'signature';
        boss.timer = BOSS.mail.signatureSeconds;
        this.events.push({ type: 'registered_letter', stage: 'waiting' });
      } else {
        boss.sector = nextSector(boss.sector);
      }
    }
  }

  /** Returns true while the mayor is busy speaking (she does not advance). */
  private updateMayorSpeech(e: Enemy, boss: BossRuntime, dt: number): boolean {
    if (boss.phase === 'speech') {
      e.action = 'speech';
      boss.timer -= dt;
      if (boss.timer > 0) return true;
      boss.phase = 'advance';
      const sector = boss.speechTarget ?? nextSector(e.target);
      for (const [type, count] of Object.entries(BOSS.mayor.reinforcements) as [EnemyTypeId, number][]) {
        for (let n = 0; n < count; n++) this.spawn(type, sector, false);
      }
      this.events.push({ type: 'reinforcements', sector });
      return false;
    }
    boss.ability -= dt;
    if (boss.ability > 0) return false;
    boss.ability = BOSS.mayor.speechEvery;
    boss.phase = 'speech';
    boss.timer = e.def.windupSeconds;
    const others = SECTOR_IDS.filter((s) => s !== sectorOf(Math.floor(e.x), Math.floor(e.y)));
    boss.speechTarget = this.rng.pick(others);
    this.telegraph('speech', e, boss.speechTarget, e.def.windupSeconds);
    return true;
  }

  private updateChiefWhistle(e: Enemy, boss: BossRuntime, dt: number): void {
    const last = this.chiefTracks[0];
    if (!last || Math.hypot(e.x - last.x, e.y - last.y) >= CHIEF_FOOTSTEP) {
      this.chiefTracks.unshift({ x: e.x, y: e.y });
      this.chiefTracks.length = Math.min(7, this.chiefTracks.length);
    }
    const before = boss.ability;
    boss.ability -= dt;
    if (before > BOSS.chief.watchLead && boss.ability <= BOSS.chief.watchLead)
      this.telegraph('watch', e, sectorOf(Math.floor(e.x), Math.floor(e.y)), BOSS.chief.watchLead);
    if (boss.ability > 0) return;
    boss.ability = BOSS.chief.whistleEvery;
    for (const other of this.enemies) {
      if (other.alive && !other.def.boss && Math.hypot(other.x - e.x, other.y - e.y) <= BOSS.chief.auraRadius) other.hasteFor = BOSS.chief.whistleSeconds;
    }
    this.telegraph('whistle', e, sectorOf(Math.floor(e.x), Math.floor(e.y)), BOSS.chief.whistleSeconds);
  }

  // ───────────────────────────── Combat helpers ─────────────────────────────

  private face(e: Enemy, x: number, y: number): void {
    const dx = x - e.x;
    const dy = y - e.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.001) return;
    e.fx = dx / distance;
    e.fy = dy / distance;
  }

  private telegraph(kind: TelegraphKind, e: Enemy, sector: SectorId, seconds: number): void {
    this.events.push({ type: 'telegraph', kind, enemyId: e.id, x: e.x, y: e.y, sector, seconds });
  }

  /** Cancels a wind-up or a speech in progress. */
  private interrupt(e: Enemy): void {
    const wasWinding = e.windup > 0 || (e.boss?.phase === 'speech' && e.type === 'mayor');
    e.windup = 0;
    if (e.boss && e.type === 'mayor' && e.boss.phase === 'speech') {
      e.boss.phase = 'advance';
      e.boss.ability = BOSS.mayor.speechEvery * 0.7;
    }
    if (wasWinding) {
      e.cooldown = Math.max(e.cooldown, 1.2);
      this.events.push({ type: 'interrupt', x: e.x, y: e.y, pose: impactPose(e) });
    }
  }

  mopedRide: {
    sector: SectorId;
    start: number;
    path: readonly [Cell, Cell];
    impact: Cell;
    hit: Set<number>;
    contact?: { readonly at: number; readonly id: number; readonly pushX: number; readonly pushY: number; readonly fatal: boolean };
    departed: boolean;
    blastAt: number | null;
    bladeKills: number;
    blastKills: number;
  } | null = null;

  /** Estimate a release from the people on camera now. The final tally uses actual contact. */
  mopedTargets(sector: SectorId): number {
    const impact = mopedImpact(sector);
    let count = 0;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const moving = enemy.action === 'walk' || enemy.action === 'crawl' || enemy.action === 'charge';
      const movingTime = Math.max(0, MOPED_EXIT_SECONDS + MOPED_RUN_SECONDS - Math.max(enemy.stunnedFor, enemy.nettedFor));
      const lead = moving ? enemy.moveSpeed * movingTime : 0;
      const dx = enemy.x + enemy.fx * lead - impact.x;
      const dy = enemy.y + enemy.fy * lead - impact.y;
      if (dx * dx + dy * dy <= MOPED_BLAST_RADIUS ** 2) count++;
    }
    return count;
  }

  launchMoped(sector: SectorId): boolean {
    if (this.awayFromDesk || this.mopedRide || this.outcome !== 'ongoing') return false;
    const [origin, impact] = mopedPath(sector);
    this.mopedRide = { sector, start: this.time, path: [origin, impact], impact, hit: new Set(), departed: false, blastAt: null, bladeKills: 0, blastKills: 0 };
    return true;
  }

  private sweepMoped(dt: number): void {
    const ride = this.mopedRide;
    if (!ride || ride.blastAt !== null) return;
    const driveAt = ride.start + MOPED_EXIT_SECONDS;
    const age = this.time - driveAt;
    if (age < 0) return;
    if (!ride.departed) {
      ride.departed = true;
      this.events.push({ type: 'moped_departure' });
    }
    const [entry, end] = ride.path;
    const dx = end.x - entry.x, dy = end.y - entry.y;
    const length = Math.hypot(dx, dy);
    const from = Math.max(0, (age - dt) / MOPED_RUN_SECONDS) * length;
    const to = Math.min(1, age / MOPED_RUN_SECONDS) * length;
    for (const e of this.enemies) {
      if (!e.alive || ride.hit.has(e.id)) continue;
      const x = e.x - entry.x, y = e.y - entry.y;
      const along = (x * dx + y * dy) / length;
      const lateral = (dx * y - dy * x) / length;
      if (along < from - .45 || along > to + .45 || Math.abs(lateral) > 1.75) continue;
      ride.hit.add(e.id);
      this.damage(e, 95);
      if (!ride.contact) {
        const side = lateral < 0 ? -1 : 1;
        ride.contact = { at: this.time, id: e.id, pushX: -dy / length * side, pushY: dx / length * side, fatal: !e.alive };
        this.events.push({ type: 'moped_blade_contact' });
      }
      if (!e.alive) ride.bladeKills++;
    }
    if (age < MOPED_RUN_SECONDS) return;
    ride.blastAt = driveAt + MOPED_RUN_SECONDS;
    for (const e of this.enemies) {
      if (!e.alive || Math.hypot(e.x - end.x, e.y - end.y) > MOPED_BLAST_RADIUS) continue;
      this.damage(e, 190);
      if (!e.alive) ride.blastKills++;
    }
    this.events.push({ type: 'moped_blast', sector: ride.sector, kills: ride.blastKills });
  }

  /** The epic actions use the same damage, kills and impact feedback as the desk traps. */
  epicStrike(sector: SectorId, kind: 'flame' | 'pack', targets?: ReadonlySet<number>): number {
    let hits = 0;
    for (const e of this.enemies) {
      if (!e.alive || (targets && !targets.has(e.id)) || sectorOf(Math.floor(e.x), Math.floor(e.y)) !== sector) continue;
      this.damage(e, kind === 'flame' ? 36 : 95);
      hits++;
    }
    return hits;
  }

  private damage(e: Enemy, amount: number, contact?: EnemyImpact): void {
    if (!e.alive) return;
    let dealt = amount;
    if (e.nettedFor > 0) dealt *= COMBAT.nettedDamageMultiplier;
    if (e.lit) dealt *= COMBAT.litDamageMultiplier;
    if (e.shielded) dealt *= BOSS.chief.auraDamageTaken;
    if (e.type === 'chief' && e.nettedFor <= 0 && !e.lit) dealt *= BOSS.chief.selfDamageTaken;
    if (e.type === 'mower' && e.boss?.phase === 'jam') dealt *= 1.5;
    if (e.type === 'mail' && e.boss?.phase === 'signature') {
      e.boss.phase = 'round';
      e.boss.sector = nextSector(e.boss.sector);
      this.events.push({ type: 'registered_letter', stage: 'missed' });
    }
    e.hp -= dealt;
    e.hitFlash = HIT_REACTION_SECONDS;
    e.hitCrawlDepth = e.crawlDepth;
    const pose = impactPose(e);
    const { x, y, fx, fy, type } = pose;
    this.events.push({ type: 'enemy_hit', x: contact?.x ?? x, y: contact?.y ?? y, amount: Math.round(dealt), pose: contact ?? pose });
    if (e.hp > 0) return;
    e.hp = 0;
    e.alive = false;
    this.kills[e.type] = (this.kills[e.type] ?? 0) + 1;
    this.killCount++;
    const foot = doorStance(pose);
    const ground = { x: foot.x, y: foot.y, ...(foot.threshold && { threshold: foot.threshold }) };
    const stain = this.addDecal('splat', Math.floor(e.x), Math.floor(e.y), ground);
    this.events.push({ type: 'enemy_dead', id: e.id, enemy: type, x, y, fx, fy, pose, ...(stain && { stain }) });
    if (e.def.boss) {
      this.bossDefeated = e.def.boss;
      if (e.type === 'chief' && this.night === BOSS_NIGHT.chief) this.chiefFellAt = ground;
      this.events.push({ type: 'boss_dead', boss: e.def.boss, x: e.x, y: e.y });
    }
  }

  private knockback(e: Enemy, fromX: number, fromY: number, cells: number): void {
    let dx = e.x - fromX;
    let dy = e.y - fromY;
    const length = Math.hypot(dx, dy);
    if (length < 1e-3) {
      dx = 0;
      dy = 1;
    } else {
      dx /= length;
      dy /= length;
    }
    // Slide back in small steps and stop at the first wall, palisade or prop.
    for (let moved = 0; moved < cells; moved += 0.2) {
      const nx = e.x + dx * 0.2;
      const ny = e.y + dy * 0.2;
      const cx = Math.floor(nx);
      const cy = Math.floor(ny);
      if (!inGrid(cx, cy) || isStaticBlocked(cx, cy) || this.fences.has(idx(cx, cy))) break;
      e.x = nx;
      e.y = ny;
    }
  }

  private separate(): void {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i] as Enemy;
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j] as Enemy;
        if (!b.alive) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = 0.3 * (a.def.size + b.def.size);
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = ((min - d) / d) * 0.25;
        // Bosses shove; they are not shoved.
        if (!a.def.boss) this.nudge(a, -dx * push, -dy * push);
        if (!b.def.boss) this.nudge(b, dx * push, dy * push);
      }
    }
  }

  private nudge(e: Enemy, dx: number, dy: number): void {
    const nx = e.x + dx;
    const ny = e.y + dy;
    const cx = Math.floor(nx);
    const cy = Math.floor(ny);
    if (!inGrid(cx, cy) || isStaticBlocked(cx, cy) || this.fences.has(idx(cx, cy)) || this.raised.has(idx(cx, cy))) return;
    e.x = nx;
    e.y = ny;
  }

  private addDecal(kind: Decal['kind'], x: number, y: number, at?: Decal['at']): Decal | undefined {
    if (this.decals.some((d) => d.kind === kind && d.x === x && d.y === y)) return;
    const decal = { kind, x, y, ...(at && { at }) };
    this.decals.push(decal);
    // Mown strips are the joke: they outlive the stains.
    while (this.decals.length > MAX_DECALS) {
      const drop = this.decals.findIndex((d) => d.kind !== 'mown');
      this.decals.splice(drop >= 0 ? drop : 0, 1);
    }
    return decal;
  }

  private resolveOutcome(dt: number): void {
    // Sweep the dead out so long nights do not accumulate them.
    for (let i = this.enemies.length - 1; i >= 0; i--) if (!(this.enemies[i] as Enemy).alive) this.enemies.splice(i, 1);

    if (this.pending.length === 0 && this.enemies.length === 0) this.clearFor += dt;
    else this.clearFor = 0;
    if (this.houseHp <= 0) this.closingOutcome = 'overrun';
    else if (!this.defense && (this.clearFor >= GRACE_AFTER_CLEAR || this.time >= this.dawnAt)) this.closingOutcome = 'survived';
    if (this.closingOutcome) this.defense = null;
    if (!this.closingOutcome || this.mopedRide?.blastAt === null) return;
    this.outcome = this.closingOutcome;
    this.events.push({ type: 'outcome', survived: this.outcome === 'survived' });
  }

  // ───────────────────────────── Results ─────────────────────────────

  get currentHighlight(): NightHighlight | undefined {
    return this.highlight;
  }

  report(): NightReport {
    const barricadeDamage = {} as Record<SectorId, number>;
    for (const sector of SECTOR_IDS) barricadeDamage[sector] = Math.round(this.barricadeStart[sector] - this.barricades[sector].hp);
    return {
      night: this.night,
      ...(this.highlight && { highlight: this.highlight }),
      survived: this.outcome === 'survived',
      kills: { ...this.kills },
      breaches: this.breaches,
      houseDamage: Math.round(this.houseStart - this.houseHp),
      devicesBroken: this.devicesBroken,
      barricadeDamage,
      triggers: this.triggers,
      autoTriggers: this.autoTriggers,
      ...(this.indoorKills > 0 && { indoorKills: this.indoorKills }),
      bossDefeated: this.bossDefeated,
      ...(this.letterDelivered && { letterDelivered: true as const }),
      ...(this.mechanicStoppedAt && { mechanicStoppedAt: this.mechanicStoppedAt }),
      ...(this.chiefFellAt && { chiefFellAt: this.chiefFellAt }),
      durationSeconds: Math.round(this.time),
      cameraLost: this.cameraLost,
      traps: Object.fromEntries([...this.tallies].map(([id, tally]) => [id, { ...tally }])) as Record<number, TrapTally>,
    };
  }

  /** What the lot looks like the morning after: this is exactly what the day phase inherits. */
  toYard(previous: YardState): YardState {
    return {
      ...previous,
      houseHp: Math.max(0, Math.round(this.houseHp)),
      devices: this.devices.map((d) => ({ id: d.id, type: d.type, x: d.x, y: d.y, facing: d.facing, hp: d.hp, broken: d.state === 'broken' })),
      barricades: {
        portail: { level: this.barricades.portail.level, hp: Math.round(this.barricades.portail.hp) },
        grange: { level: this.barricades.grange.level, hp: Math.round(this.barricades.grange.hp) },
        arriere: { level: this.barricades.arriere.level, hp: Math.round(this.barricades.arriere.hp) },
        verger: { level: this.barricades.verger.level, hp: Math.round(this.barricades.verger.hp) },
      },
      decals: [...this.decals],
    };
  }
}
