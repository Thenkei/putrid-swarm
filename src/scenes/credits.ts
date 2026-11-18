// The credits, told the way the game was found: the sticky note on the monitor is where it comes
// from. The camera goes into the note, comes out one summer on a sofa in a student flat where three
// friends are having the idea, and returns to the desk thirteen years later, where the names roll
// on the protagonist's own screen and leave it to a photograph of that summer: the same three, seen
// from the front this time, looking up as they do on the sofa.
//
// Nothing here is played and nothing is at stake: it can be left at any moment. What rises from the
// sofa is the game's own art, and only what the player has already met — the credits can be opened
// from the title before the first night, and must not give the end away.

import { STAGE_H, STAGE_W, type App, type Scene } from '../engine/app';
import { assetUrl, sprite } from '../engine/assets';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S } from '../engine/i18n';
import { endingsTally } from '../engine/progress';
import { hush } from '../engine/voice';
import { Atmosphere } from './atmosphere';
import { desk } from './desk';
import { goTitle } from './flow';

const CX = STAGE_W / 2;
const CY = STAGE_H / 2;

/** The script, in seconds. The theme runs 75 s and rings out from 71: everything is hung on it. */
const AT = {
  /** The desk as the title leaves it, then the camera goes to the note. */
  toNote: 1.2,
  atNote: 6.2,
  /** The yellow of the note takes the whole picture, and gives it back on the sofa. */
  summer: 7.2,
  date: 8.4,
  lines: [11, 16, 20.5] as const,
  names: 26,
  /** The first idea leaves the sofa. */
  ideas: 12,
  /** Back through the note. */
  leave: 35.2,
  later: 36.2,
  /** The card has been read: the yellow thins and the camera starts back toward the chair. */
  desk: 39.2,
  /** The camera is back in the chair; the screen wakes and the names roll. */
  roll: 43.5,
  /** The names are gone: the photograph comes up on the glass, and the last words under it. */
  thanks: 61.8,
  fade: 72,
  end: 73.6,
} as const;

const CAMERA_AT_DESK = AT.roll - 0.5;

/** The note on the monitor casing, in stage units, and how close the camera gets to it. */
const NOTE = { x: 282, y: 66, zoom: 3.3 } as const;
const NOTE_YELLOW = '#f2c84b';
const PHOTO = 'credits_photo';

const FLAT = { plate: 'plate_credits_flat', focusY: 0.42 } as const;
/** The sofa: how wide it is drawn, and how far below the frame its feet sit when the camera is furthest back. */
const SOFA = { art: 'credits_sofa', width: 900, sink: 236 } as const;
/** The top of each of the three heads, as fractions of the sofa's picture: where an idea leaves from. */
const HEADS = [
  { x: 0.208, y: 0.02 },
  { x: 0.49, y: 0.01 },
  { x: 0.78, y: 0.04 },
] as const;
/** The television's glass, as fractions of the room's picture. */
const TV = { x: 0.237, y: 0.314, w: 0.09, h: 0.114 } as const;

/** What the three were already talking about. The second list is only for those who have seen how it ends. */
const IDEAS: readonly { readonly art: string; readonly size: number }[] = [
  { art: 'dev_log_armed', size: 96 },
  { art: 'boss_mower_front', size: 118 },
  { art: 'dev_spikes_armed', size: 84 },
  { art: 'por_mail_alive', size: 104 },
  { art: 'dev_horn_armed', size: 92 },
  { art: 'boss_mayor_front', size: 120 },
  { art: 'dev_net_armed', size: 92 },
  { art: 'por_mechanic_alive', size: 104 },
];
const IDEAS_SEEN: readonly { readonly art: string; readonly size: number }[] = [
  { art: 'orchard_rabbit_back', size: 112 },
  { art: 'finale_mower_rider', size: 126 },
];
const IDEA_EVERY = 2.3;
const IDEA_LIFE = 6.5;

interface Idea {
  readonly art: string;
  readonly size: number;
  readonly head: number;
  readonly born: number;
  readonly sway: number;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const smooth = (v: number): number => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
/** 0 before `from`, 1 after `to`, eased in between. */
const ramp = (time: number, from: number, to: number): number => smooth((time - from) / (to - from));

export class CreditsScene implements Scene {
  private time = 0;
  private left = false;
  private readonly air = new Atmosphere({ motes: 46 });
  private readonly ideas: Idea[] = [];
  private readonly pool: readonly { readonly art: string; readonly size: number }[];
  private nextIdea: number = AT.ideas;
  private ideaCount = 0;
  private root!: HTMLElement;
  private monitor!: HTMLElement;
  private roll!: HTMLElement;
  private rollHeight = 0;
  private readonly cues: { readonly at: number; done: boolean; readonly run: () => void }[] = [];

