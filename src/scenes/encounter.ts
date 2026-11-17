// What the player sees of an encounter: who is there, what is at stake, what each way out
// costs, and how it ended. The rules live in core/encounters; nothing here decides an outcome.

import { DAY_HOURS, LOCATIONS } from '../core/data/locations';
import { ENCOUNTER, RESOURCE_VALUE } from '../core/data/rivals';
import {
  acquaintance,
  act,
  choicesOf,
  fightHours,
  greetingOf,
  stanceOf,
  units,
  washerTotal,
  type Action,
  type Choice,
  type Exchange,
  type MovePreview,
  type Resolution,
  type Step,
} from '../core/encounters';
import { clockLabel } from '../core/game';
import type { Ambush, Cost, Dispute, Encounter, Fight, GameState, GroupId, ResourceId, RivalId } from '../core/types';
import { RESOURCE_IDS, RIVAL_IDS } from '../core/types';
import { STAGE_H, STAGE_W, type App, type Scene } from '../engine/app';
import { assetUrl } from '../engine/assets';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S, fmt, hours } from '../engine/i18n';
import { costLine, drawPlate, inventoryBar, lootSfx, resourceChip } from './common';
import { goHomeStretch } from './flow';
import { WashersBoard, type Landing, type Side } from './washers';

export interface PanelHost {
  /** The game state changed: whatever shows the clock or the boot is out of date. */
  changed(): void;
  /** The player has read how it ended. */
  closed(resolution: Resolution): void;
  /** The player wants to look around before answering. Absent when the encounter cannot wait. */
  later?(): void;
}

const isRival = (who: RivalId | GroupId): who is RivalId => RIVAL_IDS.includes(who as RivalId);

/** The name the player knows someone by. */
export function nameOf(who: RivalId | GroupId): string {
  const s = S().encounter;
  return isRival(who) ? s.rival[who].name : s.group[who].name;
}

/** What a survivor now thinks of the player, when this encounter changed it. */
export function memoryLine(resolution: Resolution): string | null {
  const s = S().encounter.standing;
  const standing = resolution.standing;
  if (!standing || standing.before === standing.after) return null;
  const name = nameOf(standing.rival);
  if (standing.after === 'owes') return fmt(s.owes, { name });
  if (standing.after === 'grudge') return fmt(s.grudge, { name });
  return fmt(standing.before === 'grudge' ? s.settled : s.quits, { name });
}

const portraitOf = (who: RivalId | GroupId): string | undefined => assetUrl(isRival(who) ? `por_rival_${who}` : `por_group_${who}`);

/** The cheapest way to make up a payment, as a starting point the player then adjusts. */
function cheapestPayment(ambush: Ambush, trunk: Readonly<Record<ResourceId, number>>): Record<ResourceId, number> {
  const payment: Record<ResourceId, number> = { wood: 0, scrap: 0, springs: 0, wire: 0, battery: 0 };
  let left = ambush.toll;
  for (const id of [...ambush.accepts].sort((a, b) => RESOURCE_VALUE[a] - RESOURCE_VALUE[b])) {
    const n = Math.min(left, trunk[id]);
    payment[id] = n;
    left -= n;
  }
  return payment;
}

export class EncounterPanel {
  private modal: HTMLElement | null = null;
  private resolution: Resolution | null = null;
  private exchange: Exchange | null = null;
  private payment: Record<ResourceId, number> | null = null;
  private board: WashersBoard | null = null;
  /** What the number keys do in the view on screen. */
  private keys: (() => void)[] = [];

  constructor(
    private readonly app: App,
    private readonly parent: HTMLElement,
    private readonly host: PanelHost,
  ) {}

  private get state(): GameState {
    if (!this.app.state) throw new Error('EncounterPanel needs a running game');
    return this.app.state;
  }

  get open(): boolean {
    return this.modal !== null;
  }

  /** Opens on the encounter in progress, at whatever stage it was left. */
  show(): void {
    if (!this.state.encounter && !this.resolution) return;
    this.render();
  }

  hide(): void {
    this.modal?.remove();
    this.modal = null;
    this.board = null;
    this.keys = [];
  }

