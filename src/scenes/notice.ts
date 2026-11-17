// The two things said before the game starts: what it shows, once, to everyone; and that it needs a
// keyboard, to whoever opens it on a touch screen. Neither is part of the story.

import { STAGE_H, STAGE_W, type App, type Scene } from '../engine/app';
import { el } from '../engine/dom';
import { S } from '../engine/i18n';

const WARNED_KEY = 'putrid-swarm.warned';

/** Whether this browser has already been told what the game shows. */
export function warningSeen(): boolean {
  try {
    return localStorage.getItem(WARNED_KEY) === '1';
  } catch {
    // No storage: say it again rather than never.
    return false;
  }
}

function rememberWarning(): void {
  try {
    localStorage.setItem(WARNED_KEY, '1');
  } catch {
    // Non-fatal: it will simply be shown again next time.
  }
}

type Notice = 'warning' | 'keyboard';

function card(kind: Notice, onGo: () => void): HTMLElement {
  const s = S().notice[kind];
  return el('div', { class: 'card notice-card' }, [
    el('h2', { text: s.title }),
    ...s.lines.map((line) => el('p', { text: line })),
    el('p', { class: 'note', text: s.note }),
    el('div', { class: 'notice-actions' }, [el('button', { class: 'btn btn-primary', text: s.go, onClick: onGo })]),
  ]);
}

/** What the game shows, before the title. Acknowledged once per browser; `next` is where it leads. */
export class WarningScene implements Scene {
  private left = false;

  constructor(
    private readonly app: App,
    private readonly next: () => Scene,
  ) {}

  enter(): void {
    this.app.ui.append(el('div', { class: 'notice' }, [card('warning', () => this.leave())]));
  }

  private leave(): void {
    if (this.left) return;
    this.left = true;
    rememberWarning();
    this.app.go(this.next);
  }

  onKeyDown(code: string): void {
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') this.leave();
  }

  update(): void {}

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#0d0b09';
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  }
}

/**
 * "You need a keyboard", laid over the whole page rather than drawn on the stage: the stage is
 * 1280 units wide whatever the screen, and on a phone nothing on it can be read.
 * Resolves when the visitor chooses to go on anyway.
 */
export function keyboardGate(): Promise<void> {
  return new Promise((resolve) => {
    const gate = el('div', { class: 'gate' }, [
      card('keyboard', () => {
        gate.remove();
        resolve();
      }),
    ]);
    document.body.append(gate);
  });
}