  constructor(private readonly app: App) {
    // Whoever has reached the end of a run may see where it was going.
    this.pool = endingsTally('finale').seen > 0 ? [...IDEAS.slice(0, 3), ...IDEAS_SEEN, ...IDEAS.slice(3)] : IDEAS;
  }

  enter(): void {
    hush();
    desk.reset();
    audio.setAmbience('room');
    audio.setMusic('credits');
    const s = S().credits;

    const date = el('div', { class: 'credits-date' });
    const lines = s.lines.map((text) => el('p', { class: 'credits-line', text }));
    const names = el('div', { class: 'credits-names' }, [el('small', { text: s.sofa.title }), el('div', {}, s.sofa.names.map((name) => el('b', { text: name })))]);
    const later = el('div', { class: 'credits-later' }, [el('h1', { text: s.later })]);
    const scanCredit = el('a', { text: 'Lee Perry-Smith · Infinite-Realities (CC BY 3.0)' });
    scanCredit.href = import.meta.env.BASE_URL + 'assets/licenses/infected-head.txt';
    scanCredit.target = '_blank';
    scanCredit.rel = 'noopener';
    this.roll = el(
      'div',
      { class: 'credits-roll' },
      [
        el('h2', { text: 'Putrid Swarm' }),
        ...s.roll.map((entry) => el('section', {}, [el('small', { text: entry.role }), ...entry.names.map((name) => el('b', { text: name }))])),
        el('section', {}, [el('small', { text: s.scannedHead }), scanCredit]),
        el('p', { text: s.disclaimer }),
      ],
    );
    // That summer, as it was: the one real picture in the game.
    const photoUrl = assetUrl(PHOTO);
    const photo = photoUrl ? el('img', { class: 'credits-photo' }) : null;
    if (photo && photoUrl) {
      photo.src = photoUrl;
      photo.alt = s.photoAlt;
    }
    const thanks = el('div', { class: 'credits-thanks' }, [photo, photo ? el('small', { text: s.summer }) : null, el('h2', { text: s.thanks }), el('span', { text: s.sign })]);
    const crt = el('div', { class: 'crt' }, [el('div', { class: 'crt-menu' }, [this.roll, thanks])]);
    this.monitor = el('div', { class: 'credits-monitor' }, [crt]);
    desk.mountNote(this.monitor);
    const skip = el('button', { class: 'credits-skip', text: s.skip, onClick: () => this.leave() });
    this.root = el('div', { class: 'credits' }, [date, ...lines, names, later, skip]);
    this.app.ui.append(this.monitor, this.root);
    this.rollHeight = this.roll.offsetHeight;

    const show = (node: HTMLElement, from: number, to: number): void => {
      this.cue(from, () => node.classList.add('on'));
      this.cue(to, () => node.classList.remove('on'));
    };
    this.cue(AT.date, () => this.type(date, s.date));
    this.cue(AT.leave - 1.4, () => date.classList.remove('on'));
    lines.forEach((line, index) => show(line, AT.lines[index] ?? AT.names, (AT.lines[index + 1] ?? AT.names) - 0.5));
    show(names, AT.names, AT.leave - 0.9);
    show(later, AT.later, AT.desk);
    this.cue(CAMERA_AT_DESK, () => this.monitor.classList.add('on'));
    this.cue(AT.thanks, () => thanks.classList.add('on'));
    this.cue(AT.fade, () => {
      this.root.classList.add('out');
      this.monitor.classList.remove('on');
    });
    this.cue(AT.end, () => this.leave());
  }

  exit(): void {
    this.left = true;
    desk.reset();
  }

  private cue(at: number, run: () => void): void {
    this.cues.push({ at, done: false, run });
  }

  /** The date, written the way the news captions are: one letter at a time. */
  private type(node: HTMLElement, text: string): void {
    node.classList.add('on');
    const started = this.time;
    const step = (): void => {
      if (this.left) return;
      const shown = Math.min(text.length, Math.floor((this.time - started) * 22));
      node.textContent = text.slice(0, shown);
      if (shown < text.length) requestAnimationFrame(step);
    };
    step();
  }