  update(dt: number): void {
    this.board?.update(dt);
  }

  /** Returns true when the key was for the panel. */
  onKeyDown(code: string): boolean {
    if (!this.modal) return false;
    if (this.board) {
      if (code === 'Space' || code === 'Enter') this.board.throw();
      return true;
    }
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    const handler = digit ? this.keys[Number(digit[1]) - 1] : (code === 'Enter' || code === 'Space') && this.resolution ? this.keys[0] : undefined;
    handler?.();
    return true;
  }

  // ───────────────────────────── Acting ─────────────────────────────

  private apply(action: Action): Step | null {
    const result = act(this.state, action);
    if (!result.ok) {
      audio.play('deny');
      this.app.toast(S().err.generic, 'error');
      return null;
    }
    this.app.state = result.value.state;
    this.app.save();
    this.host.changed();
    return result.value;
  }

  private choose(choice: Choice): void {
    if (choice.blocked) {
      audio.play('deny');
      return;
    }
    const encounter = this.state.encounter;
    if (choice.id === 'pay') {
      if (encounter?.kind !== 'ambush' || !this.state.outing) return;
      audio.play('click');
      this.payment = cheapestPayment(encounter, this.state.outing.trunk);
      this.render();
      return;
    }
    const step = this.apply({ type: choice.id });
    if (!step) return;
    this.exchange = step.exchange;
    this.resolution = step.resolution;
    this.sound(choice, step);
    this.render();
  }

  private sound(choice: Choice, step: Step): void {
    const { exchange, resolution } = step;
    if (exchange) {
      if (exchange.blows > 0) audio.play('hit');
      if (exchange.move !== 'wait' && exchange.move !== 'yield') audio.play('scuffle');
    } else if (choice.id === 'threaten' && !resolution) audio.play('deny');
    else audio.play('click');
    if (!resolution) return;
    const found = lootSfx(resolution.gained);
    if (found) {
      window.setTimeout(() => audio.play(exchange ? 'crate' : 'rummage'), exchange ? 200 : 0);
      window.setTimeout(() => audio.play(found), 420);
    } else if (units(resolution.lost) > 0) audio.play('rummage');
  }

  private dismiss(): void {
    const resolution = this.resolution;
    this.resolution = null;
    this.exchange = null;
    this.hide();
    audio.play('click');
    if (resolution) this.host.closed(resolution);
  }

  // ───────────────────────────── Views ─────────────────────────────

  private render(): void {
    const encounter = this.state.encounter;
    if (this.resolution) return this.mount(this.resolution.who, this.resultView(this.resolution));
    if (!encounter) return this.hide();
    if (encounter.kind === 'dispute') {
      if (encounter.stage === 'game') {
        // The table keeps its own animation: it is built once and left alone.
        if (!this.board) this.mount(encounter.rival, this.gameView(encounter), 'wide');
        return;
      }
      if (encounter.stage === 'fight') return this.mount(encounter.rival, this.fightView(encounter.rival, encounter.fight, 'dispute'));
      return this.mount(encounter.rival, this.disputeView(encounter));
    }
    if (encounter.stage === 'fight') return this.mount(encounter.group, this.fightView(encounter.group, encounter.fight, 'ambush'));
    return this.mount(encounter.group, this.payment ? this.payView(encounter, this.payment) : this.ambushView(encounter));
  }

  private mount(who: RivalId | GroupId, body: readonly (HTMLElement | null)[], layout: 'side' | 'wide' = 'side'): void {
    const url = portraitOf(who);
    const portrait = el('img', { class: 'portrait' });
    if (url) portrait.src = url;
    const card = el('div', { class: `card dialogue encounter ${layout}` }, [layout === 'side' ? portrait : null, el('div', { class: 'body' }, body)]);
    const modal = el('div', { class: 'modal' }, [card]);
    this.modal?.remove();
    this.modal = modal;
    this.parent.append(modal);
  }

  private timeLabel(choice: Choice): string {
    const s = S().encounter;
    if (choice.maxHours <= 0) return s.free;
    return choice.hours === choice.maxHours ? fmt(s.hours, { h: hours(choice.hours) }) : fmt(s.upTo, { h: hours(choice.maxHours) });
  }

