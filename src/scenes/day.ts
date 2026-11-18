// Daytime at the refuge: the lot seen from above, the build menu, the doors, and the two ways
// out of the day — the car, or waiting for night.

import { BARRICADE, DEVICES, HOUSE_MAX_HP, HOUSE_REPAIR, facingsOf, isTrap, turned } from '../core/data/devices';
import { DAY_HOURS } from '../core/data/locations';
import { ORCHARD, hasLeftArm } from '../core/orchard';
import { SHED, briefingFor, type Briefing } from '../core/shed';
import { allyFor, guestOf, lookoutFor } from '../core/radio';
import { LAST_NIGHT, planForNight } from '../core/data/waves';
import { bossOfNight, clockLabel, startNight } from '../core/game';
import { ENTRIES, GRID_H, GRID_W, SPAWN_CELLS, idx } from '../core/map';
import { computeField, traceRoute } from '../core/pathing';
import type { Cell, DeviceInstance, DeviceTypeId, Facing, GameState, Result, SectorId } from '../core/types';
import { DEVICE_TYPE_IDS, RESOURCE_IDS, SECTOR_IDS, ok } from '../core/types';
import {
  affordableCount,
  barricadeMaxHp,
  brokenDevices,
  build,
  canAfford,
  daylightRefund,
  deviceAt,
  dismantle,
  fenceCells,
  isFresh,
  lastFresh,
  placementProblem,
  refundOf,
  reinforceBarricade,
  repairAll,
  repairBarricade,
  repairCostOf,
  repairDevice,
  repairHouse,
  tallyOf,
  type YardError,
  turnDevice,
  undoLastBuild,
  wasSilent,
} from '../core/yard';
import { STAGE_H, STAGE_W, type App, type Pointer, type Scene } from '../engine/app';
import { assetUrl, sprite } from '../engine/assets';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S, fmt, hours } from '../engine/i18n';
import { sayAny, sayOnce } from '../engine/voice';
import { applyDaylight, cameraView, drawWorld, houseLights, inView, pickDevice, pickDoor, pickProp, prepareWorld, project, unproject, WELL_CLINK_AT, type DeviceVisual, type Ghost, type Particle, type Rot, type SceneryAction, type View, type WorldFrame } from '../render/world';
import { deviceArt } from '../render/defenses';
import { VISIBLE_DOORS } from '../render/house';
import { costLine, describeCost, inventoryBar } from './common';
import { goMap, goNightfall, goTitle } from './flow';

type Mode = { readonly kind: 'idle' } | { readonly kind: 'build'; readonly type: DeviceTypeId } | { readonly kind: 'repair' } | { readonly kind: 'dismantle' };

const RECT = { x: 292, y: 56, w: 976, h: 652 } as const;
/** Corner radius of the yard's frame; `.yard-frame` in the stylesheet has the same. */
const FRAME_RADIUS = 8;
const MIN_ZOOM = 0.62;
const MAX_ZOOM = 1.5;
const HINT_KEY = 'putrid-swarm.hint.v2';

/** The view can be centred anywhere on the lot but its outermost cells: past them there is only wood to look at. */
const PAN_INSET = 2;
const panLimit = (value: number, size: number): number => Math.min(size - PAN_INSET, Math.max(PAN_INSET, value));

/** How close a predicted route must pass for a device there to do anything. A barrier only holds what walks into it. */
const coverReach = (type: DeviceTypeId): number => (type === 'barrier' ? 0.5 : DEVICES[type].reach);

function dayDeviceVisual(d: DeviceInstance, highlight = false, silent = false): DeviceVisual {
  return {
    id: d.id, type: d.type, x: d.x, y: d.y, facing: d.facing,
    state: d.broken ? 'broken' : 'idle', hpRatio: d.hp / DEVICES[d.type].maxHp, highlight, silent,
  };
}

/** Where the infected are predicted to walk: sample routes to draw, and every cell stepped on per door. */
interface Forecast {
  readonly routes: Cell[][];
  readonly walked: Readonly<Record<SectorId, ReadonlySet<number>>>;
  /** How many of the predicted routes step on each cell: the worn ground the overlay paints. */
  readonly traffic: ReadonlyMap<number, number>;
}

export function yardErrorText(error: YardError): string {
  const s = S();
  switch (error.code) {
    case 'cannot_afford':
      return fmt(s.err.cannot_afford, { list: describeCost(error.missing) });
    case 'no_time':
      return fmt(s.err.no_time, { h: hours(error.needed) });
    case 'not_buildable':
      return s.err.not_buildable;
    case 'occupied':
      return s.err.occupied;
    case 'seals_routes':
      return fmt(s.err.seals_routes, { sectors: error.sectors.map((id) => s.sector[id]).join(', ') });
    case 'nothing_to_repair':
      return s.err.nothing_to_repair;
    case 'nothing_to_undo':
      return s.err.nothing_to_undo;
    case 'already_reinforced':
      return s.err.already_reinforced;
    case 'not_broken':
      return s.err.not_broken;
    default:
      return s.err.generic;
  }
}

export class DayScene implements Scene {
  private rot: Rot = 0;
  private zoom = 0.69;
  private cx = GRID_W / 2;
  private cy = GRID_H / 2;
  private mode: Mode = { kind: 'idle' };
  /** Which way the piece in hand is turned. */
  private facing: Facing = 0;
  private hover: Cell | null = null;
  private hoverDevice: DeviceInstance | null = null;
  private hoverDoor: SectorId | null = null;
  private panelDoor: SectorId | null = null;
  private previewHp: number | undefined;
  private showRoutes = true;
  private sceneryAction: SceneryAction | null = null;
  private time = 0;
  private reveal: number;
  private readonly particles: Particle[] = [];
  private drag: {
    x: number;
    y: number;
    cx: number;
    cy: number;
    moved: boolean;
    pan: boolean;
    /** Pressed with the secondary button: a press without a drag turns the piece. */
    secondary: boolean;
    painted: boolean;
    stopped: boolean;
    /** Last palisade laid by this stroke, to know which way the line runs. */
    last: { x: number; y: number; id: number } | null;
    aligned: boolean;
  } | null = null;

  private root!: HTMLElement;
  private info!: HTMLElement;
  private refundTag!: HTMLElement;
  private readonly buildIcons = new Map<DeviceTypeId, HTMLImageElement>();
  private routeCache: { key: string; forecast: Forecast } | null = null;
  private ghostCache: { key: string; ghost: Ghost | null; problem: YardError | null } | null = null;

