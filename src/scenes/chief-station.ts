import paintingUrl from '../assets/chief-station.webp';
import { BOSS } from '../core/data/enemies';
import { assetUrl } from '../engine/assets';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { line, S } from '../engine/i18n';
import { calmMotion } from '../render/lighting';
import './chief-station.css';

type Pose = 'welcome' | 'reflection' | 'glare' | 'watch' | 'snap' | 'door';
const CEL: Record<Pose, number> = { welcome: 0, watch: 1, snap: 2, reflection: 3, glare: 4, door: 5 };
const GLARE = .64;
const WATCH = 1.94;
const SNAP = 2.72;
const WATCH_SOUND = SNAP - .10;

/** The watch belongs to the second paid search. Reading the scene spends no daylight. */
export class ChiefStation {
  private readonly canvas = el('canvas', { class: 'chief-cel' });
  private readonly frame = el('div', { class: 'chief-frame' }, [this.canvas]);
  private readonly painting = new Image();
  private readonly caption = el('p', { class: 'chief-caption' });
  private readonly root: HTMLElement;
  private pose: Pose;
  private paintingState: 'loading' | 'ready' | 'missing' = 'loading';
  private time = 0;
  private watchStarted = false;

  constructor(host: HTMLElement, greeting: string | null, dismiss: () => void, leave: () => void) {
    const welcome = greeting !== null;
    this.pose = welcome ? 'welcome' : 'reflection';
    const stay = el('button', { class: welcome ? 'btn btn-primary' : 'btn',
      text: welcome ? line('Fouiller le poste', 'Search the station') : line('Voir le coffre', 'Check the boot'), onClick: dismiss });
    const go = el('button', { class: welcome ? 'btn' : 'btn btn-primary', text: S().loc.leave, onClick: leave });
    const buttons = welcome ? [stay, go] : [go, stay];
    this.root = el('div', { class: 'modal chief-station' }, [el('div', { class: 'card chief-station-card' }, [
      this.frame, el('div', { class: 'chief-copy' }, [
        el('h2', { text: S().neighbor.chief.name }), this.caption,
        welcome ? el('p', { class: 'chief-note', text: S().neighbor.chief.firstNote }) : null,
        el('div', { class: 'chief-actions' }, buttons),
      ]),
    ])]);
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', S().neighbor.chief.name);
    this.caption.setAttribute('role', 'status');
    this.frame.setAttribute('aria-hidden', 'true');
    this.canvas.width = this.canvas.height = 512;
    const fallback = assetUrl('por_chief_alive');
    if (fallback) this.frame.style.backgroundImage = `url("${fallback}")`;
    this.painting.src = paintingUrl;
    void this.painting.decode().then(() => {
      this.paintingState = 'ready';
      if (this.root.isConnected) this.draw();
    }, () => { this.paintingState = 'missing'; });
    this.show(this.pose, greeting);
    this.root.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.stopPropagation(); dismiss(); }
      if (event.key === 'Tab') {
        event.preventDefault();
        (document.activeElement === stay ? go : stay).focus();
      }
    });
    host.append(this.root);
    buttons[0]!.focus({ preventScroll: true });
    void audio.prepareSample('chief_watch');
    void audio.prepareSample('whistle');
  }

  private show(pose: Pose, greeting: string | null = null): void {
    this.pose = pose;
    this.frame.dataset.pose = pose;
    switch (pose) {
      case 'welcome': this.caption.textContent = greeting; break;
      case 'reflection': this.caption.textContent = line('Dans la vitre, il vous surveille encore.', 'His reflection is still watching you.'); break;
      case 'glare': this.caption.textContent = line('La lampe pivote. Dans la vitre, le Chef détourne les yeux.', 'The lamp swings round. In the glass, the Chief turns his eyes away.'); break;
      case 'watch': this.caption.textContent = line('Son pouce se pose sur le couvercle.', 'His thumb rests on the lid.'); break;
      case 'snap': this.caption.textContent = line('La montre claque.', 'The watch snaps shut.'); break;
      case 'door':
        this.caption.textContent = line('Deux coups de sifflet. Du doigt, il vous montre la sortie.', 'Two blasts on the whistle. He points you to the door.');
        audio.play('whistle', .66);
        break;
    }
    this.draw();
  }

  update(dt: number): void {
    if (this.pose === 'welcome' || this.pose === 'door' || this.paintingState === 'loading' || document.hidden || !document.hasFocus()) return;
    this.time += dt;
    const pose = this.time < GLARE ? 'reflection' : this.time < WATCH ? 'glare'
      : this.time < SNAP ? 'watch' : this.time < WATCH_SOUND + BOSS.chief.watchLead ? 'snap' : 'door';
    // The sample begins with the lid moving. Its metal tick lands a tenth of a second later.
    if (!this.watchStarted && this.time >= WATCH_SOUND && this.time < SNAP + .11) {
      audio.play('chief_watch', .91, 1, Math.max(0, this.time - WATCH_SOUND - dt));
      this.watchStarted = true;
    }
    if (pose !== this.pose) this.show(pose);
    else if (pose === 'glare' && this.time - GLARE < .46) this.draw();
  }

  private draw(): void {
    if (this.paintingState !== 'ready') return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const sw = this.painting.naturalWidth / 3, sh = this.painting.naturalHeight / 2;
    const cel = (index: number) => ctx.drawImage(this.painting, index % 3 * sw + 2, Math.floor(index / 3) * sh + 2, sw - 4, sh - 4, 0, 0, 512, 512);
    if (this.pose === 'glare' && !calmMotion() && this.time - GLARE < .44) {
      const t = Math.max(0, (this.time - GLARE) / .44);
      cel(CEL.reflection);
      ctx.save();
      ctx.globalAlpha = t * t * (3 - 2 * t);
      cel(CEL.glare);
      ctx.restore();
    } else cel(CEL[this.pose]);
  }

  pause(): void {
    audio.fadeOut('chief_watch', .025);
    this.watchStarted = false;
    if (this.pose === 'door') audio.fadeOut('whistle', .04);
  }

  close(): void { this.pause(); this.root.remove(); }
}
