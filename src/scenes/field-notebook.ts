import { epicFlag } from '../core/epics';
import { garageModel, garageModels } from '../core/garage-ignition';
import type { GameState } from '../core/types';
import type { App } from '../engine/app';
import { el } from '../engine/dom';
import { line as L } from '../engine/i18n';
import { observations } from './chapter-observations';
import { discoveredEvidence, type EvidencePicture } from './scene-evidence';
import { papers, seenFind, story, type Find } from './find-notes';
import trailUrl from '../assets/shed-muddy-trail.webp';
import './field-notebook.css';

interface Page { id: string; title: string; notes: string[]; pictures?: EvidencePicture[] }

export const cameraNames = () => [L('Verger', 'Orchard'), L('Grange', 'Barn'), L('Portail', 'Gate')];

function pagesFor(state: GameState): Page[] {
  const pages: Page[] = [];
  const find = (kind: Find, place: string) => {
    const seen = seenFind(state, kind);
    if (!seen) return;
    const words = story(kind);
    const notes = [];
    if (seen & 1) notes.push(words.other);
    if (seen & 2) notes.push(words.clue);
    if (epicFlag(state, kind)) notes.push(words.result);
    const pictures = kind === 'trail' && seen === 3 ? [{ url: trailUrl, caption: words.title }] : [];
    if (kind !== 'trail' && (seen & 2)) pictures.push({ url: papers[kind][1], caption: words.second });
    pages.push({ id: kind, title: place, notes, pictures });
  };
  find('menu', L('Le snack', 'Snack counter'));
  const garage = [];
  if (epicFlag(state, 'garageModelRead')) garage.push(L('Sur le réservoir de Gérard', 'On Gérard’s tank') + ' · ' + garageModels[garageModel(state.seed)]);
  const held = epicFlag(state, 'garageTracing') - 1;
  const copied = epicFlag(state, 'garageTracings');
  garageModels.forEach((model, index) => {
    if (index === held) garage.push(L('Calque en poche', 'Tracing in my pocket') + ' · ' + model);
    else if (copied & (1 << index)) garage.push(L('Calque déjà relevé', 'Previously traced') + ' · ' + model);
  });
  if (garage.length) pages.push({ id: 'garage', title: L('Chez Gérard', 'Gérard’s garage'), notes: garage });
  find('vhs', L('La poste', 'Post office'));
  find('trail', L('Le cabanon du tondeur', 'The mower shed'));
  const prints = state.moonPrints ?? [];
  const pact = epicFlag(state,'moonPact');
  const outcome = pact === 1 ? L('Au chêne creux, le petit a retrouvé ses parents. La meute a chassé les vagues suivantes.', 'At the hollow oak the cub found its parents. The pack hunted down the remaining waves.')
    : pact === 2 ? L('Je les ai laissés passer. La meute a gardé ses distances.', 'I let them pass. The pack kept its distance.')
    : pact === 3 ? L('Le cri du petit s’est tu sous les racines.', 'The cub fell silent under the roots.')
    : epicFlag(state, 'cub') ? L('La grille est retombée derrière le petit. Les adultes l’ont rejoint.', 'The gate dropped behind the cub. The adults joined it.')
    : [undefined, L('J’ai gardé la grille fermée. Les adultes ont creusé à la lisière.', 'I kept the gate shut. The adults dug at the treeline.'),
      L('Un choc dans la grille. Les bêtes ont filé par le fossé.', 'A blow against the gate. The animals fled along the ditch.')][epicFlag(state, 'packExit')];
  if (prints.length || outcome) {
    const notes = [];
    if (prints.length) notes.push(L('Même pointe claire au bout de la queue. Je reconnaîtrais ce petit jusque dans le noir.', 'Same pale tip on the tail. I’d know that cub even in the dark.'));
    if (outcome) notes.push(outcome);
    const cameras = cameraNames();
    pages.push({ id: 'moon', title: L('La pleine lune', 'Full moon'), notes, pictures: prints.map(p => ({ url: p.image, caption: p.camera === 1 && epicFlag(state,'found.cubLine') ? L('L’étendoir','The clothesline') : p.camera === 2 && pact === 1 ? L('Le chêne creux','The hollow oak') : p.camera === 2 && epicFlag(state, 'found.cubWinch') && epicFlag(state, 'cub') ? L('Au coude de la haie', 'At the bend') : cameras[p.camera]! })) });
  }
  find('photo', L('La fenêtre', 'The window'));
  const chapters = { orchard: L('Au verger', 'In the orchard'), shed: L('Au poteau', 'At the post'), radio: L('À la radio', 'On the radio'), finale: L('Les amplis', 'The amps') };
  for (const chapter of Object.keys(chapters) as (keyof typeof chapters)[]) {
    const seen = epicFlag(state, chapter + 'Look');
    if (!seen) continue;
    const points = observations(chapter);
    const pictures = points.flatMap((p, i) => {
      const url = state.chapterPrints?.[chapter + i];
      return (seen & (1 << i)) && url ? [{ url, caption: p.label }] : [];
    });
    pages.push({ id: chapter, title: chapters[chapter], notes: points.filter((_, i) => seen & (1 << i)).map(p => p.evidence), pictures });
  }
  const titles: Record<string, string> = { ...chapters, moon: L('La pleine lune', 'Full moon'), menu: L('Le snack et la cuisine', 'Snack counter and kitchen'), garage: L('Chez Gérard', 'Gérard’s garage'), vhs: L('La cassette', 'The tape'), photo: L('La fenêtre', 'The window'), relay: L('La dernière veille', 'Last watch') };
  for (const f of discoveredEvidence(state)) {
    let page = pages.find(p => p.id === f.page);
    if (!page) { page = { id: f.page, title: titles[f.page]!, notes: [] }; pages.push(page); }
    page.notes.push(f.text);
    if (f.picture) (page.pictures ??= []).push(f.picture);
  }
  return pages;
}

