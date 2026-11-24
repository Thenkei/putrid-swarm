import paintingUrl from '../assets/mechanic-workshop.webp';
import { BOSS } from '../core/data/enemies';
import type { NeighborMeeting } from '../core/game';
import { assetUrl } from '../engine/assets';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { line, S } from '../engine/i18n';
import { calmMotion } from '../render/lighting';
import { costLine } from './common';
import './mechanic-visit.css';

const CHAIN_START = 1.35;
const CHAIN_STILL = CHAIN_START + BOSS.mechanic.chainSeconds;
const HANDOVER = CHAIN_STILL + 1.15;
const INVOICE = HANDOVER + 1.5;
type Pose = 'stop' | 'drag' | 'taut' | 'gift' | 'invoice';

/** A visit is already booked at arrival. These gestures only show what the mechanic did. */
export class MechanicVisit {
  private readonly painting = new Image();
  private readonly canvas = el('canvas', { class: 'mechanic-cels' });
  private readonly frame = el('div', { class: 'mechanic-frame' }, [this.canvas]);
  private readonly caption = el('p', { class: 'mechanic-caption' });
  private readonly cargo = el('p', { class: 'mechanic-cargo' });
  private readonly root: HTMLElement;
  private age = 0;
  private pose: Pose = 'stop';
  private prepared = false;
  private sampleWait = .45;
  private playing = false;