  private leave(): void {
    if (this.left) return;
    this.left = true;
    audio.setMusic('none');
    goTitle(this.app);
  }

  onKeyDown(code: string): void {
    if (code === 'Escape') this.leave();
  }

  // ───────────────────────────── Loop ─────────────────────────────

  update(dt: number): void {
    this.time += dt;
    desk.update(this.time);
    this.air.update(dt);
    for (const cue of this.cues) {
      if (cue.done || this.time < cue.at) continue;
      cue.done = true;
      cue.run();
    }
    if (this.inSummer) {
      while (this.time >= this.nextIdea && this.nextIdea < AT.leave - 3) {
        const pick = this.pool[this.ideaCount % this.pool.length] as (typeof this.pool)[number];
        // Each head in turn, the middle one first: it is the one pointing at the screen.
        this.ideas.push({ ...pick, head: [1, 0, 2][this.ideaCount % 3] as number, born: this.nextIdea, sway: Math.random() * 6 });
        this.ideaCount++;
        this.nextIdea += IDEA_EVERY;
      }
    }
    while (this.ideas.length > 0 && this.time - (this.ideas[0] as Idea).born > IDEA_LIFE) this.ideas.shift();
    // The names climb the glass at a reader's pace and are gone when the last words come up.
    const travel = ramp(this.time, AT.roll, AT.thanks + 0.4);
    const linear = clamp01((this.time - AT.roll) / (AT.thanks + 0.4 - AT.roll));
    this.roll.style.transform = `translateY(${Math.round(399 - (travel * 0.25 + linear * 0.75) * (this.rollHeight + 399))}px)`;
  }

  private get inSummer(): boolean {
    return this.time >= AT.summer && this.time < AT.later;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const t = this.time;
    ctx.fillStyle = '#0d0b09';
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);

    if (this.inSummer) this.drawSummer(ctx, t);
    else this.drawDesk(ctx, t);

    // Through the note and back: its yellow takes the picture, the cut happens underneath.
    const wash = t < AT.later ? ramp(t, AT.atNote - 0.7, AT.summer) * (1 - ramp(t, AT.summer, AT.summer + 1.6)) + ramp(t, AT.leave, AT.later) : 1 - ramp(t, AT.desk - 0.2, AT.desk + 1.8);
    if (wash > 0) {
      ctx.globalAlpha = clamp01(wash);
      ctx.fillStyle = NOTE_YELLOW;
      ctx.fillRect(0, 0, STAGE_W, STAGE_H);
      ctx.globalAlpha = 1;
    }

    const dark = Math.max(1 - ramp(t, 0, 1.4), ramp(t, AT.fade, AT.end - 0.2));
    if (dark > 0) {
      ctx.fillStyle = `rgba(5, 4, 3, ${dark})`;
      ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    }
  }

  /** The desk, from the chair or from very close to the note. */
  private drawDesk(ctx: CanvasRenderingContext2D, t: number): void {
    // In before the summer, out after it: the same move, played backwards.
    const close = t < AT.summer ? ramp(t, AT.toNote, AT.atNote) : 1 - ramp(t, AT.desk + 0.4, CAMERA_AT_DESK);
    const zoom = 1 + (NOTE.zoom - 1) * close;
    const x = CX + (NOTE.x - CX) * close;
    const y = CY + (NOTE.y - CY) * close;
    ctx.save();
    ctx.translate(CX, CY);
    ctx.scale(zoom, zoom);
    // Never past the edge of the picture: the note is in its corner.
    ctx.translate(-Math.max(CX / zoom, Math.min(STAGE_W - CX / zoom, x)), -Math.max(CY / zoom, Math.min(STAGE_H - CY / zoom, y)));
    desk.draw(ctx, t);
    ctx.restore();
  }

