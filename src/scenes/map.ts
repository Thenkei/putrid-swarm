// The village map: pick a destination for the break, or stay home.

import { DAY_HOURS, HOME_PIN, LOCATIONS, type LocationDef } from '../core/data/locations';
import { clockLabel, isUnlocked, neighborStatus, plannedSearches, roundTripHours, travelTo } from '../core/game';
import type { GameState, LocationId } from '../core/types';
import { LOCATION_IDS } from '../core/types';
import { STAGE_H, STAGE_W, type App, type Scene } from '../engine/app';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S, fmt, hours } from '../engine/i18n';
import { carDeparture, drawPlate, inventoryBar, platePoint, tripLine } from './common';
import { goDay, goLocation, goTravel } from './flow';

const MAP_PLATE = 'plate_map';
const MAP_FOCUS_Y = 0.25;

export class MapScene implements Scene {
  private root!: HTMLElement;
  private selected: LocationId | null = null;
  private time = 0;

  constructor(private readonly app: App) {}

  private get state(): GameState {
    if (!this.app.state) throw new Error('MapScene needs a running game');
    return this.app.state;
  }

  enter(): void {
    audio.setAmbience('day');
    audio.setMusic('day');
    this.root = el('div');
    this.app.ui.append(this.root);
    this.refresh();
  }

  private remaining(location: LocationDef): number {
    return location.spots.length - this.state.locations[location.id].searched.length;
  }

  private refresh(): void {
    const s = S();
    const state = this.state;

    const topbar = el('div', { class: 'topbar' }, [
      el('span', { class: 'label-strong', text: s.map.title }),
      el('span', { class: 'sep' }),
      el('span', { text: clockLabel(state.hoursLeft) }),
      el('span', { class: 'meter' }, [el('i', { style: { width: `${(state.hoursLeft / DAY_HOURS) * 100}%` } })]),
      el('span', { class: 'muted', text: fmt(s.day.hoursLeft, { h: hours(state.hoursLeft) }) }),
      el('span', { class: 'grow' }),
      inventoryBar(state.inventory),
    ]);

    const pins = LOCATION_IDS.map((id) => {
      const location = LOCATIONS[id];
      const p = platePoint(MAP_PLATE, location.pin.x, location.pin.y, MAP_FOCUS_Y);
      const unlocked = isUnlocked(location, state.day);
      const left = this.remaining(location);
      const sub = !unlocked ? fmt(s.map.locked, { n: location.unlockDay }) : left > 0 ? fmt(s.map.left, { n: left }) : s.map.empty;
      return el(
        'button',
        {
          class: `pin ${unlocked ? '' : 'locked'} ${this.selected === id ? 'sel' : ''}`,
          style: { left: `${p.x}px`, top: `${p.y}px` },
          onClick: () => {
            audio.play('click');
            this.selected = id;
            this.refresh();
          },
        },
        [el('span', { class: 'tag' }, [s.location[id].name, el('small', { text: sub })]), el('span', { class: 'stem' }), el('span', { class: 'dot' })],
      );
    });
    const home = platePoint(MAP_PLATE, HOME_PIN.x, HOME_PIN.y, MAP_FOCUS_Y);
    pins.push(
      el('button', { class: 'pin home', style: { left: `${home.x}px`, top: `${home.y}px` }, onClick: () => goDay(this.app) }, [
        el('span', { class: 'tag' }, [s.location.home, el('small', { text: s.map.stayHome })]),
        el('span', { class: 'stem' }),
        el('span', { class: 'dot' }),
      ]),
    );

    this.root.replaceChildren(topbar, ...pins, this.card());
  }

  private card(): HTMLElement {
    const s = S();
    const state = this.state;
    const back = el('button', { class: 'btn', text: s.map.home, onClick: () => goDay(this.app) });
    if (!this.selected) return el('div', { class: 'panel map-card' }, [el('p', { class: 'muted', text: s.day.hint2 }), back]);

    const location = LOCATIONS[this.selected];
    const id = location.id;
    const unlocked = isUnlocked(location, state.day);
    const enough = state.hoursLeft + 1e-9 >= roundTripHours(location);
    const neighbor = location.neighbor;
    const lines: (HTMLElement | string)[] = [
      el('h3', { text: s.location[id].name }),
      el('p', {}, [
        s.location[id].hint,
        el('br'),
        el('span', { class: 'muted', text: `${fmt(s.map.travel, { h: hours(location.travelHours) })} · ${fmt(s.map.roundTrip, { h: hours(roundTripHours(location)) })}` }),
      ]),
    ];
    if (neighbor && unlocked && neighborStatus(neighbor, state.day) === 'gone') lines.push(el('p', { class: 'muted', text: s.neighbor[neighbor].gone }));
    const reason = !unlocked ? fmt(s.map.locked, { n: location.unlockDay }) : !enough ? s.map.noTime : '';
    if (reason) lines.push(el('p', { style: { color: '#ff8a78' }, text: reason }));
    else {
      const count = plannedSearches(state, location);
      lines.push(el('p', { text: count > 0 ? fmt(s.map.searchBudget, { n: count }) : s.map.noSearches }));
    }
    lines.push(
      el('button', {
        class: 'btn btn-primary',
        text: s.map.drive,
        disabled: !unlocked || !enough,
        onClick: () => this.drive(id),
      }),
    );
    lines.push(el('div', { style: { height: '8px' } }), back);
    return el('div', { class: 'panel map-card' }, lines);
  }

  private drive(id: LocationId): void {
    const result = travelTo(this.state, id);
    if (!result.ok) {
      audio.play('deny');
      this.app.toast(result.error.code === 'no_time' ? S().map.noTime : S().err.generic, 'error');
      return;
    }
    carDeparture();
    tripLine('car', this.state);
    this.app.state = result.value.state;
    this.app.save();
    const s = S();
    const { meeting } = result.value;
    goTravel(this.app, {
      // The two village concept plates alternate so the drive does not always look the same.
      plate: LOCATION_IDS.indexOf(id) % 2 === 0 ? 'plate_village' : 'plate_town',
      title: s.location[id].name,
      sub: fmt(s.map.travel, { h: hours(LOCATIONS[id].travelHours) }),
      next: () => goLocation(this.app, id, meeting),
    });
  }

  update(dt: number): void {
    this.time += dt;
  }

  render(ctx: CanvasRenderingContext2D): void {
    drawPlate(ctx, MAP_PLATE, { focusY: MAP_FOCUS_Y });
    // Late light as the day runs out.
    const dusk = 1 - this.state.hoursLeft / DAY_HOURS;
    ctx.fillStyle = `rgba(40, 30, 90, ${Math.max(0, dusk - 0.55) * 0.55})`;
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  }

  onKeyDown(code: string): void {
    if (code === 'Escape') goDay(this.app);
  }
}
