// A searchable interior. Each hotspot costs daylight and is emptied for good; what is found
// rides in the boot until the refuge. Someone else may already be standing at the best lot.

import { epicObject } from './epic-day';
import { ShopLife } from './shop-life';
import { MechanicVisit } from './mechanic-visit';
import { ChiefStation } from './chief-station';
import { CONCEAL_HOURS, DAY_HOURS, HARDWARE_SPRING_BIN, LOCATIONS, SEARCH_HOURS, SPRING_RECEIPT_OFFER } from '../core/data/locations';
import { gradeFinish, type Finish } from '../core/finish';
import { clockLabel, concealableSpots, concealSpot, leaveLocation, neighborStatus, noticeChiefEscort, prepareSearch, searchAttemptKey, searchStop, takeSpringReceipt, type NeighborMeeting, type SearchOutcome, type SearchStop } from '../core/game';
import { hasViceLeftovers } from '../core/garage-vice';
import { spotRng, type Puzzle } from '../core/scavenge';
import { puzzleLevel } from '../core/difficulty';
import { spotRevealed } from '../core/planque';
import { makeNoise, NOISE_PER_LOST_SEARCH, searchesLostToNoise, streetNoise } from '../core/street-noise';
import type { Cost, Dispute, GameState, LocationId } from '../core/types';
import { RESOURCE_IDS } from '../core/types';
import { STAGE_H, STAGE_W, type App, type Scene } from '../engine/app';
import { assetUrl, sprite } from '../engine/assets';
import { audio } from '../engine/audio';
import { rememberEnding } from '../engine/progress';
import { el } from '../engine/dom';
import { S, fmt, hours } from '../engine/i18n';
import { hush, say } from '../engine/voice';
import { calmMotion } from '../render/lighting';
import { smoothstep } from '../render/noise';
import { heroArt, costLine, drawPlate, inventoryBar, lootSfx, oneArmed, platePoint, returnCargoBar } from './common';
import { EncounterPanel, memoryLine, nameOf, roadPlate } from './encounter';
import { goAmbush, goEnd, goHomeStretch, goTravel } from './flow';
import { ScavengePanel } from './scavenge';
import { hasCrossbow } from '../core/crossbow';
import { hasDetector } from '../core/dead-channel';
import { hasSiren } from '../core/siren';
import { shouldStopAtDusk } from '../core/crossbow-road';

const SEARCH_DUST_SECONDS = 0.78;

const LOOTING_GRUMBLES = ['vo_looted_again', 'vo_looted_again_2', 'vo_looted_again_3'] as const;

export class LocationScene implements Scene {
  private hud!: HTMLElement;
  private overlay!: HTMLElement;
  private panel!: EncounterPanel;
  private puzzle: ScavengePanel | null = null;
  private mechanicVisit: MechanicVisit | null = null;
  private chiefStation: ChiefStation | null = null;
  private concealing = false;
  private readonly roomLife: ShopLife;
  private searchDust: { readonly x: number; readonly y: number; age: number } | null = null;
  /** Whether this visit's searching is over, and why. */
  private get stop(): SearchStop | null {
    return searchStop(this.state, LOCATIONS[this.id]);
  }

  private get stopLine(): string {
    return this.stop === 'noise' ? S().streetNoise.tooLoud : S().loc.escorted;
  }

