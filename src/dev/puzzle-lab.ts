// Puzzle lab: every scavenging puzzle in town, opened on demand with a fresh deal each time.
// Development only, served at /puzzles.html by `vite`; it plays the real ScavengePanel without a run.
import { LOCATIONS } from '../core/data/locations';
import { LOCATION_IDS, type LocationId } from '../core/types';
import { spotRng, type Puzzle } from '../core/scavenge';
import { loadAssets } from '../engine/assets';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { getLang, initLang, S, setLang, type Lang } from '../engine/i18n';
import { ScavengePanel } from '../scenes/scavenge';

const SIDEBAR = 340;
const lab = document.getElementById('lab')!;
const ui = document.getElementById('ui')!;
const stage = document.getElementById('stage')!;
const toast = document.getElementById('toast')!;

let panel: ScavengePanel | null = null;
let opened: { location: LocationId; index: number } | null = null;
let deals = 0;

Object.assign(lab.style, {
  position: 'fixed', inset: '0 auto 0 0', width: `${SIDEBAR}px`, overflow: 'auto', padding: '14px 16px', zIndex: '5',
  background: '#17130e', borderRight: '2px solid #3b2f20', color: '#eadbb8', userSelect: 'text', font: '15px/1.3 system-ui, sans-serif',
});

function fit(): void {
  const width = window.innerWidth - SIDEBAR;
  const scale = Math.min(width / 1280, window.innerHeight / 720);
  stage.style.left = `${SIDEBAR + width / 2}px`;
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

function say(text: string, ok: boolean): void {
  toast.textContent = text;
  Object.assign(toast.style, {
    position: 'absolute', left: '50%', top: '18px', transform: 'translateX(-50%)', zIndex: '30', padding: '8px 18px', borderRadius: '4px',
    background: ok ? '#3f5a2a' : '#6b2a20', color: '#fff3d6', font: 'bold 22px/1.2 system-ui, sans-serif', opacity: '1', transition: 'opacity .6s 1.4s',
  });
  requestAnimationFrame(() => { toast.style.opacity = '0'; });
}

function close(): void {
  panel?.root.remove();
  panel = null;
  render();
}

function open(location: LocationId, index: number): void {
  panel?.root.remove();
  const s = S();
  const def = LOCATIONS[location];
  const spot = def.spots[index]!;
  const puzzle = (s.scavenge.spots[location] as Readonly<Record<string, Puzzle>>)[spot.key]!;
  const name = (s.spot[location] as Readonly<Record<string, string>>)[spot.key]!;
  // A fresh seed per opening stands in for a new paid attempt in the game.
  const rng = spotRng((Date.now() ^ (++deals * 0x9e3779b1)) >>> 0, location, spot.key, `lab:${deals}`);
  opened = { location, index };
  const current: ScavengePanel = new ScavengePanel(puzzle, name, spot, def.plate, rng,
    () => { say(getLang() === 'fr' ? 'Réussi' : 'Solved', true); close(); },
    close,
    () => {},
    message => current.showFailure(message, () => open(location, index)),
  );
  panel = current;
  ui.append(current.root);
  current.focus();
  render();
}

function render(): void {
  const s = S();
  const fr = getLang() === 'fr';
  const langButton = (lang: Lang, label: string) => el('button', {
    text: label,
    style: { padding: '4px 10px', marginRight: '6px', background: getLang() === lang ? '#b98a46' : '#3b2f20', color: '#fff3d6', borderRadius: '3px' },
    onClick: () => {
      setLang(lang);
      if (opened && panel) open(opened.location, opened.index);
      render();
    },
  });
  const groups = LOCATION_IDS.map(id => {
    const book = s.scavenge.spots[id] as Readonly<Record<string, Puzzle>>;
    const names = s.spot[id] as Readonly<Record<string, string>>;
    return el('section', { style: { marginTop: '14px' } }, [
      el('h3', { text: s.location[id].name, style: { margin: '0 0 6px', font: 'bold 16px/1.2 system-ui, sans-serif', color: '#ffd58c' } }),
      ...LOCATIONS[id].spots.map((spot, index) => {
        const puzzle = book[spot.key]!;
        const active = opened?.location === id && opened.index === index && panel;
        return el('button', {
          style: {
            display: 'flex', justifyContent: 'space-between', gap: '8px', width: '100%', marginBottom: '3px', padding: '5px 8px', textAlign: 'left',
            borderRadius: '3px', background: active ? '#5a4526' : '#2a231a', color: '#eadbb8', font: '14px/1.2 system-ui, sans-serif',
          },
          onClick: () => open(id, index),
        }, [el('span', { text: names[spot.key] ?? spot.key }), el('small', { text: puzzle.kind, style: { color: puzzle.kind === 'rummage' ? '#cfe6a3' : '#a8977a' } })]);
      }),
    ]);
  });
  lab.replaceChildren(
    el('h2', { text: 'Puzzle Lab', style: { margin: '0 0 4px', font: 'bold 22px/1.2 system-ui, sans-serif' } }),
    el('p', { text: fr ? 'Chaque ouverture tire une nouvelle donne. Un échec propose de réessayer.' : 'Every opening deals a fresh board. A failure offers a retry.', style: { margin: '0 0 10px', color: '#a8977a' } }),
    el('div', {}, [langButton('fr', 'FR'), langButton('en', 'EN')]),
    ...groups,
  );
}

let last = performance.now();
function frame(now: number): void {
  panel?.update(Math.min(0.1, (now - last) / 1000));
  last = now;
  requestAnimationFrame(frame);
}

initLang();
fit();
window.addEventListener('resize', fit);
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown', event => { if (event.key === 'Escape' && panel) close(); });
render();
requestAnimationFrame(frame);
void audio.preload().catch(() => {});
void loadAssets(() => {}).then(() => { if (opened && panel) open(opened.location, opened.index); });