  constructor(
    private readonly app: App,
    options: { reveal?: boolean } = {},
  ) {
    this.reveal = options.reveal ? 2.8 : 0;
  }

  private get state(): GameState {
    if (!this.app.state) throw new Error('DayScene needs a running game');
    return this.app.state;
  }

  private get view(): View {
    return { rot: this.rot, zoom: this.zoom, cx: this.cx, cy: this.cy, ...RECT };
  }

  enter(): void {
    audio.setAmbience('day');
    audio.setMusic('day');
    // Painted while the screen is still dark from the scene change, not during the first frame.
    prepareWorld({ ...this.view, rot: this.rot === 0 ? 1 : 0 }, this.view);
    this.root = el('div');
    this.app.ui.append(this.root);
    this.refresh();
  }

  exit(): void {
    delete this.app.canvas.dataset.yardCursor;
  }

  // ───────────────────────────── HUD ─────────────────────────────

  private refreshBuildArt(): void {
    for (const [type, img] of this.buildIcons) {
      const selected = this.mode.kind === 'build' && this.mode.type === type;
      const art = deviceArt(type, selected ? this.facing : 0, type === 'fence' ? 'resting' : 'armed', this.rot);
      const url = assetUrl(art.key);
      if (url) {
        if (img.getAttribute('src') !== url) img.src = url;
      } else img.removeAttribute('src');
      img.style.transform = art.flip ? 'scaleX(-1)' : '';
    }
  }

