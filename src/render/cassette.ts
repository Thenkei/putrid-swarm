import { TAPE, type MorningTape } from '../core/cassette';
import { SECTOR_IDS, type NightHighlight, type SectorId } from '../core/types';

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

/** A circular buffer of already painted CCTV pictures. No world render or image encoding in the night loop. */
export class CassetteRecorder {
  private readonly buffers = new Map<SectorId, CanvasRenderingContext2D>();
  private readonly times: number[] = [];
  private written = 0;
  private bucket = -1;
  private selected: NightHighlight | undefined;
  private pending: { sector: SectorId; until: number } | null = null;
  private frozen: CanvasRenderingContext2D | null = null;
  private frozenTimes: number[] = [];

  record(time: number, highlight: NightHighlight | undefined, sector: SectorId | undefined, copy: CopyFeed): void {
    if (this.selected?.kind === 'breach' && !this.pending) return;
    if (highlight && sector && highlight !== this.selected) {
      this.selected = highlight;
      // Leave the swing or falling boards on screen before keeping the clip.
      this.pending = { sector, until: time + 0.75 };
    }
    const bucket = Math.floor(time * fps);
    if (bucket === this.bucket) return;
    this.bucket = bucket;
    const slot = this.written++ % frames;
    this.times[slot] = time;
    for (const id of SECTOR_IDS) {
      const buffer = this.buffers.get(id) ?? sheet();
      if (!buffer) continue;
      this.buffers.set(id, buffer);
      copy(id, buffer, x(slot), y(slot));
    }
    if (this.pending && time >= this.pending.until) this.freeze();
  }

  private freeze(): void {
    if (!this.pending) return;
    const source = this.buffers.get(this.pending.sector);
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
      const to = this.frozenTimes.length;
      this.frozen.drawImage(source.canvas, x(from), y(from), width, height, x(to), y(to), width, height);
      this.frozenTimes.push(time);
    }
    // A breach is the highest-priority highlight and can never be replaced.
    if (this.selected?.kind === 'breach') this.releaseBuffers();
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
      if (image.startsWith('data:image/jpeg;') && image.length < 2_000_000) return { image, times: this.frozenTimes };
    } catch (error) {
      console.warn('[cassette] Could not encode last night’s recording', error);
    }
    return;
  }
}
