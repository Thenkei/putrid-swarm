import thornUrl from '../assets/coast-thorn.webp';
import hedgeUrl from '../assets/coast-gate.webp';
import cottageUrl from '../assets/coast-refuge.webp';
import woodsUrl from '../assets/coast-woods.webp';
import groveUrl from '../assets/coast-grove.webp';
import { HOUSE_MAX_HP } from '../core/data/devices';
import laneUrl from '../assets/coast-lane.webp';
import postsUrl from '../assets/coast-posts.webp';
import listenerUrl from '../assets/coast-listener.webp';
import type { CoastArt } from '../render/coast-road';
import { COAST_METRES, COAST_RUT, CoastDrive, type CoastArrival, type CoastOutcome } from '../core/coast-home';
import type { App, Scene } from '../engine/app';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { line as L, S } from '../engine/i18n';
import { hush, say } from '../engine/voice';
import { drawCoast } from '../render/coast-home';
import { prepareCoastWheel } from '../render/coast-wheel';
import { calmMotion } from '../render/lighting';
import { oneArmed } from './common';
import { goTitle } from './flow';
import { PauseMenu } from './pause';
import './coast-home.css';

export class CoastHomeScene implements Scene {
  private readonly drive = new CoastDrive();
  private readonly art: CoastArt = { cottage: new Image(), thorn: new Image(), hedge: new Image(), woods: new Image(), grove: new Image(), lane: new Image(), posts: new Image(), listener: new Image() };
  private readonly keys = new Set<string>();
  private readonly heldButtons = new Set<string>();
  private readonly pedals = new Map<string, HTMLButtonElement>();
  private readonly dash = el('section', { class: 'coast-dash' });
  private readonly title = el('h1');
  private readonly hint = el('p');
  private readonly action = el('button', { class: 'coast-key', onClick: () => this.ignition() });
  private readonly controls = el('div', { class: 'coast-controls' });
  private readonly overlay = el('div', { class: 'overlay' });
  private readonly pause = new PauseMenu(this.overlay, this.action);
  private readonly distance = el('output', { class: 'coast-distance' });
  private readonly speed = el('output', { class: 'coast-speed' });
  private readonly reduced = calmMotion();
  private age = 0;
  private rollingTime = 0;
  private alertAge = 0;
  private nextTyre = .6;
  private paused = false;
  private leaving = false;
  private ready = false;

  constructor(private readonly app: App, private readonly next: (outcome: CoastOutcome, arrival: CoastArrival) => void) {}