  private refresh(): void {
    const s = S();
    const state = this.state;
    const yard = state.yard;

    const daylight = el('span', { class: 'meter' }, [el('i', { style: { width: `${(state.hoursLeft / DAY_HOURS) * 100}%` } })]);
    const houseMeter = el('span', { class: `meter house ${yard.houseHp <= 35 ? 'low' : ''}` }, [el('i', { style: { width: `${(yard.houseHp / HOUSE_MAX_HP) * 100}%` } })]);
    const topbar = el('div', { class: 'topbar' }, [
      el('span', { class: 'label-strong', text: fmt(s.day.day, { n: state.day }) }),
      el('span', { class: 'sep' }),
      el('span', { text: clockLabel(state.hoursLeft) }),
      daylight,
      el('span', { class: 'muted', text: fmt(s.day.hoursLeft, { h: hours(state.hoursLeft) }) }),
      hasLeftArm(state) ? null : el('span', { class: 'chip-arm', text: s.day.oneArm, title: fmt(s.day.oneArmNote, { h: hours(ORCHARD.dressingHours) }) }),
      state.shed === 'freed' ? el('span', { class: 'chip-arm chip-shed good', text: s.day.shedFreed, title: fmt(s.day.shedFreedNote, { n: SHED.delivery.wood ?? 0 }) }) : null,
      state.shed === 'chained' ? el('span', { class: 'chip-arm chip-shed', text: s.day.shedChained, title: fmt(s.day.shedChainedNote, { h: hours(SHED.upkeepHours) }) }) : null,
      el('span', { class: 'grow' }),
      inventoryBar(state.inventory),
      el('span', { class: 'sep' }),
      el('span', { text: s.day.house }),
      houseMeter,
      el('button', { class: 'btn icon-btn', text: '☰', title: s.end.menu, onClick: () => goTitle(this.app) }),
    ]);

    // Build menu.
    const cards = DEVICE_TYPE_IDS.map((type, i) => {
      const def = DEVICES[type];
      const selected = this.mode.kind === 'build' && this.mode.type === type;
      const img = el('img');
      this.buildIcons.set(type, img);
      const count = affordableCount(state.inventory, type, state.hoursLeft);
      const affordable = count > 0;
      const tag = def.mode === 'auto' ? s.day.tagAuto : def.mode === 'manual' ? s.day.tagManual : s.day.tagPassive;
      return el(
        'button',
        {
          class: `dev-card ${selected ? 'sel' : ''} ${affordable ? '' : 'poor'}`,
          title: `${i + 1}`,
          onClick: () => this.setMode(selected ? { kind: 'idle' } : { kind: 'build', type }),
          onEnter: () => this.showDeviceInfo(type),
          onLeave: () => this.updateInfo(),
        },
        [
          img,
          el('span', { class: 'name' }, [
            s.device[type].name,
            el('span', {}, [
              // How many of them the stock and the daylight still pay for: the answer to "can I close this gap?".
              count > 0 ? el('i', { class: 'stock-count', text: `×${count}`, title: fmt(s.day.affordable, { n: count }) }) : null,
              fmt(s.day.time, { h: hours(def.buildHours) }),
            ]),
          ]),
          el('span', { class: 'meta' }, [costLine(def.cost, state.inventory), el('span', { class: `tag tag-${def.mode}`, text: tag })]),
        ],
      );
    });
    this.refreshBuildArt();
    const tool = (kind: 'repair' | 'dismantle', label: string): HTMLElement =>
      el('button', {
        class: `btn ${this.mode.kind === kind ? 'sel' : ''}`,
        text: label,
        onClick: () => this.setMode(this.mode.kind === kind ? { kind: 'idle' } : { kind }),
      });
    // The two chores that come back every day, each in one click: take back the piece just laid, and put
    // everything the night broke back on its feet.
    const fresh = lastFresh(state);
    const wrecks = brokenDevices(yard).length;
    const repairs = repairAll(state);
    const count = repairs.ok ? repairs.value.repaired : 0;
    const after = repairs.ok ? repairs.value.state : state;
    const bill = Object.fromEntries(RESOURCE_IDS.map((id) => [id, state.inventory[id] - after.inventory[id]]));
    const quick = el('div', { class: 'tool-row quick' }, [
      el('button', {
        class: 'btn',
        text: s.day.undo,
        disabled: !fresh,
        title: fresh ? fmt(s.day.undoTitle, { name: s.device[fresh.type].name }) : s.day.undoNone,
        onClick: () => this.undo(),
      }),
      el('button', {
        class: `btn ${count > 0 ? 'btn-alert' : ''}`,
        text: wrecks === 0 ? s.day.repairAllNone : fmt(count === wrecks ? s.day.repairAll : s.day.repairPart, { n: count, total: wrecks }),
        disabled: count === 0,
        title: repairs.ok ? `${describeCost(bill)} · ${fmt(s.day.time, { h: hours(state.hoursLeft - after.hoursLeft) })}` : wrecks ? yardErrorText(repairs.error) : s.day.repairAllNoneTitle,
        onClick: () => this.repairEverything(),
      }),
    ]);
    const panel = el('div', { class: 'panel build-panel' }, [
      el('h3', { text: s.day.build }),
      ...cards,
      el('h3', { text: s.day.tools }),
      el('div', { class: 'tool-row' }, [tool('repair', s.day.repair), tool('dismantle', s.day.dismantle)]),
      quick,
    ]);

    // Doors and house. Each door also says how many working traps stand on the way to it.
    const expected = this.expectedSectors();
    const walked = this.forecast().walked;
    const doorRows = SECTOR_IDS.map((sector) => {
      const cover = yard.devices.filter((d) => !d.broken && isTrap(d.type) && this.covers(d.type, d.x, d.y, walked[sector])).length;
      const exposed = cover === 0 && expected.includes(sector);
      const barricade = yard.barricades[sector];
      const max = barricadeMaxHp(barricade.level);
      const ratio = barricade.hp / max;
      const damaged = barricade.hp < max;
      const repair = repairBarricade(state, sector);
      const nextHp = repair.ok ? repair.value.yard.barricades[sector].hp : barricade.hp;
      const button = damaged
        ? el('button', {
            class: 'btn icon-btn',
            text: '+',
            title: repair.ok ? this.doorRepairLabel(nextHp - barricade.hp) : yardErrorText(repair.error),
            onClick: () => this.apply(repairBarricade(this.state, sector), s.day.repaired, 'build'),
          })
        : barricade.level === 0
          ? el('button', {
              class: 'btn icon-btn',
              text: '▲',
              title: `${s.day.doorReinforce} · ${describeCost(BARRICADE.reinforceCost)} · ${fmt(s.day.time, { h: hours(BARRICADE.reinforceHours) })}`,
              onClick: () => this.apply(reinforceBarricade(this.state, sector), s.day.repaired, 'build'),
            })
          : el('span');
      const row = el('div', { class: 'row', data: { door: sector } }, [
        el('span', {}, [
          el('button', { class: 'door-location', text: s.sector[sector], title: fmt(s.day.showDoor, { sector: s.sector[sector] }), onClick: () => this.showDoor(sector) }),
          el('span', { class: `cover ${exposed ? 'bad' : cover === 0 ? 'none' : ''}`, text: `${cover}`, title: cover > 0 ? fmt(s.day.covered, { n: cover }) : s.day.uncovered }),
        ]),
        el('span', { class: `meter house ${ratio <= 0.35 ? 'low' : ''}`, title: `${barricade.hp} / ${max}` }, [
          el('i', { style: { width: `${ratio * 100}%` } }),
          repair.ok ? el('span', { class: 'repair-gain', style: { left: `${ratio * 100}%`, width: `${((nextHp - barricade.hp) / max) * 100}%` } }) : null,
        ]),
        button,
      ]);
      row.addEventListener('mouseenter', () => this.inspectDoor(sector));
      row.addEventListener('mouseleave', () => this.inspectDoor(null));
      row.addEventListener('focusin', () => this.inspectDoor(sector));
      row.addEventListener('focusout', () => this.inspectDoor(null));
      return row;
    });
    const houseRow = el('div', { class: 'row' }, [
      el('span', {}, [s.day.house]),
      el('span', { class: `meter house ${yard.houseHp <= 35 ? 'low' : ''}`, title: `${yard.houseHp} / ${HOUSE_MAX_HP}` }, [el('i', { style: { width: `${(yard.houseHp / HOUSE_MAX_HP) * 100}%` } })]),
      yard.houseHp < HOUSE_MAX_HP
        ? el('button', {
            class: 'btn icon-btn',
            text: '+',
            title: `${fmt(s.day.houseRepair, { hp: HOUSE_REPAIR.amount })} · ${describeCost(HOUSE_REPAIR.cost)} · ${fmt(s.day.time, { h: hours(HOUSE_REPAIR.hours) })}`,
            onClick: () => this.apply(repairHouse(this.state), s.day.repaired, 'build'),
          })
        : el('span'),
    ]);
    const doors = el('div', { class: 'panel door-chips' }, [...doorRows, houseRow]);

    const boss = bossOfNight(state.day);
    const tonight = el('div', { class: 'panel tonight' }, [
      el('b', { text: `${s.day.tonight} · ${fmt(s.night.night, { n: state.day })}` }),
      el('div', { text: fmt(s.day.tonightFrom, { sectors: expected.map((sector) => s.sector[sector]).join(', ') }) }),
      el('div', { class: 'muted', text: boss ? fmt(s.day.tonightBoss, { name: s.neighbor[boss].name }) : s.day.tonightUnknown }),
      this.briefing(briefingFor(state)),
      this.radioBriefing(),
    ]);

    const viewTools = el('div', { class: 'view-tools' }, [
      el('button', { class: 'btn icon-btn', text: s.day.flip, onClick: () => this.flip() }),
      el('button', { class: `btn icon-btn ${this.showRoutes ? 'sel' : ''}`, text: s.day.routes, onClick: () => this.toggleRoutes() }),
    ]);

    const outOfTime = state.hoursLeft < 0.25;
    const actions = el('div', { class: 'day-actions' }, [
      el('button', { class: `btn ${outOfTime ? '' : 'btn-primary'}`, disabled: state.hoursLeft < 0.5, onClick: () => goMap(this.app) }, [s.day.takeCar]),
      el('button', { class: `btn ${outOfTime ? 'btn-primary' : ''}`, onClick: () => this.askNight() }, [s.day.waitNight]),
    ]);

    this.info = el('div', { class: 'panel info-card' });
    // The window onto the yard, seated in the desk like the panels around it.
    const frame = el('div', { class: 'yard-frame', style: { left: `${RECT.x}px`, top: `${RECT.y}px`, width: `${RECT.w}px`, height: `${RECT.h}px` } });
    this.refundTag = el('div', { class: 'yard-refund' });
    frame.append(this.refundTag);
    // One column: the doors' panel grows a line taller with every door that needs a nail, and the card under it follows.
    const side = el('div', { class: 'day-side' }, [doors, tonight]);
    this.root.replaceChildren(frame, topbar, panel, viewTools, side, actions, this.info);
    this.panelDoor = SECTOR_IDS.find((_, index) => doorRows[index]?.matches(':hover')) ?? null;
    this.updateHover(this.app.pointer, true);
    this.maybeHint();
  }

