// The night defense simulation. One authoritative, deterministic state: cameras only look at it.
// Mutable on purpose (it steps 60 times a second); everything it reports back is a snapshot.

import { BARRICADE, COMBAT, DEVICES, isManual, isTrap } from './data/devices';
import { BOSS, ENEMIES, type EnemyDef } from './data/enemies';
import { NIGHT_LEAD_IN, planForNight } from './data/waves';
import { ENTRIES, GRID_H, GRID_W, LANES, SPAWN_CELLS, idx, inGrid, isStaticBlocked, sectorOf } from './map';
import type { CameraOutage } from './orchard';
import type { Ally } from './radio';
import { computeField, nextStep, type Field } from './pathing';
import { createRng, type Rng } from './rng';
import type { Cell, Decal, DeviceTypeId, EnemyTypeId, Facing, NeighborId, NightHighlight, NightReport, Result, SectorId, YardState } from './types';
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
}

export type EnemyAction = 'walk' | 'attack' | 'windup' | 'charge' | 'rev' | 'jam' | 'speech' | 'idle';

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
  nettedFor: number;
  stunnedFor: number;
  hasteFor: number;
  lureFor: number;
  lureDevice: number | null;
  lit: boolean;
  shielded: boolean;
  windup: number;
  cooldown: number;
  hitFlash: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly trampled: Set<number>;
  boss: BossRuntime | null;
  alive: boolean;
}

export type TelegraphKind = 'mower' | 'ram' | 'speech' | 'whistle' | 'boar';

export type SimEvent =
  | { readonly type: 'wave'; readonly index: number; readonly total: number }
  | { readonly type: 'spawn'; readonly enemy: EnemyTypeId; readonly sector: SectorId }
  | { readonly type: 'boss_spawn'; readonly boss: NeighborId; readonly sector: SectorId }
  | { readonly type: 'boss_dead'; readonly boss: NeighborId; readonly x: number; readonly y: number }
  | { readonly type: 'trigger'; readonly deviceId: number; readonly device: DeviceTypeId; readonly x: number; readonly y: number; readonly hits: number; readonly kills: number; readonly auto: boolean }
  | { readonly type: 'trigger_denied'; readonly deviceId: number; readonly reason: TriggerError }
  | { readonly type: 'device_ready'; readonly deviceId: number; readonly device: DeviceTypeId; readonly x: number; readonly y: number }
  | { readonly type: 'device_broken'; readonly deviceId: number; readonly device: DeviceTypeId; readonly x: number; readonly y: number }
  | { readonly type: 'enemy_hit'; readonly x: number; readonly y: number; readonly amount: number }
  | { readonly type: 'enemy_dead'; readonly id: number; readonly enemy: EnemyTypeId; readonly x: number; readonly y: number; readonly fx: number; readonly fy: number }
  | { readonly type: 'barricade_hit'; readonly sector: SectorId }
  | { readonly type: 'breach'; readonly sector: SectorId }
  | { readonly type: 'entered'; readonly sector: SectorId; readonly enemy: EnemyTypeId; readonly damage: number }
  | { readonly type: 'telegraph'; readonly kind: TelegraphKind; readonly enemyId: number; readonly x: number; readonly y: number; readonly sector: SectorId; readonly seconds: number }
  | { readonly type: 'interrupt'; readonly x: number; readonly y: number }
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
  | { readonly type: 'outcome'; readonly survived: boolean };

export type TriggerError = 'unknown' | 'passive' | 'automatic' | 'broken' | 'busy' | 'rearming' | 'no_energy' | 'over';

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
const samePress = (a: DeskPress, b: DeskPress): boolean =>
  a.kind === b.kind && (a.kind === 'look' ? a.sector === (b as typeof a).sector : a.kind === 'key' ? a.slot === (b as typeof a).slot : a.deviceId === (b as typeof a).deviceId);

/** What firing a manual trap right now would catch. `now` is the desk's cue: enough is under it to be worth it. */
export interface Opportunity {
  readonly targets: number;
  readonly now: boolean;
}

export type Outcome = 'ongoing' | 'survived' | 'overrun';

