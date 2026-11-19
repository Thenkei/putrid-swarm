import birthdayUrl from '../assets/mamie-birthday.webp';
import { TAPE, type MorningTape } from '../core/cassette';
import { SECTOR_IDS, type SectorId } from '../core/types';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S } from '../engine/i18n';
import { calmMotion } from '../render/lighting';

const counter = (t: number) => `00:${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t) % 60).padStart(2, '0')}`;

export class CassettePlayer {
  readonly root: HTMLElement;
  readonly launch: HTMLButtonElement;
  private readonly screen = el('canvas');
  private readonly sheet = new Image();
  private readonly birthday = new Image();
  private readonly transport: HTMLButtonElement;
  private readonly seek = el('input');
  private readonly stamp = el('span', { class: 'tape-stamp' });
  private elapsed = 0;
  private playing = false;
  private winding = false;
  private insert = 0;
  private lastFrame = -1;

  constructor(
    private readonly tape: MorningTape,
    sector: SectorId,
    private firstViewing: boolean,
    private readonly seen: () => void,
    inspect: () => void,
  ) {
    const s = S().cassette;
    this.screen.width = TAPE.width * 2;
    this.screen.height = TAPE.height * 2;
    this.screen.setAttribute('aria-label', S().sector[sector]);
    this.launch = el('button', { class: 'tape-launch', disabled: true, onClick: () => this.open() }, [
      el('span', { class: 'tape-mini', text: 'VHS' }),
      el('span', { text: s.rewind }),
    ]);
    this.launch.setAttribute('aria-expanded', 'false');
    this.transport = el('button', { class: 'vcr-key play-key', onClick: () => this.toggle() });
    this.seek.type = 'range';
    this.seek.min = '0';
    this.seek.max = String(this.duration);
    this.seek.step = '0.01';
    this.seek.value = '0';
    this.seek.setAttribute('aria-label', s.seek);
    this.seek.addEventListener('input', () => {
      this.insert = 0;
      this.winding = false;
      this.playing = false;
      this.elapsed = this.seek.valueAsNumber;
      this.paint();
    });
    const cam = `CAM 0${SECTOR_IDS.indexOf(sector) + 1} · ${S().sector[sector]}`;
    const monitor = el('div', { class: 'tape-monitor' }, [this.screen, el('span', { class: 'tape-cam', text: cam }), this.stamp]);
    this.root = el('section', { class: 'vcr-deck' }, [
      el('header', { class: 'tape-case' }, [
        el('div', { class: 'tape-paper' }, [el('strong', { text: s.label }), el('span', { text: s.keep })]),
        el('div', { class: 'tape-window' }, [el('i'), el('i')]),
      ]),
      monitor,
      this.seek,
      el('div', { class: 'vcr-transport' }, [
        el('button', { class: 'vcr-key', text: '◀◀', title: s.rewind, onClick: () => this.rewind() }),
        this.transport,
        el('button', { class: 'vcr-key tape-yard', text: S().morning.inspect, onClick: () => { this.close(); inspect(); } }),
        el('button', { class: 'vcr-key', text: '⏏', title: s.eject, onClick: () => this.close() }),
      ]),
    ]);
    this.root.setAttribute('aria-label', s.title);
    this.root.hidden = true;
    const ready = () => {
      this.launch.disabled = this.sheet.naturalWidth !== TAPE.columns * TAPE.width
        || this.sheet.naturalHeight !== TAPE.frames / TAPE.columns * TAPE.height
        || (firstViewing && !this.birthday.complete);
    };
    this.sheet.onload = ready;
    if (firstViewing) {
      this.birthday.onload = ready;
      this.birthday.onerror = ready;
      this.birthday.src = birthdayUrl;
    }
    this.sheet.src = tape.image;
  }

  private get duration(): number { return this.tape.times.at(-1)! - this.tape.times[0]!; }

  private open(): void {
    this.root.hidden = false;
    this.launch.setAttribute('aria-expanded', 'true');
    this.insert = this.firstViewing && this.birthday.naturalWidth ? 0.68 : 0;
    if (this.insert) {
      this.firstViewing = false;
      this.seen();
    }
    audio.play('click');
    this.start();
    this.transport.focus();
  }

  close(): void {
    audio.play('click');
    this.root.hidden = true;
    this.playing = false;
    this.winding = false;
    this.insert = 0;
    this.launch.setAttribute('aria-expanded', 'false');
    this.launch.focus();
  }

  private toggle(): void {
    audio.play('click');
    if (this.elapsed >= this.duration && !this.winding) this.start();
    else {
      this.winding = false;
      this.playing = !this.playing;
      this.paint();
    }
  }

  private rewind(): void {
    audio.play('click');
    this.insert = 0;
    if (calmMotion() || !this.elapsed) this.start();
    else {
      this.winding = true;
      this.playing = true;
      this.paint();
    }
  }

  private start(): void {
    this.winding = false;
    this.elapsed = 0;
    this.playing = true;
    this.lastFrame = -1;
    this.paint();
  }

  update(dt: number): void {
    if (this.root.hidden || !this.playing) return;
    if (this.winding) {
      this.elapsed = Math.max(0, this.elapsed - dt * 14);
      if (!this.elapsed) this.winding = false;
    } else if (this.insert > 0) this.insert = Math.max(0, this.insert - dt);
    else this.elapsed = Math.min(this.duration, this.elapsed + dt);
    if (this.elapsed >= this.duration) this.playing = false;
    this.paint();
  }

  private paint(): void {
    const ctx = this.screen.getContext('2d');
    if (!ctx) return;
    const time = this.tape.times[0]! + this.elapsed;
    const next = this.tape.times.findIndex(t => t > time + 0.00001);
    const index = next < 0 ? this.tape.times.length - 1 : Math.max(0, next - 1);
    const w = this.screen.width, h = this.screen.height;
    if (this.insert > 0) {
      const img = this.birthday;
      const crop = Math.min(img.naturalHeight, img.naturalWidth * h / w);
      ctx.drawImage(img, 0, (img.naturalHeight - crop) * 0.42, img.naturalWidth, crop, 0, 0, w, h);
      if (!calmMotion()) {
        const y = Math.floor(h * (1 - this.insert / 0.68));
        ctx.drawImage(this.screen, 0, y, w - 14, 6, 14, y, w - 14, 6);
      }
    } else if (this.lastFrame !== index) {
      ctx.drawImage(this.sheet, (index % TAPE.columns) * TAPE.width, Math.floor(index / TAPE.columns) * TAPE.height,
        TAPE.width, TAPE.height, 0, 0, w, h);
      this.lastFrame = index;
    }
    this.root.classList.toggle('tape-winding', this.winding);
    this.root.classList.toggle('family-frame', this.insert > 0);
    this.root.classList.toggle('tape-running', this.playing);
    const label = this.playing ? 'Ⅱ  ' + S().cassette.pause : '▶  ' + S().cassette.play;
    if (this.transport.textContent !== label) this.transport.textContent = label;
    this.seek.value = String(this.elapsed);
    this.stamp.textContent = counter(this.elapsed);
  }
}