  /** What the morning on the radio left for tonight: someone at a door, someone in the shed, where they will come from. */
  private radioBriefing(): HTMLElement | null {
    const s = S();
    const state = this.state;
    if (state.day !== LAST_NIGHT || !state.radio.call) return null;
    const name = s.radio.caller[state.radio.call.caller].split(',')[0] ?? '';
    const lines: HTMLElement[] = [];
    const ally = allyFor(state);
    if (ally) lines.push(el('div', { text: fmt(s.day.briefAlly, { name, sector: s.sector[ally.sector] }) }));
    if (guestOf(state)) lines.push(el('div', { text: fmt(s.day.briefGuest, { name }) }));
    const lookout = lookoutFor(state);
    if (lookout) {
      if (lookout.rows.length === 0) lines.push(el('div', { text: s.day.briefLookoutNone }));
      else {
        lines.push(el('div', { text: s.day.briefLookout }));
        for (const row of lookout.rows) {
          lines.push(
            el('div', { class: 'brief-row' }, [
              el('b', { text: fmt(s.day.briefSector, { sector: s.sector[row.sector], n: row.total }) }),
              el('span', { text: [...row.kinds.map((k) => `${s.enemy[k.type]} ×${k.count}`), ...(row.boss ? [fmt(s.day.briefBoss, { name: s.enemy[row.boss.type], w: row.boss.wave })] : [])].join(', ') }),
            ]),
          );
        }
        if (lookout.missed > 0) lines.push(el('div', { class: 'muted', text: fmt(s.day.briefLookoutMissed, { n: lookout.missed }) }));
      }
    }
    return lines.length > 0 ? el('div', { class: 'brief' }, lines) : null;
  }

  /** What the baker in the shed said about tonight, if he said anything that matters today. */
  private briefing(brief: Briefing | null): HTMLElement | null {
    if (!brief) return null;
    const s = S();
    if (brief.kind === 'chief') {
      const c = brief.chief;
      const n = (v: number): string => hours(v);
      return el('div', { class: 'brief', text: fmt(s.day.briefChief, { every: n(c.whistleEvery), haste: c.whistleHaste, secs: n(c.whistleSeconds), radius: n(c.auraRadius), aura: c.auraShield, self: c.selfShield }) });
    }
    return el('div', { class: 'brief' }, [
      el('div', { text: s.day.briefTonight }),
      ...brief.sectors.map((row) =>
        el('div', { class: 'brief-row' }, [
          el('b', { text: fmt(s.day.briefSector, { sector: s.sector[row.sector], n: row.total }) }),
          el('span', {
            text: [...row.kinds.map((k) => `${s.enemy[k.type]} ×${k.count}`), ...(row.boss ? [fmt(s.day.briefBoss, { name: s.enemy[row.boss.type], w: row.boss.wave })] : [])].join(', '),
          }),
        ]),
      ),
    ]);
  }

  private maybeHint(): void {
    if (this.state.day !== 1 || this.reveal > 0) return;
    let seen = false;
    try {
      seen = localStorage.getItem(HINT_KEY) === '1';
    } catch {
      seen = false;
    }
    if (seen) return;
    const s = S();
    const card = el('div', { class: 'card hint' }, [
      el('ol', {}, [el('li', { text: s.day.hint1 }), el('li', { text: s.day.hint2 }), el('li', { text: s.day.hint3 })]),
      el('div', { class: 'actions' }, [
        el('button', {
          class: 'btn btn-primary',
          text: s.day.gotIt,
          onClick: () => {
            try {
              localStorage.setItem(HINT_KEY, '1');
            } catch {
              // Non-fatal: the hint will simply show again.
            }
            card.remove();
          },
        }),
      ]),
    ]);
    this.root.append(card);
  }

  private showDeviceInfo(type: DeviceTypeId): void {
    const s = S();
    const def = DEVICES[type];
    this.info.replaceChildren(
      el('b', { text: s.device[type].name }),
      s.device[type].desc,
      el('div', {}, [costLine(def.cost, this.state.inventory), el('span', { class: 'muted', text: `  ·  ${fmt(s.day.time, { h: hours(def.buildHours) })}` })]),
    );
  }

  private inspectDoor(sector: SectorId | null): void {
    this.panelDoor = sector;
    this.updateInfo();
  }

  private showDoor(sector: SectorId): void {
    const view = cameraView(sector, RECT, this.zoom);
    audio.play('camera');
    if (this.rot !== view.rot) {
      this.rot = view.rot;
      this.refreshBuildArt();
    }
    this.cx = view.cx;
    this.cy = view.cy;
    this.ghostCache = null;
    this.updateHover(this.app.pointer, true, sector);
  }

  private doorRepairLabel(gain: number): string {
    const s = S().day;
    return `${fmt(s.doorRepair, { hp: gain })} · ${fmt(s.time, { h: hours(BARRICADE.repairHours) })}`;
  }

  private get inspectedDoor(): SectorId | null {
    return this.panelDoor ?? (this.mode.kind === 'repair' || this.mode.kind === 'idle' ? this.hoverDoor : null);
  }