  enter(): void {
    const urls = { cottage: cottageUrl, thorn: thornUrl, hedge: hedgeUrl, woods: woodsUrl, grove: groveUrl, lane: laneUrl, posts: postsUrl, listener: listenerUrl };
    const loaded = (Object.keys(urls) as (keyof CoastArt)[]).map(key => {
      this.art[key].src = urls[key];
      return this.art[key].decode();
    });
    void Promise.allSettled([...loaded, prepareCoastWheel()]).then(() => { this.ready = true; this.action.disabled = false; });
    this.action.disabled = true;
    this.distance.setAttribute('aria-live', 'off');
    this.speed.setAttribute('aria-live', 'off');
    this.hint.setAttribute('role', 'status');
    this.dash.append(this.distance, this.speed, this.title, this.hint, this.action, this.controls);
    const labels = [['ArrowLeft', '←', L('Gauche', 'Left')], ['ArrowRight', '→', L('Droite', 'Right')], ['ArrowUp', '↑', L('Élan', 'Momentum')], ['ArrowDown', L('↓ / Espace', '↓ / Space'), L('Freiner', 'Brake')]] as const;
    for (const [key, cap, label] of labels) {
      const button = el('button', { class: 'coast-pedal' }, [el('kbd', { text: cap }), label]);
      this.pedals.set(key, button);
      button.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        button.setPointerCapture(event.pointerId);
        this.heldButtons.add(key);
      });
      button.addEventListener('lostpointercapture', () => this.heldButtons.delete(key));
      button.addEventListener('keydown', event => {
        if (event.code === 'Enter') { event.preventDefault(); this.heldButtons.add(key); }
      });
      button.addEventListener('keyup', event => { if (event.code === 'Enter') this.heldButtons.delete(key); });
      button.addEventListener('blur', () => this.heldButtons.delete(key));
      this.controls.append(button);
    }
    this.app.ui.append(this.dash, el('button', { class: 'road-pause', text: S().crossbowRoad.pause, onClick: () => this.togglePause() }), this.overlay);
    audio.setMusic('none');
    audio.setAmbience('car', .45);
    for (const id of ['vo_coast_descent', 'coast_jars', 'coast_gravel', 'hedge_leaves', 'hedge_twig', 'groan']) void audio.prepareSample(id);
    this.sync();
  }

  private ignition(): void {
    if (!this.ready || this.paused || this.leaving) return;
    const phase = this.drive.phase;
    if (phase !== 'ready' && phase !== 'stopped') return;
    this.drive.ignition();
    if (phase === 'ready') {
      audio.fadeOut('engine', .15);
      audio.setAmbience('none');
      audio.play('engine_stop', .65);
    } else {
      audio.play('engine', .88);
      audio.play('coast_jars', this.drive.jarRattle, .86);
      this.app.playSceneCue('groan', 650);
      audio.setAmbience('car', .45);
    }
    this.sync();
  }

  private sync(): void {
    const { phase, metres, grass, heard } = this.drive;
    const active = phase === 'rolling' || phase === 'powered';
    const houseInSight = metres >= COAST_METRES - 2.9;
    this.dash.dataset.phase = phase;
    this.dash.dataset.alert = String(heard);
    const distance = String(Math.ceil(COAST_METRES - metres)).padStart(2, '0') + ' m';
    if (this.distance.value !== distance) this.distance.value = distance;
    const speed = Math.round(this.drive.speed * 3.6) + ' km/h';
    if (this.speed.value !== speed) this.speed.value = speed;
    this.speed.hidden = phase === 'ready';
    this.controls.hidden = !active;
    for (const [key, button] of this.pedals) {
      const pressed = active && (this.held(key) || (key === 'ArrowDown' && this.held('Space')));
      if (button.getAttribute('aria-pressed') !== String(pressed)) button.setAttribute('aria-pressed', String(pressed));
    }
    this.action.hidden = phase !== 'ready' && phase !== 'stopped';
    const title = phase === 'ready' ? L('Coupe le moteur, Hugo.', 'Kill the engine, Hugo.') :
      phase === 'stopped' ? L('Plus un centimètre.', 'Dead stop.') :
      houseInSight ? L('La maison, entre les arbres.', 'Home, through the trees.') :
      grass ? L('Herbe mouillée', 'Wet grass') : L('Gravier', 'Loose gravel');
    const hint = phase === 'ready' ? L('Deux silhouettes après le portail. Vise l’herbe à droite pour étouffer le gravier.', 'Two figures beyond the gate. Aim for the grass on the right to quiet the tyres.') :
      phase === 'stopped' ? L('Le break s’est arrêté dans la pente. Un tour de clé et ils nous entendront.', 'The wagon has stopped on the slope. Turn the key and they’ll hear us.') :
      this.drivingHint(houseInSight);
    if (this.title.textContent !== title) this.title.textContent = title;
    if (this.hint.textContent !== hint) this.hint.textContent = hint;
    if (!this.action.hidden) this.action.textContent = phase === 'ready' ? L('Couper le contact', 'Cut the ignition') : L('Redémarrer', 'Restart the engine');
  }

  private drivingHint(houseInSight: boolean): string {
    const { metres, lane, grass, heard, listening, losingMomentum, rootCrossing, speed } = this.drive;
    if (losingMomentum && (this.held('ArrowDown') || this.held('Space'))) return L('Relâche le frein, on perd notre élan.', 'Ease off the brake. We’re losing momentum.');
    if (houseInSight) return L('Au bout de l’allée, gare le break à gauche avec les flèches.', 'At the end of the drive, use the arrow keys to park on the left.');
    if (this.drive.edgeContact > .35) return lane > 0 ? L('Ça frotte dans la haie. Ramène le nez à gauche.', 'The hedge is brushing the car. Steer left.') :
      L('Ça frotte dans la haie. Ramène le nez à droite.', 'The hedge is brushing the car. Steer right.');
    if (heard) return metres < 9 ? L('Les deux têtes se retournent.', 'Both heads turn.') : L('Dans le rétro, il nous suit des yeux.', 'In the mirror, he’s watching us.');
    if (metres >= COAST_RUT && metres < COAST_RUT + 1.3 && rootCrossing) {
      return rootCrossing === 'quiet' ?
        L('La racine passe sous les roues. Les bocaux n’ont pas bougé.', 'Over the root. The jars didn’t budge.') :
        L('Les bocaux s’entrechoquent. Il tend l’oreille.', 'The jars clack together. He’s listening.');
    }
    if (lane >= .52 && metres >= COAST_RUT - 2 && metres < COAST_RUT) {
      return speed > .80 ? L('Une racine dans l’ornière. Un peu de frein…', 'A root in the rut. Ease onto the brake…') :
        L('Voilà. Passe la racine à cette allure.', 'Easy. Take the root at this pace.');
    }
    if (listening) return L('Il s’arrête pour écouter. Tout doux…', 'He’s stopped to listen. Easy now…');
    if (grass) return L('Les pneus chuchotent. Garde ton élan.', 'A whisper from the tyres. Keep rolling.');
    return speed < .76 ? L('Le gravier roule doucement sous les pneus.', 'The stones shift softly under the tyres.') :
      L('Les pierres craquent sous les roues.', 'Stones crunch under the wheels.');
  }

  update(dt: number): void {
    if (this.paused || this.leaving) return;
    this.age += dt;
    const d = this.drive;
    if (d.heard) this.alertAge += dt;
    if (d.phase !== 'rolling' && d.phase !== 'powered') {
      d.update(dt, 0, false);
      return;
    }
    const heard = d.heard;
    const bumped = d.bumped;
    const jars = d.jarRattle;
    const elapsed = this.rollingTime;
    this.rollingTime += dt;
    if (elapsed < .6 && this.rollingTime >= .6) say('vo_coast_descent', { interrupt: true });
    d.update(dt, Number(this.held('ArrowRight')) - Number(this.held('ArrowLeft')), this.held('ArrowDown') || this.held('Space'), this.held('ArrowUp'));
    const tyreLoad = d.tyreLoad;
    if (d.metres >= this.nextTyre) {
      const brush = d.grass || d.edgeContact > .30;
      const level = brush ? .09 + .15 * tyreLoad + .35 * d.edgeContact : .12 + .54 * tyreLoad;
      audio.play(brush ? 'hedge_leaves' : 'coast_gravel', level, .78 + .25 * tyreLoad);
      this.nextTyre = d.metres + (d.grass ? 1.8 : 1.32);
    }
    if (!bumped && d.bumped) audio.play('hedge_twig', .64);
    if (d.jarRattle > jars) audio.play('coast_jars', d.jarRattle, d.metres >= COAST_RUT ? .91 : 1);
    if (!heard && d.heard) audio.play('groan', .47);
    if (d.metres >= COAST_METRES) {
      this.leaving = true;
      this.next(d.heard ? 'followed' : 'quiet', d.arrival);
      return;
    }
    this.sync();
  }

  private held(code: string): boolean { return this.keys.has(code) || this.heldButtons.has(code); }

  onKeyDown(code: string, event: KeyboardEvent): void {
    if (code === 'Escape') { this.togglePause(); return; }
    if (this.paused) return;
    if (code === 'Enter' && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); this.ignition(); }
    if ((this.pedals.has(code) || code === 'Space') && !this.controls.hidden) {
      event.preventDefault(); this.keys.add(code);
    }
  }
  onKeyUp(code: string): void { this.keys.delete(code); }
  onBlur(): void {
    this.keys.clear();
    this.heldButtons.clear();
    if (!this.paused && this.drive.phase !== 'ready') this.togglePause(true);
  }
  private togglePause(auto = false): void {
    if (this.leaving) return;
    this.paused = !this.paused;
    this.keys.clear();
    this.heldButtons.clear();
    this.sync();
    if (this.paused) {
      audio.setAmbience('none');
      audio.fadeOut('coast_gravel', .1);
      audio.fadeOut('engine', .14);
      this.pause.open(() => this.togglePause(), () => goTitle(this.app), auto);
    } else {
      if (this.drive.phase === 'powered' || this.drive.phase === 'ready') audio.setAmbience('car', .25);
      this.pause.close();
    }
  }
  render(ctx: CanvasRenderingContext2D): void { drawCoast(ctx, this.art, this.drive, this.age, this.alertAge, this.reduced, (this.app.state?.yard.houseHp ?? HOUSE_MAX_HP) / HOUSE_MAX_HP, oneArmed(this.app.state)); }
  exit(): void {
    this.keys.clear();
    this.heldButtons.clear();
    if (!this.leaving || !this.drive.arrival.powered) {
      audio.setAmbience('none');
      audio.fadeOut('engine', .22);
    }
    audio.fadeOut('coast_gravel', .12);
    audio.fadeOut('coast_jars', .12);
    hush();
  }
}
