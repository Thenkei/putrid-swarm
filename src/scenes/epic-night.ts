import type { MoonCamera } from '../render/moon-yard';
import { porchContact, porchFlame, type PorchBurst } from '../render/porch-flame';
import { paintedRoom, type Detail } from './painted-room';
import { stoveReturn } from './stove-return';
import { kitchenBolts } from './kitchen-bolts';
import darkroomPlate from '../assets/darkroom-paper.webp';
import kitchenPlate from '../assets/epic-kitchen.webp';
import mopedReadyPlate from '../assets/epic-moped-ready.webp';
import { garageView } from './garage-keys';
import neighbourPlate from '../assets/epic-neighbour.webp';
import vhsSleeve from '../assets/epic-vhs-signed.webp';
import { discover, type FindingId } from './scene-evidence';
import { notebookButton } from './field-notebook';
import { BARRICADE, COMBAT } from '../core/data/devices';
import { escortFeed } from './garden-escort';
import { warmGardenArt } from '../render/garden-scenery';
import { playVhs } from './vhs-arcade';
import { ejectVhs, warmVhsRoom } from './vhs-ejection';
import { rememberEnding } from '../engine/progress';
import { goEnd } from './flow';
import { moonWatch } from './moon-pack';
import { developGaragePrint } from './garage-print';
import { epicFlag, GARDEN_NIGHT, markEpic, MOON_NIGHT, moonResolvedNight } from '../core/epics';
import { LAST_NIGHT } from '../core/data/waves';
import { lastWatchDesk } from './last-watch';
import type { NightSim } from '../core/night';
import { SECTOR_IDS, type SectorId } from '../core/types';
import type { App } from '../engine/app';
import { assetUrl } from '../engine/assets';
import { audio } from '../engine/audio';
import { hush, say } from '../engine/voice';
import { el } from '../engine/dom';
import { line as L, S } from '../engine/i18n';
import { heroArt, oneArmed } from './common';

const button = (text: string, onClick: () => void) => el('button', { class: 'btn', text, onClick });
const sector = (n: number) => S().sector[SECTOR_IDS[n]!];

/** Owns one playable interruption. Its clock advances with the scene, including pause. */
export class EpicNight {
  private shown = false;
  private gardenShown = false;
  private panel: HTMLElement | null = null;
  private readonly title = el('h2');
  private readonly note = el('p');
  private readonly field = el('div', { class: 'epic-field' });
  private readonly actions = el('div', { class: 'epic-actions' });
  private elapsed = 0;
  private clock: ((dt: number) => void) | null = null;
  private readonly lane: number;

  private outside = false;
  private reading = false;
  private launchButton: HTMLButtonElement | null = null;
  private launchHint: HTMLElement | null = null;
  private nextMopedCheck = 0;
  mopedGroup = false;
  private previousFocus: HTMLElement | null = null;

  get mopedSector(): SectorId | undefined {
    return this.launchHint ? SECTOR_IDS[this.lane] : undefined;
  }

  constructor(private app: App, private sim: NightSim, private desk: HTMLElement,
    private paintYard: (canvas: HTMLCanvasElement, sector: SectorId, burst?: PorchBurst) => { id: number; x: number; y: number }[] | undefined,
    private tuneCamera: (sector: SectorId) => void, private pause: () => void, private readonly moonCamera: MoonCamera) {
    this.lane = this.flag('lane') % 4;
    if (this.flag('moped') && !this.flag('spent')) {
      const launch = button(L('Lâcher la mob → ', 'Release moped → ') + sector(this.lane), () => {
        if (this.active || this.sim.outcome !== 'ongoing' || this.desk.inert) return;
        if (!this.sim.launchMoped(SECTOR_IDS[this.lane]!)) return;
        this.tuneCamera(SECTOR_IDS[this.lane]!);
        this.mark('spent');
        this.app.save();
        if (this.sim.barricades[SECTOR_IDS[this.lane]!].hp > 0) audio.play('moped_door');
        launch.disabled = true;
        launch.dataset.stage = 'run';
        launch.textContent = L('Mob lancée…', 'Moped away…');
        this.launchHint = null;
        launch.classList.add('epic-launched');
      });
      launch.classList.add('epic-launch');
      const art = assetUrl('epic_moped_art');
      if (art) {
        launch.style.setProperty('--moped-art', 'url("' + art + '")');
        launch.classList.add('moped-illustrated');
      }
      launch.title = L('Un seul départ. Regarde la zone pointillée sur la caméra. La mob y arrive en deux secondes et demie.', 'One ride. Watch the dashed area on the feed. The moped reaches it in two and a half seconds.');
      this.launchButton = launch;
      this.launchHint = el('small');
      launch.append(this.launchHint);
      launch.setAttribute('aria-live', 'polite');
      this.desk.append(launch);
    }
  }

