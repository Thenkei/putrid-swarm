// The morning after: what the night cost, told by the yard itself.

import { BARRICADE, DEVICES, HOUSE_MAX_HP } from '../core/data/devices';
import { chapterWaiting } from '../core/chapters';
import { bossOfNight, startNextDay } from '../core/game';
import { ENTRIES, sectorOf } from '../core/map';
import { silentTraps } from '../core/yard';
import type { GameState, NightHighlight } from '../core/types';
import { SECTOR_IDS } from '../core/types';
import { STAGE_H, type App, type Scene } from '../engine/app';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S, fmt } from '../engine/i18n';
import { cameraView, drawWorld, type View, type WorldFrame } from '../render/world';
import { drawPlate, oneArmed } from './common';
import { goChapter, goDay } from './flow';

/** Cells around the highlighted spot that the inspection view rings, so it is found at a glance. */
const SPOT_RADIUS = 1.2;

export class MorningScene implements Scene {
  private time = 0;
  private inspecting = false;
  private inspection: { view: View; frame: WorldFrame } | null = null;

  constructor(private readonly app: App) {}

  private get state(): GameState {
    if (!this.app.state) throw new Error('MorningScene needs a running game');
    return this.app.state;
  }

  enter(): void {
    audio.setAmbience('day');
    audio.setMusic('morning');
    const s = S();
    const state = this.state;
    const report = state.lastNight;
    const night = report?.night ?? state.day;
    const kills = report ? Object.values(report.kills).reduce((sum, n) => sum + (n ?? 0), 0) : 0;

    // The neighbour of the night: beaten, or gone home at first light.
    const boss = bossOfNight(night);
    const bossLine = boss ? (report?.bossDefeated === boss ? s.neighbor[boss].defeated : s.neighbor[boss].escaped) : s.morning.quiet;

    const silent = silentTraps(state).length;
    const row = (label: string, value: string, tone: '' | 'bad' | 'good' | 'warn' = ''): HTMLElement => el('tr', {}, [el('td', { text: label }), el('td', { class: tone, text: value })]);
    const rows = [
      row(s.morning.kills, String(kills), 'good'),
      row(s.morning.autoTriggers, String(report?.autoTriggers ?? 0)),
      row(s.morning.triggers, String(report?.triggers ?? 0)),
      row(s.morning.breaches, String(report?.breaches ?? 0), (report?.breaches ?? 0) > 0 ? 'bad' : 'good'),
      row(s.morning.devices, String(report?.devicesBroken ?? 0), (report?.devicesBroken ?? 0) > 0 ? 'bad' : 'good'),
      // Working traps nobody walked into: the yard marks which ones, the day after.
      ...(silent > 0 ? [row(s.morning.silent, String(silent), 'warn')] : []),
      row(s.morning.house, `${state.yard.houseHp} / ${HOUSE_MAX_HP}${report && report.houseDamage > 0 ? `  (−${report.houseDamage})` : ''}`, report && report.houseDamage > 0 ? 'bad' : 'good'),
      ...SECTOR_IDS.map((sector) => {
        const barricade = state.yard.barricades[sector];
        const lost = report?.barricadeDamage[sector] ?? 0;
        return row(fmt(s.day.door, { sector: s.sector[sector] }), `${barricade.hp} / ${BARRICADE.maxHp[barricade.level]}${lost > 0 ? `  (−${lost})` : ''}`, barricade.hp <= 0 ? 'bad' : '');
      }),
    ];

    // A chapter waiting for this morning comes before anything else: a camera gone dark, someone in the shed.
    const chapter = chapterWaiting(state);
    const dark = chapter !== null ? report?.cameraLost ?? null : null;
    if (dark) rows.push(row(fmt(s.night.cam, { i: String(SECTOR_IDS.indexOf(dark) + 1).padStart(2, '0'), name: s.sector[dark] }), s.morning.signal, 'bad'));
    this.app.ui.append(
      el('div', { class: `card report${chapter ? ' tight' : ''}` }, [
        el('h2', { text: s.morning.title }),
        el('p', { text: fmt(s.morning.survived, { n: night }) }),
        el('table', {}, rows),
        el('p', { class: 'note', text: bossLine }),
        chapter ? el('p', { class: 'note alarm', text: s.chapter[chapter].note }) : null,
        el('div', { class: 'actions' }, [el('button', { class: 'btn btn-primary', text: chapter ? s.chapter[chapter].go : fmt(s.morning.next, { n: state.day + 1 }), onClick: () => this.next() })]),
      ]),
    );
    // On the scene, not in the report: a chapter morning already fills the card to its last line.
    const headline = report?.highlight ? this.headline(report.highlight) : null;
    if (headline) this.app.ui.append(headline);
  }

  private headline(highlight: NightHighlight): HTMLElement | null {
    const s = S();
    const yard = this.state.yard;
    const device = highlight.kind === 'breach' ? null : yard.devices.find((d) => d.id === highlight.deviceId);
    const cell = highlight.kind === 'breach' ? ENTRIES[highlight.sector] : device;
    if (!cell) return null;
    const sector = highlight.kind === 'breach' ? highlight.sector : sectorOf(cell.x, cell.y);
    const label = device ? `${s.sector[sector]} · ${s.device[device.type].name}` : s.sector[sector];
    const detail = highlight.kind === 'catch' ? fmt(s.morning.caught, { n: highlight.kills }) : s.morning[highlight.kind];

    // Keep the morning open while the player looks around, including on a chapter morning.
    const view = cameraView(sector, { x: 20, y: 28, w: 766, h: STAGE_H - 56 }, 1.2);
    this.inspection = {
      view: { ...view, cx: cell.x + 0.5, cy: cell.y + 0.5 },
      frame: {
        time: 0,
        night: false,
        carPresent: true,
        barricades: yard.barricades,
        decals: yard.decals,
        enemies: [],
        particles: [],
        devices: yard.devices.map((d) => ({
          ...d, state: d.broken ? 'broken' : 'idle', hpRatio: d.hp / DEVICES[d.type].maxHp, highlight: d.id === device?.id,
        })),
        doorHighlight: highlight.kind === 'breach' ? sector : null,
        // The renderer only marks a hovered cell that has a radius: this ring is what points at the spot.
        hoverCell: cell,
        hoverRadius: SPOT_RADIUS,
      },
    };

    const button = el('button', {
      class: 'btn',
      text: s.morning.inspect,
      onClick: () => {
        this.inspecting = !this.inspecting;
        button.textContent = this.inspecting ? s.morning.back : s.morning.inspect;
      },
    });
    return el('div', { class: 'card morning-headline' }, [el('div', {}, [el('strong', { text: label }), el('div', { text: detail })]), button]);
  }

  /** On to the day — or to the chapter this morning is waiting for. */
  private next(): void {
    const chapter = chapterWaiting(this.state);
    if (chapter) {
      goChapter(this.app, chapter);
      return;
    }
    this.app.state = startNextDay(this.state);
    this.app.save();
    goDay(this.app);
  }

  update(dt: number): void {
    this.time += dt;
  }

  render(ctx: CanvasRenderingContext2D): void {
    drawPlate(ctx, 'plate_morning', { zoom: 1.03 + this.time * 0.003, focusX: 0.1, focusY: 0.5, oneArmed: oneArmed(this.app.state) });
    if (this.inspecting && this.inspection) {
      drawWorld(ctx, this.inspection.view, { ...this.inspection.frame, time: this.time });
    }
  }

  onKeyDown(code: string, event: KeyboardEvent): void {
    if (event.target instanceof HTMLButtonElement) return;
    if (code === 'Enter') this.next();
  }
}
