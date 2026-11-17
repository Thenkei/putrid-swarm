// Where every run stops. There is no screen for a run that was won: the house falls, or the seventh
// dawn comes and they do not leave — or, once, the orchard. After the mower, this is the last picture
// of that scene held still, with what the song was worth written over it.

import { chapterOfFate } from '../core/chapters';
import { finaleOf, type FinaleKind, type JamResult, type RecordOutcome } from '../core/finale';
import { LAST_NIGHT } from '../core/data/waves';
import { newGame, retryChapter } from '../core/game';
import { hasLeftArm } from '../core/orchard';
import { allyOf, epilogueOf } from '../core/radio';
import type { GameState } from '../core/types';
import { STAGE_H, STAGE_W, type App, type Scene } from '../engine/app';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S, fmt } from '../engine/i18n';
import { endingsTally } from '../engine/progress';
import { drawPlate } from './common';
import { SWARMED } from './finale';
import { chapterEndPlate, goChapter, goDay, goFinale, goNightfall, goTitle } from './flow';

/** What the last scene hands over. Empty when a finished run is merely reloaded. */
export interface EndOptions {
  /** How the song went, and how it stands against the record of its mode. */
  readonly song?: { readonly result: JamResult; readonly record: RecordOutcome };
  /** This ending had never been seen in this browser. */
  readonly firstTime?: boolean;
}

/** The swarm picture fades in from where the last scene left it: this many seconds into it. */
const SWARM_SECONDS = 9;

export class EndScene implements Scene {
  private time = 0;
  private left = false;
  /** Null when the orchard ended the run. */
  private readonly kind: FinaleKind | null;
  /** The evening before the lost night, so "replay this night" restores exactly what was at stake. */
  private readonly retry: GameState | null = null;

  constructor(
    private readonly app: App,
    private readonly options: EndOptions = {},
  ) {
    const state = app.state;
    this.kind = state ? finaleOf(state) : null;
    // Nobody replays a night after holding all seven: only a lost house offers it.
    if (state && state.phase === 'lost' && state.fate === null) {
      try {
        const raw = sessionStorage.getItem('putrid-swarm.evening');
        this.retry = raw ? (JSON.parse(raw) as GameState) : null;
      } catch {
        this.retry = null;
      }
    }
  }

