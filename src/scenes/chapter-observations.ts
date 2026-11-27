import { line as L } from '../engine/i18n';

export type Chapter = 'orchard' | 'shed' | 'radio' | 'finale';
export interface Look { x: number; y: number; label: string; evidence: string }

export function observations(chapter: Chapter): Look[] {
  switch (chapter) {
    case 'orchard': return [
      { x: .53, y: .54, label: L('Observer les oreilles', 'Watch the ears'), evidence: L('Une pomme tombe. Une oreille pivote au bruit, puis le museau redescend vers le câble. Il t’entend déjà d’ici.', 'An apple drops. One ear turns towards the sound, then the nose dips back to the cable. It can hear you from here.') },
      { x: .52, y: .16, label: L('Examiner la caméra quatre', 'Inspect camera four'), evidence: L('Le boîtier est toujours droit. Le fil descend le long du poteau et se perd dans l’herbe, juste à côté des pattes.', 'The camera is still upright. Its cable runs down the pole into the grass, right beside those paws.') },
    ];
    case 'shed': return [
      { x: .47, y: .66, label: L('Écouter près du poteau', 'Listen by the post'), evidence: L('Deux maillons raclent le sol, puis le silence. Quand tu restes sur le seuil, la chaîne retombe.', 'Two links scrape the floor, then silence. As you stand still in the doorway, the chain goes slack.') },
      { x: .24, y: .53, label: L('Regarder l’établi', 'Look over the workbench'), evidence: L('Il y a de la place sur l’établi pour poser ce que tu as en main. Tu peux y revenir en quittant le poteau.', 'There is space on the bench to put down what you’re holding. You can step away from the post and come back here.') },
    ];
    case 'radio': return [
      { x: .32, y: .81, label: L('Écouter le poste', 'Listen to the set'), evidence: L('Une voix continue de parler par-dessus le grésillement. Une autre dit « à vous » et attend. C’est dans ce silence qu’on pourrait répondre.', 'One voice talks straight through the static. Another says “over” and waits. There’s room to answer in that silence.') },
      { x: .73, y: .50, label: L('Regarder les moniteurs', 'Inspect the monitors'), evidence: L('Les écrans roulent tous la même neige. La voix vient de plus bas, du haut-parleur du poste.', 'The same snow rolls across every screen. The voice is coming from lower down, from the set’s speaker.') },
    ];
    case 'finale': return [
      { x: .64, y: .64, label: L('Faire sonner les cordes', 'Sound the strings'), evidence: L('Trois accords et tes doigts retrouvent le manche. Avec les trois autres, il faudra changer de position en plein riff.', 'Three chords fall under your fingers. Add the other three and you’ll have to shift your hand mid-riff.') },
      { x: .77, y: .37, label: L('Examiner les amplis', 'Inspect the amps'), evidence: L('Les sangles tiennent. Ces deux murs de haut-parleurs porteront le morceau bien au-delà de la cabane.', 'The straps hold. Those two walls of speakers will carry the song far beyond the shed.') },
    ];
  }
}
