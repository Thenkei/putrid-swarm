// The morning after: what the night cost, told by the yard itself.

import { BARRICADE, HOUSE_MAX_HP } from '../core/data/devices';
import { chapterWaiting } from '../core/chapters';
import { bossOfNight, startNextDay } from '../core/game';
import type { GameState } from '../core/types';
import { SECTOR_IDS } from '../core/types';
import type { App, Scene } from '../engine/app';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S, fmt } from '../engine/i18n';
import { drawPlate, oneArmed } from './common';
import { goChapter, goDay } from './flow';

export class MorningScene implements Scene {
  private time = 0;

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

    const row = (label: string, value: string, tone: '' | 'bad' | 'good' = ''): HTMLElement => el('tr', {}, [el('td', { text: label }), el('td', { class: tone, text: value })]);
    const rows = [
      row(s.morning.kills, String(kills), 'good'),
      row(s.morning.autoTriggers, String(report?.autoTriggers ?? 0)),
      row(s.morning.triggers, String(report?.triggers ?? 0)),
      row(s.morning.breaches, String(report?.breaches ?? 0), (report?.breaches ?? 0) > 0 ? 'bad' : 'good'),
      row(s.morning.devices, String(report?.devicesBroken ?? 0), (report?.devicesBroken ?? 0) > 0 ? 'bad' : 'good'),
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
  }

  onKeyDown(code: string): void {
    if (code === 'Enter') this.next();
  }
}
