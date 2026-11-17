#!/usr/bin/env node
// Dev aid: measures a track so a chart can be laid on it.
//   node tools/beat.mjs public/assets/audio/mus_finale.mp3 [minBpm maxBpm]
//     the tempo, the time of the first beat and the track length (FINALE in src/core/finale.ts)
//   node tools/beat.mjs public/assets/audio/mus_finale.mp3 --bars [--json]
//     the same, then the track bar by bar (SONG in src/core/finale.ts): where beat one of the bar is,
//     how loud each bar is, how busy, how bright, how much a single line stands out of the wall of
//     guitars, where the last big hit falls and where the silence after it starts.
// Needs ffmpeg on the PATH. Nobody has to listen: every number printed is computed from the PCM.
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const [file, lo = '120', hi = '180'] = args.filter((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: node tools/beat.mjs <audio file> [minBpm maxBpm] [--bars] [--json]');
  process.exit(2);
}

// ───────────────────────────── Tempo and first beat ─────────────────────────────
// Unchanged since the chart was first laid: the onset curve is energy that rises, and the beat grid
// is the one that lands on the most of it.

const RATE = 11025;
const HOP = 64; // ~5.8 ms per frame
const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
const samples = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 4));
const frames = Math.floor(samples.length / HOP);
const fps = RATE / HOP;

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
const tempo = { bpm: Number(best.bpm.toFixed(2)), offset: Number(best.offset.toFixed(3)), seconds: Number((samples.length / RATE).toFixed(2)), contrast: Number((best.value / Math.max(off, 1e-9)).toFixed(2)) };
if (!flags.has('--bars')) {
  console.log(JSON.stringify(tempo));
  process.exit(0);
}


// ───────────────────────────── Bar by bar ─────────────────────────────
// A spectrum every ~12 ms over a ~186 ms window (fine enough to see one guitar line stand out of
// the distorted wall), from a second decode at a rate that keeps the cymbals and the lead.

const SR = 22050;
const N = 4096;
const STEP = 256;
const wide = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
const x = new Float32Array(wide.buffer, wide.byteOffset, Math.floor(wide.byteLength / 4));
const spectra = Math.max(0, Math.floor((x.length - N) / STEP) + 1);
const sps = SR / STEP;
const hz = (k) => (k * SR) / N;
const bin = (f) => Math.round((f * N) / SR);
const frameAt = (t) => Math.max(0, Math.min(spectra, Math.round(t * sps)));

/** In-place radix-2 FFT. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

const BANDS = { low: [40, 160], mid: [160, 1200], lead: [1200, 4000], high: [5000, 10000] };
const PITCH = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const hann = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
const F = {
  rms: new Float64Array(spectra),
  centroid: new Float64Array(spectra),
  /** How far the sharpest peak between 500 Hz and 2.5 kHz stands above its neighbourhood, in dB: one line singing over the chug. */
  prominence: new Float64Array(spectra),
  /** That peak's pitch, in semitones (MIDI numbering). */
  pitch: new Float64Array(spectra),
  chromaHigh: [],
  chromaLow: [],
  band: Object.fromEntries(Object.keys(BANDS).map((k) => [k, new Float64Array(spectra)])),
  flux: Object.fromEntries(Object.keys(BANDS).map((k) => [k, new Float64Array(spectra)])),
};
const chromaOf = (power, from, to) => {
  const c = new Float64Array(12);
  for (let k = bin(from); k < bin(to); k++) c[(((Math.round(12 * Math.log2(hz(k) / 440)) % 12) + 12 + 9) % 12)] += Math.sqrt(power[k]);
  const norm = Math.hypot(...c) || 1;
  return c.map((v) => v / norm);
};
{
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  let previous = null;
  for (let s = 0; s < spectra; s++) {
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const v = x[s * STEP + i];
      sum += v * v;
      re[i] = v * hann[i];
      im[i] = 0;
    }
    F.rms[s] = Math.sqrt(sum / N);
    fft(re, im);
    const power = new Float64Array(N / 2);
    for (let k = 0; k < N / 2; k++) power[k] = re[k] * re[k] + im[k] * im[k];
    let weighted = 0;
    let total = 0;
    for (let k = bin(40); k < bin(8000); k++) {
      weighted += hz(k) * power[k];
      total += power[k];
    }
    F.centroid[s] = total > 0 ? weighted / total : 0;
    for (const [name, [a, b]] of Object.entries(BANDS)) {
      let e = 0;
      let flux = 0;
      for (let k = bin(a); k < bin(b); k++) {
        e += power[k];
        if (previous) flux += Math.max(0, Math.log1p(power[k] * 100) - Math.log1p(previous[k] * 100));
      }
      F.band[name][s] = e;
      F.flux[name][s] = flux / (bin(b) - bin(a));
    }
    let sharpest = 0;
    let sharpestAt = bin(500);
    for (let k = bin(500); k < bin(2500); k++) {
      if (power[k] < power[k - 1] || power[k] < power[k + 1]) continue;
      let around = 0;
      for (let j = k - 12; j <= k + 12; j++) if (Math.abs(j - k) > 2) around += power[j];
      const ratio = power[k] / (around / 20 + 1e-12);
      if (ratio > sharpest) {
        sharpest = ratio;
        sharpestAt = k;
      }
    }
    F.prominence[s] = 10 * Math.log10(sharpest + 1e-12);
    F.pitch[s] = 69 + 12 * Math.log2(hz(sharpestAt) / 440);
    F.chromaHigh.push(chromaOf(power, 500, 3000));
    F.chromaLow.push(chromaOf(power, 70, 400));
    previous = power;
  }
}

