// The opening, as the creator described it: the menu IS the protagonist's computer screen.
// Start → the news breaks in → a long drag, smoke fills the frame → "plus tard".

import { newGame } from '../core/game';
import { STAGE_H, STAGE_W, type App, type Scene } from '../engine/app';
import { assetUrl, sprite } from '../engine/assets';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S, fmt, getLang, setLang } from '../engine/i18n';
import { haze } from '../engine/haze';
import { endingsTally } from '../engine/progress';
import { hush, say, sayOnce } from '../engine/voice';
import { SAVER_AFTER, SAVER_CORNER_AT, saverAt } from '../engine/saver';
import { drawPlate } from './common';
import { CreditsScene } from './credits';
import { JOINT, MUG, POWER, SPEAKER, VOLUME_STEP_CLICK, VOLUME_STEP_WHEEL, desk, inside } from './desk';
import { goDay, goTitle, resumeGame } from './flow';

const SAVER_TINTS = ['#d8f2e8', '#f2a531', '#9fd8e3', '#e0725c', '#c8f08a', '#d9a8e6'] as const;
const MIRE_SECONDS = 7;
/** Up, up, down, down, left, right, left, right, B, A — by position, so any layout types it. */
const CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'] as const;

export class TitleScene implements Scene {
  /** Scene time of the last sign of life from the player. */
  private lastInput = 0;
  private saver: { readonly node: HTMLElement; readonly logo: HTMLElement; readonly at: number; cornered: boolean } | null = null;
  private mire: { readonly node: HTMLElement; readonly until: number } | null = null;
  private typed = 0;
  private lastPointer = { x: -1, y: -1 };
  private root!: HTMLElement;
  private view: 'main' | 'options' | 'confirm' = 'main';
  private time = 0;
  private alive = true;
  private recentDrags: number[] = [];

  constructor(private readonly app: App) {}

  enter(): void {
    desk.reset();
    audio.setAmbience('room');
    audio.setMusic('title');
    this.root = el('div', { class: 'crt' });
    this.app.ui.append(this.root);
    desk.mount(this.app.ui);
    this.build();
  }

  exit(): void {
    this.alive = false;
    this.app.canvas.style.cursor = '';
    // Whatever the hand was doing, the news finds the desk as it was.
    desk.reset();
    // The game itself is read by its colours (the firing cue, door health): the haze stays at the desk.
    haze.settle();
  }

  // ───────────────────────────── Easter eggs ─────────────────────────────

  private readonly onExhale = (): void => {
    // Scene time slows down in a background tab. The thirty seconds are real time.
    const now = performance.now();
    this.recentDrags = this.recentDrags.filter((at) => now - at < 30_000);
    this.recentDrags.push(now);
    if (this.recentDrags.length === 5) this.app.go(() => new TaranjaDeathScene(this.app));
  };

  private togglePower(): void {
    desk.powered = !desk.powered;
    this.root.classList.toggle('off', !desk.powered);
    this.syncMenuAvailability();
    this.root.classList.toggle('waking', desk.powered);
    if (desk.powered) {
      // The class only carries the wake-up animation: left on, every menu redraw would replay it.
      const root = this.root;
      window.setTimeout(() => root.classList.remove('waking'), 750);
      audio.play('crt_on');
      audio.setAmbience('room');
      audio.setMusic('title');
      window.setTimeout(() => this.alive && sayOnce('egg:on', 'vo_egg_on'), 900);
    } else {
      audio.play('crt_off');
      audio.setMusic('none');
      audio.setAmbience('none');
      window.setTimeout(() => this.alive && !desk.powered && sayOnce('egg:off', 'vo_egg_off'), 900);
    }
  }

  private setVolume(volume: number): void {
    audio.setVolume(volume);
    audio.play('knob');
    desk.showVolume(this.time);
    if (this.view === 'options') this.build();
  }

  /** The player moved: the screensaver, if it was on, gives the menu back. */
  private awake(): void {
    this.lastInput = this.time;
    if (!this.saver) return;
    this.saver.node.remove();
    this.saver = null;
    this.syncMenuAvailability();
  }