  /** One summer, on a sofa. The room and the sofa are two layers: the camera leans in between them. */
  private drawSummer(ctx: CanvasRenderingContext2D, t: number): void {
    const push = ramp(t, AT.summer, AT.leave);
    const drift = Math.sin((t - AT.summer) * 0.21) * 14;

    const room = sprite(FLAT.plate);
    const zoom = 1.03 + push * 0.09;
    ctx.save();
    ctx.translate(CX, CY);
    ctx.scale(zoom, zoom);
    ctx.translate(-CX + drift * 0.4, -CY - push * 10);
    let tv = { x: 0, y: 0, w: 0, h: 0 };
    if (room) {
      const scale = Math.max(STAGE_W / room.w, STAGE_H / room.h);
      const w = room.w * scale;
      const h = room.h * scale;
      const left = (STAGE_W - w) / 2;
      const top = (STAGE_H - h) * FLAT.focusY;
      ctx.drawImage(room.img, left, top, w, h);
      tv = { x: left + TV.x * w, y: top + TV.y * h, w: TV.w * w, h: TV.h * h };
    } else {
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    }
    // The television: whatever is on, it flickers, and the whole room takes its light.
    const flicker = 0.5 + 0.22 * Math.sin(t * 11.3) + 0.16 * Math.sin(t * 27.1 + 1) + 0.12 * Math.sin(t * 3.7);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(150, 200, 255, ${0.1 + 0.12 * flicker})`;
    ctx.fillRect(tv.x, tv.y, tv.w, tv.h);
    const glow = ctx.createRadialGradient(tv.x + tv.w / 2, tv.y + tv.h / 2, 10, tv.x + tv.w / 2, tv.y + tv.h / 2, 520);
    glow.addColorStop(0, `rgba(120, 170, 255, ${0.1 + 0.08 * flicker})`);
    glow.addColorStop(1, 'rgba(120, 170, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    this.air.drawFront(ctx, drift, 0.8);

    // The sofa is nearer: it grows faster, slides further and sinks as the camera passes over it.
    const sofa = sprite(SOFA.art);
    const near = 1 + push * 0.2;
    const laugh = Math.max(0, Math.sin(t * 0.9 + 1)) ** 6 * Math.sin(t * 17) * 0.006;
    ctx.save();
    ctx.translate(CX + drift * 1.5, STAGE_H + SOFA.sink + push * 70);
    ctx.scale(near, near * (1 + Math.sin(t * 1.3) * 0.004));
    ctx.rotate(laugh);
    if (sofa) {
      const height = (sofa.h / sofa.w) * SOFA.width;
      ctx.drawImage(sofa.img, -SOFA.width / 2, -height, SOFA.width, height);
    }
    ctx.restore();

    if (sofa) {
      const width = SOFA.width * near;
      const height = (sofa.h / sofa.w) * width;
      const feet = STAGE_H + SOFA.sink + push * 70;
      for (const idea of this.ideas) {
        const head = HEADS[idea.head] as (typeof HEADS)[number];
        this.drawIdea(ctx, idea, t, { x: CX + drift * 1.5 + (head.x - 0.5) * width, y: feet - (1 - head.y) * height });
      }
    }
  }

  /** An idea: a thought bubble that leaves a head, swells, wanders up and thins out. */
  private drawIdea(ctx: CanvasRenderingContext2D, idea: Idea, t: number, from: { x: number; y: number }): void {
    const age = (t - idea.born) / IDEA_LIFE;
    if (age < 0 || age >= 1) return;
    const art = sprite(idea.art);
    // The head it comes from moves with the sofa.
    const fromX = from.x;
    const fromY = from.y;
    const rise = smooth(age);
    const x = fromX + Math.sin(idea.sway + age * 4) * 22 + (idea.head - 1) * rise * 50;
    const y = fromY - 70 - rise * 190;
    const alpha = Math.min(1, age * 6) * (1 - ramp(age, 0.72, 1));
    const size = idea.size * (0.55 + 0.45 * smooth(age * 3));
    const radius = size * 0.72;
    ctx.save();
    ctx.globalAlpha = alpha;
    // The little ones that lead up to it.
    ctx.fillStyle = 'rgba(255, 250, 235, 0.92)';
    for (let i = 1; i <= 3; i++) {
      const k = i / 4;
      ctx.beginPath();
      ctx.arc(fromX + (x - fromX) * k, fromY - 8 + (y + radius - fromY + 8) * k, 3 + i * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(58, 39, 20, 0.55)';
    ctx.stroke();
    if (art) {
      const scale = Math.min(size / art.w, size / art.h);
      const w = art.w * scale;
      const h = art.h * scale;
      ctx.drawImage(art.img, x - w / 2, y - h / 2, w, h);
    }
    ctx.restore();
  }
}
