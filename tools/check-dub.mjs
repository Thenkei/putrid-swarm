#!/usr/bin/env node
// Checks a dub by ear, without ears: transcribes every raw recording of a language with ElevenLabs
// speech-to-text and compares what was said with what was asked for.
//
//   tsx tools/check-dub.mjs --lang en                 # every line; prints the ones that differ
//   tsx tools/check-dub.mjs --lang en --only en/vo_car,en/vo_dawn --words
//
// Billable (by the minute of audio), like gen-audio; needs ELEVENLABS_API_KEY the same way.
// A transcript is evidence, not a verdict: a mumbled or growled line is meant to be hard to transcribe.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { voicesIn } from './audio-lang.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = join(ROOT, 'art', 'audio', 'raw');
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const lang = option('lang') ?? 'en';
const only = option('only')?.split(',').map((s) => s.trim());
const words = args.includes('--words');
const out = option('out');
const THRESHOLD = Number(option('threshold') ?? 0.8);

const key =
  process.env.ELEVENLABS_API_KEY ??
  (existsSync(join(ROOT, '.env'))
    ? readFileSync(join(ROOT, '.env'), 'utf8')
        .split('\n')
        .find((l) => l.startsWith('ELEVENLABS_API_KEY='))
        ?.slice('ELEVENLABS_API_KEY='.length)
        .trim()
    : undefined);
if (!key) {
  console.error('ELEVENLABS_API_KEY is not set (environment or .env).');
  process.exit(2);
}

const plain = (text) =>
  text
    .replace(/\[[^\]]*\]/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

/** Share of the asked-for words found, in order, in what was heard (longest common subsequence). */
function heardShare(asked, heard) {
  if (asked.length === 0) return 1;
  const row = new Array(heard.length + 1).fill(0);
  for (const a of asked) {
    let diagonal = 0;
    for (let j = 1; j <= heard.length; j++) {
      const up = row[j];
      row[j] = a === heard[j - 1] ? diagonal + 1 : Math.max(row[j], row[j - 1]);
      diagonal = up;
    }
  }
  return row[heard.length] / asked.length;
}

async function transcribe(file) {
  const form = new FormData();
  form.set('model_id', 'scribe_v1');
  form.set('file', new Blob([readFileSync(file)], { type: 'audio/mpeg' }), 'line.mp3');
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': key }, body: form, signal: AbortSignal.timeout(120_000) });
    if (response.ok) return response.json();
    if (response.status !== 429 && response.status < 500) throw new Error(`HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  throw new Error('gave up after three attempts');
}

const queue = voicesIn(lang).filter((entry) => !only || only.includes(entry.id));
const results = [];
let cursor = 0;
await Promise.all(
  Array.from({ length: 2 }, async () => {
    while (cursor < queue.length) {
      const entry = queue[cursor++];
      const file = join(RAW_DIR, `${entry.id}.mp3`);
      if (!existsSync(file)) {
        results.push({ id: entry.id, asked: entry.text, heard: null, share: 0, language: null });
        continue;
      }
      try {
        const data = await transcribe(file);
        const share = heardShare(plain(entry.text), plain(data.text ?? ''));
        results.push({
          id: entry.id,
          asked: entry.text,
          heard: data.text ?? '',
          share,
          language: data.language_code ?? null,
          ...(words ? { words: (data.words ?? []).filter((w) => w.type === 'word').map((w) => ({ text: w.text, start: w.start, end: w.end })) } : {}),
        });
      } catch (error) {
        results.push({ id: entry.id, asked: entry.text, heard: null, share: 0, language: null, error: error.message });
      }
    }
  }),
);

results.sort((a, b) => a.share - b.share);
if (out) writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
const off = results.filter((r) => r.share < THRESHOLD);
for (const r of off) console.log(`${r.share.toFixed(2)} ${r.id} [${r.language ?? '?'}]\n   asked: ${r.asked}\n   heard: ${r.heard ?? r.error ?? '(no recording)'}`);
if (words) for (const r of results) console.log(`${r.id}: ${(r.words ?? []).map((w) => `${w.text}@${w.start.toFixed(2)}`).join(' ')}`);
console.log(`${results.length - off.length} of ${results.length} line(s) heard as asked (at least ${Math.round(THRESHOLD * 100)} % of the words, in order).`);
