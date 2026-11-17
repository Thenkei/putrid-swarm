// A short beat in the old break between the refuge and the village, and back with the boot full.

import type { Cost } from '../core/types';
import type { App, Scene } from '../engine/app';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S } from '../engine/i18n';
import { costLine, drawPlate } from './common';

const HOLD_SECONDS = 3.2;
/** The road noise comes up slowly, under the engine that was just started. */
const ROAD_FADE_IN = 2.2;

export interface TravelOptions {
  readonly plate: string;
  readonly title: string;
  readonly sub: string;
  /** What is in the boot, when driving home. */
  readonly loot?: Cost;
  /** What the outing handed over or had taken on the way. */
  readonly lost?: Cost;
  /** A last line under the load: what it still allows before dark. */
  readonly note?: string;
  readonly next: () => void;
}

export class TravelScene implements Scene {
  private time = 0;
  private done = false;

  constructor(
    private readonly app: App,
    private readonly options: TravelOptions,
  ) {}

  enter(): void {
    audio.setAmbience('car', ROAD_FADE_IN);
    const { title, sub, loot, lost, note } = this.options;
    const some = (cost: Cost | undefined): cost is Cost => cost !== undefined && Object.values(cost).some((n) => (n ?? 0) > 0);
    const s = S();
    this.app.ui.append(
      el('div', { class: 'center-col hit', onClick: () => this.finish() }, [
        el('h1', { text: title }),
        sub ? el('p', { text: sub }) : null,
        some(loot) ? el('p', {}, [`${s.loc.trunk} : `, costLine(loot, undefined, '+')]) : loot ? el('p', { text: s.encounter.arrival.empty }) : null,
        some(lost) ? el('p', { class: 'lost' }, [`${s.encounter.arrival.lost} : `, costLine(lost, undefined, '−')]) : null,
        note ? el('p', { class: 'muted', text: note }) : null,
      ]),
    );
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    // Arriving is heard: the starter fades if the drive was skipped, and the engine is switched off
    // while the road noise fades under the next scene's ambience.
    audio.fadeOut('engine', 0.5);
    audio.play('engine_stop');
    this.options.next();
  }

  update(dt: number): void {
    this.time += dt;
    if (this.time >= HOLD_SECONDS) this.finish();
  }

  render(ctx: CanvasRenderingContext2D): void {
    drawPlate(ctx, this.options.plate, { zoom: 1.04 + this.time * 0.012, focusY: 0.5 });
  }

  onKeyDown(code: string): void {
    if (code === 'Space' || code === 'Enter' || code === 'Escape') this.finish();
  }
}