export function notebookButton(app: App, preferred?: string, onRead?: (open: boolean) => void) {
  const title = L('Carnet de terrain', 'Field notebook');
  const button = el('button', { class: 'btn notebook-open', text: L('Carnet', 'Notebook'), onClick: open });
  button.setAttribute('aria-label', title);
  button.setAttribute('aria-haspopup', 'dialog');
  function open() {
    const pages = pagesFor(app.state!);
    const close = el('button', { class: 'notebook-close', text: L('Refermer', 'Close notebook'), onClick: () => dialog.close() });
    const index = el('nav', { class: 'notebook-index' });
    index.setAttribute('aria-label', L('Sommaire', 'Contents'));
    const leaf = el('article', { class: 'notebook-leaf' });
    const dialog = el('dialog', { class: 'field-notebook' }, [
      el('header', {}, [el('h2', { text: title }), close]), index, leaf
    ]);
    dialog.setAttribute('aria-label', title);
    function turn(i: number) {
      const page = pages[i]!;
      Array.from(index.children).forEach((b, n) => b.setAttribute('aria-pressed', String(n === i)));
      leaf.replaceChildren(el('h3', { text: page.title }), ...page.notes.map(text => el('p', { text })));
      for (const p of page.pictures ?? []) {
        const img = el('img');
        img.src = p.url;
        img.alt = p.caption || page.title;
        if (p.crop) {
          const [x, y, w, h] = p.crop;
          const crop = el('div', { class: 'notebook-crop' }, [img]);
          crop.style.aspectRatio = '2';
          img.style.width = (100 / w) + '%';
          img.style.height = (100 / h) + '%';
          img.style.left = (-100 * x / w) + '%';
          img.style.top = (-100 * y / h) + '%';
          img.addEventListener('load', () => { crop.style.aspectRatio = String(img.naturalWidth * w / (img.naturalHeight * h)); });
          leaf.append(el('figure', {}, [crop]));
          continue;
        }
        leaf.append(el('figure', {}, [img, el('figcaption', { text: p.caption })]));
      }
      leaf.scrollTop = 0;
    }
    pages.forEach((p, i) => index.append(el('button', { text: p.title, onClick: () => turn(i) })));
    if (pages.length) {
      let current = pages.findIndex(p => p.id === preferred);
      if (current < 0 && preferred === 'moon') current = pages.findIndex(p => p.id === 'trail');
      turn(current >= 0 ? current : pages.length - 1);
    } else {
      index.hidden = true;
      leaf.append(el('p', { text: L('Première page. J’y noterai ce que je remarque en chemin.', 'First page. I’ll jot down what I notice along the way.') }));
    }
    dialog.addEventListener('keydown', e => e.stopPropagation());
    dialog.addEventListener('keyup', e => e.stopPropagation());
    dialog.addEventListener('close', () => { dialog.remove(); onRead?.(false); button.focus({ preventScroll: true }); }, { once: true });
    app.ui.append(dialog);
    onRead?.(true);
    dialog.showModal();
    close.focus({ preventScroll: true });
  }
  return button;
}