const db = (v) => 10 * Math.log10(v + 1e-12);
const avg = (arr, a = 0, b = arr.length) => {
  let s = 0;
  let n = 0;
  for (let i = Math.max(0, a); i < Math.min(arr.length, b); i++) {
    s += arr[i];
    n++;
  }
  return n ? s / n : 0;
};
const median = (arr) => [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)];
const cos = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const bandDb = (name, t, span) => db(avg(F.band[name], frameAt(t), frameAt(t + span) + 1));

// ── The end: the final chord, how long it rings, and the silence after it ──
// Loudness in 50 ms slices; the silence is where it falls 40 dB under the track's loud passages for good,
// the final chord the biggest jump in loudness in the three seconds before.
const SLICE = 0.05;
const slices = Array.from({ length: Math.floor(x.length / SR / SLICE) }, (_, i) => {
  // Straight off the samples: the spectra's long window would smear the attack over a fifth of a second.
  let sum = 0;
  const a = Math.round(i * SLICE * SR);
  const n = Math.round(SLICE * SR);
  for (let k = a; k < a + n; k++) sum += x[k] * x[k];
  return db(sum / n);
});
const loudRef = [...slices].sort((a, b) => a - b)[Math.floor(slices.length * 0.9)];
let quietFrom = slices.length;
while (quietFrom > 0 && slices[quietFrom - 1] < loudRef - 40) quietFrom--;
let hitSlice = quietFrom - 1;
for (let i = Math.max(1, quietFrom - Math.round(3 / SLICE)); i < quietFrom; i++) if (slices[i] - slices[i - 1] > slices[hitSlice] - slices[hitSlice - 1]) hitSlice = i;
let ringsTo = hitSlice;
const chordLevel = Math.max(...slices.slice(hitSlice, hitSlice + 4));
while (ringsTo < quietFrom && slices[ringsTo] > chordLevel - 10) ringsTo++;
const beatLen = 60 / tempo.bpm;
const finalChord = { at: +(hitSlice * SLICE).toFixed(2), beat: Math.round((hitSlice * SLICE - tempo.offset) / beatLen), ringsUntil: +(ringsTo * SLICE).toFixed(2), silence: +(quietFrom * SLICE).toFixed(2) };

