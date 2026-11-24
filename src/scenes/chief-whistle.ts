import dawnUrl from '../assets/chief-whistle-dawn.webp';
import figureUrl from '../assets/chief-hedge-turn.webp';
import pocketUrl from '../assets/chief-whistle-pocket.webp';
import { sprite } from '../engine/assets';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { line } from '../engine/i18n';
import { calmMotion } from '../render/lighting';
import { mobGaitAssetKey } from '../render/mob-cycles';
import gait from '../render/mob-gaits.json';
import './chief-whistle.css';

const HEAD_TURNS = .94;
const SHOULDERS_SETTLE = 1.42;
const IN_LINE = 3.05;
const POCKET = IN_LINE + 2.85;
const TUCKED = POCKET + .94;
const GRASS_STEPS = [1.80, 2.50] as const;

/** Use the flat cap and shuffling gait the player saw behind the shield. */
function drawFollower(ctx: CanvasRenderingContext2D, age: number, leadX: number, feet: number, reduced: boolean): void {
  const atlas = sprite(mobGaitAssetKey('shambler'));
  const stance = sprite('en_shambler_front');
  if ((!atlas && !stance) || age < SHOULDERS_SETTLE) return;
  const walk = Math.min(1, (age - SHOULDERS_SETTLE) / (IN_LINE - SHOULDERS_SETTLE));
  // Two stills tell the same story when camera and walking motion are reduced.
  const travel = reduced ? (walk < 1 ? 0 : 1) : walk;
  const x = leadX + 19 + 46 * (1 - travel);
  const y = feet - 9 - 6 * (1 - travel);
  const frame = Math.floor(travel * (gait.frames * 2 + 3)) % gait.frames;
  const scale = (51 + 4 * travel) / gait.inkHeight;
  const width = gait.cellWidth * scale, height = gait.cellHeight * scale;
  ctx.save();
  const visible = reduced ? 1 : Math.min(1, walk * 8);
  ctx.globalAlpha = visible;
  ctx.fillStyle = 'rgba(54, 41, 22, .30)';
  ctx.beginPath(); ctx.ellipse(x, y - 3, 12, 2.4, -.12, 0, Math.PI * 2); ctx.fill();
  ctx.filter = 'saturate(0.65) brightness(0.67)';
  // The boots disappear into the grass in the opening.
  ctx.beginPath(); ctx.rect(x - width / 2, y - height, width, height - 3); ctx.clip();
  // Both boots settle in the grass before the silent wait.
  const rest = atlas ? Math.min(1, Math.max(0, (travel - .88) / .12)) : 1;
  if (atlas) {
    ctx.globalAlpha = visible * (stance ? 1 - rest : 1);
    ctx.drawImage(atlas.img, frame % gait.columns * gait.cellWidth, Math.floor(frame / gait.columns) * gait.cellHeight,
      gait.cellWidth, gait.cellHeight, x - width / 2, y - height, width, height);
  }
  if (stance && rest > 0) {
    const standHeight = 55, standWidth = standHeight * stance.w / stance.h;
    ctx.globalAlpha = visible * rest;
    ctx.drawImage(stance.img, x - standWidth / 2, y - standHeight, standWidth, standHeight);
  }
  ctx.restore();
}

function loadPaintings() {
  const plate = new Image(), figure = new Image(), pocket = new Image();
  plate.src = dawnUrl;
  figure.src = figureUrl;
  pocket.src = pocketUrl;
  return { plate, figure, pocket, pocketReady: pocket.decode().then(() => true, () => false),
    ready: Promise.allSettled([plate.decode(), figure.decode()]) };
}

let preparedArt: ReturnType<typeof loadPaintings> | undefined;
export function prepareWhistlePaintings() {
  return preparedArt ??= loadPaintings();
}

/** The whistle on the ground, the file at the hedge, then Hugo putting the whistle away. */
export class WhistleDawn {
  private readonly paintings = prepareWhistlePaintings();
  private readonly frame = el('canvas', { class: 'whistle-shot' });
  private readonly caption = el('p', { class: 'whistle-caption' });
  private readonly blow: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  readonly root: HTMLElement;
  private age: number | null = null;
  private sounding = false;
  private figureReady = false;