  private updateInfo(): void {
    const s = S();
    this.refundTag.hidden = true;
    this.previewHp = undefined;
    const sector = this.inspectedDoor;
    if (sector) {
      const door = this.state.yard.barricades[sector];
      const repair = repairBarricade(this.state, sector);
      const hp = repair.ok ? repair.value.yard.barricades[sector].hp : undefined;
      this.previewHp = hp;
      this.info.replaceChildren(
        el('b', { text: fmt(s.day.door, { sector: s.sector[sector] }) }),
        hp === undefined ? `${door.hp} / ${barricadeMaxHp(door.level)}` : fmt(s.day.repairHp, { from: door.hp, to: hp }),
      );
      if (hp !== undefined) this.info.append(el('div', { text: this.doorRepairLabel(hp - door.hp) }));
      else if (!repair.ok && door.hp < barricadeMaxHp(door.level)) this.info.append(el('div', { class: 'bad', text: yardErrorText(repair.error) }));
      if (this.panelDoor && !VISIBLE_DOORS[this.rot].includes(sector)) {
        this.info.append(el('div', { class: 'muted', text: fmt(s.day.showDoorHint, { sector: s.sector[sector] }) }));
      }
      return;
    }
    if (this.mode.kind === 'build') {
      this.showDeviceInfo(this.mode.type);
      const { ghost, problem } = this.currentGhost();
      if (problem && this.hover) this.info.append(el('div', { style: { color: '#ff8a78', marginTop: '4px' }, text: yardErrorText(problem) }));
      else if (ghost && isTrap(ghost.type)) {
        // The most useful thing to know before paying: will anybody actually walk into it?
        const idle = this.ghostIdle();
        this.info.append(el('div', { style: { color: idle ? '#ffc24a' : '#c8f08a', marginTop: '4px' }, text: idle ? s.day.offRoute : s.day.onRoute }));
      } else if (DEVICES[this.mode.type].blocks) this.info.append(el('div', { class: 'muted', style: { marginTop: '4px' }, text: s.day.dragHint }));
      this.info.append(el('div', { class: 'muted', style: { marginTop: '4px' }, text: s.day.turnHint }));
      return;
    }
    const device = this.hoverDevice;
    if (device) {
      const def = DEVICES[device.type];
      const lines: (HTMLElement | string)[] = [el('b', { text: `${s.device[device.type].name}${device.broken ? ` · ${s.day.broken}` : ''}` })];
      lines.push(`${device.hp} / ${def.maxHp}`);
      const tally = tallyOf(this.state, device);
      if (tally && !device.broken) {
        // What the night made of it: the one honest review of where it stands.
        const text =
          tally.fired === 0
            ? s.day.tallySilent
            : device.type === 'barrier'
              ? fmt(s.day.tallyBarrier, { fired: tally.fired, hits: tally.hits })
              : fmt(tally.kills > 0 ? s.day.tallyKills : s.day.tally, { fired: tally.fired, hits: tally.hits, kills: tally.kills });
        lines.push(el('div', { class: tally.fired === 0 ? 'tally silent' : 'tally', text }));
      }
      if (device.broken || device.hp < def.maxHp) {
        lines.push(el('div', {}, [fmt(s.day.repairHp, { from: device.hp, to: def.maxHp }), ' · ', costLine(repairCostOf(device.type), this.state.inventory), ` · ${fmt(s.day.time, { h: hours(def.buildHours / 2) })}`]));
      }
      const fresh = isFresh(device, this.state.day);
      const refund = refundOf(device, this.state.day);
      const timeBack = daylightRefund(device, this.state);
      const timeText = timeBack > 0 ? ` · +${fmt(s.day.time, { h: hours(timeBack) })}` : '';
      lines.push(el('div', {}, [`${s.day.dismantle} → ${s.day.refund} `, costLine(refund), timeText]));
      if (this.mode.kind === 'dismantle') {
        const point = project(this.view, device.x + 0.5, device.y + 0.5);
        this.refundTag.replaceChildren(costLine(refund, undefined, '+'), timeText);
        this.refundTag.hidden = false;
        const left = point.x < RECT.x + RECT.w / 2;
        this.refundTag.style.left = `${point.x - RECT.x + (left ? 16 : -16)}px`;
        this.refundTag.style.top = `${Math.max(18, Math.min(RECT.h - 18, point.y - RECT.y - 10 * this.zoom))}px`;
        this.refundTag.style.transform = left ? 'translateY(-50%)' : 'translate(-100%, -50%)';
      }
      if (fresh) lines.push(el('div', { class: 'tally', text: s.day.freshNote }));
      lines.push(el('div', { class: 'muted', text: s.day.turnHint }));
      this.info.replaceChildren(...lines);
      return;
    }
    const hint = this.mode.kind === 'repair' ? s.day.repairHint : this.mode.kind === 'dismantle' ? s.day.dismantleHint : s.day.selectHint;
    this.info.replaceChildren(el('span', { class: 'muted', text: hint }));
  }

  private setMode(mode: Mode): void {
    audio.play('click');
    this.mode = mode;
    // A facing only palisades have does not carry over to a trap.
    if (mode.kind === 'build' && this.facing >= facingsOf(mode.type)) this.facing = 0;
    this.ghostCache = null;
    this.refresh();
  }

  private flip(): void {
    audio.play('camera');
    this.rot = this.rot === 0 ? 1 : 0;
    this.ghostCache = null;
    this.refreshBuildArt();
    this.updateHover(this.app.pointer, true);
  }

  /** Turns the piece in hand, or the placed device under the pointer when nothing is being built. */
  private turn(): void {
    if (this.mode.kind === 'build') {
      audio.play('click');
      this.facing = turned(this.mode.type, this.facing);
      this.ghostCache = null;
      this.refreshBuildArt();
      this.updateInfo();
      return;
    }
    if (this.hoverDevice) this.apply(turnDevice(this.state, this.hoverDevice.id), '', 'click');
  }

  private toggleRoutes(): void {
    this.showRoutes = !this.showRoutes;
    this.refresh();
  }

  /** Takes back the last piece laid today, whole: materials and daylight. */
  private undo(): void {
    const result = undoLastBuild(this.state);
    if (!result.ok) {
      audio.play('deny');
      this.app.toast(yardErrorText(result.error), 'error');
      return;
    }
    const { device } = result.value;
    if (this.hoverDevice?.id === device.id) this.hoverDevice = null;
    this.apply(ok(result.value.state), fmt(S().day.undone, { name: S().device[device.type].name }), 'click', device);
  }

  /** Repairs every broken device the stock and the daylight allow, and says what is left. */
  private repairEverything(): void {
    const s = S();
    const result = repairAll(this.state);
    if (!result.ok) {
      audio.play('deny');
      this.app.toast(yardErrorText(result.error), 'error');
      return;
    }
    const { repaired, left } = result.value;
    this.apply(ok(result.value.state), left > 0 ? fmt(s.day.repairedSome, { n: repaired, left }) : fmt(s.day.repairedAll, { n: repaired }), 'build');
  }

