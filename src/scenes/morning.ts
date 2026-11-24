// The morning after: what the night cost, told by the yard itself.

import { epicFlag, wreckSector } from '../core/epics';
import { BARRICADE, DEVICES, HOUSE_MAX_HP } from '../core/data/devices';
import { chapterWaiting } from '../core/chapters';
import { bossOfNight, startNextDay } from '../core/game';
import { ENTRIES, sectorOf } from '../core/map';
import { silentTraps } from '../core/yard';
import type { GameState, NightHighlight } from '../core/types';
import { SECTOR_IDS } from '../core/types';
import { STAGE_H, type App, type Pointer, type Scene } from '../engine/app';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S, fmt, line } from '../engine/i18n';
import { calmMotion } from '../render/lighting';
import { MorningGarden } from '../render/morning-garden';
import { smoothstep } from '../render/noise';
import { cameraView, drawWorld, type View, type WorldFrame } from '../render/world';
import { drawPlate, oneArmed } from './common';
import { CassettePlayer } from './cassette';
import { goChapter, goDay } from './flow';

/** Cells around the highlighted spot that the inspection view rings, so it is found at a glance. */
const SPOT_RADIUS = 1.2;
const INSPECT_IN = 0.64;
const INSPECT_OUT = 0.46;

export class MorningScene implements Scene {
  private time = 0;
  private garden!: MorningGarden;
  private cassette: CassettePlayer | null = null;
  private inspecting = false;
  private inspectionProgress = 0;
  private inspection: { view: View; overview: View; frame: WorldFrame } | null = null;

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
    this.garden = new MorningGarden(night);
    const kills = report ? Object.values(report.kills).reduce((sum, n) => sum + (n ?? 0), 0) : 0;

    // The neighbour of the night: beaten, or gone home at first light.
    const boss = bossOfNight(night);
    const bossLine = boss ? (report?.bossDefeated === boss ? s.neighbor[boss].defeated : s.neighbor[boss].escaped) : s.morning.quiet;

    const silent = silentTraps(state).length;
    const row = (label: string, value: string, tone: '' | 'bad' | 'good' | 'warn' = ''): HTMLElement => el('tr', {}, [el('td', { text: label }), el('td', { class: tone, text: value })]);
    const rows = [
      row(s.morning.kills, String(kills), 'good'),
      ...(report?.indoorKills ? [row(s.morning.indoorKills, String(report.indoorKills))] : []),
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
    const card = el('div', { class: `card report${chapter ? ' tight' : ''}` }, [
      el('h2', { text: s.morning.title }),
      el('p', { text: fmt(s.morning.survived, { n: night }) }),
      el('table', {}, rows),
      el('p', { class: 'note', text: bossLine }),
      chapter ? el('p', { class: 'note alarm', text: s.chapter[chapter].note }) : null,
      el('div', { class: 'actions' }, [el('button', { class: 'btn btn-primary', text: chapter ? s.chapter[chapter].go : fmt(s.morning.next, { n: state.day + 1 }), onClick: () => this.next() })]),
    ]);
    this.app.ui.append(card);
    const letters = el('div', { class: 'morning-mail' });
    if (night === 5 || (night === 6 && epicFlag(state, 'neighbor'))) {
      letters.append(el('details', { class: 'morning-letter postal-paper' }, [
        el('summary', { text: night === 5 ? line('Traces dans la boue', 'Tracks in the mud') : line('La fenêtre d’en face', 'Across the street') }),
        el('p', { text: night === 6 ? line('Un cendrier sur le rebord. « Bien reçu, ducon. »', 'An ashtray on the sill. “Got it, asshole.”') : epicFlag(state, 'cub') ? line('Deux grandes pistes et une petite ressortent ensemble par le portail.', 'Two large sets of prints and a small one lead out through the gate together.') : line('Deux pistes longent la clôture. Sous le portail, de toutes petites griffes ont creusé la terre.', 'Two trails follow the fence. Tiny claws have dug into the dirt under the gate.') }),
      ]));
    }
    if (report?.letterDelivered === true) {
      letters.append(el('details', { class: 'morning-letter postal-paper' }, [
        el('summary', { text: s.registeredLetter.open }),
        el('p', { text: s.registeredLetter.postmark }),
        el('blockquote', { text: s.registeredLetter.complaint }),
      ]));
    }
    if (letters.childElementCount) this.app.ui.append(letters);
    // Reinforced doors badly hit make figures long enough to fold the labels beside them: set tighter, it all fits.
    if (card.scrollHeight > card.clientHeight) card.classList.add('tight');
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
      overview: view,
      frame: {
        time: 0,
        night: false,
        mopedWreck: wreckSector(this.state),
        carPresent: true,
        houseHpRatio: yard.houseHp / HOUSE_MAX_HP,
        barricades: yard.barricades,
        decals: yard.decals,
        enemies: [],
        particles: [],
        devices: yard.devices.map((d) => ({
          ...d, state: d.broken ? 'broken' : 'idle', hpRatio: d.hp / DEVICES[d.type].maxHp, highlight: d.id === device?.id,
        })),
        doorHighlight: highlight.kind === 'breach' ? sector : null,
        hoverCell: cell,
      },
    };