  private flag(key: string) { return epicFlag(this.app.state!, key); }
  private mark(key: string, value = 1) { this.app.state = markEpic(this.app.state!, key, value); }
  get active() { return this.panel !== null; }
  get holdsDesk() { return this.active && !this.outside; }

  finishMoped(kills: number): void {
    if (!this.launchButton) return;
    this.launchButton.textContent = L('Mob détruite', 'Moped wrecked');
    const blades = this.sim.mopedRide?.bladeKills ?? 0;
    this.launchButton.append(el('small', { text: L('Lames ', 'Blades ') + blades + L(' · Souffle ', ' · Blast ') + kills }));
    this.launchButton.dataset.stage = 'spent';
    this.launchButton = null;
  }

  syncMoped(): void {
    const sector = this.mopedSector;
    if (!sector || !this.launchHint || !this.launchButton || this.sim.time < this.nextMopedCheck) return;
    this.nextMopedCheck = this.sim.time + 0.15;
    const blind = this.sim.cameraLost === sector;
    const targets = blind ? 0 : this.sim.mopedTargets(sector);
    this.mopedGroup = targets >= 3;
    const cue = blind ? L('Caméra coupée · Tir à l’aveugle', 'No signal · Blind release')
      : this.mopedGroup ? L('Groupe en approche · Lâche !', 'Group incoming · Release!')
      : targets ? L('Peu de monde · Attends le groupe', 'Few targets · Wait for more')
      : L('Haie dégagée · Attends', 'Hedge clear · Wait');
    if (this.launchHint.textContent !== cue) {
      this.launchHint.textContent = cue;
      this.launchButton.dataset.stage = this.mopedGroup ? 'crowd' : 'armed';
    }
  }

