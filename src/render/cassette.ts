import { TAPE, type DefenseTake, type MorningTape } from '../core/cassette';
import { SECTOR_IDS, type NightHighlight, type SectorId } from '../core/types';
import { HOUSE_CENTER } from '../core/map';
import { DOOR_OPENINGS } from '../house-layout';
import { cameraView, unproject, type View } from './projection';
import { HOUSE_PAINT_SCALE, houseOffset } from './registration';
import { smoothstep } from './noise';

/** Start on the ordinary wide feed, then frame the lit window and the threshold together. */
export function defenseTapeView(sector: SectorId, age: number, wideZoom: number, reduced: boolean): View {
  const view = cameraView(sector, { x: 0, y: 0, w: TAPE.width, h: TAPE.height }, wideZoom);
  const door = DOOR_OPENINGS[sector];
  const pane = view.rot ? { x: 226, y: 289 } : { x: 534, y: 332 };
  const bottom = door.y + door.h + Math.max(0, door.rise);
  const zoom = TAPE.height / ((bottom - pane.y) * HOUSE_PAINT_SCALE + 23);
  const center = houseOffset(view.rot, (pane.x + door.x + door.w / 2) / 2, (pane.y + bottom) / 2);
  const origin = { ...view, x: 0, y: 0, w: 0, h: 0, cx: HOUSE_CENTER.x, cy: HOUSE_CENTER.y, zoom: 1 };
  const target = unproject(origin, center.dx, -center.lift);
  const t = reduced ? 1 : smoothstep(0, .7, age);
  return { ...view, cx: view.cx + (target.gx - view.cx) * t, cy: view.cy + (target.gy - view.cy) * t,
    zoom: wideZoom + (zoom - wideZoom) * t };
}

const { width, height, columns, frames, fps } = TAPE;
const x = (slot: number) => slot % columns * width;
const y = (slot: number) => Math.floor(slot / columns) * height;

function sheet(): CanvasRenderingContext2D | null {
  const canvas = document.createElement('canvas');
  canvas.width = columns * width;
  canvas.height = Math.ceil(frames / columns) * height;
  return canvas.getContext('2d', { alpha: false });
}

type CopyFeed = (sector: SectorId, into: CanvasRenderingContext2D, x: number, y: number) => void;

/** Keep the four rolling feeds until the first house defense selects its camera. Encode only at dawn. */
export class CassetteRecorder {
  private readonly buffers = new Map<SectorId, CanvasRenderingContext2D>();
  private readonly times: number[] = [];
  private written = 0;
  private bucket = -1;
  private selected: NightHighlight | DefenseTake | undefined;
  private readonly shots: number[] = [];
  private exposedShots = 0;
  private pending: { sector: SectorId; from: number; until: number } | null = null;
  private frozen: CanvasRenderingContext2D | null = null;
  private frozenTimes: number[] = [];

  shot(time: number): void {
    // The first sortie owns the tape. A later sortie must never add sound to it.
    if (this.shots.length < 3 && !(this.selected?.kind === 'defense' && !this.pending)) this.shots.push(time);
  }

  record(time: number, highlight: NightHighlight | DefenseTake | undefined, sector: SectorId | undefined, awayFromDesk: boolean, copy: CopyFeed): void {
    if (this.selected?.kind === 'defense' && !this.pending) return;
    if (highlight && sector && highlight !== this.selected) {
      this.selected = highlight;
      // Leave the swing or falling boards on screen before keeping the clip.
      this.pending = highlight.kind === 'defense'
        ? { sector: highlight.feed, from: highlight.started - 1, until: Infinity }
        : { sector, from: -Infinity, until: time + .75 };
    }
    const bucket = Math.floor(time * fps);
    const returned = this.pending && this.selected?.kind === 'defense' && !awayFromDesk;
    const flash = highlight?.kind === 'defense' && this.shots.length > this.exposedShots;
    // Expose the flash and the return even when the regular VHS frame is not due yet.
    if (bucket === this.bucket && ((!flash && !returned) || time === this.times[(this.written - 1) % frames])) return;
    if (flash) this.exposedShots = this.shots.length;
    this.bucket = bucket;
    const slot = this.written++ % frames;
    this.times[slot] = time;
    for (const id of SECTOR_IDS) {
      if (highlight?.kind === 'defense' && id !== highlight.feed) continue;
      const buffer = this.buffers.get(id) ?? sheet();
      if (!buffer) continue;
      this.buffers.set(id, buffer);
      copy(id, buffer, x(slot), y(slot));
    }
    if (this.pending && (returned || time >= this.pending.until)) this.freeze();
  }

  private freeze(): void {
    if (!this.pending) return;
    const { sector, from: earliest } = this.pending;
    const source = this.buffers.get(sector);
    this.pending = null;
    this.frozenTimes = [];
    this.frozen ??= sheet();
    if (!source || !this.frozen) return;
    this.frozen.clearRect(0, 0, this.frozen.canvas.width, this.frozen.canvas.height);
    const end = this.times[(this.written - 1) % frames]!;
    for (let i = Math.max(0, this.written - frames); i < this.written; i++) {
      const from = i % frames;
      const time = this.times[from]!;
      if (time < end - 8) continue;
      // The last exposure before the cut is still on screen at the one-second mark.
      if (time < earliest && i + 1 < this.written && this.times[(i + 1) % frames]! <= earliest) continue;
      const to = this.frozenTimes.length;
      this.frozen.drawImage(source.canvas, x(from), y(from), width, height, x(to), y(to), width, height);
      this.frozenTimes.push(Math.max(time, earliest));
    }
    // A later intrusion may follow an earlier breach, even through a different door.
    if (this.selected?.kind === 'defense') this.releaseBuffers();
  }

  private releaseBuffers(): void {
    for (const buffer of this.buffers.values()) buffer.canvas.width = 0;
    this.buffers.clear();
  }

  dispose(): void {
    this.releaseBuffers();
    if (this.frozen) this.frozen.canvas.width = 0;
  }

  finish(): MorningTape | undefined {
    this.freeze();
    if (!this.frozen || this.frozenTimes.length < 2) return;
    try {
      const image = this.frozen.canvas.toDataURL('image/jpeg', 0.71);
      if (image.startsWith('data:image/jpeg;') && image.length < 2_000_000) {
        const times = this.frozenTimes;
        const shots = this.shots.filter(time => time >= times[0]! && time <= times.at(-1)!);
        return this.selected?.kind === 'defense' ? { image, times, shots, defense: this.selected } : { image, times };
      }
    } catch (error) {
      console.warn('[cassette] Could not encode last night’s recording', error);
    }
    return;
  }
}
