#!/usr/bin/env node
// Dev aid: measures the tempo of a track and where its beats fall, so a chart can be laid on it.
//   node tools/beat.mjs public/assets/audio/mus_finale.mp3 [minBpm maxBpm]
// Prints the tempo, the time of the first beat and the track length (see FINALE in src/core/finale.ts).
// Needs ffmpeg on the PATH.
import { execFileSync } from 'node:child_process';

const [file, lo = '120', hi = '180'] = process.argv.slice(2);
if (!file) {
  console.error('usage: node tools/beat.mjs <audio file> [minBpm maxBpm]');
  process.exit(2);
}
const RATE = 11025;
const HOP = 64; // ~5.8 ms per frame
const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
const samples = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 4));
const frames = Math.floor(samples.length / HOP);
const fps = RATE / HOP;

// Onset strength: how much louder each frame is than the one before, never negative.
const energy = new Float64Array(frames);
for (let f = 0; f < frames; f++) {
  let sum = 0;
  for (let i = f * HOP; i < (f + 1) * HOP; i++) sum += samples[i] * samples[i];
  energy[f] = Math.log1p(sum * 1000);
}
const onset = new Float64Array(frames);
for (let f = 1; f < frames; f++) onset[f] = Math.max(0, energy[f] - energy[f - 1]);

/** Sum of the onset strength on a grid of beats: high when the grid sits on the drums. */
const score = (bpm, offset) => {
  const period = (60 / bpm) * fps;
  let total = 0;
  let count = 0;
  for (let t = offset * fps; t < frames - 1; t += period) {
    const i = Math.floor(t);
    total += onset[i] * (1 - (t - i)) + onset[i + 1] * (t - i);
    count++;
  }
  return count ? total / count : 0;
};

let best = { bpm: 0, offset: 0, value: -1 };
for (let bpm = Number(lo); bpm <= Number(hi); bpm += 0.05) {
  const beat = 60 / bpm;
  for (let offset = 0; offset < beat; offset += 0.005) {
    const value = score(bpm, offset);
    if (value > best.value) best = { bpm, offset, value };
  }
}
// How much better than a grid that falls between the beats: a rough confidence.
const off = score(best.bpm, best.offset + 30 / best.bpm);
console.log(JSON.stringify({ bpm: Number(best.bpm.toFixed(2)), offset: Number(best.offset.toFixed(3)), seconds: Number((samples.length / RATE).toFixed(2)), contrast: Number((best.value / Math.max(off, 1e-9)).toFixed(2)) }));