  update(dt: number): boolean {
    if (this.active) {
      if (document.hidden || this.reading) return true;
      this.elapsed += dt;
      this.clock?.(dt);
      return !this.outside;
    }
    if (this.launchButton && this.launchHint) this.launchButton.disabled = this.sim.awayFromDesk;
    if (this.sim.awayFromDesk) return false;
    const day = this.sim.night;
    if (day === 5 || day < 2 || day > LAST_NIGHT) return false;
    const garden = day === GARDEN_NIGHT && this.shown && !this.gardenShown && this.sim.waveIndex >= 2;
    if (this.shown && !garden) return false;
    if (day === LAST_NIGHT ? this.sim.progress() < 0.72 : day !== 4 && this.sim.time < 9) return false;
    if (day === MOON_NIGHT) {
      if (this.sim.moonAge === null) return false;
      const resolved = moonResolvedNight(this.app.state!);
      if (resolved) {
        this.shown = true;
        this.sim.settlePack(resolved === day && this.flag('moonPact') === 1 ? 'allied' : 'neutral');
        return false;
      }
    }
    const ride = this.sim.mopedRide;
    if (ride && (ride.blastAt === null || this.sim.time - ride.blastAt < 0.85)) return false;
    this.shown = true;
    if (garden) this.gardenShown = true;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.desk.inert = true;
    const pause = el('button', { class: 'btn epic-pause', text: 'Ⅱ', title: S().night.paused, onClick: this.pause });
    pause.setAttribute('aria-label', S().night.paused);
    const page = garden ? 'photo' : ({ 2: 'menu', 3: 'garage', 4: 'vhs', 7: 'relay' } as Record<number, string | undefined>)[day];
    const heading = page ? el('div', { class: 'epic-heading' }, [
      this.title, notebookButton(this.app, page, open => { this.reading = open; }),
    ]) : this.title;
    this.panel = el('section', { class: 'epic-night' }, [heading, this.field, this.note, this.actions, pause]);
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
    if (day === GARDEN_NIGHT) {
      if (garden) this.windows();
      else this.garage();
    }
    if (day === 4) this.arcadeIntro();
    if (day === MOON_NIGHT) this.moon();
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

  private inspectPainting(url: string, ratio: number, points: (Detail & { finding: FindingId })[]) {
    const original = this.note.textContent ?? '';
    const room = paintedRoom(url, ratio, original, points, index => {
      if (index !== null) discover(this.app, points[index]!.finding);
      this.note.textContent = index === null ? original : points[index]!.read;
    });
    this.field.append(room.host);
    this.actions.prepend(room.back);
  }

  private garage() {
    const title = L('La mob à Gérard', 'Gérard’s moped');
    if (this.flag('moped')) {
      const spent = this.flag('spent');
      this.page(title, spent
        ? L('La caméra se rallume. Une roue tourne encore près de la haie. Gérard va demander où est passée sa mob.', 'The feed comes back. A wheel is still spinning by the hedge. Gérard is going to ask about his moped.')
        : L('Les pointillés sur la caméra marquent la haie où la mob va exploser. Lâche-la quand le groupe approche, le temps qu’elle traverse le jardin. Gérard peut rentrer à pied.', 'The dashed ring on the feed marks where the moped will blow. Release it as a group approaches so it has time to cross the yard. Gérard can walk home.'));
      if (spent) {
        const feed = el('canvas', { class: 'garden-feed' });
        feed.width = 960;
        feed.height = 420;
        this.field.append(feed);
        this.paintYard(feed, SECTOR_IDS[this.lane]!);
      } else {
        this.field.style.backgroundImage = 'url("' + mopedReadyPlate + '")';
      }
      return;
    }
    if (this.flag('garageKey') || this.flag('garageStarterBroken')) {
      this.page(title, this.flag('garageStarterBroken') ? L('La caméra du garage montre la mob à sa place. Avec son démarreur cassé, elle va y rester.',
        'The garage feed shows the moped where you left it. With its broken starter, it is staying there.') : L('Tu as la clé. La mob est restée chez Gérard, l’antivol ouvert. Tu peux revenir la chercher avec le break.',
        'You have the key. The moped is still at Gérard’s with its steering unlocked. You can go back for it with the wagon.'));
      this.field.style.backgroundImage = 'none';
      this.field.append(garageView(assetUrl(heroArt('plate_loc_garage', oneArmed(this.app.state))), this.app.state!.seed));
      return;
    }
    const develop = () => {
      this.page(title, '');
      this.clock = developGaragePrint(this.field, this.note, this.actions, this.app.state!.seed, () => discover(this.app, 'pocket'), readable => {
        if (readable) this.mark('garagePrint');
        this.page(title, readable
          ? L('Sur le tirage, un reflet de laiton au bord d’une poche. Tu reconnais le bleu de travail de Gérard.', 'In the print, brass glints at the edge of a pocket. You recognise Gérard’s coveralls.')
          : L('Impossible de lire le tirage. À la prochaine sortie, il faudra fouiller le garage à la lumière du jour.', 'The print is unreadable. You’ll have to search the garage in daylight on your next outing.'));
      });
    };
    this.page(title, L('Le klaxon a déclenché la caméra du garage. Il reste une feuille dans le bac de la chambre noire.', 'The horn tripped the garage camera. One sheet of paper remains in the darkroom tray.'),
      button(L('Développer le cliché', 'Develop the print'), develop), button(L('Reprendre la veille', 'Back to the desk'), this.close));
    this.inspectPainting(darkroomPlate, 16 / 9, [
      { finding: 'tongs', x: 17, y: 68, label: L('Examiner la pince', 'Inspect the tongs'), read: L('Les mors sont encore humides. Juste assez larges pour prendre un coin.', 'The tips are still wet. Just wide enough to grip one corner.') },
      { finding: 'paper', x: 73, y: 64, label: L('Regarder le papier', 'Look at the paper'), read: L('Le coin se soulève. Le reste de la feuille baigne déjà dans le rouge.', 'One corner curls upwards. The rest of the sheet is already bathed in red.') }
    ]);
  }

  private lastWatch() {
    // Leave any bark from the yard behind when we lean in to listen to the receiver.
    hush();
    const lamp = Boolean(this.flag('neighbor'));
    const cub = Boolean(this.flag('cub'));
    const clue = el('span', { class: 'relay-clue' });
    clue.setAttribute('role', 'status');
    const leave = () => {
      if (cub) audio.fadeOut('epic_pack', .12);
      if (!lamp && !cub) audio.fadeOut('mower_start', .12);
      this.close();
    };
    const target: SectorId = lamp ? 'arriere' : cub ? 'portail' : SECTOR_IDS.reduce((a, b) => this.sim.threat(a).count >= this.sim.threat(b).count ? a : b);
    const connect = button(L('Enclencher le relais', 'Engage relay'), () => {
      if (!receiver.locked()) {
        audio.play('deny');
        receiver.retry();
        return;
      }
      discover(this.app, 'aligned');
      const before = this.sim.energy;
      this.sim.energy = Math.min(COMBAT.nightEnergy, this.sim.energy + 12);
      if (this.sim.cameraLost === target) this.sim.cameraLost = null;
      const recovered = Math.round(this.sim.energy - before);
      audio.play('radio_ptt', .65);
      if (lamp) say('vo_epic_neighbor_relay', { interrupt:true });
      receiver.confirm(S().sector[target] + ' · ' + L('Relais connecté', 'Relay connected') +
        (recovered ? ' · +' + recovered + ' ' + L('énergie', 'energy') : ''));
      this.note.replaceChildren(clue);
      const resume = button(L('Reprendre la veille', 'Back to the desk'), () => { leave(); this.tuneCamera(target); });
      resume.setAttribute('aria-describedby', receiver.statusId);
      const rack = this.field.firstElementChild!;
      const feed = el('canvas', { class: 'garden-feed' });
      feed.width = 960;
      feed.height = 420;
      const review = button(S().sector[target] + ' · ' + L('Voir la caméra', 'View camera'), () => {
        if (feed.isConnected) {
          this.field.replaceChildren(rack);
          review.textContent = S().sector[target] + ' · ' + L('Voir la caméra', 'View camera');
        } else {
          this.paintYard(feed, target);
          this.field.replaceChildren(feed);
          review.textContent = L('Revoir le relais', 'Inspect the relay');
        }
      });
      this.actions.replaceChildren(review, resume);
      resume.focus();
    });
    this.page(L('La dernière veille', 'Last watch'), L('Le poste grésille. Deux signaux courent sur le même verre. Leurs crêtes se séparent.', 'The set crackles. Two signals cross the same glass. Their crests drift apart.'),
      connect, button(L('Reprendre la veille', 'Back to the desk'), leave));
    this.note.prepend(clue, document.createTextNode(' '));
    const receiver = lastWatchDesk(this.field, clue, this.app.state!.seed, lamp, cub, this.moonCamera, id => discover(this.app, id));
    this.clock = receiver.tick;
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
      const headBack = () => this.keys(fuel < 8);
      this.page(title, hints, ...burners, button(L('Rentrer', 'Head back'), headBack));
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
        if ((fuel === 0 || this.elapsed >= 18 || this.sim.waveIndex > startWave) && this.elapsed >= flameUntil) { headBack(); return; }
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
        this.mark('bolts');
        this.app.save();
        this.page(title, L('Les deux verrous tiennent. Les coups glissent le long du montant.', 'Both bolts hold. The blows glance off the doorframe.') +
          (gate.hp > before ? ' · +' + Math.round(gate.hp - before) + ' ' + S().sector.portail : ''));
      });
    };
    this.page(title, L('Les corps masquent la caméra de la cuisine. La poignée tourne.', 'Bodies block the kitchen feed. The handle turns.'),
      ...(this.flag('stove') ? [button(L('Sortir avec la gazinière 🔥', 'Take the stove outside 🔥'), outside)] : []),
      button(L('Tirer les verrous', 'Slide the bolts'), bolt), button(L('Reprendre la veille', 'Back to the desk'), this.close));
    this.inspectPainting(kitchenPlate, 1280 / 540, [
      { finding: 'latch', x: 89.5, y: 47, label: L('Observer la porte', 'Watch the door'), read: L('La poignée baisse par à-coups. Entre deux coups, le bois revient en place.', 'The handle dips in jerks. Between knocks the wood settles back against the frame.') },
      { finding: this.flag('stove') ? 'stoveOut' : 'hob', x: 14, y: 53, label: L('Regarder la gazinière', 'Look at the stove'), read: this.flag('stove') ? L('Le perron est juste derrière la porte. Huit flambées devront suffire.', 'The porch is just beyond the door. Eight bursts will have to do.') : L('La vieille reste à sa place. Le couvercle tressaute à chaque coup.', 'The old stove is staying put. Its lid jumps at every knock.') }
    ]);
  }

  private keys(blackened: boolean) {
    const hit = () => {
      const door = this.sim.barricades.portail;
      door.hp = Math.max(0, door.hp - 2);
    };
    const tap = el('button', { class: 'btn', text: L('Attraper la clé', 'Catch the key') });
    const windowExit = button(L('Passer par la fenêtre (−2 porte)', 'Climb through the window (−2 door)'), () => {
      hit();
      this.close();
    });
    this.page(L('La porte a claqué', 'Locked out'), L('La clé se balance devant la serrure. À chaque geste manqué, ton épaule cognera la porte (−2).', 'The key swings in front of the lock. Each missed grab will knock your shoulder against the door (−2).'), tap, windowExit);
    this.clock = stoveReturn(this.field, this.note, tap, windowExit, blackened, hit, () => {
      this.mark('sootyLock');
      this.app.save();
    }, this.close);
  }

  private arcadeIntro() {
    warmVhsRoom();
    void audio.prepareSample('vhs_play');
    void audio.prepareSample('vhs_eject');
    void audio.prepareSample('door');
    this.field.style.backgroundImage = 'url("' + vhsSleeve + '")';
    this.field.style.backgroundPosition = 'center 22%';
    this.page(L('NUIT IV · Édition vidéo', 'NIGHT IV · Video edition'), L('Cette sacoche jaune… « Il a vraiment tourné ça pendant sa tournée ? »', 'That yellow satchel… “Did he really film this on his round?”'),
      button(L('Lecture ▶', 'Play ▶'), () => this.arcade()), button(L('Éjecter', 'Eject'), () => { audio.play('vhs_eject'); this.close(); }));
    this.inspectPainting(vhsSleeve, 16 / 9, [
      { finding: 'signature', x: 41, y: 74, label: L('Lire la dédicace', 'Read the dedication'), read: this.flag('vhs') ? L('Même sacoche que sur le colis. Le facteur a signé « cachet double » à côté de son portrait.', 'The same satchel as on the parcel. The postman signed “double fee” beside his portrait.') : L('Le facteur signe ses cascades d’une étoile sur la sacoche. Les chariots, eux, ont une plaque de fer.', 'The postman marks his stunts with a star on his satchel. The carts carry an iron plate.') },
      { finding: 'rewind', x: 70, y: 49, label: L('Lire l’étiquette de la bande', 'Read the tape label'), read: L('« Rembobiner au portail rouge. » ← → changent de voie, Espace tire. Au doigt ou à la souris, appuie et glisse.', '“Rewind at the red gate.” ← → change lanes, Space fires. Press and drag with touch or mouse.') }
    ]);
  }

  private arcade() {
    audio.play('vhs_play');
    this.page(L('NUIT IV · Tir en rafale', 'NIGHT IV · Burst fire'), '');
    const rightHandOnly = oneArmed(this.app.state);
    this.clock = playVhs(this.field, this.actions, this.note, !!this.flag('vhs'), rightHandOnly, (score, complete, fired, frame) => {
      this.mark('vhsPlayed');
      this.mark('vhsScore', score);
      this.app.save();
      let best = score;
      try {
        best = Math.max(score, Number(localStorage.getItem('putrid-swarm.vhs-best')) || 0);
        localStorage.setItem('putrid-swarm.vhs-best', String(best));
      } catch { /* Storage is optional for a tape played in private browsing. */ }
      audio.fadeOut('vhs_play', .04);
      this.page(L('REMBOBINEZ S’IL VOUS PLAÎT', 'BE KIND, REWIND'), '');
      this.clock = ejectVhs(this.field, this.note, frame, complete, fired, rightHandOnly,
        score + ' pts · ' + L('Record ', 'Best ') + best, () => discover(this.app, 'knock'));
    });
  }

  private moon() {
    this.tuneCamera('grange');
    this.page(L('Pleine lune', 'Full moon'), '');
    this.outside = true; // Keep the actual second wave moving during the surveillance shot.
    let firstTime = false;
    this.clock = moonWatch(this.field, this.note, this.actions, this.app, this.moonCamera, {
      age: () => this.sim.moonAge ?? 0,
      cub: () => this.sim.moonCub,
      setLive: live => { this.outside = live; },
      caughtAtDoor: () => {
        firstTime = rememberEnding('moon.outside');
        this.app.state = { ...this.app.state!, phase: 'lost', fate: 'outside' };
        this.app.save();
      },
      decide: result => {
        this.sim.settlePack(result);
        this.mark('moonResolvedNight', MOON_NIGHT);
        this.mark('moonPact', result === 'allied' ? 1 : result === 'neutral' ? 2 : 3);
        if (result === 'allied') this.mark('cub');
        if (result === 'hostile') {
          firstTime = rememberEnding('moon.parents');
          this.app.state = { ...this.app.state!, phase: 'lost', fate: 'werewolves' };
        }
        this.app.save();
      },
      leave: () => {
        this.outside = false;
        this.close();
        if (this.app.state?.phase === 'lost') goEnd(this.app, { firstTime });
      }
    });
  }

  private windows() {
    warmGardenArt();
    const title = L('Quelqu’un fait tourner', 'Pass it around');
    this.field.style.backgroundImage = 'url("' + neighbourPlate + '")';
    const lamp = Boolean(this.flag('lamp'));
    const method = lamp
      ? L('Le manteau jaune lève le nez vers ta lampe. Il attend au portillon.', 'The yellow coat looks up at your lamp and waits by the wicket.')
      : L('Le rideau bouge. En bas, un homme en jaune s’arrête, la main sur le loquet.', 'The curtain stirs. Below, a man in yellow stops with his hand on the latch.');
    const play = () => {
      const signal = el('button', { class: 'btn' });
      this.page(title, '', signal);
      this.clock = escortFeed(this.field, this.note, signal, lamp, this.app.state!.seed, id => discover(this.app, id), (home) => {
        if (home) {
          this.mark('neighbor');
          say('vo_epic_neighbor', { interrupt: true });
        }
        this.mark('gardenNight', GARDEN_NIGHT);
        this.mark('gardenWalk', home ? 1 : 2);
        this.app.save();
        this.page(title, home
          ? L('La cuisine d’en face s’allume. Derrière la vitre, le voisin lève sa lampe pour te répondre.', 'The kitchen across the street lights up. Your neighbour raises his lamp to answer you.')
          : L('La deuxième patrouille l’a vu. Il rebrousse chemin jusqu’à l’abri. Sa fenêtre reste noire.', 'Spotted a second time, he doubles back to shelter. His kitchen stays dark.'));
      });
    };
    const shutter = () => this.page(title, L('Sa main reste sur le loquet. Si tu fermes, il n’aura plus personne pour le guider ce soir.', 'His hand is still on the latch. Close up and he will have no one to guide him tonight.'),
      button(L('Laisser le volet ouvert', 'Leave the shutter open'), () => this.windows()),
      button(L('Fermer pour la nuit', 'Shut it for the night'), this.close));
    this.page(title, method, button(L('Prendre le relais', 'Take the watch'), play), button(L('Fermer le volet', 'Close the shutter'), shutter));
    this.inspectPainting(neighbourPlate, 1280 / 540, [
      { finding: 'coat', x: 53, y: 63, label:L('Observer le manteau jaune', 'Watch the yellow coat'), read:L('Il attend qu’on lui fasse signe. Quand une silhouette passe devant lui, il baisse la tête derrière la haie.', 'He waits for a sign. When a figure crosses ahead of him he ducks behind the hedge.') },
      { finding: lamp ? 'litSignal' : 'curtain', x: 9, y: 51, label:L('Regarder le reflet', 'Inspect the reflection'), read:lamp ? L('L’ampoule se reflète sur le loquet. Il voit ta main dès qu’elle passe devant la lampe.', 'The bulb shines on the latch. He sees your hand as soon as it crosses the lamp.') : L('Le rideau fait une ombre jusque sur le sentier. Il lui faut un instant pour lever les yeux.', 'The curtain casts a shadow all the way to the path. It takes him a moment to look up.') }
    ]);
  }
}
