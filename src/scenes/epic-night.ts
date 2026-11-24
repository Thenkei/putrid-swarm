import { porchContact, porchFlame, type PorchBurst } from '../render/porch-flame';
import { calmMotion } from '../render/lighting';
import { kitchenBolts } from './kitchen-bolts';
import kitchenPlate from '../assets/epic-kitchen.webp';
import neighbourPlate from '../assets/epic-neighbour.webp';
import vhsSleeve from '../assets/epic-vhs.webp';
import { BARRICADE, COMBAT } from '../core/data/devices';
import { escortFeed } from './garden-escort';
import { warmGardenArt } from '../render/garden-scenery';
import { playVhs } from './vhs-arcade';
import { moonWatch } from './moon-pack';
import { developGaragePrint } from './garage-print';
import { epicFlag, markEpic } from '../core/epics';
import { LAST_NIGHT } from '../core/data/waves';
import { lastWatchDesk } from './last-watch';
import type { NightSim } from '../core/night';
import { SECTOR_IDS, type SectorId } from '../core/types';
import type { App } from '../engine/app';
import { assetUrl } from '../engine/assets';
import { audio } from '../engine/audio';
import { say } from '../engine/voice';
import { el } from '../engine/dom';
import { line as L, S } from '../engine/i18n';
import { heroArt, oneArmed } from './common';

const button = (text: string, onClick: () => void) => el('button', { class: 'btn', text, onClick });
const sector = (n: number) => S().sector[SECTOR_IDS[n]!];

/** Owns one playable interruption. Its clock advances with the scene, including pause. */
export class EpicNight {
  private shown = false;
  private panel: HTMLElement | null = null;
  private readonly title = el('h2');
  private readonly note = el('p');
  private readonly field = el('div', { class: 'epic-field' });
  private readonly actions = el('div', { class: 'epic-actions' });
  private elapsed = 0;
  private clock: ((dt: number) => void) | null = null;
  private readonly lane: number;

  private outside = false;
  private launched: HTMLButtonElement | null = null;
  private previousFocus: HTMLElement | null = null;
  constructor(private app: App, private sim: NightSim, private desk: HTMLElement,
    private paintYard: (canvas: HTMLCanvasElement, sector: SectorId, burst?: PorchBurst) => { id: number; x: number; y: number }[] | undefined,
    private tuneCamera: (sector: SectorId) => void, private pause: () => void) {
    this.lane = this.flag('lane') % 4;
    if (this.flag('moped') && !this.flag('spent')) {
      const launch = button(L('🛵 Lâcher la mob → ', '🛵 Release moped → ') + sector(this.lane), () => {
        if (this.active || this.sim.outcome !== 'ongoing' || this.desk.inert) return;
        if (!this.sim.launchMoped(SECTOR_IDS[this.lane]!)) return;
        this.tuneCamera(SECTOR_IDS[this.lane]!);
        this.mark('spent');
        this.app.save();
        if (this.sim.barricades[SECTOR_IDS[this.lane]!].hp > 0) audio.play('moped_door');
        launch.disabled = true;
        launch.dataset.stage = 'run';
        launch.textContent = L('Mob lancée…', 'Moped away…');
        this.launched = launch;
        launch.classList.add('epic-launched');
      });
      launch.classList.add('epic-launch');
      launch.title = L('Un seul départ. Les lames frappent sur le trajet. La mob explose au fond du jardin.', 'One ride. The blades strike on the way out. The moped explodes at the far end of the yard.');
      launch.setAttribute('aria-live', 'polite');
      this.desk.append(launch);
    }
  }

  private flag(key: string) { return epicFlag(this.app.state!, key); }
  private mark(key: string, value = 1) { this.app.state = markEpic(this.app.state!, key, value); }
  get active() { return this.panel !== null; }
  get holdsDesk() { return this.active && !this.outside; }