  constructor(start: () => boolean, close: () => void) {
    for (const id of ['chief_pocket', 'step_grass_1', 'step_grass_2']) void audio.prepareSample(id);
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
    void this.paintings.pocketReady.then(ready => {
      if (ready && this.root.isConnected && this.root.dataset.shot === 'pocket') this.paint();
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
    if (this.age === null || this.sounding) return;
    if (this.age < HEAD_TURNS) {
      audio.play('chief_dawn_whistle', .9, 1, this.age);
    } else if (this.age >= POCKET && this.age < POCKET + .85) {
      audio.play('chief_pocket', .55, 1, this.age - POCKET);
    } else return;
    this.sounding = true;
  }

  update(dt: number): void {
    if (this.age === null || this.age >= TUCKED || document.hidden || !document.hasFocus()) return;
    this.sound();
    const before = this.age;
    this.age += dt;
    for (const step of GRASS_STEPS) {
      if (before < step && this.age >= step) audio.play('step_grass', .20, .92);
    }
    if (before < POCKET && this.age >= POCKET) {
      this.root.dataset.shot = 'pocket';
      this.caption.textContent = line('Hugo glisse le sifflet dans sa poche.', 'Hugo slips the whistle into his pocket.');
      this.sounding = false;
      this.sound();
    } else if (before < IN_LINE && this.age >= IN_LINE) {
      this.root.dataset.shot = 'file';
      this.caption.textContent = line('Les deux infectés se mettent en file comme au portail. Ils attendent le deuxième coup.',
        'The two infected line up just like they did at the gate. They wait for the second blast.');
    } else if (this.age >= SHOULDERS_SETTLE && this.root.dataset.shot === 'hedge') {
      this.root.dataset.shot = 'turned';
      this.caption.textContent = line('Au premier coup, un infecté se retourne. Un autre sort de la haie.',
        'At the first blast, a walker turns. Another steps out of the hedge.');
    }
    if (before < IN_LINE || this.age >= POCKET) this.paint();
  }

  pause(): void {
    if (this.age !== null) {
      audio.fadeOut('chief_dawn_whistle', .03);
      audio.fadeOut('step_grass', .04);
      audio.fadeOut('chief_pocket', .03);
    }
    this.sounding = false;
  }

  private paint(): void {
    const ctx = this.frame.getContext('2d');
    const { plate, figure } = this.paintings;
    if (!ctx) return;
    const w = this.frame.width, h = this.frame.height;
    const pocket = this.paintings.pocket;
    if (this.root.dataset.shot === 'pocket' && pocket.complete && pocket.naturalWidth) {
      this.frame.hidden = false;
      const sh = pocket.naturalHeight / 2;
      const settled = Math.min(1, Math.max(0, ((this.age ?? POCKET) - (TUCKED - .16)) / .16));
      ctx.drawImage(pocket, 0, 0, pocket.naturalWidth, sh, 0, 0, w, h);
      if (settled > 0) {
        ctx.save(); ctx.globalAlpha = calmMotion() ? (settled >= 1 ? 1 : 0) : settled;
        ctx.drawImage(pocket, 0, sh, pocket.naturalWidth, sh, 0, 0, w, h);
        ctx.restore();
      }
      return;
    }
    if (this.frame.hidden || !plate.naturalWidth) return;
    const pw = plate.naturalWidth, ph = plate.naturalHeight / 2;
    if (this.age === null) { ctx.drawImage(plate, 0, 0, pw, ph, 0, 0, w, h); return; }
    ctx.save();
    const reduced = calmMotion();
    const ease = Math.min(1, this.age / IN_LINE);
    const zoom = reduced ? 1.24 : 1.15 + .09 * ease * ease * (3 - 2 * ease);
    ctx.translate(w * .66, h * .58); ctx.scale(zoom, zoom); ctx.translate(-w * .66, -h * .58);
    ctx.drawImage(plate, 0, ph, pw, ph, 0, 0, w, h);
    const feet = h * .69, leadX = w * .715;
    drawFollower(ctx, this.age, leadX, feet, reduced);
    if (!this.figureReady) { ctx.restore(); return; }
    const progress = Math.min(1, Math.max(0, (this.age - HEAD_TURNS) / (SHOULDERS_SETTLE - HEAD_TURNS)));
    const pose = reduced ? (progress < 1 ? 0 : 2) : progress * 2;
    const index = Math.floor(pose);
    const sw = figure.naturalWidth / 3, sh = figure.naturalHeight;
    const tall = 65, wide = tall * sw / sh;
    const x = leadX - wide / 2;
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
