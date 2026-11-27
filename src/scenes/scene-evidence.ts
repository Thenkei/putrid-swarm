import { epicFlag, markEpic } from '../core/epics';
import type { App } from '../engine/app';
import type { GameState } from '../core/types';
import { line as L } from '../engine/i18n';
import kitchen from '../assets/epic-kitchen.webp';
import sleeve from '../assets/epic-vhs-signed.webp';
import window from '../assets/epic-neighbour.webp';
import darkroom from '../assets/darkroom-paper.webp';

/** A crop is in fractions of the original painting, so the print survives a resize or reload. */
export interface EvidencePicture { url: string; caption: string; crop?: readonly [number, number, number, number] }
interface Finding { page: string; fr: string; en: string; picture?: EvidencePicture }

function detail(page: string, fr: string, en: string, url: string, crop: NonNullable<EvidencePicture['crop']>): Finding {
  return { page, fr, en, picture: { url, crop, caption: '' } };
}
function note(page: string, fr: string, en: string): Finding { return { page, fr, en }; }

const findings = {
  dial: detail('menu', 'Le bouton du four porte une encoche, juste sous le brûleur.', 'There is a notch in the oven dial just below the burner.', kitchen, [.06,.52,.16,.19]),
  table: detail('menu', 'Les assiettes occupent presque toute la largeur du torchon.', 'The plates span nearly the whole width of the tea towel.', kitchen, [.36,.47,.31,.30]),
  coldTin: note('menu', 'À la place de la gazinière, il reste une marque sur le lino. Les raviolis sont froids.', 'The stove left its mark on the lino. The ravioli are cold.'),
  latch: detail('menu', 'Entre deux coups, la poignée remonte et le bois revient contre le montant.', 'Between knocks the handle rises and the wood settles against the frame.', kitchen, [.82,.35,.13,.32]),
  hob: detail('menu', 'Le couvercle de la gazinière vibre au rythme des coups à la porte.', 'The stove lid rattles in time with the blows at the door.', kitchen, [.035,.24,.20,.37]),
  stoveOut: note('menu', 'Huit flambées sur le perron. Il faut viser avant que le groupe se disperse.', 'Eight bursts on the porch. Aim before the group scatters.'),
  tongs: detail('garage', 'Les mors de la pince sont humides. On a retiré un tirage du bain.', 'The tips of the tongs are wet. Someone lifted a print out of the bath.', darkroom, [.04,.54,.23,.28]),
  paper: detail('garage', 'Un seul coin du papier dépasse du révélateur.', 'Only one corner of the sheet sticks out of the developer.', darkroom, [.56,.47,.26,.24]),
  pocket: note('garage', 'Un anneau dépasse du bleu de Gérard, au bord de la poche.', 'A ring peeks out of Gérard’s coveralls at the lip of the pocket.'),
  hook: note('garage', 'Sous le rebord du chariot, le trousseau a rayé la peinture rouge.', 'Under the trolley rim, the key ring has scratched the red paint.'),
  signature: detail('vhs', 'Une étoile et « Cachet double ! » de la main du facteur, sur le jaune de la jaquette.', 'A star and “Double fee!” in the postman’s hand on the yellow sleeve artwork.', sleeve, [.345,.60,.16,.22]),
  rewind: detail('vhs', 'Entre les bobines, une étiquette de travers. « Rembobiner au portail rouge. »', 'A crooked label between the reels. “Rewind at the red gate.”', sleeve, [.637,.34,.14,.31]),
  ashtray: detail('photo', 'Le même éclat creuse le bord du cendrier, côté rue.', 'The same chip cuts into the street side of the ashtray.', window, [.09,.80,.15,.19]),
  shade: detail('photo', 'L’abat-jour se reflète dans la vitre au-dessus du cendrier.', 'The lampshade reflects in the pane above the ashtray.', window, [.013,.24,.17,.36]),
  coat: detail('photo', 'Le manteau jaune reste au portillon. Quand une silhouette passe, il se baisse derrière la haie.', 'The yellow coat waits at the wicket. When a figure passes, he ducks behind the hedge.', window, [.445,.42,.17,.47]),
  litSignal: note('photo', 'Depuis le sentier, il voit ma main passer devant la lampe.', 'From the path he can see my hand cross the lamp.'),
  curtain: note('photo', 'L’ombre du rideau atteint le sentier. Il lui faut un instant pour lever les yeux.', 'The curtain casts a shadow across the path. It takes him a moment to look up.'),
  rope: note('orchard', 'Une corde pend à la clôture du verger.', 'A rope hangs from the orchard fence.'),
  saw: note('orchard', 'La scie est au pied de l’arbre.', 'The saw is by the tree.'),
  bowl: note('shed', 'J’ai pris la gamelle. Je peux la remplir à nouveau.', 'I picked up the bowl. I can fill it again.'),
  flour: note('shed', 'De la farine. Il en reste sur mes doigts.', 'Flour. I still have some on my fingers.'),
  leads: note('shed', 'Les deux pinces des câbles tiennent encore.', 'The jumper leads still have both clamps.'),
  hammer: note('shed', 'Le marteau tient bien dans la main.', 'The hammer sits firmly in my hand.'),
  caller: note('radio', 'En tournant le cadran, j’ai trouvé une voix entre deux nappes de souffle.', 'Turning the dial, I found a voice between two bands of static.'),
  flashes: note('relay', 'Trois éclats dans le verre du poste. La lampe donne la fréquence reçue.', 'Three flashes in the glass. The lamp gives the incoming frequency.'),
  cry: note('relay', 'Un petit cri au portail donne la phase du signal.', 'A small cry at the gate gives the phase of the signal.'),
  cough: note('relay', 'La tondeuse a toussé derrière la cloison pendant le réglage.', 'The mower coughed behind the wall while I was tuning.'),
  hedge: note('photo', 'À la première haie, le feuillage cache le manteau jaune au passage de la patrouille.', 'At the first hedge the leaves hide the yellow coat from the patrol.'),
  laundry: note('photo', 'Le linge pend assez bas pour le dissimuler.', 'The hanging laundry is low enough to hide him.'),
  greenhouse: note('photo', 'La serre lui offre un dernier abri avant sa fenêtre.', 'The greenhouse offers one last shelter before his window.'),
  knock: note('vhs', 'La cassette est sortie. Les coups continuent à la porte du refuge.', 'The tape is out. The knocking at the shelter door continues.'),
  sunday: note('finale', 'Le recommandé dit « dimanche à 7 h 12 ». Hugo le glisse sous la sangle.', 'The registered letter says “Sunday at 7:12”. Hugo slips it under the strap.'),
  boltsSeated: note('menu', 'Au matin, les deux pênes sont encore dans leurs gâches.', 'In the morning both bolts are still seated in their keepers.'),
  sootMark: note('menu', 'Une empreinte de suie sur la serrure de la cuisine.', 'A sooty print on the kitchen lock.'),
  spentTape: note('vhs', 'Au matin, la cassette dépasse encore du lecteur.', 'In the morning the cassette is still sticking out of the VCR.'),
  cubLine: note('moon', 'Sous le drap oublié, une petite queue claire. Toute la vague a tourné à sa suite.', 'A pale tail under the forgotten sheet. The whole wave turned to follow it.'),
  cubSteps: note('moon', 'Le petit a tourné court devant la maison. Une main a raclé ma porte en passant.', 'The cub turned sharply in front of the house. A hand scraped my door on its way past.'),
  cubMetal: note('moon', 'J’ai cogné sur la boîte près du break. Les rôdeurs ont quitté la piste du petit.', 'I struck the tin by the wagon. The stragglers turned off the cub’s trail.'),
  cubSpoor: note('moon', 'Les petites empreintes traversent la cour et s’enfoncent dans les feuilles.', 'The small prints cross the yard and disappear into the leaves.'),
  cubHollow: note('moon', 'Le petit s’abrite entre les racines du chêne creux.', 'The cub shelters between the roots of the hollow oak.'),
  woodland: note('moon', 'Deux grandes pistes et une petite repartent de l’étendoir vers le bois.', 'Two large sets of prints and one small set lead from the line towards the woods.'),
  clothesline: note('moon', 'La petite piste quitte l’étendoir. Elle se perd à la lisière.', 'The small trail leaves the clothesline and fades at the treeline.'),
  cubHem: note('moon', 'Sous le drap, le pli avance par petits bonds. Une queue claire dépasse du dernier pli.', 'The fold travels along the hem in little bounds. A pale tail sticks out of the last fold.'),
  cubWinch: note('moon', 'Passé le coude de la haie, une manivelle lève la grille. De là je vois encore la porte éclairée.', 'Beyond the bend a crank lifts the gate. I can still see the light over my door from here.'),
  together: note('moon', 'Dans la boue, deux grandes pistes et une petite ressortent ensemble par le portail.', 'In the mud, two large sets of prints and one small set lead out through the gate together.'),
  digging: note('moon', 'Au pied du poteau, des griffes ont strié la terre fraîche.', 'Claws scored the loose earth at the foot of the post.'),
  ditch: note('moon', 'Les petites empreintes bifurquent vers le fossé. Les grandes les suivent.', 'The small prints veer towards the ditch. The larger ones follow.'),
  fence: note('moon', 'Au matin, deux grandes pistes longent la clôture.', 'In the morning two large sets of tracks run along the fence.'),
  sill: note('photo', 'Le cendrier est revenu sur le rebord de la fenêtre.', 'The ashtray is back on the windowsill.'),
  shutter: note('photo', 'Au matin, son volet est toujours fermé.', 'In the morning his shutter is still closed.'),
  complaint: note('finale', 'Sur le recommandé, une heure soulignée. Dimanche à 7 h 12.', 'An underlined time on the registered letter. Sunday at 7:12.'),
  aligned: note('relay', 'Les crêtes se superposent sur le verre quand le relais accroche.', 'The crests line up on the glass when the relay connects.'),
};
export type FindingId = keyof typeof findings;

export function discover(app: App, id: FindingId) {
  if (epicFlag(app.state!, 'found.' + id)) return;
  app.state = markEpic(app.state!, 'found.' + id);
  app.save();
}

export function noteWhenOpened(app: App, panel: HTMLDetailsElement, ...ids: FindingId[]) {
  panel.addEventListener('toggle', () => {
    if (panel.open && panel.isConnected) ids.forEach(id => discover(app, id));
  });
  return panel;
}

export function discoveredEvidence(state: GameState) {
  return (Object.entries(findings) as [FindingId, Finding][]).filter(([id]) =>
    epicFlag(state, 'found.' + id) || (id === 'pocket' && epicFlag(state, 'garagePrint')) || (id === 'complaint' && epicFlag(state, 'readComplaint'))
  ).map(([id, f]) => {
    let text = L(f.fr, f.en);
    if (id === 'flashes') text += ' ' + L('Fréquence', 'Frequency') + ' ' + (3 + (state.seed >>> 0) % 5) + '.';
    if (id === 'cry') text += ' ' + L('Phase', 'Phase') + ' ' + (2 + (state.seed >>> 8) % 6) + '.';
    return { page: f.page, text, picture: f.picture };
  });
}