  finishMoped(kills: number): void {
    if (!this.launched) return;
    const tally = kills + L(kills > 1 ? ' éliminés au souffle' : ' éliminé au souffle', kills === 1 ? ' blast kill' : ' blast kills');
    this.launched.textContent = L('Mob détruite', 'Moped wrecked') + ' · ' + tally;
    this.launched.dataset.stage = 'spent';
    this.launched = null;
  }

  update(dt: number): boolean {
    if (this.active) {
      if (document.hidden) return true;
      this.elapsed += dt;
      this.clock?.(dt);
      return !this.outside;
    }
    const day = this.sim.night;
    if (this.shown || day < 2 || day > LAST_NIGHT || (day === LAST_NIGHT ? this.sim.progress() < 0.72 : day !== 4 && this.sim.time < 9)) return false;
    const ride = this.sim.mopedRide;
    if (ride && (ride.blastAt === null || this.sim.time - ride.blastAt < 0.85)) return false;
    this.shown = true;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.desk.inert = true;
    const pause = el('button', { class: 'btn epic-pause', text: 'Ⅱ', title: S().night.paused, onClick: this.pause });
    pause.setAttribute('aria-label', S().night.paused);
    this.panel = el('section', { class: 'epic-night' }, [this.title, this.field, this.note, this.actions, pause]);
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    this.panel.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const stops = Array.from(this.panel!.querySelectorAll<HTMLElement>('button:enabled, input:enabled, [tabindex="0"]'))
        .filter(node => node.getClientRects().length > 0);
      const first = stops[0], last = stops.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    this.app.ui.append(this.panel);
    const plates = ['plate_village', 'plate_loc_garage', 'plate_town', 'plate_orchard_fence', 'plate_village', 'plate_control_room'];
    const url = assetUrl(heroArt(plates[day - 2]!, oneArmed(this.app.state)));
    if (url) this.field.style.backgroundImage = 'linear-gradient(0deg,#12131177,#13121c22),url("' + url + '")';
    if (day === 2) this.kitchen();
    if (day === 3) this.garage();
    if (day === 4) this.arcadeIntro();
    if (day === 5) this.moon();
    if (day === 6) this.windows();
    if (day === 7) this.lastWatch();
    if (!this.panel.contains(document.activeElement)) this.actions.querySelector('button')?.focus();
    return true;
  }

  private close = () => {
    this.panel?.remove();
    this.panel = null;
    this.desk.inert = false;
    this.clock = null;
    const back = this.previousFocus;
    (back && back !== document.body && back.isConnected ? back : this.desk.querySelector<HTMLButtonElement>('button:enabled'))?.focus();
    this.previousFocus = null;
  };
  private page(title: string, note: string, ...choices: HTMLButtonElement[]) {
    this.clock = null;
    this.outside = false;
    this.elapsed = 0;
    this.title.textContent = title;
    this.panel?.setAttribute('aria-label', title);
    this.note.textContent = note;
    this.field.replaceChildren();
    this.actions.replaceChildren(...(choices.length ? choices : [button(L('Reprendre la veille', 'Back to the desk'), this.close)]));
    this.actions.querySelector('button')?.focus();
  }

  private garage() {
    const title = L('La mob à Gérard', 'Gérard’s moped');
    if (this.flag('moped')) {
      this.page(title, this.flag('spent')
        ? L('La caméra se rallume. Une roue tourne encore près de la haie. Gérard va demander où est passée sa mob.', 'The feed comes back. A wheel is still spinning by the hedge. Gérard is going to ask about his moped.')
        : L('Les lames de la roue avant brillent dans le phare. Attends que ça se tasse contre la haie pour lâcher la mob depuis le bureau. Elle explose là-bas. Gérard peut rentrer à pied.', 'The blades on the front wheel catch the headlamp. Wait for a crowd at the hedge, then release the moped from the desk. It blows up out there. Gérard can walk home.'));
      return;
    }
    const develop = () => {
      this.page(title, '');
      this.clock = developGaragePrint(this.field, this.note, this.actions, readable => {
        if (readable) this.mark('garagePrint');
        this.page(title, readable
          ? L('Sur le tirage, la clé pend au rideau du garage. Tu gardes la photo pour ta prochaine sortie.', 'In the print, a key hangs from the garage shutter. You keep the photo for your next outing.')
          : L('Impossible de lire le tirage. À la prochaine sortie, il faudra fouiller le garage à la lumière du jour.', 'The print is unreadable. You’ll have to search the garage in daylight on your next outing.'));
      });
    };
    this.page(title, L('Le klaxon a déclenché la caméra du garage. Il reste une feuille dans le bac de la chambre noire.', 'The horn tripped the garage camera. One sheet of paper remains in the darkroom tray.'),
      button(L('Développer le cliché', 'Develop the print'), develop), button(L('Reprendre la veille', 'Back to the desk'), this.close));
  }

