// The two ways a run stops: the house falls, or the seventh dawn comes.

import { newGame, retryOrchard } from '../core/game';
import { hasLeftArm } from '../core/orchard';
import type { GameState } from '../core/types';
import type { App, Scene } from '../engine/app';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S, fmt } from '../engine/i18n';
import { say } from '../engine/voice';
import { drawPlate } from './common';
import { goDay, goNightfall, goOrchard, goTitle } from './flow';

export class EndScene implements Scene {
  private time = 0;
  private readonly won: boolean;
  /** The evening before the lost night, so "replay this night" restores exactly what was at stake. */
  private readonly retry: GameState | null;

  constructor(private readonly app: App) {
    const state = app.state;
    this.won = state?.phase === 'won';
    this.retry = null;
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
    const fate = this.app.state?.fate ?? null;
    audio.setAmbience(this.won || fate ? 'day' : 'night');
    audio.setMusic(this.won ? 'won' : 'none');
    if (this.won) say('vo_won', { subtitle: false });
    const s = S();
    const state = this.app.state;
    const night = state?.lastNight?.night ?? state?.day ?? 1;
    const totals = state?.totals ?? { kills: 0, triggers: 0, searches: 0 };

    const buttons: HTMLElement[] = [];
    // The orchard ended it: the night before was won, so it is that morning that is played again.
    const again = state ? retryOrchard(state) : null;
    if (again?.ok) {
      const morning = again.value;
      buttons.push(
        el('button', {
          class: 'btn btn-primary',
          text: s.end.retryOrchard,
          onClick: () => {
            this.app.state = morning;
            this.app.save();
            goOrchard(this.app);
          },
        }),
      );
    }
    if (!this.won && this.retry) {
      const evening = this.retry;
      buttons.push(
        el('button', {
          class: 'btn btn-primary',
          text: s.end.retryNight,
          onClick: () => {
            this.app.state = evening;
            this.app.save();
            goNightfall(this.app);
          },
        }),
      );
    }
    buttons.push(
      el('button', {
        class: `btn ${this.won || (!this.retry && !again?.ok) ? 'btn-primary' : ''}`,
        text: s.end.newGame,
        onClick: () => {
          // A new run starts from a clean state: nothing of the previous one survives.
          this.app.state = newGame((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
          this.app.save();
          goDay(this.app, { reveal: true });
        },
      }),
      el('button', { class: 'btn', text: s.end.menu, onClick: () => goTitle(this.app) }),
    );

    this.app.ui.append(
      el('div', { class: 'center-col' }, [
        el('h1', { text: this.won ? s.end.wonTitle : fate ? s.end.fate[fate].title : s.end.lostTitle }),
        el('p', { text: this.won ? s.end.wonText : fate ? fmt(s.end.fate[fate].text, { n: (state?.day ?? 2) + 1 }) : fmt(s.end.lostText, { n: night }) }),
        el('p', { class: 'muted', text: `${fmt(s.end.stats, totals)}${state && !hasLeftArm(state) ? ` · ${s.end.oneArm}` : ''}` }),
        el('div', { class: 'row' }, buttons),
      ]),
    );
  }

  update(dt: number): void {
    this.time += dt;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const plate = this.won ? 'plate_victory' : this.app.state?.fate ? 'plate_orchard_end' : 'plate_gameover';
    drawPlate(ctx, plate, { zoom: 1.02 + this.time * 0.003, focusY: 0.45 });
  }
}
