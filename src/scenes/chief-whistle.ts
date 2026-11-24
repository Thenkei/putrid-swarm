import dawnUrl from '../assets/chief-whistle-dawn.webp';
import figureUrl from '../assets/chief-hedge-turn.webp';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { line } from '../engine/i18n';
import { calmMotion } from '../render/lighting';
import './chief-whistle.css';

const HEAD_TURNS = .94;
const SHOULDERS_SETTLE = 1.42;

function loadPaintings() {
  const plate = new Image(), figure = new Image();
  plate.src = dawnUrl;
  figure.src = figureUrl;
  return { plate, figure, ready: Promise.allSettled([plate.decode(), figure.decode()]) };
}

let preparedArt: ReturnType<typeof loadPaintings> | undefined;
export function prepareWhistlePaintings() {
  return preparedArt ??= loadPaintings();
}

/** Two painted shots: the whistle in the mud, then the gap in the hedge seen from Hugo's hands. */
export class WhistleDawn {
  private readonly paintings = prepareWhistlePaintings();
  private readonly frame = el('canvas', { class: 'whistle-shot' });
  private readonly caption = el('p', { class: 'whistle-caption' });
  private readonly blow: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  readonly root: HTMLElement;
  private age: number | null = null;
  private faced = false;
  private sounding = false;
  private figureReady = false;

  constructor(start: () => boolean, close: () => void) {
    this.blow = el('button', { class: 'btn btn-primary', text: line('Souffler dans le sifflet', 'Blow the whistle'), disabled: true, onClick: () => {
      if (this.blow.disabled || this.age !== null || !start()) return;
      this.age = 0;
      preparedArt = undefined;
      this.root.dataset.shot = 'hedge';
      this.blow.hidden = true;
      this.closeButton.focus({ preventScroll: true });
      this.caption.textContent = line('Un coup de sifflet traverse le jardin.', 'A single whistle carries across the garden.');
      this.sound();
      this.paint();
    } });
    this.closeButton = el('button', { class: 'btn', text: line('Retour au jardin', 'Back to the yard'), onClick: close });
    const title = line('Le sifflet du Chef', 'The Chief’s whistle');
    this.caption.textContent = line('Hugo se penche dans l’herbe…', 'Hugo bends down into the grass…');
    this.caption.setAttribute('role', 'status');
    this.frame.width = 960; this.frame.height = 480;
    this.frame.setAttribute('aria-hidden', 'true');
    this.frame.hidden = true;
    this.root = el('div', { class: 'modal whistle-dawn', data: { shot: 'grass' } }, [
      el('section', { class: 'whistle-card' }, [this.frame, el('div', { class: 'whistle-strip' }, [
        el('h2', { text: title }), this.caption, el('div', { class: 'whistle-actions' }, [this.blow, this.closeButton]),
      ])]),
    ]);
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', title);
    this.root.tabIndex = -1;
    this.root.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key === 'Tab') {
        event.preventDefault();
        (this.blow.hidden || this.blow.disabled || document.activeElement === this.blow ? this.closeButton : this.blow).focus();
      }
    });
    void this.paintings.ready.then(([plate, figure]) => {
      if (!this.root.isConnected) return;
      this.frame.hidden = plate.status === 'rejected';
      this.figureReady = figure.status === 'fulfilled';
      this.caption.textContent = line('De la rosée perle sur le laiton. La lanière est encore nouée.', 'Dew beads on the brass. The leather cord is still knotted.');
      this.paint();
      this.blow.disabled = false;
      if (document.activeElement === this.root) this.focus();
    });
  }

  focus(): void { (this.blow.disabled ? this.root : this.blow).focus({ preventScroll: true }); }

  private sound(): void {
    if (this.age === null || this.age >= HEAD_TURNS || this.sounding) return;
    audio.play('chief_dawn_whistle', .9, 1, this.age);
    this.sounding = true;
  }

  update(dt: number): void {
    if (this.age === null || document.hidden || !document.hasFocus()) return;
    this.sound();
    this.age += dt;
    if (!this.faced && this.age >= SHOULDERS_SETTLE) {
      this.faced = true;
      this.root.dataset.shot = 'turned';
      this.caption.textContent = line('Tout au fond, une silhouette s’est tournée vers vous.', 'At the far hedge, a figure has turned to face you.');
    }
    if (this.age < 2 || !this.faced) this.paint();
  }

  pause(): void {
    if (this.sounding) audio.fadeOut('chief_dawn_whistle', .03);
    this.sounding = false;
  }

  private paint(): void {
    const ctx = this.frame.getContext('2d');
    const { plate, figure } = this.paintings;
    if (!ctx || this.frame.hidden || !plate.naturalWidth) return;
    const w = this.frame.width, h = this.frame.height;
    const pw = plate.naturalWidth, ph = plate.naturalHeight / 2;
    if (this.age === null) { ctx.drawImage(plate, 0, 0, pw, ph, 0, 0, w, h); return; }
    ctx.save();
    if (!calmMotion()) {
      const ease = Math.min(1, this.age / 1.75);
      const zoom = 1 + .045 * ease * ease * (3 - 2 * ease);
      ctx.translate(w * .73, h * .62); ctx.scale(zoom, zoom); ctx.translate(-w * .73, -h * .62);
    }
    ctx.drawImage(plate, 0, ph, pw, ph, 0, 0, w, h);
    if (!this.figureReady) { ctx.restore(); return; }
    const progress = Math.min(1, Math.max(0, (this.age - HEAD_TURNS) / (SHOULDERS_SETTLE - HEAD_TURNS)));
    const pose = calmMotion() ? (progress < 1 ? 0 : 2) : progress * 2;
    const index = Math.floor(pose);
    const sw = figure.naturalWidth / 3, sh = figure.naturalHeight;
    const tall = 65, wide = tall * sw / sh;
    const x = w * .73 - wide / 2, feet = h * .69;
    // Bottom blades in the bright opening hide his shoes; all three cels share one planted heel.
    ctx.beginPath(); ctx.moveTo(x, feet - tall); ctx.lineTo(x + wide, feet - tall);
    ctx.lineTo(x + wide, feet - 4); ctx.lineTo(x + wide * .8, feet - 7);
    ctx.lineTo(x + wide * .68, feet - 3); ctx.lineTo(x + wide * .59, feet - 8);
    ctx.lineTo(x + wide * .48, feet - 4); ctx.lineTo(x + wide * .26, feet - 6); ctx.lineTo(x, feet - 3);
    ctx.closePath(); ctx.clip();
    const draw = (cel: number) => ctx.drawImage(figure, sw * cel, 0, sw, sh, x, feet - tall, wide, tall);
    draw(index);
    if (pose > index) { ctx.globalAlpha = pose - index; draw(index + 1); }
    ctx.restore();
  }
}