  private blockedLine(choice: Choice): HTMLElement | null {
    const s = S().encounter;
    const blocked = choice.blocked;
    if (!blocked) return null;
    if (blocked.code === 'cannot_pay') return el('span', { class: 'why' }, [s.blocked.cannot_pay, ' ', costLine(blocked.missing)]);
    return el('span', { class: 'why', text: fmt(this.state.where === 'road' ? s.blocked.no_time_road : s.blocked.no_time, { h: hours(blocked.needed) }) });
  }

  /** One way out, with everything it costs and brings written on it. */
  private choiceButton(index: number, choice: Choice, label: string, hint: string, extra: readonly (HTMLElement | null)[] = []): HTMLElement {
    const s = S().encounter;
    const deal: (HTMLElement | string)[] = [];
    if (choice.gives) deal.push(el('span', { class: 'deal' }, [s.gives, ' ', costLine(choice.gives, undefined, '−')]));
    if (choice.gains) deal.push(el('span', { class: 'deal' }, [s.yours, ' ', costLine(choice.gains, undefined, '+')]));
    const run = (): void => this.choose(choice);
    this.keys[index] = run;
    return el('button', { class: `choice ${choice.blocked ? 'blocked' : ''}`, onClick: run }, [
      el('span', { class: 'key', text: String(index + 1) }),
      el('span', { class: 'what' }, [el('b', { text: label }), el('small', { text: hint }), ...deal, ...extra, this.blockedLine(choice)]),
      el('span', { class: 'when', text: this.timeLabel(choice) }),
    ]);
  }

  private disputeView(dispute: Dispute): (HTMLElement | null)[] {
    const s = S().encounter;
    const lines = s.rival[dispute.rival];
    const spotNames = S().spot[dispute.location] as Readonly<Record<string, string>>;
    const spotKey = LOCATIONS[dispute.location].spots[dispute.spot]?.key ?? '';
    const refused = dispute.stage === 'refused';
    this.keys = [];
    const buttons = choicesOf(this.state).map((choice, index) => {
      const text = choice.id === 'concede' && refused ? s.choice.backDown : s.choice[choice.id as keyof typeof s.choice];
      return this.choiceButton(index, choice, text.label, text.hint);
    });
    const later = this.host.later;
    return [
      el('h2', { text: lines.name }),
      el('p', { text: refused ? lines.refused : lines.greeting[greetingOf(acquaintance(this.state, dispute.rival))] }),
      el('p', { class: 'stake' }, [el('b', { text: `${s.lot} · ${spotNames[spotKey] ?? spotKey}` }), costLine(dispute.lot)]),
      refused ? el('p', { class: 'memory', text: fmt(s.standing.grudge, { name: lines.name }) }) : el('p', { class: 'note', text: dispute.yields ? lines.cue.nervous : lines.cue.firm }),
      el('div', { class: 'choices' }, buttons),
      !refused && later
        ? el('div', { class: 'actions' }, [
            el('button', {
              class: 'btn',
              text: s.later,
              onClick: () => {
                audio.play('click');
                this.hide();
                later();
              },
            }),
          ])
        : null,
    ];
  }

  private ambushView(ambush: Ambush): (HTMLElement | null)[] {
    const s = S().encounter;
    const lines = s.group[ambush.group];
    const everything = ambush.accepts.length === RESOURCE_IDS.length;
    const member = ambush.member ? lines.member[ambush.memberStanding === 'stranger' ? 'known' : ambush.memberStanding] : null;
    this.keys = [];
    const buttons = choicesOf(this.state).map((choice, index) => {
      switch (choice.id) {
        case 'favor':
          return this.choiceButton(index, choice, s.choice.waved.label, fmt(s.choice.waved.hint, { name: ambush.member ? nameOf(ambush.member) : '' }));
        case 'pay':
          return this.choiceButton(index, choice, s.choice.pay.label, fmt(s.choice.pay.hint, { n: ambush.toll }));
        case 'bargain':
          return this.choiceButton(index, choice, s.choice.bargain.label, lines.need);
        case 'detour':
          return this.choiceButton(index, choice, s.choice.detour.label, lines.detour);
        default:
          return this.choiceButton(index, choice, s.choice.defend.label, s.choice.defend.hint);
      }
    });
    return [
      el('h2', { text: lines.name }),
      el('p', { text: lines.greeting }),
      el('p', { class: 'stake' }, [
        el('b', { text: fmt(s.road.toll, { n: ambush.toll }) }),
        everything ? null : el('span', { class: 'cost' }, [`${s.road.accepts} `, ...ambush.accepts.map((id) => resourceChip(id, ''))]),
      ]),
      member ? el('p', { class: 'note', text: member }) : null,
      el('div', { class: 'choices' }, buttons),
    ];
  }