interface PendingSpawn {
  time: number;
  readonly wave: number;
  readonly sector: SectorId;
  readonly type: EnemyTypeId;
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

const DOOR_REACH = 1.3;
const FENCE_BLOW_FACTOR = 2.5;
const TRAMPLE_DAMAGE = 45;
const LURE_GNAW_DPS = 2;
const GRACE_AFTER_CLEAR = 2;
const FAST_FORWARD_GAP = 3;
const MAX_DECALS = 90;
/** Seconds after the last arrival before first light: whatever is still standing wanders off. */
const DAWN_MARGIN = 55;

export class NightSim {
  readonly night: number;
  time = 0;
  energy: number = COMBAT.nightEnergy;
  houseHp: number;
  outcome: Outcome = 'ongoing';
  waveIndex = 0;
  readonly waveCount: number;
  readonly devices: DeviceRuntime[];
  readonly enemies: Enemy[] = [];
  readonly barricades: Record<SectorId, { hp: number; level: 0 | 1 }>;
  readonly decals: Decal[];

  private readonly rng: Rng;
  private readonly pending: PendingSpawn[] = [];
  private events: SimEvent[] = [];
  private nextEnemyId = 1;
  private clearFor = 0;
  /** Simulation time at which dawn breaks. Moves earlier when quiet gaps are skipped. */
  dawnAt = 0;
  private readonly nightLength: number;
  private fences = new Set<number>();
  private raised = new Set<number>();
  private walkFields!: Record<SectorId, Field>;
  private breachFields!: Record<SectorId, Field>;
  private readonly lureFields = new Map<number, Field>();
  private fieldsDirty = true;

  private readonly kills: Partial<Record<EnemyTypeId, number>> = {};
  private killCount = 0;
  private highlight: NightHighlight | undefined;
  private breaches = 0;
  private houseDamage = 0;
  private devicesBroken = 0;
  private triggers = 0;
  private autoTriggers = 0;
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

