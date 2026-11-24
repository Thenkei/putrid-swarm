import jacketUrl from '../assets/camper-pocket.webp';
import type { Standing } from '../core/types';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { line } from '../engine/i18n';
import { calmMotion } from '../render/lighting';
import './camper-pocket.css';

/** The two pulls are in the same recording, separated by the teeth catching. */
const SECOND_PULL = .4;
const SHOW_TERMINAL = 1.06;
const CELS = ['covered', 'caught', 'open', 'terminal'] as const;

export class CamperPocket {
  readonly figure: HTMLElement;
  private readonly window = el('div', { class: 'camper-pocket-window' });
  private readonly painting = el('img');
  private readonly caption = el('figcaption');
  private readonly beforePull: number;
  private readonly still = calmMotion();
  private age = 0;
  private cel = -1;
  private started = false;
  private resumeSample = false;
  private sampleReady = false;
  private sampleWait = .65;

  constructor(readonly standing: Standing, seen: boolean, private readonly markSeen: () => void) {
    this.beforePull = standing === 'owes' ? .14 : .64;
    this.painting.alt = '';
    this.painting.src = jacketUrl;
    this.window.append(this.painting);
    this.caption.setAttribute('aria-live', 'polite');
    this.figure = el('figure', { class: 'camper-pocket' }, [this.window, this.caption]);
    this.figure.dataset.standing = standing;
    if (seen && standing !== 'grudge') this.age = this.beforePull + SHOW_TERMINAL;
    this.pose(standing === 'grudge' || !seen ? 0 : 3);
    if (!seen && standing !== 'grudge') void audio.prepareSample('camper_zip').then(() => { this.sampleReady = true; });
  }

  private pose(cel: number): void {
    if (cel === this.cel) return;
    this.cel = cel;
    this.figure.dataset.pose = CELS[cel];
    this.painting.style.left = cel % 2 ? '-100%' : '0';
    this.painting.style.top = cel >= 2 ? '-100%' : '0';
    const words = this.standing === 'grudge'
      ? line('Sa paume reste à plat sur la poche.', 'His palm stays flat over his pocket.')
      : cel === 3 ? line('La cosse du camping-car. Il vous montre le fil rompu.', 'The terminal from his camper van. He shows you the broken wire.')
      : cel > 0 ? line('Le zip accroche. Il faut tirer deux fois.', 'The zip catches. It takes two pulls.')
      : this.standing === 'owes' ? line('Il vous reconnaît. Sa main va droit à la tirette.', 'He recognises you. His hand goes straight to the zip.')
      : line('Son pouce cherche la tirette de la poche.', 'His thumb feels for the pocket zip.');
    if (this.caption.textContent !== words) this.caption.textContent = words;
  }

  pause(): void {
    if (this.started && this.cel !== 3 && !this.resumeSample) {
      audio.fadeOut('camper_zip', .02);
      this.resumeSample = true;
    }
  }

  update(dt: number): void {
    if (this.cel === 3 || this.standing === 'grudge' || !this.figure.isConnected || document.hidden || !document.hasFocus()) return;
    // Keep the sound with the image even on a cold connection.
    if (!this.painting.complete || !this.painting.naturalWidth) return;
    this.age += dt;
    const pull = this.age - this.beforePull;
    if (pull < 0) return;
    if (!this.started) {
      if (!this.sampleReady && this.sampleWait > 0) {
        this.sampleWait -= dt;
        this.age = this.beforePull;
        return;
      }
      this.started = true;
      this.markSeen();
      audio.play('camper_zip', .78);
    } else if (this.resumeSample) {
      this.resumeSample = false;
      audio.play('camper_zip', .78, 1, pull);
    }
    const cel = pull < SECOND_PULL ? 1 : pull < SHOW_TERMINAL ? 2 : 3;
    this.pose(cel);
    // A slight catch in the chest before the slider lets go on the second pull.
    if (!this.still) {
      const strain = cel === 1 ? Math.sin(Math.PI * pull / SECOND_PULL) : 0;
      this.painting.style.transform = `translateX(${(-1.5 * strain).toFixed(2)}px)`;
    }
  }
}