// ── Beat one ──
// Four ways to group the beats in fours. Rock changes chords on beat one and puts its fills on beat
// four; the final chord falls on a beat one. Each is a vote; the harmony settles a tie.
const beats = [];
for (let t = tempo.offset; t < finalChord.at + beatLen; t += beatLen) beats.push(t);
const harmonyOf = (t) => {
  const c = new Float64Array(12);
  for (let s = frameAt(t); s < frameAt(t + beatLen); s++) for (let k = 0; k < 12; k++) c[k] += F.chromaLow[s]?.[k] ?? 0;
  const norm = Math.hypot(...c) || 1;
  return c.map((v) => v / norm);
};
const harmony = beats.map(harmonyOf);
const change = beats.map((_, i) => (i === 0 ? 0 : 1 - cos(harmony[i], harmony[i - 1])));
/** Toms and snare over a dropped kick, across one beat: positive in a fill. */
const fillness = beats.map((t) => bandDb('mid', t, beatLen) - bandDb('low', t, beatLen));
const fillFloor = median(fillness) + 4;
const fillBeats = beats.map((_, i) => i).filter((i) => fillness[i] > fillFloor);
const phases = [0, 1, 2, 3].map((phase) => {
  const on = (i) => (((i - phase) % 4) + 4) % 4 === 0;
  const ratio = (values) => avg(values.filter((_, i) => on(i))) / Math.max(1e-9, avg(values.filter((_, i) => !on(i))));
  return {
    phase,
    change: +ratio(change).toFixed(2),
    fillsOnFour: fillBeats.filter((i) => (((i - phase) % 4) + 4) % 4 === 3).length,
    finalOnOne: on(finalChord.beat),
  };
});
const best4 = (key) => [...phases].sort((a, b) => Number(b[key]) - Number(a[key]))[0].phase;
const votes = phases.map((p) => ({ ...p, votes: [best4('change'), best4('fillsOnFour'), best4('finalOnOne')].filter((v) => v === p.phase).length }));
const one = [...votes].sort((a, b) => b.votes - a.votes || b.change - a.change)[0].phase;

// ── Bars ──
const barLen = beatLen * 4;
const firstBar = tempo.offset + one * beatLen;
const bars = [];
for (let b = 0, t = firstBar; t + barLen <= finalChord.at + 1e-6; b++, t += barLen) {
  const a = frameAt(t);
  const z = frameAt(t + barLen);
  const flux = (s) => F.flux.low[s] + F.flux.mid[s] + F.flux.high[s];
  const floor = avg(Array.from({ length: z - a }, (_, i) => flux(a + i))) * 1.4;
  let attacks = 0;
  for (let s = a + 1; s < Math.min(z, spectra - 1); s++) if (flux(s) > floor && flux(s) >= flux(s - 1) && flux(s) > flux(s + 1)) attacks++;
  // How much the high line moves, sixteenth to sixteenth; how much the low end does.
  const sixteenth = Math.round((sps * beatLen) / 4);
  let motion = 0;
  let steps = 0;
  for (let s = a + sixteenth; s < z; s += sixteenth, steps++) motion += 1 - cos(F.chromaHigh[s], F.chromaHigh[s - sixteenth]);
  const pcs = new Float64Array(12);
  for (let s = a; s < z; s++) for (let k = 0; k < 12; k++) pcs[k] += F.chromaHigh[s][k];
  const beat0 = Math.round((t - tempo.offset) / beatLen);
  bars.push({
    bar: b,
    from: +t.toFixed(3),
    loud: +db(avg(F.rms, a, z) ** 2).toFixed(1),
    attacks: +(attacks / 4).toFixed(2),
    bright: Math.round(avg(F.centroid, a, z)),
    lead: +avg(F.prominence, a, z).toFixed(1),
    sung: +(Array.from(F.prominence.subarray(a, z)).filter((p) => p > 12).length / (z - a)).toFixed(2),
    // How far that line wanders over the bar (interquartile range, semitones): near zero when it holds one note.
    wander: (() => {
      const sung = Array.from(F.pitch.subarray(a, z)).filter((_, i) => F.prominence[a + i] > 12).sort((p, q) => p - q);
      return sung.length < 8 ? 0 : +(sung[Math.floor(sung.length * 0.75)] - sung[Math.floor(sung.length * 0.25)]).toFixed(1);
    })(),
    motion: +(motion / steps).toFixed(3),
    fill: [0, 1, 2, 3].filter((k) => fillBeats.includes(beat0 + k)).map((k) => k + 1),
    notes: [...pcs].map((v, k) => [v, PITCH[k]]).sort((p, q) => q[0] - p[0]).slice(0, 3).map((p) => p[1]).join(' '),
  });
}

