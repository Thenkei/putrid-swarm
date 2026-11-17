#!/usr/bin/env node
// Turns raw generated audio (art/audio/raw) into runtime assets (public/assets/audio):
// trims silence, applies the per-entry effect chain, fades out anything the generator cut off while
// it was still sounding, levels the result and writes manifest.json.
//
//   node tools/process-audio.mjs              # everything
//   node tools/process-audio.mjs --only log   # one entry (the manifest is still rewritten in full)
//
// Requires ffmpeg and ffprobe on the PATH. Nothing here calls a paid service.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO } from './audio-manifest.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = join(ROOT, 'art', 'audio', 'raw');
const OUT_DIR = join(ROOT, 'public', 'assets', 'audio');
const MANIFEST = join(OUT_DIR, 'manifest.json');

const args = process.argv.slice(2);
const onlyIndex = args.indexOf('--only');
const only = onlyIndex >= 0 ? args[onlyIndex + 1]?.split(',').map((s) => s.trim()) : undefined;

const TRIM_HEAD = 'silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.01';
const TRIM_BOTH = `${TRIM_HEAD},areverse,${TRIM_HEAD},areverse`;

/** Character of a line: who is speaking through what. */
const FX = {
  tv: 'highpass=f=170,lowpass=f=5200,acompressor=threshold=-20dB:ratio=3:attack=5:release=80',
  megaphone: 'highpass=f=520,lowpass=f=2900,volume=10dB,alimiter=limit=0.6,aecho=0.8:0.7:45:0.3',
  far: 'highpass=f=220,lowpass=f=3800,aecho=0.8:0.6:60:0.25',
  /** A small wooden shed: close, a short boxy reflection, the top shaved off. */
  shed: 'highpass=f=85,lowpass=f=7200,aecho=0.8:0.55:19|31:0.16|0.09',
  /**
   * A CB set: a narrow telephone band, squashed hard, the peaks clipped soft the way a cheap speaker
   * breaks up, and a few bits shaved off. The hiss is not baked in: the scene lays its own static under
   * it, as loud as the dial is far from the voice.
   */
  radio: 'highpass=f=330,lowpass=f=2900,acompressor=threshold=-26dB:ratio=8:attack=1:release=60,volume=7dB,asoftclip=type=tanh,acrusher=bits=10:mix=0.35,highpass=f=300,lowpass=f=3100',
};

/** Fades the last `seconds` out without needing to know how long the sound is. */
const fadeTail = (seconds) => `areverse,afade=t=in:d=${seconds.toFixed(3)},areverse`;
/** A sound whose last moments are within this many dB of its peak was cut off, not finished. */
const CUT_OFF_WITHIN_DB = 30;
const TAIL_WINDOW = 0.12;
const DECLICK = 0.03;

/** Per kind: filter chain before levelling, target peak (dBFS) or loudness, and encoding. */
const PROFILE = {
  sfx: { chain: (entry, tail) => `${TRIM_HEAD},afade=t=in:d=0.004,${fadeTail(tail)}`, peak: -2, channels: 1, bitrate: '96k' },
  // Beds must keep their exact length: the generator made them loop.
  loop: { chain: () => 'anull', peak: -6, channels: 2, bitrate: '128k' },
  music: { chain: () => 'loudnorm=I=-17:TP=-1.5:LRA=11', peak: null, channels: 2, bitrate: '128k' },
  voice: { chain: (entry) => [TRIM_BOTH, entry.fx ? FX[entry.fx] : null, 'afade=t=in:d=0.01', fadeTail(DECLICK)].filter(Boolean).join(','), peak: -2, channels: 1, bitrate: '96k' },
};

function ffmpeg(input, filters, output, inputOptions = []) {
  const out = output ? ['-ar', '44100', ...output] : ['-f', 'null', '-'];
  const result = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-y', ...inputOptions, '-i', input, '-af', filters, ...out], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr.split('\n').slice(-4).join(' '));
  return result.stderr;
}

const duration = (file) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());

const stat = (log, name) => {
  const found = new RegExp(`${name}: (-?[\\d.]+) dB`).exec(log);
  return found ? Number(found[1]) : null;
};

/**
 * How long the fade-out of an effect should be. The generator stops at the requested length whether
 * or not the sound is over (an idling engine, a held horn): those get a real fade, the rest a declick.
 */
function tailFor(entry, raw, seconds) {
  if (entry.tail !== undefined) return Math.min(entry.tail, seconds / 2);
  const peak = stat(ffmpeg(raw, 'volumedetect'), 'max_volume');
  const end = stat(ffmpeg(raw, 'volumedetect', undefined, ['-sseof', `-${TAIL_WINDOW}`]), 'mean_volume');
  if (peak === null || end === null || end < peak - CUT_OFF_WITHIN_DB) return DECLICK;
  return Math.min(0.5, Math.max(0.1, seconds * 0.25));
}

function processEntry(entry) {
  const raw = join(RAW_DIR, `${entry.id}.mp3`);
  if (!existsSync(raw)) return null;
  const profile = PROFILE[entry.kind];
  if (!profile) throw new Error(`${entry.id}: no processing profile for kind "${entry.kind}"`);
  const tail = entry.kind === 'sfx' ? tailFor(entry, raw, duration(raw)) : 0;
  let filters = profile.chain(entry, tail);
  if (profile.peak !== null) {
    // Measure the peak after the chain, then bring it to the target in the real pass.
    const measured = /max_volume: (-?[\d.]+) dB/.exec(ffmpeg(raw, `${filters},volumedetect`));
    if (!measured) throw new Error(`${entry.id}: could not measure level`);
    filters += `,volume=${(profile.peak - Number(measured[1])).toFixed(2)}dB`;
  }
  // Whole MP3 frames only: some filters (aecho) otherwise hand the encoder a short last frame it rejects.
  filters += ',asetnsamples=n=1152:p=1';
  const file = `${entry.id}.mp3`;
  const target = join(OUT_DIR, file);
  ffmpeg(raw, filters, ['-ac', String(profile.channels), '-c:a', 'libmp3lame', '-b:a', profile.bitrate, target]);
  const seconds = duration(target);
  if (!(seconds > 0.12)) throw new Error(`${entry.id}: nothing left after trimming (${seconds}s)`);
  if (tail > DECLICK) faded.push(`${entry.id} ${tail.toFixed(2)}s`);
  return { file, kind: entry.kind, seconds: Math.round(seconds * 1000) / 1000, gain: entry.gain ?? 1 };
}

mkdirSync(OUT_DIR, { recursive: true });
const previous = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
const manifest = {};
const missing = [];
const failed = [];
const faded = [];
for (const entry of AUDIO) {
  if (only && !only.includes(entry.id)) {
    if (previous[entry.id]) manifest[entry.id] = previous[entry.id];
    continue;
  }
  try {
    const result = processEntry(entry);
    if (result) manifest[entry.id] = result;
    else missing.push(entry.id);
  } catch (error) {
    failed.push(entry.id);
    console.error(`✗ ${entry.id}: ${error.message}`);
  }
}
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

const total = Object.values(manifest).reduce((sum, e) => sum + e.seconds, 0);
console.log(`${Object.keys(manifest).length} sound(s) in public/assets/audio (${total.toFixed(0)} s of audio).`);
if (faded.length) console.log(`Cut off by the generator, faded out: ${faded.join(', ')}`);
if (missing.length) console.log(`Not generated yet: ${missing.join(', ')}`);
if (failed.length) {
  console.error(`Failed: ${failed.join(', ')}`);
  process.exit(1);
}
