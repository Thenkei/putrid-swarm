#!/usr/bin/env node
// Generates raw art with the codex CLI image tool, one `codex exec` per manifest entry.
//
//   node tools/gen-art.mjs                 # generate everything that is missing
//   node tools/gen-art.mjs --only en_dog,logo --force
//   node tools/gen-art.mjs --concurrency 3
//
// Raw outputs land in art/raw/<id>.png; run tools/process-art.mjs afterwards.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ART } from './art-manifest.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = join(ROOT, 'art', 'raw');
const LOG_DIR = join(ROOT, 'art', 'logs');
const JOB_TIMEOUT_MS = 8 * 60 * 1000;
const MAX_ATTEMPTS = 2;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const only = option('only')?.split(',').map((s) => s.trim());
const force = flag('force');
const concurrency = Number(option('concurrency') ?? 4);

mkdirSync(RAW_DIR, { recursive: true });
mkdirSync(LOG_DIR, { recursive: true });

const shapeHint = (entry) => {
  if (entry.kind === 'plate') return 'Use a landscape canvas (1536x1024).';
  if (entry.kind === 'split' && entry.cols > entry.rows) return 'Use a landscape canvas (1536x1024).';
  return 'Use a square canvas (1024x1024).';
};

const isValidPng = (file) => existsSync(file) && statSync(file).size > 20_000;
const isGenerated = (entry) => !entry.source;

function runCodex(entry) {
  const rel = `art/raw/${entry.id}.png`;
  // A character's existing turnaround goes first, so "the first attached image" in the brief is unambiguous.
  const refs = [...(entry.edit ? [entry.edit] : []), ...(entry.sheet ? [entry.sheet] : []), ...(entry.refs ?? [])];
  const refNote = entry.edit
    ? `The attached image is the picture to edit: give it to the image tool as the image to edit, keep everything the brief does not mention as it is, and save the edited result. `
    : !refs.length
    ? ''
    : (entry.sheet
        ? `The first attached image is this character's existing sprite sheet, made earlier for this project: keep the character identical to it. ` +
          `The other attached image(s) are the creator's concept art: `
        : `The ${refs.length} attached image(s) are the creator's concept art: `) +
      `pass them all to the image tool as style/character references and match their linework, palette and character designs. ` +
      `Create a NEW image; never return or crop a reference. `;
  const instruction =
    `Use your built-in image generation tool to create exactly ONE image, then copy the generated PNG, unmodified, to ${rel} ` +
    `(relative to the current directory, overwrite if present). Do not post-process, crop or resize it, do not write any other file, ` +
    `and do not read other project files. ${refNote}${shapeHint(entry)} Reply with only the saved path.\n\nImage brief: ${entry.prompt}`;

  return new Promise((resolvePromise) => {
    // The prompt goes through stdin: `-i` is variadic and would otherwise swallow a positional prompt.
    const cliArgs = ['exec', '--sandbox', 'workspace-write', '--skip-git-repo-check', '-c', 'model_reasoning_effort="low"', '-C', ROOT];
    for (const ref of refs) cliArgs.push('-i', join(ROOT, ref));
    cliArgs.push('-');
    const child = spawn('codex', cliArgs, { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.end(instruction);
    let log = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), JOB_TIMEOUT_MS);
    child.stdout.on('data', (d) => (log += d));
    child.stderr.on('data', (d) => (log += d));
    child.on('close', (code) => {
      clearTimeout(timer);
      writeFileSync(join(LOG_DIR, `${entry.id}.log`), log);
      resolvePromise(code === 0 && isValidPng(join(ROOT, rel)));
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolvePromise(false);
    });
  });
}

async function generate(entry) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    const ok = await runCodex(entry);
    const secs = ((Date.now() - started) / 1000).toFixed(0);
    if (ok) {
      console.log(`✓ ${entry.id} (${secs}s)`);
      return true;
    }
    console.log(`✗ ${entry.id} attempt ${attempt}/${MAX_ATTEMPTS} failed (${secs}s) — see art/logs/${entry.id}.log`);
  }
  return false;
}

const queue = ART.filter(isGenerated)
  .filter((e) => !only || only.includes(e.id))
  .filter(
  (e) => force || !isValidPng(join(RAW_DIR, `${e.id}.png`)),
);

if (only) {
  const unknown = only.filter((id) => !ART.some((e) => e.id === id));
  if (unknown.length) {
    console.error(`Unknown art ids: ${unknown.join(', ')}`);
    process.exit(2);
  }
}

console.log(`Generating ${queue.length} image(s) with concurrency ${concurrency}…`);
const failed = [];
let cursor = 0;
await Promise.all(
  Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (cursor < queue.length) {
      const entry = queue[cursor++];
      if (!(await generate(entry))) failed.push(entry.id);
    }
  }),
);

if (failed.length) {
  console.error(`Failed: ${failed.join(', ')}`);
  process.exit(1);
}
console.log('All requested art generated.');