  private payView(ambush: Ambush, payment: Record<ResourceId, number>): (HTMLElement | null)[] {
    const s = S().encounter;
    const trunk = this.state.outing?.trunk;
    if (!trunk) return [];
    const picked = units(payment);
    const nudge = (id: ResourceId, by: number): void => {
      const next = payment[id] + by;
      if (next < 0 || next > trunk[id] || (by > 0 && picked >= ambush.toll)) {
        audio.play('deny');
        return;
      }
      audio.play('click');
      payment[id] = next;
      this.render();
    };
    const rows = RESOURCE_IDS.filter((id) => trunk[id] > 0).map((id) => {
      const accepted = ambush.accepts.includes(id);
      return el('div', { class: `pay-row ${accepted ? '' : 'refused'}` }, [
        resourceChip(id, trunk[id]),
        el('span', { class: 'name', text: S().res[id] }),
        el('button', { class: 'btn step', text: '−', disabled: !accepted || payment[id] <= 0, onClick: () => nudge(id, -1) }),
        el('span', { class: 'count', text: String(payment[id]) }),
        el('button', { class: 'btn step', text: '+', disabled: !accepted || payment[id] >= trunk[id] || picked >= ambush.toll, onClick: () => nudge(id, 1) }),
      ]);
    });
    const confirm = (): void => {
      if (units(payment) !== ambush.toll) return;
      const step = this.apply({ type: 'pay', payment });
      if (!step) return;
      this.payment = null;
      this.resolution = step.resolution;
      audio.play('rummage');
      this.render();
    };
    const back = (): void => {
      audio.play('click');
      this.payment = null;
      this.render();
    };
    this.keys = [];
    return [
      el('h2', { text: s.group[ambush.group].name }),
      el('p', { class: 'stake' }, [el('b', { text: s.pay.title }), el('span', { class: 'tally', text: fmt(s.pay.count, { n: picked, total: ambush.toll }) })]),
      el('div', { class: 'pay' }, rows),
      el('div', { class: 'actions' }, [
        el('button', { class: 'btn', text: s.pay.back, onClick: back }),
        el('button', { class: 'btn btn-primary', text: s.pay.confirm, disabled: picked !== ambush.toll, onClick: confirm }),
      ]),
    ];
  }

  private moveHint(move: MovePreview, fight: Fight, kind: Encounter['kind']): string {
    const s = S().encounter.move;
    const blowHours = hours(ENCOUNTER.hours.blow * move.blows);
    if (move.move === 'yield') return kind === 'dispute' ? s.yieldDispute : s.yieldAmbush;
    if (move.wins) return move.blows > 0 ? fmt(s.winsBlows, { n: move.blows, h: blowHours }) : s.wins;
    if (move.opening) return fmt(s.opening, { h: blowHours });
    if (move.splits) return kind === 'dispute' ? s.splitDispute : s.splitAmbush;
    return fmt(s.wait, { n: ENCOUNTER.exchanges - fight.exchange - 1 });
  }

