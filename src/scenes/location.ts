// A searchable interior. Each hotspot costs daylight and is emptied for good; what is found
// rides in the boot until the refuge. Someone else may already be standing at the best lot.

import { DAY_HOURS, LOCATIONS, SEARCH_HOURS } from '../core/data/locations';
import { clockLabel, leaveLocation, neighborStatus, prepareSearch, visitSearchLimit, type NeighborMeeting, type SearchOutcome } from '../core/game';
import { spotRng, type Puzzle } from '../core/scavenge';
import type { Dispute, GameState, LocationId } from '../core/types';
import { RESOURCE_IDS } from '../core/types';
import { STAGE_H, STAGE_W, type App, type Scene } from '../engine/app';
import { assetUrl } from '../engine/assets';
import { audio } from '../engine/audio';
import { rememberEnding } from '../engine/progress';
import { el } from '../engine/dom';
import { S, fmt, hours } from '../engine/i18n';
import { carDeparture, heroArt, costLine, drawPlate, inventoryBar, lootSfx, oneArmed, platePoint } from './common';
import { EncounterPanel, memoryLine, nameOf, roadPlate } from './encounter';
import { goAmbush, goEnd, goHomeStretch, goTravel } from './flow';
import { ScavengePanel } from './scavenge';

export class LocationScene implements Scene {
  private hud!: HTMLElement;
  private overlay!: HTMLElement;
  private panel!: EncounterPanel;
  private puzzle: ScavengePanel | null = null;
  private get escorted(): boolean {
    const location = LOCATIONS[this.id];
    const state = this.state;
    const key = `searches:${this.id}:${state.day}:${state.locations[this.id].visits}`;
    return (state.flags[key] ?? 0) >= visitSearchLimit(location, state.day);
  }

  constructor(
    private readonly app: App,
    private readonly id: LocationId,
    private meeting: NeighborMeeting | null,
  ) {}

  private get state(): GameState {
    if (!this.app.state) throw new Error('LocationScene needs a running game');
    return this.app.state;
  }

  /** Whoever claims a lot here, while that is not settled. */
  private get dispute(): Dispute | null {
    const encounter = this.state.encounter;
    return encounter?.kind === 'dispute' && encounter.location === this.id ? encounter : null;
  }

  enter(): void {
    audio.setAmbience('day');
    audio.setMusic('day');
    this.hud = el('div');
    this.overlay = el('div');
    this.app.ui.append(this.hud, this.overlay);
    this.panel = new EncounterPanel(this.app, this.overlay, {
      changed: () => this.refresh(),
      closed: () => this.refresh(),
      // Before anything is engaged, the rest of the place can be searched first.
      later: () => this.refresh(),
    });
    this.refresh();
    if (this.meeting) this.showMeeting(this.meeting);
    else if (this.dispute) this.panel.show();
  }