  private askNight(): void {
    const s = S();
    const proceed = (): void => {
      const result = startNight(this.state);
      if (!result.ok) return;
      this.app.state = result.value;
      this.app.save();
      goNightfall(this.app);
    };
    if (this.state.hoursLeft < 1) {
      proceed();
      return;
    }
    const modal = el('div', { class: 'modal' }, [
      el('div', { class: 'card', style: { width: '520px', padding: '20px 24px' } }, [
        el('p', { text: fmt(s.day.waitNightConfirm, { h: hours(this.state.hoursLeft) }) }),
        el('div', { class: 'actions' }, [
          el('button', { class: 'btn', text: s.day.waitNo, onClick: () => modal.remove() }),
          el('button', { class: 'btn btn-primary', text: s.day.waitYes, onClick: proceed }),
        ]),
      ]),
    ]);
    this.root.append(modal);
  }

  /** Commits a state transition or explains why it was refused. */
  private apply(result: Result<GameState, YardError>, okMessage: string, sound: 'build' | 'click', at?: Cell): boolean {
    if (!result.ok) {
      audio.play('deny');
      this.app.toast(yardErrorText(result.error), 'error');
      return false;
    }
    this.app.state = result.value;
    this.app.save();
    audio.play(sound);
    if (at) this.particles.push({ kind: 'dust', x: at.x + 0.5, y: at.y + 0.5, age: 0, life: 0.6, radius: 1 });
    if (okMessage) this.app.toast(okMessage, 'good');
    this.routeCache = null;
    this.ghostCache = null;
    this.refresh();
    return true;
  }

  // ───────────────────────────── Derived view data ─────────────────────────────

  private currentGhost(): { ghost: Ghost | null; problem: YardError | null } {
    if (this.mode.kind !== 'build' || !this.hover) return { ghost: null, problem: null };
    const type = this.mode.type;
    const key = `${type}:${this.facing}:${this.hover.x}:${this.hover.y}:${this.state.yard.devices.length}:${this.state.hoursLeft}`;
    if (this.ghostCache?.key === key) return this.ghostCache;
    const def = DEVICES[type];
    let problem = placementProblem(this.state.yard, type, this.hover.x, this.hover.y);
    if (!problem && this.state.hoursLeft < def.buildHours) problem = { code: 'no_time', needed: def.buildHours };
    if (!problem && !canAfford(this.state.inventory, def.cost)) problem = { code: 'cannot_afford', missing: def.cost };
    this.ghostCache = { key, ghost: { type, x: this.hover.x, y: this.hover.y, facing: this.facing, ok: problem === null }, problem };
    return this.ghostCache;
  }

  /**
   * Where the infected will walk with the yard as it stands (plus the palisade being placed):
   * three sample routes per stretch of tree line for the dashed overlay, and every cell any of
   * them would step on, grouped by the door they end at.
   */
  private forecast(): Forecast {
    const devices = this.state.yard.devices;
    const ghost = this.currentGhost().ghost;
    const preview = ghost && ghost.ok && DEVICES[ghost.type].blocks ? ghost : null;
    const key = `${devices.length}:${devices.filter((d) => d.broken).length}:${devices.map((d) => d.id).join(',')}:${preview ? idx(preview.x, preview.y) : -1}`;
    if (this.routeCache?.key === key) return this.routeCache.forecast;

    const fences = fenceCells(devices);
    if (preview) fences.add(idx(preview.x, preview.y));
    const fields = Object.fromEntries(SECTOR_IDS.map((sector) => [sector, computeField(ENTRIES[sector], { blocked: fences })])) as Record<SectorId, Float32Array>;
    const routes: Cell[][] = [];
    const walked: Record<SectorId, Set<number>> = { portail: new Set(), grange: new Set(), arriere: new Set(), verger: new Set() };
    const traffic = new Map<number, number>();
    for (const sector of SECTOR_IDS) {
      const cells = SPAWN_CELLS[sector];
      const drawn = new Set([cells[1], cells[Math.floor(cells.length / 2)], cells[cells.length - 2]]);
      for (const cell of cells) {
        // Same choice the simulation makes: the home door unless another is clearly closer.
        let target = sector;
        let best = fields[sector][idx(cell.x, cell.y)] as number;
        for (const other of SECTOR_IDS) {
          const d = fields[other][idx(cell.x, cell.y)] as number;
          if (d * 1.35 < best) {
            best = d;
            target = other;
          }
        }
        if (!Number.isFinite(best)) continue;
        const route = traceRoute(fields[target], cell, fences);
        for (const step of route) {
          const cellIndex = idx(step.x, step.y);
          walked[target].add(cellIndex);
          traffic.set(cellIndex, (traffic.get(cellIndex) ?? 0) + 1);
        }
        if (drawn.has(cell)) routes.push(route);
      }
    }
    const forecast: Forecast = { routes, walked, traffic };
    this.routeCache = { key, forecast };
    return forecast;
  }

  /** True when a device of that type on that cell would have a predicted route within reach. */
  private covers(type: DeviceTypeId, x: number, y: number, walked: ReadonlySet<number>): boolean {
    const reach = coverReach(type);
    const span = Math.ceil(reach);
    for (let dy = -span; dy <= span; dy++) {
      for (let dx = -span; dx <= span; dx++) {
        if (Math.hypot(dx, dy) <= reach && walked.has(idx(x + dx, y + dy))) return true;
      }
    }
    return false;
  }

  /** The trap being placed is allowed, but nothing is predicted to come within its reach. */
  private ghostIdle(): boolean {
    const ghost = this.currentGhost().ghost;
    if (!ghost || !ghost.ok || !isTrap(ghost.type)) return false;
    const walked = this.forecast().walked;
    return !SECTOR_IDS.some((sector) => this.covers(ghost.type, ghost.x, ghost.y, walked[sector]));
  }

  /** The approaches tonight's infected come from: the tracks the protagonist found this morning. */
  private expectedSectors(): SectorId[] {
    const seen = new Set(planForNight(this.state.day).waves.flatMap((wave) => wave.groups.map((group) => group.sector)));
    return SECTOR_IDS.filter((sector) => seen.has(sector));
  }

  // ───────────────────────────── Loop ─────────────────────────────

  update(dt: number): void {
    const previousTime = this.time;
    this.time += dt;
    const action = this.sceneryAction;
    if (action) {
      const age = this.time - action.startedAt;
      const previous = previousTime - action.startedAt;
      if (action.kind === 'well' && previous < WELL_CLINK_AT && age >= WELL_CLINK_AT) audio.play('tin');
      const voiceAt = action.kind === 'car' ? 1.7 : 1.5;
      if (previous < voiceAt && age >= voiceAt) sayAny(action.kind === 'car' ? 'honk' : 'well');
      if (age >= Math.max(1.6, voiceAt)) this.sceneryAction = null;
    }
    if (this.reveal > 0) {
      this.reveal = Math.max(0, this.reveal - dt);
      if (this.reveal === 0) {
        this.maybeHint();
        sayOnce('day1', 'vo_day1');
      }
    }
    for (const particle of this.particles) particle.age += dt;
    for (let i = this.particles.length - 1; i >= 0; i--) if ((this.particles[i] as Particle).age >= (this.particles[i] as Particle).life) this.particles.splice(i, 1);
  }