  private fightView(who: RivalId | GroupId, fight: Fight, kind: Encounter['kind']): (HTMLElement | null)[] {
    const s = S().encounter;
    const encounter = this.state.encounter;
    // Someone the player knows saw them square up to the group: said once, as it happens.
    const witness =
      encounter?.kind === 'ambush' && encounter.member && encounter.memberStanding !== 'grudge' && fight.exchange === 0 ? fmt(s.standing.grudge, { name: nameOf(encounter.member) }) : null;
    const stances = isRival(who) ? s.rival[who].stance : s.group[who].stance;
    const labels = s.move[kind];
    const last = this.exchange;
    const feedback = !last ? null : last.blows > 0 ? fmt(s.fight.hit, { n: last.blows }) : last.opening ? s.fight.opening : s.fight.nothing;
    this.keys = [];
    const buttons = choicesOf(this.state).map((choice, index) => {
      const move = choice.move;
      const run = (): void => this.choose(choice);
      this.keys[index] = run;
      return el('button', { class: `choice ${move?.move === 'yield' ? 'quiet' : ''}`, onClick: run }, [
        el('span', { class: 'key', text: String(index + 1) }),
        el('span', { class: 'what' }, [el('b', { text: move ? labels[move.move] : '' }), el('small', { text: move ? this.moveHint(move, fight, kind) : '' })]),
      ]);
    });
    return [
      el('h2', { text: nameOf(who) }),
      el('p', { class: 'tally' }, [
        fmt(s.fight.exchange, { i: fight.exchange + 1, n: ENCOUNTER.exchanges }),
        ' · ',
        fmt(s.fight.blows, { n: fight.blows }),
        ' · ',
        fmt(s.fight.spent, { h: hours(fightHours(fight.blows)) }),
      ]),
      feedback ? el('p', { class: 'note', text: feedback }) : null,
      witness ? el('p', { class: 'memory', text: witness }) : null,
      el('p', { class: 'stance', text: stances[stanceOf(fight)] }),
      el('div', { class: 'choices' }, buttons),
    ];
  }

  private gameView(dispute: Dispute): (HTMLElement | null)[] {
    const s = S().encounter;
    const name = s.rival[dispute.rival].name;
    const status = el('p', { class: 'note', text: fmt(s.game.theirTurn, { name }) });
    const score = el('p', { class: 'tally' });
    const button = el('button', { class: 'btn btn-primary', disabled: true, onClick: () => this.board?.throw() }, [s.game.throw, el('small', { text: s.game.throwKey })]);

    /** The final throw closes the encounter in the core; the card waits for the washer to land. */
    let ending: Resolution | null = null;
    const refreshScore = (theirs: number, yours: number, round: number): void => {
      score.textContent = `${fmt(s.game.round, { i: round + 1, n: ENCOUNTER.throws })} · ${name} ${theirs} — ${s.game.you} ${yours}`;
    };
    const landed = { theirs: dispute.game.yours.length, yours: dispute.game.yours.length };
    const yours = [...dispute.game.yours];
    const totals = (): [number, number] => [washerTotal(dispute.game.theirs.slice(0, landed.theirs)), washerTotal(yours.slice(0, landed.yours))];

    const board = new WashersBoard(
      dispute.game.theirs,
      dispute.game.yours,
      {
        onThrow: (position) => {
          button.disabled = true;
          yours.push(position);
          const step = this.apply({ type: 'throw', aim: position });
          if (step?.resolution) ending = step.resolution;
        },
        onLanded: (side: Side, landing: Landing) => {
          landed[side]++;
          audio.play(landing === 'tin' ? 'tin' : 'washer');
          status.textContent = s.game.scored[landing];
          refreshScore(...totals(), board.roundIndex);
        },
        onTurn: (side) => {
          status.textContent = side === 'theirs' ? fmt(s.game.theirTurn, { name }) : s.game.yourTurn;
          button.disabled = side !== 'yours';
          refreshScore(...totals(), board.roundIndex);
        },
        onOver: () => {
          this.board = null;
          this.resolution = ending;
          if (ending) {
            const found = lootSfx(ending.gained);
            if (found) audio.play(found);
          }
          this.render();
        },
      },
      this.app.pixelRatio,
    );
    this.board = board;
    refreshScore(...totals(), board.roundIndex);
    this.keys = [];
    return [
      el('h2', { text: s.game.title }),
      el('p', { text: s.game.rules }),
      score,
      el('div', { class: 'washers hit', onClick: () => board.throw() }, [board.canvas]),
      el('div', { class: 'actions' }, [status, el('span', { class: 'grow' }), button]),
    ];
  }