  enter(): void {
    const state = this.app.state;
    const fate = state?.fate ?? null;
    const dawn = this.kind === 'dawn';
    audio.setAmbience(dawn || fate ? 'day' : 'night');
    // The quiet theme of the seventh dawn comes back once it is all over: it was never a victory.
    audio.setMusic(dawn ? 'won' : 'none');
    const s = S();
    const night = state?.lastNight?.night ?? state?.day ?? 1;
    const totals = state?.totals ?? { kills: 0, triggers: 0, searches: 0 };
    // Nights held: all of them at the seventh dawn; up to the lost one otherwise; the orchard comes the morning after its night.
    const held = dawn ? LAST_NIGHT : fate ? (state?.day ?? 0) : Math.max(0, night - 1);

    const buttons: HTMLElement[] = [];
    const primary = (label: string, onClick: () => void): HTMLElement => el('button', { class: `btn ${buttons.length === 0 ? 'btn-primary' : ''}`, text: label, onClick });
    // A chapter ended it: the night before was won, so it is that morning that is played again.
    const again = state ? retryChapter(state) : null;
    if (again?.ok) {
      const { state: morning, chapter } = again.value;
      buttons.push(
        primary(s.chapter[chapter].retry, () => {
          this.app.state = morning;
          this.app.save();
          goChapter(this.app, chapter);
        }),
      );
    }
    if (this.retry) {
      const evening = this.retry;
      buttons.push(
        primary(s.end.retryNight, () => {
          this.app.state = evening;
          this.app.save();
          goNightfall(this.app);
        }),
      );
    }
    // The song again, from the shed: the run stays where it ended, only the record can move.
    if (this.kind === 'rampage' || dawn) buttons.push(primary(s.end.encore, () => goFinale(this.app, { encore: true })));
    buttons.push(
      primary(s.end.newGame, () => {
        // A new run starts from a clean state: nothing of the previous one survives.
        this.app.state = newGame((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
        this.app.save();
        goDay(this.app, { reveal: true });
      }),
      el('button', { class: 'btn', text: s.end.menu, onClick: () => goTitle(this.app) }),
    );

    const title = fate ? s.end.fate[fate].title : this.kind === 'dawn' ? s.end.dawn.title : this.kind === 'rampage' ? s.end.rampage.title : s.end.lostTitle;
    const text = fate
      ? fmt(s.end.fate[fate].text, { n: (state?.day ?? 2) + 1 })
      : this.kind === 'dawn'
        ? s.end.dawn.text
        : fmt(this.kind === 'rampage' ? s.end.rampage.text : s.end.lostText, { n: night });
    const endings = endingsTally();
    this.app.ui.append(
      el('div', { class: `center-col end ${this.kind ?? 'fate'}` }, [
        this.options.firstTime ? el('div', { class: 'end-new', text: s.end.newEnding }) : null,
        el('h1', { text: title }),
        el('p', { text }),
        this.songCard(),
        this.radioLine(state),
        el('p', { class: 'muted', text: `${fmt(s.end.stats, { ...totals, held })}${state && !hasLeftArm(state) ? ` · ${s.end.oneArm}` : ''}` }),
        el('div', { class: 'row' }, buttons),
        el('p', { class: 'end-seen', text: fmt(s.end.seen, { n: endings.seen, total: endings.total }) }),
      ]),
    );
    if (this.options.song?.record.beaten) window.setTimeout(() => !this.left && audio.play('blast'), 900);
  }

  exit(): void {
    this.left = true;
  }

  /** One line about the morning on the radio, if it led anywhere. */
  private radioLine(state: GameState | null): HTMLElement | null {
    const epilogue = state ? epilogueOf(state) : null;
    if (!state || !epilogue || !state.radio.call) return null;
    const ally = allyOf(state.radio.call, state.radio.answer);
    const text = fmt(S().end.radio[epilogue], { sector: ally ? S().sector[ally.sector] : '' });
    return el('p', { class: 'end-radio', text });
  }

  /** The song: how many, how well, which way, whether to the end; and the record. */
  private songCard(): HTMLElement | null {
    const song = this.options.song;
    if (!song) return null;
    const s = S().end.jam;
    const { result, record } = song;
    const mode = S().finale.mode[result.mode].name;
    const standing = record.beaten
      ? el('div', { class: 'jam-record beaten' }, [el('b', { text: s.newRecord }), el('span', { text: fmt(s.previous, { n: record.previous?.mown ?? 0 }) })])
      : record.previous === null
        ? el('div', { class: 'jam-record first' }, [el('span', { text: fmt(s.firstRecord, { mode }) })])
        : el('div', { class: 'jam-record' }, [el('span', { text: fmt(s.record, { mode, n: record.record.mown }) })]);
    return el('div', { class: 'jam-result' }, [
      el('div', { class: 'jam-total' }, [el('b', { text: String(result.mown) }), el('span', { text: fmt(s.mown, { n: result.mown }) })]),
      el('div', { class: 'jam-lines' }, [
        el('span', { text: fmt(s.detail, { best: result.best, perfect: result.perfect, mode }) }),
        el('span', { class: result.full ? 'full' : 'early', text: result.full ? s.full : s.early }),
      ]),
      standing,
    ]);
  }

  update(dt: number): void {
    this.time += dt;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const state = this.app.state;
    if (state?.fate) {
      drawPlate(ctx, chapterEndPlate(chapterOfFate(state.fate)), { zoom: 1.02 + this.time * 0.003, focusY: 0.45 });
      return;
    }
    if (this.kind === 'desk' || this.kind === null) {
      drawPlate(ctx, 'plate_gameover', { zoom: 1.02 + this.time * 0.003, focusY: 0.45 });
      return;
    }
    // The last picture of the mower, where the scene left it: still closing in, very slowly.
    drawPlate(ctx, this.kind === 'dawn' ? SWARMED.dawn : SWARMED.night, { zoom: SWARMED.zoom(SWARM_SECONDS + this.time * 0.25), focusY: 0.5, oneArmed: state ? !hasLeftArm(state) : false });
    ctx.globalAlpha = SWARMED.veil;
    ctx.fillStyle = '#0a0604';
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    ctx.globalAlpha = 1;
  }
}