    const button = el('button', {
      class: 'btn',
      text: s.morning.inspect,
      onClick: () => {
        this.inspecting = !this.inspecting;
        button.textContent = this.inspecting ? s.morning.back : s.morning.inspect;
        button.setAttribute('aria-expanded', String(this.inspecting));
      },
    });
    button.setAttribute('aria-expanded', 'false');
    if (this.state.morningTape) {
      this.cassette = new CassettePlayer(this.state.morningTape, sector, !this.state.flags['birthdayTapeSeen'], () => {
        this.app.state = { ...this.state, flags: { ...this.state.flags, birthdayTapeSeen: 1 } };
        this.app.save();
      }, () => {
        if (!this.inspecting) button.click();
        button.focus();
      });
      this.app.ui.append(this.cassette.root);
    }
    return el('div', { class: 'card morning-headline' }, [el('div', {}, [el('strong', { text: label }), el('div', { text: detail })]), this.cassette?.launch, button]);
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
    this.cassette?.update(dt);
    this.inspectionProgress = this.inspecting
      ? Math.min(1, this.inspectionProgress + dt / INSPECT_IN)
      : Math.max(0, this.inspectionProgress - dt / INSPECT_OUT);
  }

  private painting(ctx: CanvasRenderingContext2D, still: boolean, alpha = 1): void {
    const plate = { zoom: 1.03 + (still ? 0 : 0.04 * smoothstep(0, 12, this.time)), focusX: 0.1, focusY: 0.5, oneArmed: oneArmed(this.app.state) };
    const bounds = drawPlate(ctx, 'plate_morning', { ...plate, alpha });
    if (bounds) {
      ctx.save(); ctx.globalAlpha = alpha;
      this.garden.draw(ctx, bounds, this.time, still);
      ctx.restore();
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const still = calmMotion();
    this.painting(ctx, still);
    const progress = still ? Number(this.inspecting) : this.inspectionProgress;
    if (!this.inspection || progress <= 0) return;
    const { view, overview, frame } = this.inspection;
    const focus = smoothstep(0, 1, progress);
    const visibility = smoothstep(0.04, 0.39, progress);
    if (visibility <= 0) return;
    const drift = (1 - focus) * 0.24;
    drawWorld(ctx, {
      ...view,
      cx: view.cx + (overview.cx - view.cx) * drift,
      cy: view.cy + (overview.cy - view.cy) * drift,
      zoom: view.zoom - 0.23 * (1 - focus),
    }, { ...frame, time: this.time, hoverRadius: SPOT_RADIUS * smoothstep(0.5, 1, progress) });
    if (visibility < 1) {
      // Dissolve from the same painting inside the inspection rectangle. The
      // world draws its own alpha layers, so the dissolve belongs over the shot.
      ctx.save();
      ctx.beginPath();
      ctx.rect(view.x, view.y, view.w, view.h);
      ctx.clip();
      this.painting(ctx, still, 1 - visibility);
      ctx.restore();
    }
  }

  onPointerMove(pointer: Pointer): void {
    if (pointer.overCanvas && !this.inspecting && this.inspectionProgress === 0 && !calmMotion() && (!this.cassette || this.cassette.root.hidden))
      this.garden.disturb(pointer.x, pointer.y, this.time);
  }

  onKeyDown(code: string, event: KeyboardEvent): void {
    if (this.cassette && !this.cassette.root.hidden) {
      if (code === 'Escape') this.cassette.close();
      return;
    }
    if (event.target instanceof HTMLElement && event.target.closest('button, summary, input')) return;
    if (code === 'Enter') this.next();
  }
}