  render(ctx: CanvasRenderingContext2D): void {
    const state = this.state;
    const placing = this.currentGhost().ghost;
    const ghost = placing ? { ...placing, idle: this.ghostIdle() } : null;
    const hoverId = this.mode.kind === 'repair' || this.mode.kind === 'dismantle' ? this.hoverDevice?.id : undefined;
    const marksSilent = this.showRoutes && this.mode.kind !== 'build';
    const devices = state.yard.devices.map(d => dayDeviceVisual(d, d.id === hoverId, marksSilent && wasSilent(state, d)));
    const def = this.mode.kind === 'build' ? DEVICES[this.mode.type] : null;
    // Out of build mode, the trap under the pointer shows how far it reaches.
    const reaching = !def && this.hoverDevice && isTrap(this.hoverDevice.type) && !this.hoverDevice.broken ? this.hoverDevice : null;
    const reachDef = reaching ? DEVICES[reaching.type] : def;
    const frame: WorldFrame = {
      time: this.time,
      night: false,
      carPresent: true,
      sceneryAction: this.sceneryAction,
      devices,
      barricades: state.yard.barricades,
      houseHpRatio: state.yard.houseHp / HOUSE_MAX_HP,
      decals: state.yard.decals,
      enemies: [],
      particles: this.particles,
      ghost,
      // While placing something the routes are the whole point, so they show regardless of the toggle.
      ...(this.showRoutes || this.mode.kind === 'build' ? { routes: this.forecast().routes, traffic: this.forecast().traffic } : {}),
      hoverCell: reaching ? { x: reaching.x, y: reaching.y } : this.hover,
      hoverRadius: reachDef && reachDef.mode !== 'passive' ? Math.max(reachDef.radius, reachDef.reach) : 0,
      showBuildable: this.mode.kind === 'build',
      doorHighlight: this.inspectedDoor,
      doorRepairHp: this.previewHp ?? null,
      dismantleTarget: this.mode.kind === 'dismantle' ? hoverId ?? null : null,
    };

    ctx.fillStyle = '#120e09';
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    // The picture has the corners of its frame.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(RECT.x, RECT.y, RECT.w, RECT.h, FRAME_RADIUS);
    ctx.clip();
    drawWorld(ctx, this.view, frame);
    // The hour it is: the light warms as the daylight runs out, and the lamps come on before dark.
    applyDaylight(ctx, this.view, 1 - state.hoursLeft / DAY_HOURS, houseLights(this.rot, frame.barricades, frame.houseHpRatio), this.time);
    ctx.restore();

    if (this.reveal > 0) {
      // The smoke of the opening clears onto the fortified house.
      const t = this.reveal / 2.8;
      ctx.fillStyle = `rgba(207, 199, 184, ${t * t})`;
      ctx.fillRect(0, 0, STAGE_W, STAGE_H);
      const smoke = sprite('fx_smoke');
      if (smoke) {
        for (let i = 0; i < 9; i++) {
          const size = 520 + i * 40;
          ctx.globalAlpha = t * 0.6;
          ctx.drawImage(smoke.img, ((i * 173) % STAGE_W) - 200 - (1 - t) * 260 * (i % 2 ? 1 : -1), ((i * 97) % STAGE_H) - 220, size, size);
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  // ───────────────────────────── Input ─────────────────────────────

  private get quickRepair(): boolean {
    if (this.hoverDevice) return this.hoverDevice.broken;
    if (!this.hoverDoor) return false;
    const door = this.state.yard.barricades[this.hoverDoor];
    return door.hp < barricadeMaxHp(door.level);
  }

  private updateHover(pointer: Pointer, refreshInfo = false, inspected?: SectorId): void {
    const view = this.view;
    const before = `${this.hover?.x},${this.hover?.y},${this.hoverDevice?.id},${this.inspectedDoor}`;
    const inside = pointer.overCanvas && inView(view, pointer.x, pointer.y);
    if (inspected) this.panelDoor = inspected;
    else if (inside) this.panelDoor = null;
    if (!inside) {
      this.hover = null;
      this.hoverDevice = null;
      this.hoverDoor = null;
    } else {
      const g = unproject(view, pointer.x, pointer.y);
      const cell = { x: Math.floor(g.gx), y: Math.floor(g.gy) };
      this.hover = cell.x >= 0 && cell.y >= 0 && cell.x < GRID_W && cell.y < GRID_H ? cell : null;
      if (this.mode.kind === 'build') {
        this.hoverDevice = null;
        this.hoverDoor = null;
      } else {
        const visuals = this.state.yard.devices.map(d => dayDeviceVisual(d));
        const picked = pickDevice(view, visuals, pointer.x, pointer.y);
        this.hoverDevice = picked ? (this.state.yard.devices.find((d) => d.id === picked.id) ?? null) : null;
        this.hoverDoor = this.hoverDevice ? null : pickDoor(view, pointer.x, pointer.y);
      }
    }
    let cursor = '';
    if (inside) {
      if (this.mode.kind === 'repair' || this.mode.kind === 'dismantle') cursor = this.mode.kind;
      else if (this.mode.kind === 'idle' && this.quickRepair) cursor = 'repair';
    }
    if (this.app.canvas.dataset.yardCursor !== cursor) this.app.canvas.dataset.yardCursor = cursor;
    const after = `${this.hover?.x},${this.hover?.y},${this.hoverDevice?.id},${this.inspectedDoor}`;
    if (refreshInfo || before !== after) this.updateInfo();
  }

  onPointerDown(pointer: Pointer, event: PointerEvent): void {
    if (!inView(this.view, pointer.x, pointer.y)) return;
    this.drag = {
      x: pointer.x,
      y: pointer.y,
      cx: this.cx,
      cy: this.cy,
      moved: false,
      pan: event.button !== 0 || this.mode.kind === 'idle',
      secondary: event.button === 2,
      painted: false,
      stopped: false,
      last: null,
      aligned: false,
    };
    // Palisades are drawn, not clicked one by one: the first goes down at once, the rest follow the pointer.
    if (!this.drag.pan && this.paintsLine()) {
      this.updateHover(pointer);
      this.paint(true);
    }
  }

  private paintsLine(): boolean {
    return this.mode.kind === 'build' && DEVICES[this.mode.type].blocks;
  }

  /**
   * Builds the selected palisade on the hovered cell while the button is held. While dragging,
   * cells that cannot take one (built on, scenery) are passed over; running out of planks or of
   * daylight, or sealing a route, ends the line with the reason. The first cell is a plain click
   * and always answers.
   */
  private paint(first = false): void {
    const drag = this.drag;
    if (!drag || drag.stopped || this.mode.kind !== 'build' || !this.hover) return;
    drag.painted = true;
    const { x, y } = this.hover;
    if (!first) {
      const problem = placementProblem(this.state.yard, this.mode.type, x, y);
      if (problem?.code === 'occupied' || problem?.code === 'not_buildable') return;
      this.alignToStroke(x, y);
    }
    const id = this.state.yard.nextDeviceId;
    if (this.apply(build(this.state, this.mode.type, x, y, this.facing), '', 'build', this.hover)) drag.last = { x, y, id };
    else if (!first) drag.stopped = true;
  }

  /**
   * A drawn line of palisades runs the way it is drawn: once the stroke has a direction, the piece
   * in hand is turned to it, and so is the first palisade, which was laid before the direction was known.
   */
  private alignToStroke(x: number, y: number): void {
    const drag = this.drag;
    if (!drag?.last || drag.aligned) return;
    const dx = x - drag.last.x;
    const dy = y - drag.last.y;
    if (dx === 0 && dy === 0) return;
    drag.aligned = true;
    // Corner to corner: x and y moving together run toward the viewer, against each other run level.
    const along: Facing = Math.abs(dx) === Math.abs(dy) ? (dx * dy > 0 ? 3 : 2) : Math.abs(dx) > Math.abs(dy) ? 0 : 1;
    if (along === this.facing) return;
    this.facing = along;
    const realigned = turnDevice(this.state, drag.last.id, along);
    if (realigned.ok) {
      this.app.state = realigned.value;
      this.app.save();
    }
  }

  onPointerMove(pointer: Pointer): void {
    const drag = this.drag;
    if (drag && pointer.down) {
      const dx = pointer.x - drag.x;
      const dy = pointer.y - drag.y;
      if (Math.hypot(dx, dy) > 6) drag.moved = true;
      if (drag.moved && drag.pan) {
        // Screen delta → grid delta, undoing the isometric projection.
        const sign = this.rot === 0 ? 1 : -1;
        const wx = dx / this.zoom;
        const wy = dy / this.zoom;
        const dvx = wy / 32 + wx / 64;
        const dvy = wy / 32 - wx / 64;
        this.cx = panLimit(drag.cx - dvx * sign, GRID_W);
        this.cy = panLimit(drag.cy - dvy * sign, GRID_H);
        this.app.canvas.dataset.yardCursor = 'pan';
        this.refundTag.hidden = true;
        return;
      }
      if (!drag.pan && this.paintsLine()) {
        const before = this.hover;
        this.updateHover(pointer);
        if (this.hover && (this.hover.x !== before?.x || this.hover.y !== before?.y)) this.paint();
        return;
      }
    }
    this.updateHover(pointer);
  }

  onPointerUp(pointer: Pointer): void {
    const drag = this.drag;
    this.drag = null;
    if (!drag) return;
    this.updateHover(pointer, drag.moved && drag.pan);
    if ((drag.moved && drag.pan) || drag.painted) return;
    if (drag.secondary) this.turn();
    else this.click();
  }

  private click(): void {
    const s = S();
    const state = this.state;
    if (this.mode.kind === 'build') {
      if (!this.hover) return;
      const type = this.mode.type;
      this.apply(build(state, type, this.hover.x, this.hover.y, this.facing), '', 'build', this.hover);
      return;
    }
    if (this.mode.kind === 'repair' || (this.mode.kind === 'idle' && this.quickRepair)) {
      if (this.hoverDevice) this.apply(repairDevice(state, this.hoverDevice.id), s.day.repaired, 'build', this.hoverDevice);
      else if (this.hoverDoor) this.apply(repairBarricade(state, this.hoverDoor), s.day.repaired, 'build');
      return;
    }
    if (this.mode.kind === 'dismantle') {
      if (this.hoverDevice) {
        const at = this.hoverDevice;
        this.hoverDevice = null;
        this.apply(dismantle(state, at.id), s.day.dismantled, 'click', at);
      }
      return;
    }
    if (!this.hoverDevice && !this.hoverDoor) this.poke();
  }

  /** Nothing useful: the break's horn, and a washer down the well. Neither costs or changes anything. */
  private poke(): void {
    const prop = pickProp(this.view, ['car', 'well'], this.app.pointer.x, this.app.pointer.y);
    if (this.sceneryAction || (prop !== 'car' && prop !== 'well')) return;
    this.sceneryAction = { kind: prop, startedAt: this.time };
    audio.play(prop === 'car' ? 'horn' : 'washer');
  }

  onWheel(deltaY: number, pointer: Pointer): void {
    if (!inView(this.view, pointer.x, pointer.y)) return;
    const before = unproject(this.view, pointer.x, pointer.y);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * Math.exp(-deltaY * 0.0015)));
    const after = unproject(this.view, pointer.x, pointer.y);
    this.cx = panLimit(this.cx + before.gx - after.gx, GRID_W);
    this.cy = panLimit(this.cy + before.gy - after.gy, GRID_H);
    this.updateHover(pointer, true);
  }

  onKeyDown(code: string): void {
    if (code === 'KeyR') this.flip();
    else if (code === 'KeyF') this.turn();
    else if (code === 'KeyT') this.toggleRoutes();
    else if (code === 'Backspace') this.undo();
    else if (code === 'Escape') {
      if (this.mode.kind !== 'idle') this.setMode({ kind: 'idle' });
    } else if (code.startsWith('Digit')) {
      const type = DEVICE_TYPE_IDS[Number(code.slice(5)) - 1];
      if (type) this.setMode({ kind: 'build', type });
    }
  }
}

export { deviceAt };