  private lastWatch() {
    const lamp = Boolean(this.flag('neighbor'));
    const cub = Boolean(this.flag('cub'));
    const clue = lamp && cub ? L('Trois éclats du voisin calent la fréquence. Au portail, le hurlement du petit te donne la phase.', 'Three flashes from your neighbour set the frequency. At the gate, the cub’s howl gives you the phase.')
      : lamp ? L('Trois éclats en face. Le voisin tient la fréquence de la porte arrière.', 'Three flashes across the road. Your neighbour holds the back-door frequency.')
      : cub ? L('Le petit hurle au portail. Son écho te donne la phase.', 'The cub howls by the gate. Its echo gives you the phase.')
      : L('La tondeuse tousse derrière la cloison. Une trace revient sur le tube.', 'The mower coughs behind the wall. A trace comes back on the tube.');
    const target: SectorId = lamp ? 'arriere' : cub ? 'portail' : SECTOR_IDS.reduce((a, b) => this.sim.threat(a).count >= this.sim.threat(b).count ? a : b);
    const connect = button(L('Enclencher le relais', 'Engage relay'), () => {
      if (!receiver.locked()) {
        audio.play('deny');
        receiver.retry();
        return;
      }
      const before = this.sim.energy;
      this.sim.energy = Math.min(COMBAT.nightEnergy, this.sim.energy + 12);
      if (this.sim.cameraLost === target) this.sim.cameraLost = null;
      const recovered = Math.round(this.sim.energy - before);
      audio.play('radio_ptt', .65);
      if (lamp) say('vo_epic_neighbor_relay', { interrupt:true });
      receiver.confirm(S().sector[target] + ' · ' + L('Relais connecté', 'Relay connected') +
        (recovered ? ' · +' + recovered + ' ' + L('énergie', 'energy') : ''));
      this.note.textContent = lamp && cub ? L('Derrière la maison, le voisin fait lentement trois nouveaux éclats. Le petit lui répond depuis le portail.', 'Behind the house your neighbour flashes the lamp three more times, slowly. The cub answers from the gate.')
        : lamp ? L('La caméra reprend. En face, le voisin pose sa lampe sur l’appui de fenêtre et tire une chaise.', 'The feed comes back. Across the road your neighbour sets his lamp on the sill and pulls up a chair.')
        : cub ? L('Sur le moniteur, la meute attend le petit. Il passe sous le lampadaire et les silhouettes repartent ensemble.', 'On the monitor the pack waits for its cub. It crosses the pool of lamplight and the silhouettes leave together.')
        : L('Le secteur réapparaît sur le moniteur. Tu distingues enfin ce qui gratte derrière la porte.', 'The sector returns to the monitor. At last you can see what’s scratching at the door.');
      const resume = button(L('Reprendre la veille', 'Back to the desk'), () => { this.close(); this.tuneCamera(target); });
      resume.setAttribute('aria-describedby', receiver.statusId);
      this.actions.replaceChildren(resume);
      resume.focus();
    });
    this.page(L('La dernière veille', 'Last watch'), clue + ' ' + L('Aligne le trait orange sur le pointillé pour reconnecter le secteur et récupérer jusqu’à 12 points d’énergie.', 'Match the solid line to the dotted trace to reconnect the feed and recover up to 12 energy.'),
      connect, button(L('Reprendre la veille', 'Back to the desk'), this.close));
    const receiver = lastWatchDesk(this.field, this.app.state!.seed, lamp, cub);
  }