  private refresh(): void {
    const s = S();
    const state = this.state;
    const location = LOCATIONS[this.id];
    const progress = state.locations[this.id];
    const spotNames = s.spot[this.id] as Readonly<Record<string, string>>;
    const dispute = this.dispute;

    const topbar = el('div', { class: 'topbar' }, [
      el('span', { class: 'label-strong', text: s.location[this.id].name }),
      el('span', { class: 'sep' }),
      el('span', { text: clockLabel(state.hoursLeft) }),
      el('span', { class: 'meter' }, [el('i', { style: { width: `${(state.hoursLeft / DAY_HOURS) * 100}%` } })]),
      el('span', { class: 'muted', text: fmt(s.day.hoursLeft, { h: hours(state.hoursLeft) }) }),
      el('span', { class: 'grow' }),
      el('span', { class: 'muted', text: s.loc.trunk }),
      state.outing ? inventoryBar(state.outing.trunk) : null,
    ]);
    // What is already safe at home, to judge what this trip still has to bring back.
    const stash = el('div', { class: 'stash' }, [el('span', { class: 'muted', text: s.encounter.stash }), inventoryBar(state.inventory)]);

    const canStillSearch = state.hoursLeft + 1e-9 >= SEARCH_HOURS + location.travelHours;
    const spots = location.spots.map((spot, index) => {
      const p = platePoint(location.plate, spot.x, spot.y);
      const name = spotNames[spot.key] ?? spot.key;
      if (dispute?.spot === index) {
        const url = assetUrl(`por_rival_${dispute.rival}`);
        const face = el('img', {});
        if (url) face.src = url;
        return el('button', { class: 'spot claimed', style: { left: `${p.x}px`, top: `${p.y}px` }, title: s.encounter.claimed, onClick: () => this.panel.show() }, [
          el('span', { class: 'ring' }, [url ? face : '!']),
          el('span', { class: 'tag' }, [name, el('small', { text: nameOf(dispute.rival) })]),
        ]);
      }
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
          data: { spot: String(index) },
          onClick: () => this.search(index, p),
        },
        [el('span', { class: 'ring', text: done ? '✓' : '?' }), el('span', { class: 'tag' }, [name, done ? null : hint])],
      );
    });

    const neighbor = location.neighbor;
    const gone = neighbor && neighborStatus(neighbor, state.day) === 'gone';
    const claimedSpot = dispute ? (spotNames[location.spots[dispute.spot]?.key ?? ''] ?? '') : '';
    const title = el('div', { class: 'panel loc-title' }, [
      el('h3', { text: s.location[this.id].name }),
      el('p', {
        text: dispute
          ? fmt(s.encounter.spotted, { spot: claimedSpot })
          : gone && neighbor
            ? s.neighbor[neighbor].gone
            : this.escorted
              ? s.loc.escorted
              : !canStillSearch
                ? s.loc.noTime
                : fmt(s.loc.search, { h: hours(SEARCH_HOURS) }),
      }),
    ]);
    // Driving off leaves the lot to whoever is standing on it: said on the button, not after the fact.
    const leaveNote = dispute ? `${fmt(s.loc.leaveCost, { h: hours(location.travelHours) })} · ${fmt(s.encounter.leaveKeeps, { name: nameOf(dispute.rival) })}` : fmt(s.loc.leaveCost, { h: hours(location.travelHours) });
    const leave = el('div', { class: 'loc-leave' }, [el('button', { class: 'btn btn-primary', onClick: () => this.leave() }, [s.loc.leave, el('small', { text: leaveNote })])]);

    this.hud.replaceChildren(topbar, stash, ...spots, title, leave);
  }

  private showMeeting(meeting: NeighborMeeting): void {
    const s = S();
    const lines = s.neighbor[meeting.neighbor];
    const url = assetUrl(`por_${meeting.neighbor}_alive`);
    const portrait = el('img', { class: 'portrait' });
    if (url) portrait.src = url;
    const hasGift = Object.keys(meeting.gift).length > 0;
    const modal = el('div', { class: 'modal' }, [
      el('div', { class: 'card dialogue' }, [
        portrait,
        el('div', { class: 'body' }, [
          el('h2', { text: lines.name }),
          el('p', { text: meeting.first ? lines.first : lines.later }),
          meeting.first ? el('p', { class: 'note', text: lines.firstNote }) : null,
          hasGift ? el('p', {}, [costLine(meeting.gift, undefined, '+')]) : null,
          meeting.hoursLost > 0 ? el('p', { class: 'note', text: `− ${hours(meeting.hoursLost)} h` }) : null,
          el('div', { class: 'actions' }, [
            el('button', {
              class: 'btn btn-primary',
              text: 'OK',
              onClick: () => {
                audio.play('click');
                this.meeting = null;
                modal.remove();
              },
            }),
          ]),
        ]),
      ]),
    ]);
    this.overlay.append(modal);
    if (hasGift) audio.play('loot');
  }

  private search(index: number, at: { x: number; y: number }, retry = false): void {
    if (this.puzzle || this.meeting || this.panel.open) return;
    const s = S();
    const result = prepareSearch(this.state, index);
    if (!result.ok) {
      const code = result.error.code;
      if (code === 'already_searched') return;
      if (code === 'disputed' || code === 'busy') {
        this.panel.show();
        return;
      }
      audio.play('deny');
      if (code === 'escorted_out') {
        this.app.toast(s.loc.escorted, 'error');
        this.refresh();
      } else if (code === 'no_time') this.app.toast(s.loc.noTime, 'error');
      else this.app.toast(s.err.generic, 'error');
      return;
    }
    const location = LOCATIONS[this.id];
    const spot = location.spots[index]!;
    const puzzles: Readonly<Record<string, Puzzle>> = s.scavenge.spots[this.id];
    const names: Readonly<Record<string, string>> = s.spot[this.id];
    const close = (): void => {
      this.puzzle?.root.remove();
      this.puzzle = null;
      this.hud.inert = false;
      this.hud.querySelector<HTMLButtonElement>(`[data-spot="${index}"]`)?.focus();
    };
    const attempt = result.value;
    this.puzzle = new ScavengePanel(
      puzzles[spot.key]!, names[spot.key]!, spot, heroArt(location.plate, oneArmed(this.state)), spotRng(this.state.seed, this.id, spot.key),
      () => {
        close();
        this.collect(attempt.success, at);
      }, close,
      () => {
        this.app.state = attempt.paid;
        this.app.save();
        this.refresh();
      },
      message => {
        if (attempt.failure.fate === 'lift') {
          this.app.state = attempt.failure;
          this.app.save();
          this.puzzle!.root.inert = true;
          goEnd(this.app, { firstTime: rememberEnding('town.lift'), playLiftCollapse: true });
          return;
        }
        const next = prepareSearch(this.state, index);
        if (next.ok) this.puzzle?.showFailure(message, () => {
          close();
          this.search(index, at, true);
        });
        else {
          const reason = next.error.code === 'escorted_out' ? s.loc.escorted : s.loc.noTime;
          this.puzzle?.showFailure(`${message} ${reason}`, null);
        }
      },
    );
    this.hud.inert = true;
    this.overlay.append(this.puzzle.root);
    if (retry) this.puzzle.start();
    this.puzzle.focus();
  }

  private collect(result: SearchOutcome, at: { x: number; y: number }): void {
    audio.play('rummage');
    const found = lootSfx(result.loot);
    if (found) window.setTimeout(() => audio.play(found), 380);
    this.app.state = result.state;
    this.app.save();
    this.refresh();
    const pop = el('div', { class: 'loot-pop', style: { left: `${at.x}px`, top: `${at.y - 34}px` } }, [costLine(result.loot, undefined, '+')]);
    this.hud.append(pop);
    window.setTimeout(() => pop.remove(), 1900);
  }

  private leave(): void {
    const result = leaveLocation(this.state);
    if (!result.ok) return;
    carDeparture();
    const s = S();
    this.app.state = result.value.state;
    this.app.save();
    // A lot left behind on the way out is still a good turn: it is said on the drive home.
    const memory = result.value.forfeit ? memoryLine(result.value.forfeit) : null;
    const drive = fmt(s.loc.leaveCost, { h: hours(LOCATIONS[this.id].travelHours) });
    const sub = memory ? `${drive} · ${memory}` : drive;
    if (result.value.state.encounter) {
      // Seen from the wheel before anything is said: there is time to take it in.
      goTravel(this.app, { plate: roadPlate(result.value.state), title: s.encounter.road.title, sub: s.encounter.road.ahead, next: () => goAmbush(this.app) });
    } else goHomeStretch(this.app, sub);
  }

  update(dt: number): void {
    this.puzzle?.update(dt);
    this.panel.update(dt);
  }

  render(ctx: CanvasRenderingContext2D): void {
    drawPlate(ctx, LOCATIONS[this.id].plate, { oneArmed: oneArmed(this.app.state) });
    const dusk = 1 - this.state.hoursLeft / DAY_HOURS;
    ctx.fillStyle = `rgba(40, 30, 90, ${Math.max(0, dusk - 0.55) * 0.5})`;
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  }

  onKeyDown(code: string): void {
    if (this.state.phase === 'lost') return;
    if (this.puzzle) {
      if (code === 'Escape') this.puzzle.cancel();
      return;
    }
    this.panel.onKeyDown(code);
  }
}
