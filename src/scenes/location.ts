// A searchable interior. Each hotspot costs daylight and is emptied for good.

import { DAY_HOURS, LOCATIONS, SEARCH_HOURS } from '../core/data/locations';
import { CHIEF_SEARCH_LIMIT, clockLabel, neighborStatus, returnHome, searchSpot, type Encounter } from '../core/game';
import type { GameState, Inventory, LocationId, ResourceId } from '../core/types';
import { RESOURCE_IDS } from '../core/types';
import { STAGE_H, STAGE_W, type App, type Scene } from '../engine/app';
import { assetUrl } from '../engine/assets';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S, fmt, hours } from '../engine/i18n';
import { carDeparture, costLine, drawPlate, inventoryBar, lootSfx, platePoint, tripLine } from './common';
import { goDay, goTravel } from './flow';

export class LocationScene implements Scene {
  private root!: HTMLElement;
  private time = 0;
  private escorted = false;

  constructor(
    private readonly app: App,
    private readonly id: LocationId,
    private encounter: Encounter | null,
    /** Inventory when the break left the refuge, to show what this trip brought back. */
    private readonly leftWith?: Inventory,
  ) {}

  private get state(): GameState {
    if (!this.app.state) throw new Error('LocationScene needs a running game');
    return this.app.state;
  }

  enter(): void {
    audio.setAmbience('day');
    audio.setMusic('day');
    this.root = el('div');
    this.app.ui.append(this.root);
    this.refresh();
  }

  private refresh(): void {
    const s = S();
    const state = this.state;
    const location = LOCATIONS[this.id];
    const progress = state.locations[this.id];
    const spotNames = s.spot[this.id] as Readonly<Record<string, string>>;

    const topbar = el('div', { class: 'topbar' }, [
      el('span', { class: 'label-strong', text: s.location[this.id].name }),
      el('span', { class: 'sep' }),
      el('span', { text: clockLabel(state.hoursLeft) }),
      el('span', { class: 'meter' }, [el('i', { style: { width: `${(state.hoursLeft / DAY_HOURS) * 100}%` } })]),
      el('span', { class: 'muted', text: fmt(s.day.hoursLeft, { h: hours(state.hoursLeft) }) }),
      el('span', { class: 'grow' }),
      el('span', { class: 'muted', text: s.loc.trunk }),
      inventoryBar(state.inventory),
    ]);

    const canStillSearch = state.hoursLeft >= SEARCH_HOURS + location.travelHours;
    const spots = location.spots.map((spot, index) => {
      const p = platePoint(location.plate, spot.x, spot.y);
      const done = progress.searched.includes(index);
      const blocked = !done && (!canStillSearch || this.escorted);
      const hint = el(
        'span',
        { class: 'cost' },
        RESOURCE_IDS.filter((id) => spot.loot[id]).map((id) => {
          const url = assetUrl(`icons_${id}`);
          const img = el('img', { style: { width: '20px', height: '18px', objectFit: 'contain' } });
          if (url) img.src = url;
          return img;
        }),
      );
      return el(
        'button',
        {
          class: `spot ${done ? 'done' : ''} ${blocked ? 'blocked' : ''}`,
          style: { left: `${p.x}px`, top: `${p.y}px` },
          title: done ? s.loc.searched : fmt(s.loc.search, { h: hours(SEARCH_HOURS) }),
          onClick: () => this.search(index, p),
        },
        [el('span', { class: 'ring', text: done ? '✓' : '?' }), el('span', { class: 'tag' }, [spotNames[spot.key] ?? spot.key, done ? null : hint])],
      );
    });

    const neighbor = location.neighbor;
    const gone = neighbor && neighborStatus(neighbor, state.day) === 'gone';
    const title = el('div', { class: 'panel loc-title' }, [
      el('h3', { text: s.location[this.id].name }),
      el('p', {
        text: gone && neighbor ? s.neighbor[neighbor].gone : this.escorted ? s.loc.escorted : !canStillSearch ? s.loc.noTime : fmt(s.loc.search, { h: hours(SEARCH_HOURS) }),
      }),
    ]);
    const leave = el('div', { class: 'loc-leave' }, [
      el('button', { class: 'btn btn-primary', onClick: () => this.leave() }, [s.loc.leave, el('small', { text: fmt(s.loc.leaveCost, { h: hours(location.travelHours) }) })]),
    ]);

    this.root.replaceChildren(topbar, ...spots, title, leave);
    if (this.encounter) this.showEncounter(this.encounter);
  }