  private resultView(resolution: Resolution): (HTMLElement | null)[] {
    const s = S().encounter;
    const who = resolution.who;
    const name = nameOf(who);
    const text = isRival(who)
      ? (s.rival[who].result as Readonly<Record<string, string>>)[resolution.outcome]
      : (s.group[who].result as Readonly<Record<string, string>>)[resolution.outcome];
    const memory = memoryLine(resolution);
    const row = (label: string, cost: Cost, sign: string): HTMLElement | null => (units(cost) > 0 ? el('p', { class: 'stake' }, [el('b', { text: label }), costLine(cost, undefined, sign)]) : null);
    const close = (): void => this.dismiss();
    this.keys = [close];
    return [
      el('h2', { text: s.outcome[resolution.outcome] }),
      text ? el('p', { text }) : null,
      row(s.result.gained, resolution.gained, '+'),
      row(s.result.lost, resolution.lost, '−'),
      row(fmt(s.result.theirs, { name }), resolution.theirs, ''),
      resolution.hours > 0 ? el('p', { class: 'note', text: fmt(s.result.time, { h: hours(resolution.hours) }) }) : null,
      memory ? el('p', { class: 'memory', text: memory }) : null,
      el('div', { class: 'actions' }, [el('button', { class: 'btn btn-primary', text: s.ok, onClick: close })]),
    ];
  }
}

// ───────────────────────────── The road home ─────────────────────────────

const ROAD_PLATE: Readonly<Record<GroupId, string>> = { committee: 'plate_roadblock', van: 'plate_van' };

/** The stretch of road the break is stopped on, or about to be. */
export const roadPlate = (state: GameState): string => (state.encounter?.kind === 'ambush' ? ROAD_PLATE[state.encounter.group] : 'plate_return');

/** The break stopped on the way back, the load still in the boot. */
export class AmbushScene implements Scene {
  private hud!: HTMLElement;
  private panel!: EncounterPanel;
  /** Kept from the start: the plate stays up while the result is read, after the encounter is closed. */
  private readonly plate: string;

  constructor(private readonly app: App) {
    this.plate = app.state ? roadPlate(app.state) : 'plate_return';
  }

  private get state(): GameState {
    if (!this.app.state) throw new Error('AmbushScene needs a running game');
    return this.app.state;
  }

  enter(): void {
    audio.setAmbience('day');
    audio.setMusic('day');
    this.hud = el('div');
    const overlay = el('div');
    this.app.ui.append(this.hud, overlay);
    this.panel = new EncounterPanel(this.app, overlay, {
      changed: () => this.refresh(),
      closed: () => goHomeStretch(this.app),
    });
    this.refresh();
    if (this.state.encounter) this.panel.show();
    else goHomeStretch(this.app);
  }

  private refresh(): void {
    const s = S();
    const state = this.state;
    this.hud.replaceChildren(
      el('div', { class: 'topbar' }, [
        el('span', { class: 'label-strong', text: s.encounter.road.title }),
        el('span', { class: 'sep' }),
        el('span', { text: clockLabel(state.hoursLeft) }),
        el('span', { class: 'meter' }, [el('i', { style: { width: `${(state.hoursLeft / DAY_HOURS) * 100}%` } })]),
        el('span', { class: 'muted', text: fmt(s.day.hoursLeft, { h: hours(state.hoursLeft) }) }),
        el('span', { class: 'grow' }),
        el('span', { class: 'muted', text: s.encounter.trunk }),
        state.outing ? inventoryBar(state.outing.trunk) : null,
      ]),
    );
  }

  update(dt: number): void {
    this.panel.update(dt);
  }

  render(ctx: CanvasRenderingContext2D): void {
    drawPlate(ctx, this.plate);
    const dusk = 1 - this.state.hoursLeft / DAY_HOURS;
    ctx.fillStyle = `rgba(40, 30, 90, ${Math.max(0, dusk - 0.55) * 0.5})`;
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  }

  onKeyDown(code: string): void {
    this.panel.onKeyDown(code);
  }
}