  constructor(host: HTMLElement, private readonly meeting: NeighborMeeting, search: () => void, leave: () => void) {
    const searchButton = el('button', { class: 'btn btn-primary', text: line('Fouiller le garage', 'Search the garage'), onClick: search });
    const leaveButton = el('button', { class: 'btn', text: S().loc.leave, onClick: leave });
    const body = el('div', { class: 'mechanic-copy' }, [
      el('h2', { text: S().neighbor.mechanic.name }), this.caption, this.cargo,
      el('div', { class: 'mechanic-actions' }, [searchButton, leaveButton]),
    ]);
    this.root = el('div', { class: 'modal mechanic-visit' }, [el('div', { class: 'card mechanic-card' }, [this.frame, body])]);
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', S().neighbor.mechanic.name);
    this.caption.setAttribute('role', 'status');
    this.frame.setAttribute('aria-hidden', 'true');
    this.canvas.width = 690;
    this.canvas.height = 460;
    const portrait = assetUrl('por_mechanic_alive');
    if (portrait) this.frame.style.backgroundImage = `url("${portrait}")`;
    this.painting.addEventListener('load', () => this.draw(), { once: true });
    this.painting.src = paintingUrl;
    if (meeting.first) {
      this.cargo.append(costLine(meeting.gift, undefined, '+'));
    }
    this.root.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.stopPropagation(); search(); }
      if (event.key === 'Tab') {
        event.preventDefault();
        (document.activeElement === searchButton ? leaveButton : searchButton).focus();
      }
    });
    host.append(this.root);
    this.show('stop');
    searchButton.focus({ preventScroll: true });
    void audio.prepareSample('mechanic_chain').then(() => { this.prepared = true; });
    if (meeting.first) void audio.prepareSample('vo_mechanic_bill');
  }

  private show(pose: Pose): void {
    this.pose = pose;
    this.frame.dataset.pose = pose;
    this.draw();
    this.cargo.hidden = pose !== 'invoice' && pose !== 'gift';
    switch (pose) {
      case 'stop':
        this.caption.textContent = line('Une paume noire de cambouis vous barre le passage. « Bougez pas. »', 'He holds up a palm black with grease. “Hold it.”');
        break;
      case 'drag':
        this.caption.textContent = line('La chaîne du palan racle le fer.', 'The hoist chain rasps against the iron.');
        break;
      case 'taut':
        this.caption.textContent = line('Les maillons se tendent. Silence.', 'The links pull tight. Silence.') + (this.meeting.first ? '' : ' ' + S().neighbor.mechanic.later);
        break;
      case 'gift':
        this.caption.textContent = this.meeting.gift.springs
          ? line('Du bout des doigts, il fait rouler un ressort vers vous.', 'With two fingers he rolls a spring across the bench to you.')
          : line('Il pousse deux bouts de ferraille à portée de votre main.', 'He pushes two pieces of scrap metal within reach.');
        break;
      case 'invoice':
        this.caption.textContent = line('Un trait de crayon sur le carbone. ', 'His pencil presses through the carbon copy. ') + S().voice.vo_mechanic_bill;
        audio.sayOn('mechanic-bill', 'vo_mechanic_bill', 1);
    }
  }

  update(dt: number): void {
    if (this.pose === 'invoice' || (!this.meeting.first && this.pose === 'taut') || document.hidden || !document.hasFocus()) return;
    if (!this.painting.complete) return;
    this.age += dt;
    if (this.age >= CHAIN_START && this.age < CHAIN_STILL) {
      if (!this.prepared && this.sampleWait > 0) {
        this.sampleWait -= dt;
        this.age = CHAIN_START;
        return;
      }
      if (!this.playing) {
        this.playing = true;
        audio.play('mechanic_chain', .82, 1, Math.max(0, this.age - CHAIN_START - dt));
      }
    } else if (this.playing) this.pause();
    const pose = this.age < CHAIN_START ? 'stop' : this.age < CHAIN_STILL ? 'drag'
      : this.age < HANDOVER || !this.meeting.first ? 'taut' : this.age < INVOICE ? 'gift' : 'invoice';
    if (pose !== this.pose) this.show(pose);
    if (pose === 'drag' || pose === 'gift') this.draw();
  }

  private draw(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx || !this.painting.complete || !this.painting.naturalWidth) return;
    const cel = this.pose === 'stop' ? 0 : this.pose === 'drag' ? 1 : this.pose === 'taut' ? 2
      : this.pose === 'invoice' ? 5 : this.meeting.gift.springs ? 3 : 4;
    const w = this.canvas.width, h = this.canvas.height;
    const sw = this.painting.naturalWidth / 3, sh = this.painting.naturalHeight / 2;
    const x = cel % 3 * sw, y = Math.floor(cel / 3) * sh;
    let shift = 0;
    if (!calmMotion()) {
      if (this.pose === 'gift') shift = -48 * (1 - Math.min(1, (this.age - HANDOVER) / .72)) ** 3;
      if (this.pose === 'drag') {
        const progress = (this.age - CHAIN_START) / (CHAIN_STILL - CHAIN_START);
        shift = 7 * Math.sin(progress * Math.PI * 6) * (1 - progress);
      }
    }
    if (Math.abs(shift) < .2) {
      ctx.drawImage(this.painting, x, y, sw, sh, 0, 0, w, h);
      return;
    }
    // Move the dangling links below their fixed axle, or the hand and the actual
    // steel on the counter. The window frame and the far end of the bench stay put.
    const left = this.pose === 'gift' ? .12 : .39;
    const right = this.pose === 'gift' ? .72 : .57;
    for (let row = 0; row < h; row += 5) {
      const height = Math.min(5, h - row);
      const amount = shift * Math.min(1, Math.max(0, (row / h - .29) / .39));
      const sy = y + row / h * sh, rh = height / h * sh;
      const l = Math.round(left * w + amount), r = Math.round(right * w + amount);
      ctx.drawImage(this.painting, x, sy, left * sw, rh, 0, row, l, height);
      ctx.drawImage(this.painting, x + left * sw, sy, (right - left) * sw, rh, l, row, r - l, height);
      ctx.drawImage(this.painting, x + right * sw, sy, (1 - right) * sw, rh, r, row, w - r, height);
    }
  }

  pause(): void {
    if (this.playing) audio.fadeOut('mechanic_chain', .015);
    this.playing = false;
    if (this.pose === 'invoice') audio.hushOn('mechanic-bill', .03);
  }

  close(): void {
    this.pause();
    this.root.remove();
  }
}