  constructor(
    private readonly app: App,
    private readonly id: LocationId,
    private meeting: NeighborMeeting | null,
  ) { this.roomLife = new ShopLife(id); }

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
    const lootNotice = this.state.outing?.lootNotice;
    if (lootNotice) void this.reactToLooting(lootNotice);
    if (this.meeting) this.showMeeting(this.meeting);
    else if (this.dispute) this.panel.show();
    else this.checkEscort();
  }

  private async reactToLooting(notice: number): Promise<void> {
    const line = notice === 1 ? 'vo_looted' : LOOTING_GRUMBLES[(notice - 2) % LOOTING_GRUMBLES.length]!;
    await audio.prepareSample(line);
    const state = this.app.state;
    if (state?.where !== this.id || state.outing?.lootNotice !== notice) return;
    const { lootNotice, ...outing } = state.outing;
    hush();
    say(line);
    this.app.state = { ...state, outing };
    this.app.save();
  }

  private refresh(): void {
    const s = S();
    const state = this.state;
    const location = LOCATIONS[this.id];
    const progress = state.locations[this.id];
    const spotNames = s.spot[this.id] as Readonly<Record<string, string>>;
    const dispute = this.dispute;
    const coverTargets = concealableSpots(state);

    const topbar = el('div', { class: 'topbar' }, [
      el('span', { class: 'label-strong', text: s.location[this.id].name }),
      el('span', { class: 'sep' }),
      el('span', { text: clockLabel(state.hoursLeft) }),
      el('span', { class: 'meter' }, [el('i', { style: { width: `${(state.hoursLeft / DAY_HOURS) * 100}%` } })]),
      el('span', { class: 'muted', text: fmt(s.day.hoursLeft, { h: hours(state.hoursLeft) }) }),
      el('span', { class: 'grow' }),
      hasCrossbow(state) ? el('span', { class: 'equipment-chip', text: s.scavenge.crossbow.name }) : null,
      ...returnCargoBar(state),
    ]);
    // What is already safe at home, to judge what this trip still has to bring back.
    const stash = el('div', { class: 'stash' }, [el('span', { class: 'muted', text: s.encounter.stash }), inventoryBar(state.inventory)]);

    const canStillSearch = state.hoursLeft + 1e-9 >= SEARCH_HOURS + location.travelHours;
    const spots = location.spots.map((spot, index) => {
      if (!spotRevealed(state, spot)) return null;
      const p = platePoint(location.plate, spot.x, spot.y);
      const name = spotNames[spot.key] ?? spot.key;
      if (dispute?.spot === index) {
        const url = assetUrl(`por_rival_${dispute.rival}`);
        const face = el('img', {});
        if (url) face.src = url;
        return el('button', { class: 'spot claimed', style: { left: `${p.x}px`, top: `${p.y}px` }, title: s.encounter.claimed, disabled: this.concealing, onClick: () => this.panel.show() }, [
          el('span', { class: 'ring' }, [url ? face : '!']),
          el('span', { class: 'tag' }, [name, el('small', { text: nameOf(dispute.rival) })]),
        ]);
      }
      const done = progress.searched.includes(index);
      const looted = progress.looted.includes(index);
      const covered = progress.covered.includes(index);
      const opened = !done && hasViceLeftovers(state, this.id, index);
      const coverTarget = this.concealing && coverTargets.includes(index);
      const receipt = looted && this.id === 'hardware' && index === HARDWARE_SPRING_BIN && state.springReceipt === 'left';
      const blocked = !done && !opened && !this.concealing && (!canStillSearch || this.stop !== null);
      const status = coverTarget ? s.stashCover.target
        : receipt ? covered ? s.stashCover.tornReceipt : s.springReceipt.found
        : covered ? looted ? s.stashCover.torn : s.stashCover.intact
        : looted ? s.loc.looted
        : opened ? s.viceLeftovers.found : null;
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
          class: `spot ${done ? 'done' : ''} ${looted ? 'looted' : ''} ${blocked ? 'blocked' : ''} ${receipt ? 'has-receipt' : ''} ${covered ? 'covered' : ''} ${coverTarget ? 'cover-target' : ''} ${opened ? 'vice-leftovers' : ''}`,
          style: { left: `${p.x}px`, top: `${p.y}px` },
          title: status ?? (done ? s.loc.searched : fmt(s.loc.search, { h: hours(SEARCH_HOURS) })),
          disabled: this.concealing && !coverTarget,
          data: { spot: String(index) },
          onClick: () => {
            if (this.concealing) this.hideStash(index);
            else if (receipt) this.showSpringReceipt();
            else this.search(index, p);
          },
        },
        [
          el('span', { class: 'ring', text: looted ? '×' : done ? '✓' : covered ? '▰' : '?' }),
          el('span', { class: 'tag' }, [name, status ? el('small', { text: status }) : null, done || opened || this.concealing ? null : hint]),
        ],
      );
    });

    const neighbor = location.neighbor;
    const gone = neighbor && neighborStatus(neighbor, state.day) === 'gone';
    const claimedSpot = dispute ? (spotNames[location.spots[dispute.spot]?.key ?? ''] ?? '') : '';
    const hoursOnReturn = state.hoursLeft - location.travelHours;
    const dusk = shouldStopAtDusk(state, hoursOnReturn);
    const lastSearchBeforeDusk =
      !dusk && canStillSearch && this.stop === null &&
      shouldStopAtDusk(state, hoursOnReturn - SEARCH_HOURS) &&
      spots.some((spot, index) => spot !== null && index !== dispute?.spot && !progress.searched.includes(index) && !hasViceLeftovers(state, this.id, index));
    const title = el('div', { class: 'panel loc-title' }, [
      el('p', {
        text: this.concealing ? s.stashCover.choose : dispute
          ? fmt(s.encounter.spotted, { spot: claimedSpot })
          : gone && neighbor
            ? s.neighbor[neighbor].gone
            : this.stop
              ? this.stopLine
              : !canStillSearch
                ? s.loc.noTime
                : fmt(s.loc.search, { h: hours(SEARCH_HOURS) }),
      }),
      coverTargets.length > 0 || this.concealing ? el('button', {
        class: 'btn conceal-button',
        text: this.concealing ? s.stashCover.cancel : fmt(s.stashCover.start, { n: CONCEAL_HOURS * 60 }),
        onClick: () => this.toggleConceal(),
      }) : null,
    ]);
    // Driving off leaves the lot to whoever is standing on it: said on the button, not after the fact.
    const drive = fmt(s.loc.leaveCost, { h: hours(location.travelHours) });
    const leaveNote = dispute ? `${drive} · ${fmt(s.encounter.leaveKeeps, { name: nameOf(dispute.rival) })}` : drive;
    const leave = el('div', { class: 'loc-leave' }, [el('button', { class: 'btn btn-primary', onClick: () => this.leave() }, [
      s.loc.leave, el('small', { text: leaveNote }), dusk ? el('small', { class: 'road-warning', text: s.crossbowRoad.warning }) : null,
    ])]);
    const thought = lastSearchBeforeDusk ? el('p', { class: 'panel last-search-thought', text: s.crossbowRoad.lastSearch }) : null;

    this.hud.replaceChildren(topbar, stash, this.noiseGauge(), ...spots.filter(spot => spot !== null), title, leave);
    const curiosity = !this.concealing && !this.stop && epicObject(this.app, () => this.refresh());
    if (curiosity) this.hud.append(curiosity);
    if (thought) this.hud.append(thought);
  }

  private showSpringReceipt(): void {
    this.showStashNote(HARDWARE_SPRING_BIN, S().springReceipt, SPRING_RECEIPT_OFFER, () => {
      const state = this.state;
      const next = takeSpringReceipt(state);
      if (next === state) return;
      this.app.state = next;
      this.app.save();
      this.refresh();
      audio.play('loot');
    });
  }

  private toggleConceal(): void {
    if (this.meeting || this.panel.open || this.hud.inert) return;
    this.concealing = !this.concealing;
    this.refresh();
    this.hud.querySelector<HTMLButtonElement>(this.concealing ? '.cover-target' : '.conceal-button')?.focus();
  }

  private hideStash(index: number): void {
    this.concealing = false;
    const state = this.state;
    const next = concealSpot(state, index);
    if (next !== state) {
      this.app.state = next;
      this.app.save();
      audio.play('rummage');
    }
    this.refresh();
    this.hud.querySelector<HTMLButtonElement>(`[data-spot="${index}"]`)?.focus();
  }

  private showStashNote(
    index: number,
    copy: { readonly title: string; readonly note: string; readonly reaction?: string; readonly take: string; readonly leave: string },
    loot: Cost,
    collect: () => void,
  ): void {
    if (this.panel.open || this.hud.inert) return;
    const close = (): void => {
      modal.remove();
      this.hud.inert = false;
      this.hud.querySelector<HTMLButtonElement>(`[data-spot="${index}"]`)?.focus();
    };
    const leave = el('button', { class: 'btn', text: copy.leave, onClick: close });
    const take = el('button', { class: 'btn btn-primary', onClick: () => {
      if (!modal.isConnected) return;
      collect();
      close();
    } }, [copy.take, el('small', {}, [costLine(loot, undefined, '+')])]);
    const card = el('div', { class: 'card stash-note' }, [
      el('h2', { text: copy.title }),
      el('blockquote', { text: copy.note }),
      copy.reaction ? el('p', { class: 'note', text: copy.reaction }) : null,
      el('div', { class: 'actions' }, [leave, take]),
    ]);
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', copy.title);
    card.addEventListener('keydown', (event) => {
      if (event.code === 'Escape') close();
      if (event.code === 'Tab') {
        event.preventDefault();
        (document.activeElement === take ? leave : take).focus();
      }
    });
    const modal = el('div', { class: 'modal' }, [card]);
    this.hud.inert = true;
    this.overlay.append(modal);
    take.focus();
  }

  private showMeeting(meeting: NeighborMeeting): void {
    if (meeting.neighbor === 'chief') {
      const chief = S().neighbor.chief;
      this.showChief(meeting.first ? chief.first : chief.later);
      return;
    }
    if (meeting.neighbor === 'mechanic') {
      this.hud.inert = true;
      const close = () => {
        this.mechanicVisit?.close();
        this.mechanicVisit = null;
        this.meeting = null;
        this.hud.inert = false;
      };
      this.mechanicVisit = new MechanicVisit(this.overlay, meeting, () => {
        close();
        this.hud.querySelector<HTMLButtonElement>('.spot:not(.done,.blocked)')?.focus({ preventScroll: true });
      }, () => { close(); this.leave(); });
      return;
    }
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

  private showChief(greeting: string | null): void {
    this.hud.inert = true;
    const close = () => {
      this.chiefStation?.close();
      this.chiefStation = null;
      this.meeting = null;
      this.hud.inert = false;
    };
    this.chiefStation = new ChiefStation(this.overlay, greeting, () => {
      close();
      const target = greeting ? '.spot:not(.done,.blocked)' : '.loc-leave button';
      this.hud.querySelector<HTMLButtonElement>(target)?.focus({ preventScroll: true });
    }, () => { close(); this.leave(); });
  }

  private checkEscort(): void {
    const next = noticeChiefEscort(this.state);
    if (next === this.state) return;
    this.app.state = next;
    this.app.save();
    this.showChief(null);
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
        this.app.toast(this.stopLine, 'error');
        this.refresh();
      } else if (code === 'no_time') this.app.toast(s.loc.noTime, 'error');
      else this.app.toast(s.err.generic, 'error');
      return;
    }
    if (hasViceLeftovers(this.state, this.id, index)) {
      this.showStashNote(index, s.viceLeftovers, result.value.success.loot, () => {
        const current = prepareSearch(this.state, index);
        if (current.ok) this.collect(current.value.success, at);
      });
      return;
    }
    const location = LOCATIONS[this.id];
    const spot = location.spots[index]!;
    const puzzles: Readonly<Record<string, Puzzle>> = s.scavenge.spots[this.id];
    const names: Readonly<Record<string, string>> = s.spot[this.id];
    const close = (): void => {
      this.puzzle?.root.remove();
      this.puzzle = null;
      this.roomLife.disturbed();
      this.hud.inert = false;
      this.hud.querySelector<HTMLButtonElement>(`[data-spot="${index}"]`)?.focus();
    };
    const attempt = result.value;
    const puzzle = puzzles[spot.key]!;
    // Outcomes were prepared before the attempt. Carry the noise already saved into them.
    let heard = 0;
    const withNoise = (state: GameState): GameState => {
      const next = makeNoise(state, heard);
      heard = 0;
      return next;
    };
    this.puzzle = new ScavengePanel(
      puzzle, names[spot.key]!, spot, heroArt(location.plate, oneArmed(this.state)), spotRng(this.state.seed, this.id, spot.key, searchAttemptKey(this.state)), puzzleLevel(this.state),
      () => {
        close();
        const finish = gradeFinish(puzzle.kind, { slipped: attempt.slipped, heard });
        const success = attempt.graded(finish);
        this.collect({ ...success, state: withNoise(success.state) }, at, finish);
        this.noticeLostSearch(attempt.paid);
        this.checkEscort();
      },
      () => {
        if (heard > 0) {
          this.refresh();
          this.noticeLostSearch(attempt.paid);
        }
        close();
        this.checkEscort();
      },
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
        this.app.state = withNoise(attempt.failure);
        this.app.save();
        this.refresh();
        this.noticeLostSearch(attempt.paid);
        const next = prepareSearch(this.state, index);
        if (next.ok) this.puzzle?.showFailure(message, () => {
          close();
          this.search(index, at, true);
        });
        else {
          const reason = next.error.code === 'escorted_out' ? this.stopLine : s.loc.noTime;
          this.puzzle?.showFailure(`${message} ${reason}`, null);
        }
      },
      amount => {
        if (amount <= 0) return;
        heard += amount;
        this.app.state = makeNoise(this.state, amount);
        this.app.save();
      },
    );
    this.hud.inert = true;
    this.overlay.append(this.puzzle.root);
    if (retry) this.puzzle.start();
    this.puzzle.focus();
  }

  /** Says so when the noise since `before` has just cost this visit a search. */
  private noticeLostSearch(before: GameState): void {
    if (searchesLostToNoise(this.state, this.id) > searchesLostToNoise(before, this.id)) this.app.toast(S().streetNoise.heard, 'error');
  }

  /** The street-noise gauge: one dot per noise towards the next lost search, and the searches already lost. */
  private noiseGauge(): HTMLElement {
    const s = S().streetNoise;
    const state = this.state;
    const lost = searchesLostToNoise(state, this.id);
    const filled = streetNoise(state) % NOISE_PER_LOST_SEARCH;
    const lostLine = lost > 0 ? fmt(s.lost, { n: lost }) : null;
    const gauge = el('span', { class: 'street-noise', title: s.hint }, [
      s.label,
      el('b', { text: '●'.repeat(filled) + '○'.repeat(NOISE_PER_LOST_SEARCH - filled) }),
      lostLine ? el('small', { text: lostLine }) : null,
    ]);
    gauge.setAttribute('aria-label', `${s.label} ${filled}/${NOISE_PER_LOST_SEARCH}${lostLine ? ` · ${lostLine}` : ''}`);
    return gauge;
  }

  private collect(result: SearchOutcome, at: { x: number; y: number }, finish: Finish = 'plain'): void {
    const foundCrossbow = !hasCrossbow(this.state) && hasCrossbow(result.state);
    const foundDetector = !hasDetector(this.state) && hasDetector(result.state);
    const foundSiren = !hasSiren(this.state) && hasSiren(result.state);
    audio.play('rummage');
    const found = lootSfx(result.loot);
    if (found) this.app.playSceneCue(found, 380);
    this.app.state = result.state;
    this.app.save();
    this.refresh();
    if (!calmMotion()) this.searchDust = { ...at, age: 0 };
    if (foundDetector) {
      audio.play('tracker_ping');
      this.app.toast(S().night.detector.found, 'good');
      return;
    }
    if (foundSiren) {
      audio.play('ready');
      this.app.toast(S().siren.found, 'good');
      return;
    }
    if (foundCrossbow) {
      this.revealCrossbow();
      return;
    }
    // A clean finish says so, so the top of the range reads as earned rather than lucky.
    const clean = finish === 'clean' ? el('small', { class: 'loot-clean', text: S().scavenge.cleanJob }) : null;
    const pop = found && el('div', { class: 'loot-pop', style: { left: `${at.x}px`, top: `${at.y - 34}px` } }, [costLine(result.loot, undefined, '+'), clean]);
    if (pop) {
      this.hud.append(pop);
      window.setTimeout(() => pop.remove(), 1900);
    }
  }

  private revealCrossbow(): void {
    const s = S().scavenge.crossbow;
    const art = assetUrl('plate_crossbow');
    const close = el('button', { class: 'btn btn-primary', text: s.take, onClick: () => {
      audio.play('click');
      reveal.remove();
      this.hud.inert = false;
      this.hud.querySelector<HTMLButtonElement>('.loc-leave button')?.focus();
    } });
    const panel = el('div', { class: 'crossbow-reveal' }, [
      art ? el('img', { class: 'crossbow-art' }) : null,
      el('div', { class: 'crossbow-caption' }, [
        el('p', { class: 'crossbow-kicker', text: s.title }),
        el('h2', { text: s.name }),
        el('p', { text: s.text }),
        close,
      ]),
    ]);
    const img = panel.querySelector('img');
    if (img && art) {
      img.src = art;
      img.alt = '';
    }
    const reveal = el('div', { class: 'modal crossbow-modal' }, [panel]);
    reveal.setAttribute('role', 'dialog');
    reveal.setAttribute('aria-modal', 'true');
    reveal.setAttribute('aria-label', s.title);
    reveal.addEventListener('keydown', event => {
      if (event.code === 'Escape') close.click();
      if (event.code === 'Tab') event.preventDefault();
    });
    this.hud.inert = true;
    this.overlay.append(reveal);
    audio.play('loot');
    close.focus();
  }

  private leave(): void {
    const result = leaveLocation(this.state);
    if (!result.ok) return;
    const { state, forfeit } = result.value;
    audio.play('car_door');
    const ignitionAt = this.app.time + 0.35;
    const s = S();
    this.app.state = state;
    this.app.save();
    // A lot left behind on the way out is still a good turn: it is said on the drive home.
    const memory = forfeit ? memoryLine(forfeit) : null;
    const drive = fmt(s.loc.leaveCost, { h: hours(LOCATIONS[this.id].travelHours) });
    const sub = memory ? `${drive} · ${memory}` : drive;
    if (state.encounter) {
      // Seen from the wheel before anything is said: there is time to take it in.
      goTravel(this.app, { plate: roadPlate(state), title: s.encounter.road.title, sub: s.encounter.road.ahead, ignitionAt, next: () => goAmbush(this.app) });
    } else goHomeStretch(this.app, sub, ignitionAt);
  }

  update(dt: number): void {
    this.chiefStation?.update(dt);
    this.mechanicVisit?.update(dt);
    if (!this.puzzle && !this.meeting && !this.chiefStation && !this.panel.open) this.roomLife.update(dt, this.app.pointer, calmMotion());
    this.puzzle?.update(dt);
    this.panel.update(dt);
    if (this.searchDust) {
      this.searchDust.age += dt;
      if (this.searchDust.age >= SEARCH_DUST_SECONDS) this.searchDust = null;
    }
  }

  onBlur(): void {
    this.chiefStation?.pause();
    this.mechanicVisit?.pause();
    this.panel.onBlur();
    this.puzzle?.pauseCourse();
  }

  exit(): void {
    this.chiefStation?.close();
    this.mechanicVisit?.close();
    this.panel.hide();
  }

  render(ctx: CanvasRenderingContext2D): void {
    drawPlate(ctx, LOCATIONS[this.id].plate, { oneArmed: oneArmed(this.app.state) });
    this.roomLife.draw(ctx, calmMotion());
    const dusk = 1 - this.state.hoursLeft / DAY_HOURS;
    ctx.fillStyle = `rgba(40, 30, 90, ${Math.max(0, dusk - 0.55) * 0.5})`;
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    this.drawSearchDust(ctx);
  }

  private drawSearchDust(ctx: CanvasRenderingContext2D): void {
    const dust = this.searchDust;
    if (!dust || calmMotion()) return;
    const art = sprite('fx_dust');
    if (!art) return;
    ctx.save();
    for (const [index, direction] of [-1, 1, -0.33].entries()) {
      const progress = (dust.age - index * 0.09) / 0.6;
      if (progress <= 0 || progress >= 1) continue;
      const w = 27 + 53 * progress;
      const h = w * art.h / art.w;
      const x = dust.x + direction * (18 + 29 * progress);
      const y = dust.y + 6 - (5 + 21 * progress);
      ctx.globalAlpha = smoothstep(0, 0.17, progress) * (1 - progress) ** 1.45 * 0.72;
      ctx.drawImage(art.img, x - w / 2, y - h / 2, w, h);
    }
    ctx.restore();
  }

  onKeyDown(code: string): void {
    if (this.state.phase === 'lost') return;
    if (this.puzzle) {
      if (code === 'Escape') this.puzzle.cancel();
      return;
    }
    if (this.concealing && code === 'Escape') this.toggleConceal();
    this.panel.onKeyDown(code);
  }
}
