import { CUB_CROSSING, PACK_CYCLE, PACK_GAP, PACK_RETURN, gatePassage, packPhase } from '../core/moon-pack';
import { assetUrl } from '../engine/assets';
import { audio } from '../engine/audio';
import { say } from '../engine/voice';
import { el } from '../engine/dom';
import { moonFeed, packAftermath } from '../render/moon-pack';
import { line as L } from '../engine/i18n';
import './moon-pack.css';

/** All input is through native buttons. Waiting for a better opening never costs the player a turn. */
export function moonWatch(field: HTMLElement, note: HTMLElement, actions: HTMLElement, seed: number,
  finish: (rescued: boolean, damage: number, message: string) => void): (dt: number) => void {
  const feeds = [L('Verger', 'Orchard'), L('Grange', 'Barn'), L('Portail', 'Gate')];
  const plates = ['plate_orchard', 'plate_loc_shed', 'plate_orchard_fence'];
  const route = (seed >>> 0) % 2 ? [1, 0, 2] : [0, 1, 2];
  const canvas = el('canvas'); canvas.width = 900; canvas.height = 420;
  canvas.setAttribute('aria-hidden', 'true');
  const header = el('strong', { class: 'moon-feed-id' });
  const evidence = el('span', { class: 'moon-evidence' });
  const caption = el('span', { class: 'moon-caption' });
  caption.setAttribute('role', 'status');
  const track = el('div', { class: 'moon-timing' });
  track.setAttribute('aria-hidden', 'true');
  const gap = el('i', { class: 'moon-gap', style: { left: PACK_GAP / PACK_CYCLE * 100 + '%', width: (PACK_RETURN - PACK_GAP) / PACK_CYCLE * 100 + '%' } });
  const head = el('i', { class: 'moon-head' });
  track.append(gap, head);
  track.hidden = true;
  const screen = el('div', { class: 'moon-screen' }, [canvas, header, evidence, track, caption]);
  field.replaceChildren(screen);
  const control = (label: string, click: () => void) => el('button', { class: 'btn', text: label, onClick: click });
  let camera = 2, stage = 0, time = 0, opened: number | null = null, crossed = false, done = false, slow = false;
  let feedback = '', feedbackUntil = 0;
  const atGate = () => stage === route.length;
  function end(rescued: boolean, damage: number, message: string) {
    if (done) return;
    done = true;
    finish(rescued, damage, message);
    screen.replaceChildren(canvas);
    const fence = assetUrl('plate_orchard_fence');
    if (fence) screen.style.backgroundImage = 'url("' + fence + '")';
    field.replaceChildren(screen);
    packAftermath(canvas, rescued, damage);
  }
  function message(text: string) {
    feedback = text;
    feedbackUntil = time + 1.7;
  }
  function switchCamera(index: number) {
    camera = index;
    const plate = assetUrl(plates[index]!);
    if (plate) screen.style.backgroundImage = 'url("' + plate + '")';
    header.textContent = 'CAM 0' + (index + 1) + ' · ' + feeds[index];
    cameraButtons.forEach((btn, i) => btn.setAttribute('aria-pressed', String(i === index)));
    feedbackUntil = 0;
    update(0);
  }
  function record() {
    if (camera !== route[stage]) {
      audio.play('deny', .45);
      message(L('Image écartée. Cherche les petites pattes.', 'Frame discarded. Look for small paws.'));
    } else {
      audio.play('camera', .6);
      stage++;
      if (atGate()) {
        say('vo_epic_pack', { interrupt: true });
        time = 0; feedbackUntil = 0;
        note.textContent = L('Lève la grille dans l’intervalle hachuré. Dès que la queue du petit est passée, referme avant le retour des infectés.', 'Raise the gate in the striped gap. Once the cub’s tail clears the bars, lower it before the infected return.');
        track.hidden = false;
        const speed = control(L('Ralenti', 'Slow motion'), () => {
          slow = !slow;
          speed.setAttribute('aria-pressed', String(slow));
        });
        speed.setAttribute('aria-pressed', 'false');
        actions.replaceChildren(handle, speed, leave);
        handle.focus();
      } else {
        message(L('Image conservée. Il file vers ', 'Frame saved. It’s heading for ') + feeds[route[stage]!] + '.');
      }
    }
    update(0);
  }
  function pull() {
    if (opened === null) {
      opened = time;
      audio.play('door', .65);
      handle.textContent = L('Abaisser la grille', 'Lower the gate');
    } else if (gatePassage(opened, time) === 'through') {
      end(true, 0, L('La grille claque juste derrière sa queue. Les adultes le rejoignent et emportent les infectés du portail dans leur course.', 'The gate drops just behind its tail. The adults catch up, scattering the infected at the gate.'));
      return;
    } else {
      opened = null;
      handle.textContent = L('Soulever la grille', 'Lift the gate');
      message(L('Trop tôt. Le petit recule, encore à l’abri.', 'Too soon. The cub backs up, still sheltered.'));
    }
    update(0);
  }
  const cameraButtons = feeds.map((name, i) => control('0' + (i + 1) + ' · ' + name, () => switchCamera(i)));
  const handle = control(L('Soulever la grille', 'Lift the gate'), pull);
  const leave = control(L('Garder fermé', 'Keep it closed'), () => end(false, 0,
    L('Tu laisses le verrou en place. À la lisière, les adultes commencent à creuser sous la clôture.', 'You leave the bolt in place. At the treeline the adults start digging under the fence.')));
  function update(dt: number) {
    if (done) return;
    time += dt * (slow ? .45 : 1);
    const gate = atGate(), subject = route[stage] ?? 2;
    let cue: string;
    if (gate) {
      const phase = packPhase(time);
      head.style.left = phase / PACK_CYCLE * 100 + '%';
      if (opened !== null) {
        const passage = gatePassage(opened, time);
        if (passage === 'impact') {
          audio.play('door');
          end(crossed, 5, crossed
            ? L('Le petit passe. Un infecté percute la grille avant sa fermeture (−5). Les adultes traversent la horde à sa suite.', 'The cub gets through. An infected slams the gate before it closes (−5). The adults charge after their cub.')
            : L('Un infecté percute la grille (−5). Le petit détale sous la clôture. Les adultes le suivent par le fossé.', 'An infected slams the gate (−5). The cub bolts along the fence. The adults follow it into the ditch.'));
          return;
        }
        crossed = passage === 'through';
        cue = crossed ? L('Queue dégagée. Referme !', 'Tail clear. Lower it!') : L('Le petit traverse…', 'The cub is crossing…');
      } else {
        cue = phase >= PACK_GAP && phase < PACK_RETURN ? L('Passage libre.', 'The approach is clear.') : L('Des infectés traversent.', 'Infected crossing.');
      }
    } else {
      cue = camera === subject ? L('Quatre petites empreintes. Une touffe claire au bout de la queue.', 'Four small prints. A pale tuft at the tip of the tail.')
        : camera === (subject + 1) % 3 ? L('Silhouette haute. Les oreilles d’un adulte pivotent.', 'Tall silhouette. An adult’s ears turn.')
        : L('Deux pas traînants. Un infecté longe le grillage.', 'Two dragging footsteps. An infected follows the fence.');
    }
    const text = time < feedbackUntil ? feedback : cue;
    if (caption.textContent !== text) caption.textContent = text;
    const record = gate ? L('Treuil du portail', 'Gate winch') : L('Piste du petit', 'Cub trail') + ' · ' + stage + '/3';
    if (evidence.textContent !== record) evidence.textContent = record;
    const progress = opened === null ? 0 : Math.min(1, (time - opened) / CUB_CROSSING);
    moonFeed(canvas, camera, subject, time, gate, Math.min(1, progress * 4) * 84, progress);
  }
  note.textContent = L('Un petit cherche sa meute. Change de caméra et photographie ses trois passages jusqu’au portail.', 'A cub is looking for its pack. Switch feeds and photograph all three sightings on its way to the gate.');
  actions.replaceChildren(...cameraButtons, control(L('Photographier la trace', 'Photograph the trail'), record), leave);
  switchCamera(camera);
  return update;
}