  private showEncounter(encounter: Encounter): void {
    const s = S();
    const lines = s.neighbor[encounter.neighbor];
    const url = assetUrl(`por_${encounter.neighbor}_alive`);
    const portrait = el('img', { class: 'portrait' });
    if (url) portrait.src = url;
    const hasGift = Object.keys(encounter.gift).length > 0;
    const modal = el('div', { class: 'modal' }, [
      el('div', { class: 'card dialogue' }, [
        portrait,
        el('div', { class: 'body' }, [
          el('h2', { text: lines.name }),
          el('p', { text: encounter.first ? lines.first : lines.later }),
          encounter.first ? el('p', { class: 'note', text: lines.firstNote }) : null,
          hasGift ? el('p', {}, [costLine(encounter.gift, undefined, '+')]) : null,
          encounter.hoursLost > 0 ? el('p', { class: 'note', text: `− ${hours(encounter.hoursLost)} h` }) : null,
          el('div', { class: 'actions' }, [
            el('button', {
              class: 'btn btn-primary',
              text: 'OK',
              onClick: () => {
                audio.play('click');
                this.encounter = null;
                modal.remove();
              },
            }),
          ]),
        ]),
      ]),
    ]);
    this.root.append(modal);
    if (hasGift) audio.play('loot');
  }

  private search(index: number, at: { x: number; y: number }): void {
    const s = S();
    const result = searchSpot(this.state, index);
    if (!result.ok) {
      const code = result.error.code;
      if (code === 'already_searched') return;
      audio.play('deny');
      if (code === 'escorted_out') {
        this.escorted = true;
        this.app.toast(s.loc.escorted, 'error');
        this.refresh();
      } else if (code === 'no_time') this.app.toast(s.loc.noTime, 'error');
      else this.app.toast(s.err.generic, 'error');
      return;
    }
    audio.play('rummage');
    const found = lootSfx(result.value.loot);
    if (found) window.setTimeout(() => audio.play(found), 380);
    this.app.state = result.value.state;
    this.app.save();
    this.refresh();
    const pop = el('div', { class: 'loot-pop', style: { left: `${at.x}px`, top: `${at.y - 34}px` } }, [costLine(result.value.loot, undefined, '+')]);
    this.root.append(pop);
    window.setTimeout(() => pop.remove(), 1900);

    const location = LOCATIONS[this.id];
    const visitKey = `searches:${this.id}:${this.state.day}:${this.state.locations[this.id].visits}`;
    if (location.neighbor === 'chief' && neighborStatus('chief', this.state.day) === 'alive' && (this.state.flags[visitKey] ?? 0) >= CHIEF_SEARCH_LIMIT) {
      this.escorted = true;
      this.refresh();
    }
  }

  private leave(): void {
    const result = returnHome(this.state);
    if (!result.ok) return;
    const day = this.state.day;
    carDeparture();
    const s = S();
    const loot: Partial<Record<ResourceId, number>> = {};
    if (this.leftWith) for (const id of RESOURCE_IDS) loot[id] = Math.max(0, result.value.inventory[id] - this.leftWith[id]);
    this.app.state = result.value;
    this.app.save();
    goTravel(this.app, {
      plate: Object.values(loot).some((n) => (n ?? 0) > 0) ? 'plate_trunk' : 'plate_return',
      title: s.location.home,
      sub: fmt(s.loc.leaveCost, { h: hours(LOCATIONS[this.id].travelHours) }),
      loot,
      next: () => {
        goDay(this.app);
        tripLine('home', day);
      },
    });
  }

  update(dt: number): void {
    this.time += dt;
  }

  render(ctx: CanvasRenderingContext2D): void {
    drawPlate(ctx, LOCATIONS[this.id].plate);
    const dusk = 1 - this.state.hoursLeft / DAY_HOURS;
    ctx.fillStyle = `rgba(40, 30, 90, ${Math.max(0, dusk - 0.55) * 0.5})`;
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  }

  onKeyDown(code: string): void {
    if (code === 'Escape' && !this.encounter) this.leave();
  }
}
