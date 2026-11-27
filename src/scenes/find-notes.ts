import receipt from '../assets/find-receipt.webp';
import dispatch from '../assets/find-dispatch.webp';
import sum from '../assets/find-sum.webp';
import menu from '../assets/find-menu.webp';
import sleeve from '../assets/find-sleeve.webp';
import photo from '../assets/find-photo.webp';

export const papers = { menu: [receipt, menu], vhs: [dispatch, sleeve], photo: [sum, photo] } as const;
import { line as L } from '../engine/i18n';
import { epicFlag } from '../core/epics';
import type { GameState } from '../core/types';

export type Find = 'menu' | 'vhs' | 'trail' | 'photo';

export function seenFind(state: GameState, kind: Find) {
  return epicFlag(state, 'notes.' + kind) | epicFlag(state, 'examined.' + kind) | (epicFlag(state, kind) ? 2 : 0);
}

export function story(kind: Find) {
  switch (kind) {
    case 'menu': return {
      title: L('Sur le comptoir du snack', 'On the snack counter'), first: L('Ticket de caisse', 'Till receipt'), second: L('Menu plié', 'Folded menu'),
      opening: L('Une auréole de gras traverse le menu. Quelqu’un a repassé un de ses bords au crayon.', 'A grease ring runs across the menu. Someone has traced one edge in pencil.'),
      other: L('Deux boîtes de raviolis, payées comptant. Ça, tu connais déjà.', 'Two tins of ravioli, paid in cash. That part you know.'),
      clue: L('Sous les prix, le cuistot a transformé le rond de gras en bouton de four. Même encoche que sur ta vieille gazinière.', 'Beneath the prices the cook turned the ring into an oven dial. Same notch as the one on your old stove.'),
      act: L('Détacher le dessin', 'Tear off the drawing'), result: L('Le talon du menu est resté sous le ticket. Le dessin plié tient dans ta poche.', 'The menu stub is still under the receipt. The folded drawing fits in your pocket.')
    };
    case 'vhs': return {
      title: L('Sur le chariot des colis', 'On the parcel trolley'), first: L('Bordereau', 'Dispatch slip'), second: L('Jaquette cornée', 'Dog-eared sleeve'),
      opening: L('Sous la ficelle, un coin de carton a blanchi à force de passer de main en main.', 'A cardboard corner under the string has worn white from handling.'),
      other: L('Le bordereau porte le poids du colis et le tampon de la poste.', 'The slip gives the parcel weight and the postmark.'),
      clue: L('Sous le rabat, le facteur a entouré sa sacoche. « Pour ma première cascade, vous me comptez double. »', 'Under the flap the postman circled his satchel. “For my first stunt, you count me double.”'),
      act: L('Glisser la jaquette dans sa poche', 'Pocket the sleeve'), result: L('La ficelle serre encore le bordereau. Tu gardes le portrait du facteur et sa dédicace.', 'The string still holds the dispatch slip. You keep the postman’s portrait and his dedication.')
    };
    case 'trail': return {
      title: L('Devant l’établi', 'By the workbench'), first: L('Sillons parallèles', 'Parallel grooves'), second: L('Petites empreintes', 'Small prints'),
      opening: L('Quelque chose a traversé la poussière sous l’établi. Deux pistes se croisent.', 'Something crossed the dust under the bench. Two trails meet.'),
      other: L('Les raies gardent le même écart et s’arrêtent au pied de l’établi. On a traîné une caisse.', 'The grooves stay the same distance apart and stop at the bench leg. Someone dragged a crate.'),
      clue: L('Quatre doigts, un coussinet. La petite patte tient tout entière dans le pas de l’adulte. Les griffes pointent vers la sortie.', 'Four toes and a pad. The little paw fits inside the adult’s print. The claws point towards the way out.'),
      act: L('Marquer le pas à la craie', 'Mark the print in chalk'), result: L('Un croissant de craie longe le petit pas. Les pointes des griffes restent bien visibles.', 'A chalk crescent follows the little paw. The claw tips are still visible.')
    };
    case 'photo': return {
      title: L('Au pied de la caisse', 'Beside the till'), first: L('Papier quadrillé', 'Squared paper'), second: L('Coin de tirage', 'Photograph corner'),
      opening: L('Un bord blanc dépasse sous la caisse. Le papier brille là où un pouce a frotté.', 'A white edge sticks out beneath the till. A thumb has polished the paper.'),
      other: L('Une addition au crayon. Un fond de tasse a laissé un cercle sur les chiffres.', 'A pencilled sum. A cup has left a ring across the figures.'),
      clue: L('Ton cendrier ébréché, photographié depuis la rue. Au dos : « De chez moi, je vois encore ta fenêtre. »', 'Your chipped ashtray, photographed from the street. On the back: “I can still see your window from mine.”'),
      act: L('Emporter le tirage', 'Take the photograph'), result: L('La feuille quadrillée reste sous la caisse. Sur le tirage en poche, la lumière accroche l’encoche du cendrier.', 'The squared paper stays under the till. In your pocket print, light catches the chip in the ashtray.')
    };
  }
}