  private kitchen() {
    const title = L('Ce soir, on mange froid', 'Cold dinner tonight');
    const outside = () => {
      say('vo_epic_stove', { interrupt: true });
      let fuel = 8, facing: SectorId = 'portail', flameUntil = 0;
      const startWave = this.sim.waveIndex;
      const yard = el('canvas');
      yard.width = 896;
      yard.height = 420;
      yard.tabIndex = 0;
      let aim = 448, hitCount = 0, firedAim = 448;
      let contacts: { x: number; y: number }[] = [];
      let firedSector: SectorId | null = null;
      const fire = () => {
        if (fuel <= 0 || this.elapsed < flameUntil) return;
        const seen = this.paintYard(yard, facing) ?? [];
        const caught = seen.filter(p => porchContact(aim, p));
        contacts = caught;
        hitCount = this.sim.epicStrike(facing, 'flame', new Set(caught.map(p => p.id)));
        audio.play('epic_flare');
        firedAim = aim;
        firedSector = facing;
        flameUntil = this.elapsed + 0.45;
        fuel--;
      };
      const burners = SECTOR_IDS.map(s => button(S().sector[s], () => { facing = s; yard.focus(); }));
      const hints = L('Vise et clique dans la cour. Au clavier, ← → puis Espace. 1–4 change de secteur.', 'Aim and click in the yard. Keyboard: ← → then Space. 1–4 changes sector.');
      this.page(title, hints, ...burners, button(L('Rentrer', 'Head back'), () => this.keys()));
      this.field.append(yard);
      yard.setAttribute('aria-label', hints);
      yard.style.cursor = 'crosshair';
      const point = (e: PointerEvent) => {
        const rect = yard.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width * yard.width;
        const y = (e.clientY - rect.top) / rect.height * yard.height;
        aim = Math.max(-150, Math.min(1046, 448 + (x - 448) * 290 / Math.max(76, 420 - y)));
      };
      yard.style.objectFit = 'fill';
      yard.onpointermove = point;
      yard.style.touchAction = 'none';
      yard.onpointerdown = e => { if (e.button !== 0 || !e.isPrimary) return; e.preventDefault(); yard.focus(); point(e); fire(); };
      yard.onkeydown = e => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') aim = Math.max(-150, Math.min(1046, aim + (e.key === 'ArrowLeft' ? -55 : 55)));
        else if (e.code === 'Space' || e.key === 'Enter') fire();
        else if (/^(Digit|Numpad)[1-4]$/.test(e.code)) facing = SECTOR_IDS[Number(e.code.slice(-1)) - 1]!;
        else return;
        e.preventDefault();
      };
      yard.focus();
      this.outside = true;
      this.clock = () => {
        if ((fuel === 0 || this.elapsed >= 18 || this.sim.waveIndex > startWave) && this.elapsed >= flameUntil) { this.keys(); return; }
        const age = facing === firedSector ? this.elapsed - flameUntil + .45 : -1;
        this.paintYard(yard, facing, age >= 0 && age < 1.05 ? { age, aim: firedAim, contacts } : undefined);
        const ctx = yard.getContext('2d');
        if (ctx) porchFlame(ctx, aim, firedAim, age, contacts);
        this.note.textContent = hints + ' · ' + S().sector[facing] + ' · ' + fuel + '/8 · ' + hitCount + L(' touchés', ' hit');
        burners.forEach((b, i) => {
          const s = SECTOR_IDS[i]!;
          const label = sector(i) + ' · ' + this.sim.threat(s).count;
          if (b.textContent !== label) b.textContent = label;
          b.setAttribute('aria-pressed', String(s === facing));
        });
      };
    };
    this.field.style.backgroundImage = 'url("' + kitchenPlate + '")';
    const bolt = () => {
      const control = el('button', { class: 'btn' });
      this.page(title, '', control, button(L('Reprendre la veille', 'Back to the desk'), this.close));
      this.clock = kitchenBolts(this.field, this.note, control, () => {
        const gate = this.sim.barricades.portail;
        const before = gate.hp;
        gate.hp = Math.min(BARRICADE.maxHp[gate.level], before + 4);
        this.page(title, L('Les deux verrous tiennent. Les coups glissent le long du montant.', 'Both bolts hold. The blows glance off the doorframe.') +
          (gate.hp > before ? ' · +' + Math.round(gate.hp - before) + ' ' + S().sector.portail : ''));
      });
    };
    this.page(title, L('Les corps masquent la caméra de la cuisine. La poignée tourne.', 'Bodies block the kitchen feed. The handle turns.'),
      ...(this.flag('stove') ? [button(L('Sortir avec la gazinière 🔥', 'Take the stove outside 🔥'), outside)] : []),
      button(L('Tirer les verrous', 'Slide the bolts'), bolt), button(L('Reprendre la veille', 'Back to the desk'), this.close));
  }

  private keys() {
    const reduced = calmMotion();
    const tolerance = reduced ? .46 : .34;
    const swingAt = () => Math.sin(this.elapsed * (reduced ? 1.7 : 3) - Math.PI / 2);
    const aligned = () => Math.abs(swingAt()) < tolerance;
    const tap = () => {
      const door = this.sim.barricades.portail;
      if (aligned()) { audio.play('door'); this.close(); }
      else {
        door.hp = Math.max(0, door.hp - 2);
        this.note.textContent = L('Raté. La porte encaisse. Vise le centre ou passe par la fenêtre.', 'Missed. The door takes a hit. Aim for the middle or use the window.');
      }
    };
    this.page(L('La porte a claqué', 'Locked out'), L('Tape quand la clé traverse la fente au centre.', 'Tap when the key crosses the slot in the middle.'),
      button(L('Taper', 'Tap'), tap), button(L('Passer par la fenêtre (−2 porte)', 'Climb through the window (−2 door)'), () => { const d = this.sim.barricades.portail; d.hp = Math.max(0, d.hp - 2); this.close(); }));
    const key = el('span', { class: 'epic-key' }, [el('i'), el('b')]);
    const slot = el('div', { class: 'epic-slot' });
    slot.style.width = (2 * 39 * tolerance) + '%';
    const door = el('div', { class: 'epic-key-door' }, [slot, key]);
    door.setAttribute('aria-hidden', 'true');
    this.field.append(door);
    let previouslyAligned = false;
    this.clock = () => {
      const swing = swingAt();
      key.style.left = (50 + 39 * swing) + '%';
      key.style.setProperty('--tilt', (swing * 12) + 'deg');
      const ready = aligned();
      if (ready && !previouslyAligned) audio.play('tin', .25, 1.35);
      previouslyAligned = ready;
      slot.dataset.aligned = String(ready);
    };
  }

  private arcadeIntro() {
    this.field.style.backgroundImage = 'url("' + vhsSleeve + '")';
    this.field.style.backgroundPosition = 'center 22%';
    const rules = L('Au feutre sur la cassette : « Rembobiner au portail rouge. » ← → pour changer de voie, Espace pour tirer. Au doigt ou à la souris, appuie et glisse. Contourne les chariots blindés.', 'Scrawled on the tape: “Rewind at the red gate.” Change lanes with ← → and hold Space to fire. With touch or mouse, hold and drag. Dodge the armoured carts.');
    const sleeve = this.flag('vhs') ? L(' La jaquette double le bonus du facteur.', ' The sleeve doubles the postman bonus.') : '';
    this.page(L('NUIT IV · Édition vidéo', 'NIGHT IV · Video edition'), rules + sleeve,
      button(L('Lecture ▶', 'Play ▶'), () => this.arcade()), button(L('Éjecter', 'Eject'), this.close));
  }

  private arcade() {
    this.page(L('NUIT IV · Tir en rafale', 'NIGHT IV · Burst fire'), '');
    this.clock = playVhs(this.field, this.actions, this.note, !!this.flag('vhs'), oneArmed(this.app.state), (score, complete) => {
      let best = score;
      try {
        best = Math.max(score, Number(localStorage.getItem('putrid-swarm.vhs-best')) || 0);
        localStorage.setItem('putrid-swarm.vhs-best', String(best));
      } catch { /* Storage is optional for a tape played in private browsing. */ }
      const lastFrame = complete ? this.field.querySelector('canvas') : null;
      const cut = complete ? L('Le portail rouge se fige. Fin de bande.', 'The red gate freezes on screen. The tape runs out.')
        : L('La cassette ressort encore tiède.', 'The cassette slides out, still warm.');
      audio.play('door', .48);
      this.page(L('REMBOBINEZ S’IL VOUS PLAÎT', 'BE KIND, REWIND'),
        score + ' pts · Record ' + best + ' · ' + cut + L(' On cogne à ta porte. Cette fois, c’est la vraie nuit.', ' Someone pounds on your door. This time the night is real.'));
      if (lastFrame) {
        lastFrame.removeAttribute('tabindex');
        lastFrame.setAttribute('aria-label', L('Dernière image de la cassette, devant le portail du garage.', 'Final frame of the tape, outside the garage gate.'));
        this.field.append(lastFrame);
      }
      this.actions.querySelector('button')?.focus();
    });
  }

  private moon() {
    audio.play('epic_pack');
    const title = L('Pleine lune', 'Full moon');
    this.page(title, '');
    this.clock = moonWatch(this.field, this.note, this.actions, this.app.state!.seed, (rescued, damage, message) => {
      const gate = this.sim.barricades.portail;
      gate.hp = Math.max(0, gate.hp - damage);
      if (rescued) {
        this.mark('cub');
        this.sim.epicStrike('portail', 'pack');
      }
      this.page(title, message);
      this.actions.querySelector('button')?.focus();
    });
  }

  private windows() {
    warmGardenArt();
    const title = L('Quelqu’un fait tourner', 'Pass it around');
    this.field.style.backgroundImage = 'url("' + neighbourPlate + '")';
    const lamp = Boolean(this.flag('lamp'));
    const method = lamp
      ? L('Le voisin reconnaît ta lampe. Il réagit au quart de tour.', 'Your neighbour recognises your lamp. He responds immediately.')
      : L('Tu entrouvres ton rideau. Il distingue le signal, mais avec un temps de retard.', 'You part the curtain. He can see your signal, but reacts a little late.');
    const play = () => {
      const signal = el('button', { class: 'btn' });
      this.page(title, '', signal);
      this.clock = escortFeed(this.field, this.note, signal, lamp, this.app.state!.seed, (home) => {
        if (home) {
          this.mark('neighbor');
          say('vo_epic_neighbor', { interrupt: true });
        }
        this.page(title, home
          ? L('La cuisine d’en face s’allume. Derrière la vitre, le voisin lève sa lampe pour te répondre.', 'The kitchen across the street lights up. Your neighbour raises his lamp to answer you.')
          : L('La deuxième patrouille l’a vu. Il rebrousse chemin jusqu’à l’abri. Sa fenêtre reste noire.', 'Spotted a second time, he doubles back to shelter. His kitchen stays dark.'));
      });
    };
    this.page(title, method + ' ' + L('Guide le manteau jaune à travers trois jardins. Montre la lumière pour le faire avancer. Cache-la pour qu’il se baisse quand un regard orange balaie le sentier. La haie et les abris le dissimulent.', 'Guide the yellow coat through three gardens. Show the light to walk. Hide it to crouch when an orange gaze sweeps the path. Hedges and shelters conceal him.'),
      button(L('Prendre le relais', 'Take the watch'), play), button(L('Fermer le volet', 'Close the shutter'), this.close));
  }
}
