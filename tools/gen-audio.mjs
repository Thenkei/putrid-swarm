#!/usr/bin/env node
// Generates raw audio with ElevenLabs, one request per entry of tools/audio-manifest.mjs.
//
//   node tools/gen-audio.mjs                    # everything that is missing
//   node tools/gen-audio.mjs --only log,vo_dawn --force
//   node tools/gen-audio.mjs --kind voice --dry-run
//   node tools/gen-audio.mjs --lang en          # the English voices (ids are then en/<id>)
//
// Needs ELEVENLABS_API_KEY in the environment or in a git-ignored .env at the project root.
// Every request is billable: existing files are never regenerated without --force, and a failed
// request is retried only when the service said it did not process it (429 / 5xx).
// Raw results land in art/audio/raw/<id>.mp3 with a JSON sidecar; run tools/process-audio.mjs next.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO, MODELS, VOICES } from './audio-manifest.mjs';
import { DUBS, voicesIn } from './audio-lang.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = join(ROOT, 'art', 'audio', 'raw');
const API = 'https://api.elevenlabs.io';
const REQUEST_TIMEOUT_MS = 180_000;
const MAX_ATTEMPTS = 3;
const MIN_BYTES = 2_000;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const only = option('only')?.split(',').map((s) => s.trim());
const kind = option('kind');
const force = flag('force');
const dryRun = flag('dry-run');
const concurrency = Number(option('concurrency') ?? 2);
const lang = option('lang') ?? 'fr';
/** What this run draws from: everything for the source language, the voices alone for a dub. */
const ENTRIES = lang === 'fr' ? AUDIO : voicesIn(lang);

function loadKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  const envFile = join(ROOT, '.env');
  if (!existsSync(envFile)) return undefined;
  const line = readFileSync(envFile, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('ELEVENLABS_API_KEY='));
  return line?.slice('ELEVENLABS_API_KEY='.length).trim() || undefined;
}

/** The exact request an entry turns into. Kept pure so --dry-run shows what would be billed. */
export function requestFor(entry) {
  switch (entry.kind) {
    case 'sfx':
    case 'loop':
      return {
        path: '/v1/sound-generation?output_format=mp3_44100_128',
        body: { text: entry.text, model_id: MODELS.sfx, duration_seconds: entry.seconds, prompt_influence: entry.influence, ...(entry.loop ? { loop: true } : {}) },
      };
    case 'music':
      return {
        path: '/v1/music?output_format=mp3_44100_128',
        body: { prompt: entry.text, model_id: MODELS.music, music_length_ms: Math.round(entry.seconds * 1000), force_instrumental: true },
      };
    case 'voice': {
      const voice = VOICES[entry.role];
      if (!voice) throw new Error(`${entry.id}: unknown voice role "${entry.role}"`);
      return {
        path: `/v1/text-to-speech/${voice.id}?output_format=mp3_44100_128`,
        body: { text: entry.text, model_id: MODELS.voice, language_code: entry.lang ? DUBS[entry.lang].code : 'fr', voice_settings: { stability: entry.stability, similarity_boost: entry.similarity } },
      };
    }
    default:
      throw new Error(`${entry.id}: unknown kind "${entry.kind}"`);
  }
}

const rawPath = (id) => join(RAW_DIR, `${id}.mp3`);
const hasRaw = (id) => existsSync(rawPath(id)) && statSync(rawPath(id)).size > MIN_BYTES;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generate(entry, apiKey) {
  const { path, body } = requestFor(entry);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    let response;
    try {
      response = await fetch(API + path, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // A timed-out paid request may still have been processed: do not repeat it blindly.
      console.log(`✗ ${entry.id}: ${error.name === 'TimeoutError' ? 'timed out' : error.message} — not retried, check the account history`);
      return false;
    }
    if (response.ok) {
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length <= MIN_BYTES) {
        console.log(`✗ ${entry.id}: empty response (${bytes.length} bytes)`);
        return false;
      }
      mkdirSync(dirname(rawPath(entry.id)), { recursive: true });
      writeFileSync(rawPath(entry.id), bytes);
      writeFileSync(
        join(RAW_DIR, `${entry.id}.json`),
        `${JSON.stringify({ id: entry.id, kind: entry.kind, provider: 'elevenlabs', endpoint: path.split('?')[0], request: body, voice: entry.role ? VOICES[entry.role].name : undefined, generatedAt: new Date().toISOString(), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2)}\n`,
      );
      console.log(`✓ ${entry.id} (${((Date.now() - started) / 1000).toFixed(1)}s, ${(bytes.length / 1024).toFixed(0)} kB)`);
      return true;
    }
    const detail = (await response.text()).slice(0, 300);
    const retryable = response.status === 429 || response.status >= 500;
    console.log(`✗ ${entry.id}: HTTP ${response.status} ${detail}${retryable && attempt < MAX_ATTEMPTS ? ' — retrying' : ''}`);
    if (!retryable) return false;
    await sleep(2000 * 2 ** (attempt - 1));
  }
  return false;
}

if (only) {
  const unknown = only.filter((id) => !ENTRIES.some((e) => e.id === id));
  if (unknown.length) {
    console.error(`Unknown audio ids: ${unknown.join(', ')}`);
    process.exit(2);
  }
}

const queue = ENTRIES.filter((e) => !only || only.includes(e.id))
  .filter((e) => !kind || e.kind === kind)
  .filter((e) => force || !hasRaw(e.id));

if (dryRun) {
  for (const entry of queue) console.log(JSON.stringify({ id: entry.id, ...requestFor(entry) }));
  console.log(`${queue.length} request(s) would be sent.`);
  process.exit(0);
}

const apiKey = loadKey();
if (!apiKey) {
  console.error('ELEVENLABS_API_KEY is not set (environment or .env).');
  process.exit(2);
}

mkdirSync(RAW_DIR, { recursive: true });
console.log(`Generating ${queue.length} sound(s) with concurrency ${concurrency}…`);
const failed = [];
let cursor = 0;
await Promise.all(
  Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (cursor < queue.length) {
      const entry = queue[cursor++];
      if (!(await generate(entry, apiKey))) failed.push(entry.id);
    }
  }),
);

if (failed.length) {
  console.error(`Failed: ${failed.join(', ')}`);
  process.exit(1);
}
console.log('All requested audio generated.');