  private startSaver(): void {
    const logo = el('div', { class: 'saver-logo', html: 'PUTRID<b>SWARM</b>' });
    const node = el('div', { class: 'crt-saver' }, [logo]);
    this.root.append(node);
    this.saver = { node, logo, at: this.time, cornered: false };
    this.syncMenuAvailability();
  }

  private updateSaver(): void {
    if (!this.saver) {
      if (desk.powered && this.view === 'main' && !this.mire && !desk.busy && this.time - this.lastInput > SAVER_AFTER) this.startSaver();
      return;
    }
    if (!desk.powered) {
      this.awake();
      return;
    }
    const t = this.time - this.saver.at;
    const at = saverAt(t);
    this.saver.logo.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px)`;
    this.saver.logo.style.color = SAVER_TINTS[at.hits % SAVER_TINTS.length] as string;
    if (!this.saver.cornered && t >= SAVER_CORNER_AT) {
      this.saver.cornered = true;
      this.saver.node.classList.add('cornered');
      audio.play('ready');
      window.setTimeout(() => this.alive && sayOnce('egg:corner', 'vo_egg_corner'), 500);
    }
  }

  /** The code everyone knows: the monitor finds a channel that has not broadcast for a long time. */
  private showMire(): void {
    if (this.mire || !desk.powered) return;
    const node = el('div', { class: 'crt-mire' }, [
      el('div', { class: 'bars' }, Array.from({ length: 8 }, () => el('i'))),
      el('div', { class: 'disc' }, [el('b', { text: 'PUTRID TV' }), el('span', { text: S().title.mire })]),
      el('div', { class: 'greys' }, Array.from({ length: 6 }, () => el('i'))),
    ]);
    this.root.append(node);
    this.mire = { node, until: this.time + MIRE_SECONDS };
    this.syncMenuAvailability();
    audio.play('camera');
    window.setTimeout(() => this.alive && sayOnce('egg:mire', 'vo_egg_mire'), 1200);
  }

  onPointerDown(pointer: { x: number; y: number }): void {
    this.awake();
    if (inside(POWER, pointer.x, pointer.y)) this.togglePower();
    else if (inside(JOINT, pointer.x, pointer.y)) desk.take('joint', this.time);
    else if (inside(MUG, pointer.x, pointer.y)) desk.take('mug', this.time);
    // One click turns it down a notch; past silence it comes back up to full.
    else if (inside(SPEAKER, pointer.x, pointer.y)) this.setVolume(audio.volume < VOLUME_STEP_CLICK / 2 ? 1 : audio.volume - VOLUME_STEP_CLICK);
  }

  onPointerMove(pointer: { x: number; y: number }): void {
    // The pointer is also reported when it has not moved (a scene change): only a real move wakes the screen.
    if (Math.hypot(pointer.x - this.lastPointer.x, pointer.y - this.lastPointer.y) > 2) {
      this.lastPointer = { x: pointer.x, y: pointer.y };
      this.awake();
    }
    desk.pointerAt(pointer.x, pointer.y);
    const hot = [POWER, JOINT, MUG, SPEAKER].some((spot) => inside(spot, pointer.x, pointer.y));
    this.app.canvas.style.cursor = hot ? 'pointer' : '';
    if (inside(SPEAKER, pointer.x, pointer.y)) desk.showVolume(this.time, 0.4);
  }

  onWheel(deltaY: number, pointer: { x: number; y: number }): void {
    this.awake();
    if (!inside(SPEAKER, pointer.x, pointer.y) || deltaY === 0) return;
    this.setVolume(audio.volume + (deltaY < 0 ? VOLUME_STEP_WHEEL : -VOLUME_STEP_WHEEL));
  }

  private syncMenuAvailability(): void {
    const menu = this.root.querySelector<HTMLElement>('.crt-menu');
    if (menu) menu.inert = !desk.powered || !!this.saver || !!this.mire;
  }

  private build(focusItem = (document.activeElement as HTMLElement | null)?.dataset.menuItem): void {
    const s = S();
    const saved = this.app.loadSave();
    const logoUrl = assetUrl('logo');
    const logo = logoUrl ? el('img', { class: 'logo' }) : el('div', { class: 'logo-text', html: 'PUTRID<b>SWARM</b>' });
    if (logoUrl) (logo as HTMLImageElement).src = logoUrl;

    const item = (id: string, label: string, onClick: () => void, disabled = false): HTMLButtonElement =>
      el('button', {
        data: { menuItem: id },
        text: label,
        disabled,
        onClick: () => {
          audio.play('click');
          onClick();
        },
      });

    let menu: HTMLElement;
    if (this.view === 'options') {
      menu = el('div', { class: 'menu options' }, [
        item('language', `${s.title.language} · ${s.lang}`, () => {
          setLang(getLang() === 'fr' ? 'en' : 'fr');
          this.build();
        }),
        item('sound', `${s.title.sound} · ${audio.enabled ? s.title.on : s.title.off}`, () => {
          audio.setEnabled(!audio.enabled);
          this.build();
        }),
        item('music', `${s.title.music} · ${audio.musicEnabled ? s.title.on : s.title.off}`, () => {
          audio.setMusicEnabled(!audio.musicEnabled);
          this.build();
        }),
        item('volume', `${s.title.volume} · ${Math.round(audio.volume * 100)} %`, () => {
          audio.setVolume(audio.volume < VOLUME_STEP_CLICK / 2 ? 1 : audio.volume - VOLUME_STEP_CLICK);
          this.build();
        }),
        item('back', s.title.back, () => {
          this.view = 'main';
          this.build('options');
        }),
      ]);
    } else if (this.view === 'confirm') {
      menu = el('div', { class: 'menu' }, [
        item('replace', s.title.yes, () => this.begin()),
        item('keep', s.title.no, () => {
          this.view = 'main';
          this.build('start');
        }),
      ]);
    } else {
      menu = el('div', { class: 'menu' }, [
        item('start', s.title.start, () => {
          if (saved) {
            this.view = 'confirm';
            this.build('keep');
          } else this.begin();
        }),
        item(
          'continue',
          s.title.continue,
          () => {
            if (saved) resumeGame(this.app, saved);
          },
          !saved,
        ),
        item('options', s.title.options, () => {
          this.view = 'options';
          this.build('language');
        }),
        item('credits', S().credits.menu, () => this.app.go(() => new CreditsScene(this.app))),
      ]);
    }

    const newsUrl = assetUrl('plate_news');
    const inset = el('div', { class: 'crt-inset' }, [el('span', { text: s.intro.live })]);
    if (newsUrl) inset.style.backgroundImage = `url(${newsUrl})`;

    const note = this.view === 'confirm' ? s.title.confirmNew : '';
    // Endings seen, in a corner of the screen, once there is at least one: nothing to count before that.
    const endings = endingsTally();
    const seen = endings.seen > 0 && this.view !== 'confirm' ? el('div', { class: 'crt-endings', text: fmt(s.title.endings, { n: endings.seen, total: endings.total }) }) : null;
    this.root.replaceChildren(el('div', { class: 'crt-menu' }, [logo, menu, inset, el('div', { class: 'crt-note', text: note }), seen]));
    // Whatever was over the menu stays over it when the menu is redrawn.
    if (this.mire) this.root.append(this.mire.node);
    if (this.saver) this.root.append(this.saver.node);
    this.syncMenuAvailability();
    if (focusItem) menu.querySelector<HTMLButtonElement>(`[data-menu-item="${CSS.escape(focusItem)}"]`)?.focus();
  }

  private begin(): void {
    this.app.go(() => new IntroScene(this.app));
  }

  update(dt: number): void {
    this.time += dt;
    desk.update(this.time, this.onExhale);
    this.updateSaver();
    if (this.mire && (this.time >= this.mire.until || !desk.powered)) {
      this.mire.node.remove();
      this.mire = null;
      this.syncMenuAvailability();
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    desk.draw(ctx, this.time);
  }

  onKeyDown(code: string, event: KeyboardEvent): void {
    const sleeping = this.saver !== null;
    this.awake();
    if (sleeping) {
      event.preventDefault();
      return;
    }
    if (!desk.powered || this.mire) return;
    this.typed = code === CODE[this.typed] ? this.typed + 1 : code === CODE[0] ? 1 : 0;
    if (this.typed === CODE.length) {
      this.typed = 0;
      this.showMire();
      return;
    }
    // The way out of a sub-menu never depends on reaching its last line.
    if (code === 'Escape' && this.view !== 'main') {
      audio.play('click');
      const parent = this.view === 'options' ? 'options' : 'start';
      this.view = 'main';
      this.build(parent);
      return;
    }
    if ((code === 'Enter' || code === 'NumpadEnter') && this.view === 'main' && !(event.target instanceof HTMLButtonElement)) {
      const saved = this.app.loadSave();
      if (saved) resumeGame(this.app, saved);
      else this.begin();
    }
  }
}

class TaranjaDeathScene implements Scene {
  constructor(private readonly app: App) {}

  enter(): void {
    hush();
    audio.setMusic('none');
    audio.setAmbience('none');
    audio.play('thud');
    const s = S();
    const back = el('button', { class: 'btn btn-primary', text: s.end.menu, onClick: () => goTitle(this.app) });
    this.app.ui.append(el('div', { class: 'center-col end' }, [
      el('h1', { text: s.title.taranja.title }),
      el('p', { text: s.title.taranja.text }),
      el('div', { class: 'row' }, [back]),
    ]));
    back.focus();
  }

  update(): void {}

  render(ctx: CanvasRenderingContext2D): void {
    drawPlate(ctx, 'plate_gameover');
  }
}

type IntroPhase = 'news' | 'smoke' | 'later';

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  grow: number;
  rotation: number;
  spin: number;
  alpha: number;
}

/** Reading speed of the broadcast caption when there is no recording to follow. */
const CAPTION_CHARS_PER_SECOND = 17;
const NEWS_TAIL_SECONDS = 1.4;
const SMOKE_SECONDS = 5;
const LATER_SECONDS = 5.2;

export class IntroScene implements Scene {
  private phase: IntroPhase = 'news';
  private phaseTime = 0;
  private time = 0;
  private root!: HTMLElement;
  private caption!: HTMLElement;
  private readonly puffs: Puff[] = [];
  private done = false;
  /** How long the anchor speaks: the caption is paced on it. */
  private newsSeconds = 0;

  constructor(private readonly app: App) {}

  enter(): void {
    audio.setAmbience('room');
    audio.setMusic('none');
    audio.play('news');
    const s = S();
    // The anchor comes in under the end of the jingle. Without a recording the caption sets the pace.
    this.newsSeconds = s.intro.broadcast.length / CAPTION_CHARS_PER_SECOND;
    window.setTimeout(() => {
      if (this.phase !== 'news') return;
      const spoken = audio.say('vo_broadcast', true);
      if (spoken > 0) this.newsSeconds = this.phaseTime + spoken;
    }, 1500);
    const newsUrl = assetUrl('plate_news');
    const news = el('div', { class: 'news' }, [
      el('div', { class: 'channel', text: s.intro.channel }),
      el('div', { class: 'live-tag', text: s.intro.live }),
      el('div', { class: 'headline', text: s.intro.headline }),
    ]);
    if (newsUrl) news.style.backgroundImage = `url(${newsUrl})`;
    this.caption = el('div', { class: 'caption' });
    // One full-stage click target: the HUD layer sits above the canvas, so skipping is handled here.
    this.root = el('div', { class: 'hit', style: { position: 'absolute', inset: '0' }, onClick: () => this.next() }, [
      el('div', { class: 'crt' }, [news]),
      this.caption,
      el('div', { class: 'skip', text: s.title.skip }),
    ]);
    this.app.ui.append(this.root);
    desk.mount(this.app.ui);
  }

  private next(): void {
    if (this.done) return;
    if (this.phase === 'news') {
      this.phase = 'smoke';
      this.phaseTime = 0;
      this.root.replaceChildren(el('div', { class: 'skip', text: S().title.skip }));
      hush();
      audio.play('exhale');
    } else if (this.phase === 'smoke') {
      this.phase = 'later';
      this.phaseTime = 0;
      const s = S();
      this.root.replaceChildren(el('div', { class: 'later' }, [el('h1', { text: s.intro.later }), el('p', { text: s.intro.laterSub })]));
      audio.setAmbience('none');
      audio.play('engine');
      // The line is the one written on screen.
      window.setTimeout(() => {
        if (this.phase === 'later' && !this.done) say('vo_later', { subtitle: false, interrupt: true });
      }, 900);
    } else {
      this.done = true;
      hush();
      this.app.state = newGame((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
      this.app.save();
      goDay(this.app, { reveal: true });
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.phaseTime += dt;

    if (this.phase === 'news') {
      // The anchor's words arrive at reading speed.
      const text = S().intro.broadcast;
      const shown = Math.min(text.length, Math.floor((Math.max(0, this.phaseTime - 1.5) / Math.max(1, this.newsSeconds - 1.5)) * text.length));
      if (this.caption.textContent?.length !== shown) this.caption.textContent = text.slice(0, shown);
      if (this.phaseTime > this.newsSeconds + NEWS_TAIL_SECONDS) this.next();
    } else if (this.phase === 'smoke') {
      // The drag: smoke rolls in from the right until nothing else is left.
      const rate = 10 + this.phaseTime * 14;
      for (let i = 0; i < rate * dt; i++) {
        this.puffs.push({
          x: STAGE_W * (0.55 + Math.random() * 0.55),
          y: STAGE_H * (0.25 + Math.random() * 0.75),
          vx: -(40 + Math.random() * 120),
          vy: -(10 + Math.random() * 40),
          size: 120 + Math.random() * 160,
          grow: 60 + Math.random() * 90,
          rotation: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 0.5,
          alpha: 0,
        });
      }
      if (this.phaseTime > SMOKE_SECONDS) this.next();
    } else if (this.phaseTime > LATER_SECONDS) {
      this.next();
    }

    for (const puff of this.puffs) {
      puff.x += puff.vx * dt;
      puff.y += puff.vy * dt;
      puff.size += puff.grow * dt;
      puff.rotation += puff.spin * dt;
      puff.alpha = Math.min(0.5, puff.alpha + dt * 0.5);
    }
    if (this.puffs.length > 260) this.puffs.splice(0, this.puffs.length - 260);
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (this.phase === 'news') {
      desk.draw(ctx, this.time);
      return;
    }
    if (this.phase === 'smoke') {
      // Cut from the screen to the man in front of it.
      drawPlate(ctx, 'plate_smoke', { zoom: 1 + this.phaseTime * 0.012, focusY: 0.35 });
    } else {
      ctx.fillStyle = '#cfc7b8';
      ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    }

    const smoke = sprite('fx_smoke');
    for (const puff of this.puffs) {
      ctx.save();
      ctx.translate(puff.x, puff.y);
      ctx.rotate(puff.rotation);
      ctx.globalAlpha = this.phase === 'later' ? puff.alpha * 0.5 : puff.alpha;
      if (smoke) ctx.drawImage(smoke.img, -puff.size / 2, -puff.size / 2, puff.size, puff.size);
      else {
        ctx.fillStyle = '#d8d2c6';
        ctx.beginPath();
        ctx.arc(0, 0, puff.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (this.phase === 'smoke') {
      const veil = Math.max(0, (this.phaseTime - SMOKE_SECONDS * 0.45) / (SMOKE_SECONDS * 0.55));
      ctx.fillStyle = `rgba(207, 199, 184, ${Math.min(1, veil * veil)})`;
      ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    }
  }

  onKeyDown(code: string): void {
    if (code === 'Space' || code === 'Enter' || code === 'Escape') this.next();
  }
}