// ── Sections ──
// Two kinds of bar tell apart on brightness and on how much a single line stands out: the chugging
// riff (dark, nothing singing) and the riff with a lead over it. Two means, iterated (k-means, k = 2)
// on both measures scaled to the track; a bar whose only difference is a fill keeps its phrase's kind.
const z = (key) => {
  const values = bars.map((b) => b[key]);
  const m = avg(values);
  const sd = Math.sqrt(avg(values.map((v) => (v - m) ** 2))) || 1;
  return values.map((v) => (v - m) / sd);
};
const zb = z('bright');
const zl = z('lead');
const points = bars.map((_, i) => [zb[i], zl[i]]);
let centres = [points.reduce((p, q) => (q[0] + q[1] < p[0] + p[1] ? q : p)), points.reduce((p, q) => (q[0] + q[1] > p[0] + p[1] ? q : p))];
let kind = [];
for (let round = 0; round < 20; round++) {
  kind = points.map((p) => (Math.hypot(p[0] - centres[0][0], p[1] - centres[0][1]) <= Math.hypot(p[0] - centres[1][0], p[1] - centres[1][1]) ? 0 : 1));
  centres = [0, 1].map((c) => {
    const mine = points.filter((_, i) => kind[i] === c);
    return mine.length ? [avg(mine.map((p) => p[0])), avg(mine.map((p) => p[1]))] : centres[c];
  });
}
bars.forEach((b, i) => {
  if (b.fill.length > 0 && i > 0) kind[i] = kind[i - 1];
  b.kind = kind[i] === 0 ? 'riff' : 'lead';
});
const sections = [];
for (const b of bars) {
  const last = sections.at(-1);
  if (last && last.kind === b.kind) last.to = b.bar;
  else sections.push({ kind: b.kind, from: b.bar, to: b.bar });
}
for (const s of sections) {
  const mine = bars.slice(s.from, s.to + 1);
  Object.assign(s, { start: mine[0].from, bright: Math.round(avg(mine.map((b) => b.bright))), lead: +avg(mine.map((b) => b.lead)).toFixed(1), motion: +avg(mine.map((b) => b.motion)).toFixed(3) });
}
// Where the lead stands out most and moves most, six bars at a time: the best candidate for a solo.
const SOLO_SPAN = 6;
let peak = { from: 0, score: -Infinity };
for (let i = 0; i + SOLO_SPAN <= bars.length; i++) {
  const run = bars.slice(i, i + SOLO_SPAN);
  if (run.some((b) => b.kind !== 'lead')) continue;
  const score = avg(run.map((_, k) => zl[i + k])) + avg(run.map((b) => b.motion)) / Math.max(1e-9, avg(bars.map((b) => b.motion)));
  if (score > peak.score) peak = { from: i, score };
}
const solo = { from: peak.from, to: peak.from + SOLO_SPAN - 1, start: bars[peak.from]?.from ?? 0 };

const result = { ...tempo, beatOne: { phase: one, firstBar: +firstBar.toFixed(3), votes }, finalChord, fills: bars.filter((b) => b.fill.length > 0).map((b) => ({ bar: b.bar, beats: b.fill })), sections, leadPeak: solo, bars };
if (flags.has('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(JSON.stringify({ ...tempo, beatOne: result.beatOne, finalChord, fills: result.fills, leadPeak: solo }));
  console.log('\nbar   from   loud  att/b  bright  lead  sung  wander  motion  fill  notes      kind');
  for (const r of bars) {
    console.log([String(r.bar).padStart(3), r.from.toFixed(2).padStart(6), r.loud.toFixed(1).padStart(6), r.attacks.toFixed(2).padStart(6), String(r.bright).padStart(7), r.lead.toFixed(1).padStart(5), r.sung.toFixed(2).padStart(5), r.wander.toFixed(1).padStart(7), r.motion.toFixed(3).padStart(7), (r.fill.join('') || '-').padStart(5), ` ${r.notes.padEnd(10)}`, r.kind].join(' '));
  }
  console.log('\nsection  bars     from    bright  lead  motion');
  for (const s of sections) console.log(`${s.kind.padEnd(8)} ${`${s.from}-${s.to}`.padEnd(7)} ${s.start.toFixed(2).padStart(6)} ${String(s.bright).padStart(8)} ${s.lead.toFixed(1).padStart(5)} ${s.motion.toFixed(3).padStart(7)}`);
}