    const plan = planForNight(night);
    this.waveCount = plan.waves.length;
    let waveStart = NIGHT_LEAD_IN;
    plan.waves.forEach((wave, waveIndex) => {
      waveStart += wave.after;
      for (const group of wave.groups) {
        for (let n = 0; n < group.count; n++) {
          this.pending.push({ time: waveStart + group.delay + n * group.every, wave: waveIndex + 1, sector: group.sector, type: group.type });
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
    if (hand.queue.some((waiting) => samePress(waiting, press))) return 'waiting';
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
    if (this.outcome !== 'ongoing') return deny('over');
    if (!device) return deny('unknown');
    const def = DEVICES[device.type];
    if (def.mode === 'passive') return deny('passive');
    if (def.mode === 'auto') return deny('automatic');
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
    const hits = this.applyTrigger(device);
    const kills = this.killCount - before;
    if (kills > 0 && (!this.highlight || (this.highlight.kind === 'catch' && kills > this.highlight.kills))) {
      this.highlight = { kind: 'catch', deviceId: device.id, kills };
    }
    this.events.push({ type: 'trigger', deviceId: device.id, device: device.type, x: device.x, y: device.y, hits, kills, auto });
  }

  /**
   * Infected standing within a trap's reach. `pressing` when one of them is worth the trap alone:
   * a heavy one, or — for a trap that hurts — anything already at work on a door or a palisade.
   */
  private underTrap(device: DeviceRuntime): { count: number; pressing: boolean } {
    const def = DEVICES[device.type];
    const cx = device.x + 0.5;
    const cy = device.y + 0.5;
    let count = 0;
    let pressing = false;
    for (const e of this.enemies) {
      if (!e.alive || Math.hypot(e.x - cx, e.y - cy) > def.reach) continue;
      // The horn means nothing to a boss or to the chief's file; the floodlight adds nothing to the already dazzled.
      if (device.type === 'horn' && (e.def.boss || e.shielded || e.lureDevice !== null)) continue;
      if (device.type === 'floodlight' && e.lit) continue;
      count++;
      if (device.type === 'barrier') continue;
      if (e.def.boss || e.def.tramples) pressing = true;
      if (def.damage > 0 && (e.action === 'attack' || e.action === 'windup')) pressing = true;
    }
    return { count, pressing };
  }

  /** The desk's cue for a manual trap: what is under it, and whether that is worth firing now. */
  opportunity(deviceId: number): Opportunity {
    const device = this.device(deviceId);
    if (!device || device.state !== 'armed' || !isManual(device.type) || this.outcome !== 'ongoing') return { targets: 0, now: false };
    const def = DEVICES[device.type];
    if (this.energy < def.energy) return { targets: 0, now: false };
    const { count, pressing } = this.underTrap(device);
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
      case 'log':
        for (const e of inRange) {
          this.interrupt(e);
          const control = e.def.boss ? COMBAT.bossControlFactor : 1;
          e.stunnedFor = Math.max(e.stunnedFor, COMBAT.logStunSeconds * control);
          this.knockback(e, cx, cy, COMBAT.logKnockbackCells * control);
          this.damage(e, def.damage);
        }
        return inRange.length;
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

  step(dt: number): void {
    if (this.outcome !== 'ongoing') return;
    this.time += dt;
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
    for (const enemy of this.enemies) if (enemy.alive) this.updateEnemy(enemy, dt);
    this.separate();
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
      this.spawn(spawn.type, spawn.sector);
    }
  }

  private spawn(type: EnemyTypeId, sector: SectorId, announce = true): Enemy {
    const def = ENEMIES[type];
    const cell = type === 'mower' ? (LANES[sector][0] as Cell) : this.rng.pick(SPAWN_CELLS[sector]);
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
      nettedFor: 0,
      stunnedFor: 0,
      hasteFor: 0,
      lureFor: 0,
      lureDevice: null,
      lit: false,
      shielded: false,
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
    const horns = this.devices.filter((d) => d.type === 'horn' && d.state === 'active');
    const chiefs = this.enemies.filter((e) => e.alive && e.type === 'chief');
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.lit = lights.some((l) => Math.hypot(e.x - (l.x + 0.5), e.y - (l.y + 0.5)) <= DEVICES.floodlight.radius);
      e.shielded = !e.def.boss && chiefs.some((c) => Math.hypot(e.x - c.x, e.y - c.y) <= BOSS.chief.auraRadius);
      if (e.def.boss || e.shielded) continue;
      for (const horn of horns) {
        if (Math.hypot(e.x - (horn.x + 0.5), e.y - (horn.y + 0.5)) <= DEVICES.horn.radius) {
          e.lureDevice = horn.id;
          e.lureFor = horn.timer;
        }
      }
    }
  }

  private updateEnemy(e: Enemy, dt: number): void {
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    e.hasteFor = Math.max(0, e.hasteFor - dt);
    e.lureFor = Math.max(0, e.lureFor - dt);
    e.cooldown = Math.max(0, e.cooldown - dt);
    if (e.lureFor <= 0) e.lureDevice = null;

    if (e.nettedFor > 0 || e.stunnedFor > 0) {
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
    this.advance(e, dt);
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
    const step = nextStep(field, cx, cy, blocked);
    if (!step) {
      e.action = 'idle';
      return;
    }

    const stepIndex = idx(step.x, step.y);
    const obstacle = this.obstacleAt(stepIndex);
    if (obstacle) {
      if (e.def.jumps) {
        if (!e.trampled.has(-obstacle.id)) {
          e.trampled.add(-obstacle.id);
          this.events.push({ type: 'jump', x: step.x + 0.5, y: step.y + 0.5 });
        }
      } else {
        this.attackDevice(e, obstacle, dt);
        return;
      }
    }

    e.windup = 0;
    e.action = 'walk';
    this.moveToward(e, step.x + 0.5 + e.offsetX * 0.6, step.y + 0.5 + e.offsetY * 0.6, this.speedOf(e), dt);
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

  private moveToward(e: Enemy, tx: number, ty: number, speed: number, dt: number): boolean {
    const dx = tx - e.x;
    const dy = ty - e.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1e-4) return true;
    const travel = Math.min(distance, speed * dt);
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
      this.telegraph(kind, e, sector, e.def.windupSeconds);
      return false;
    }
    e.windup -= dt;
    e.action = 'windup';
    if (e.windup > 0) return false;
    e.windup = 0;
    e.cooldown = interval;
    e.action = 'attack';
    return true;
  }

  private telegraphKind(e: Enemy): TelegraphKind {
    return e.type === 'boar' ? 'boar' : 'ram';
  }

  private assaultDoor(e: Enemy, dt: number): void {
    const sector = e.target;
    const barricade = this.barricades[sector];
    const entry = ENTRIES[sector];
    e.fx = entry.x + 0.5 - e.x || e.fx;
    e.fy = entry.y + 0.5 - e.y || e.fy;

    if (barricade.hp > 0) {
      const continuous = e.def.windupSeconds <= 0;
      if (!this.strike(e, dt, sector, this.telegraphKind(e), e.type === 'mechanic' ? BOSS.mechanic.blowInterval : 1.2)) return;
      this.hitBarricade(sector, continuous ? e.def.barricadeDamage * dt : e.def.barricadeDamage, !continuous);
      return;
    }

    // The door is open.
    if (!e.def.boss) {
      e.alive = false;
      this.loseHouse(e.def.houseDamage);
      this.events.push({ type: 'entered', sector, enemy: e.type, damage: e.def.houseDamage });
      return;
    }
    // Bosses stay on the doorstep and keep hammering the house itself.
    if (e.def.windupSeconds <= 0) {
      if (e.cooldown > 0) return;
      e.cooldown = 2.5;
    } else if (!this.strike(e, dt, sector, 'ram', 3)) {
      return;
    }
    this.loseHouse(e.def.houseDamage);
    this.events.push({ type: 'entered', sector, enemy: e.type, damage: e.def.houseDamage });
  }

  /** What was bitten turns, from inside: the planks he was holding are pulled half off. */
  private allyTurns(ally: Ally): void {
    this.heldDoor = null;
    const barricade = this.barricades[ally.sector];
    barricade.hp = Math.round(barricade.hp * (1 - ally.loss));
    this.events.push({ type: 'ally_turned', sector: ally.sector });
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
    e.fx = device.x + 0.5 - e.x || e.fx;
    e.fy = device.y + 0.5 - e.y || e.fy;
    const continuous = e.def.windupSeconds <= 0;
    if (!this.strike(e, dt, sectorOf(device.x, device.y), this.telegraphKind(e), 0.7)) return;
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
    if (!e.def.tramples) return;
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
      this.damageDevice(horn, LURE_GNAW_DPS * dt);
      return true;
    }
    const step = nextStep(field, Math.floor(e.x), Math.floor(e.y), this.fences);
    if (!step) return false;
    e.action = 'walk';
    this.moveToward(e, step.x + 0.5 + e.offsetX * 0.6, step.y + 0.5 + e.offsetY * 0.6, this.speedOf(e), dt);
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
        const reached = this.moveToward(e, cell.x + 0.5, cell.y + 0.5, BOSS.mower.chargeSpeed * (e.lit ? 0.8 : 1), dt);
        if (!reached) return;
        boss.laneIndex = Math.min(boss.laneIndex + 1, lane.length - 1);
        this.addDecal('mown', cell.x, cell.y);
        const device = this.devices.find((d) => d.x === cell.x && d.y === cell.y && d.state !== 'broken');
        if (device) {
          const raisedBarrier = device.type === 'barrier' && device.state === 'active';
          // Palisades and raised barriers are mown flat; a trap lying in the lane is mauled, not erased.
          const flattened = raisedBarrier || DEVICES[device.type].blocks;
          this.damageDevice(device, flattened ? Infinity : DEVICES[device.type].maxHp * BOSS.mower.laneDamage);
          if (raisedBarrier) {
            // Blades meet a striped wall: the wall loses, but so does the momentum.
            this.damage(e, 80);
            this.jamMower(e);
            return;
          }
        }
        if (boss.laneIndex >= lane.length - 1) {
          const barricade = this.barricades[boss.sector];
          if (barricade.hp > 0) this.hitBarricade(boss.sector, e.def.barricadeDamage, true);
          else {
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
    this.events.push({ type: 'interrupt', x: e.x, y: e.y });
  }

  private updateMail(e: Enemy, boss: BossRuntime, dt: number): void {
    e.target = boss.sector;
    const entry = ENTRIES[boss.sector];
    const distance = Math.hypot(e.x - (entry.x + 0.5), e.y - (entry.y + 0.5));
    if (distance > DOOR_REACH) {
      this.advance(e, dt);
      return;
    }
    // On the doorstep: two brisk knocks, then on with the round.
    e.action = 'attack';
    if (e.cooldown > 0) return;
    e.cooldown = BOSS.mail.knockInterval;
    const barricade = this.barricades[boss.sector];
    if (barricade.hp > 0) this.hitBarricade(boss.sector, e.def.barricadeDamage, true);
    else {
      this.loseHouse(e.def.houseDamage);
      this.events.push({ type: 'entered', sector: boss.sector, enemy: e.type, damage: e.def.houseDamage });
    }
    boss.knocks++;
    if (boss.knocks >= BOSS.mail.knocksPerDoor) {
      boss.knocks = 0;
      boss.sector = nextSector(boss.sector);
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
    boss.ability -= dt;
    if (boss.ability > 0) return;
    boss.ability = BOSS.chief.whistleEvery;
    for (const other of this.enemies) {
      if (other.alive && !other.def.boss && Math.hypot(other.x - e.x, other.y - e.y) <= BOSS.chief.auraRadius) other.hasteFor = BOSS.chief.whistleSeconds;
    }
    this.telegraph('whistle', e, sectorOf(Math.floor(e.x), Math.floor(e.y)), BOSS.chief.whistleSeconds);
  }

  // ───────────────────────────── Combat helpers ─────────────────────────────

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
      this.events.push({ type: 'interrupt', x: e.x, y: e.y });
    }
  }

  private damage(e: Enemy, amount: number): void {
    if (!e.alive) return;
    let dealt = amount;
    if (e.nettedFor > 0) dealt *= COMBAT.nettedDamageMultiplier;
    if (e.lit) dealt *= COMBAT.litDamageMultiplier;
    if (e.shielded) dealt *= BOSS.chief.auraDamageTaken;
    if (e.type === 'chief' && e.nettedFor <= 0 && !e.lit) dealt *= BOSS.chief.selfDamageTaken;
    if (e.type === 'mower' && e.boss?.phase === 'jam') dealt *= 1.5;
    e.hp -= dealt;
    e.hitFlash = 0.18;
    this.events.push({ type: 'enemy_hit', x: e.x, y: e.y, amount: Math.round(dealt) });
    if (e.hp > 0) return;
    e.hp = 0;
    e.alive = false;
    this.kills[e.type] = (this.kills[e.type] ?? 0) + 1;
    this.killCount++;
    this.addDecal('splat', Math.floor(e.x), Math.floor(e.y));
    this.events.push({ type: 'enemy_dead', id: e.id, enemy: e.type, x: e.x, y: e.y, fx: e.fx, fy: e.fy });
    if (e.def.boss) {
      this.bossDefeated = e.def.boss;
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

  private addDecal(kind: Decal['kind'], x: number, y: number): void {
    if (this.decals.some((d) => d.kind === kind && d.x === x && d.y === y)) return;
    this.decals.push({ kind, x, y });
    // Mown strips are the joke: they outlive the stains.
    while (this.decals.length > MAX_DECALS) {
      const drop = this.decals.findIndex((d) => d.kind !== 'mown');
      this.decals.splice(drop >= 0 ? drop : 0, 1);
    }
  }

  private resolveOutcome(dt: number): void {
    // Sweep the dead out so long nights do not accumulate them.
    for (let i = this.enemies.length - 1; i >= 0; i--) if (!(this.enemies[i] as Enemy).alive) this.enemies.splice(i, 1);

    if (this.houseHp <= 0) {
      this.outcome = 'overrun';
      this.events.push({ type: 'outcome', survived: false });
      return;
    }
    if (this.pending.length === 0 && this.enemies.length === 0) this.clearFor += dt;
    else this.clearFor = 0;
    // Either the lot is clear, or the house simply held until first light.
    if (this.clearFor >= GRACE_AFTER_CLEAR || this.time >= this.dawnAt) {
      this.outcome = 'survived';
      this.events.push({ type: 'outcome', survived: true });
    }
  }

  // ───────────────────────────── Results ─────────────────────────────

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
      bossDefeated: this.bossDefeated,
      durationSeconds: Math.round(this.time),
      cameraLost: this.cameraLost,
    };
  }

  /** What the lot looks like the morning after: this is exactly what the day phase inherits. */
  toYard(previous: YardState): YardState {
    return {
      ...previous,
      houseHp: Math.max(0, Math.round(this.houseHp)),
      devices: this.devices.map((d) => ({ id: d.id, type: d.type, x: d.x, y: d.y, facing: d.facing, hp: Math.max(0, Math.round(d.hp)), broken: d.state === 'broken' })),
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
