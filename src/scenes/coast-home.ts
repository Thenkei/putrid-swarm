import thornUrl from '../assets/coast-thorn.webp';
import hedgeUrl from '../assets/coast-gate.webp';
import cottageUrl from '../assets/coast-refuge.webp';
import woodsUrl from '../assets/coast-woods.webp';
import { HOUSE_MAX_HP } from '../core/data/devices';
import laneUrl from '../assets/coast-lane.webp';
import postsUrl from '../assets/coast-posts.webp';
import listenerUrl from '../assets/coast-listener.webp';
import type { CoastArt } from '../render/coast-road';
import { COAST_METRES, COAST_RUT, CoastDrive, finishCoastHome } from '../core/coast-home';
import type { App, Scene } from '../engine/app';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { line as L, S } from '../engine/i18n';
import { hush, say } from '../engine/voice';
import { drawCoast } from '../render/coast-home';
import { calmMotion } from '../render/lighting';
import { goTitle } from './flow';
import { PauseMenu } from './pause';
import './coast-home.css';

export class CoastHomeScene implements Scene {
  private readonly drive = new CoastDrive();
  private readonly art: CoastArt = { cottage: new Image(), thorn: new Image(), hedge: new Image(), woods: new Image(), lane: new Image(), posts: new Image(), listener: new Image() };
  private readonly keys = new Set<string>();
  private readonly dash = el('section', { class: 'coast-dash' });
  private readonly title = el('h1');
  private readonly hint = el('p');
  private readonly action = el('button', { class: 'coast-key', onClick: () => this.ignition() });
  private readonly controls = el('div', { class: 'coast-controls' });
  private readonly overlay = el('div', { class: 'overlay' });
  private readonly pause = new PauseMenu(this.overlay, this.action);
  private readonly distance = el('output', { class: 'coast-distance' });
  private readonly reduced = calmMotion();
  private age = 0;
  private rollingTime = 0;
  private alertAge = 0;
  private nextTyre = .6;
  private jarAt = 0;
  private paused = false;
  private leaving = false;
  private ready = false;
  private arrivedAt = 0;

  constructor(private readonly app: App, private readonly next: () => void) {}

  enter(): void {
    const urls = { cottage: cottageUrl, thorn: thornUrl, hedge: hedgeUrl, woods: woodsUrl, lane: laneUrl, posts: postsUrl, listener: listenerUrl };
    const loaded = (Object.keys(urls) as (keyof CoastArt)[]).map(key => {
      this.art[key].src = urls[key];
      return this.art[key].decode();
    });
    void Promise.allSettled(loaded).then(() => { this.ready = true; this.action.disabled = false; });
    this.action.disabled = true;
    this.distance.setAttribute('aria-live', 'off');
    this.hint.setAttribute('role', 'status');
    this.dash.append(this.distance, this.title, this.hint, this.action, this.controls);
    const labels = [['ArrowLeft', '←', L('Gauche', 'Left')], ['ArrowRight', '→', L('Droite', 'Right')], ['Space', L('Espace', 'Space'), L('Freiner', 'Brake')]] as const;
    for (const [key, cap, label] of labels) {
      const button = el('button', { class: 'coast-pedal' }, [el('kbd', { text: cap }), label]);
      button.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        button.setPointerCapture(event.pointerId);
        this.keys.add(key);
      });
      button.addEventListener('lostpointercapture', () => this.keys.delete(key));
      button.addEventListener('keydown', event => {
        if (event.code === 'Enter') { event.preventDefault(); this.keys.add(key); }
      });
      button.addEventListener('keyup', event => { if (event.code === 'Enter') this.keys.delete(key); });
      button.addEventListener('blur', () => this.keys.delete(key));
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
    if (phase === 'arrived') {
      if (this.age - this.arrivedAt < 1.2) return;
      this.leaving = true;
      this.next();
      return;
    }
    if (phase !== 'ready' && phase !== 'stopped') return;
    this.drive.ignition();
    if (phase === 'ready') {
      audio.fadeOut('engine', .15);
      audio.setAmbience('none');
      audio.play('engine_stop', .65);
    } else {
      audio.play('engine', .88);
      this.app.playSceneCue('groan', 650);
      audio.setAmbience('car', .45);
    }
    this.sync();
  }

  private sync(): void {
    const { phase, metres, grass, heard, noise } = this.drive;
    const active = phase === 'rolling' || phase === 'powered';
    this.dash.dataset.phase = phase;
    this.dash.dataset.alert = String(heard);
    const distance = String(Math.ceil(COAST_METRES - metres)).padStart(2, '0') + ' m';
    if (this.distance.value !== distance) this.distance.value = distance;
    this.controls.hidden = !active;
    this.action.hidden = active;
    if (phase === 'arrived') this.action.disabled = this.age - this.arrivedAt < 1.2;
    const title = phase === 'ready' ? L('Coupe le moteur, Hugo.', 'Kill the engine, Hugo.') :
      phase === 'stopped' ? L('Plus un centimètre.', 'Dead stop.') :
      phase === 'arrived' ? (heard ? L('Ils ont retenu le chemin.', 'They know the way now.') : L('Ils continuent tout droit.', 'They walk on.')) :
      grass ? L('Herbe mouillée', 'Wet grass') : L('Gravier', 'Loose gravel');
    const hint = phase === 'ready' ? L('Deux silhouettes dans l’allée de la grange. Prends le bas-côté en herbe à droite.', 'Two figures on the barn drive. Take the grassy verge on the right.') :
      phase === 'stopped' ? L('Le break s’est arrêté dans la pente. Un tour de clé et ils nous entendront.', 'The wagon has stopped on the slope. Turn the key and they’ll hear us.') :
      phase === 'arrived' ? (heard ? L('Ces deux-là seront au portail dès la première vague, ce soir.', 'These two will be at the gate when the first wave starts tonight.') : L('Ce soir, ces deux-là arriveront plus tard, avec la vague.', 'Tonight these two will arrive later, with the wave.')) :
      heard ? (metres < 6 ? L('Les deux têtes se retournent.', 'Both heads turn.') : L('Dans le rétro, deux visages tournés vers nous.', 'In the mirror, two faces turn our way.')) :
      noise > .52 ? L('Il s’arrête pour écouter.', 'He stops to listen.') :
      grass && metres >= COAST_RUT - 3.5 && metres < COAST_RUT ? L('Une racine dans l’ornière. Un peu de frein…', 'A root in the rut. Ease onto the brake…') :
      grass ? L('Les pneus chuchotent. Garde ton élan.', 'A whisper from the tyres. Keep rolling.') : L('Les pierres craquent sous les roues.', 'Stones crunch under the wheels.');
    if (this.title.textContent !== title) this.title.textContent = title;
    if (this.hint.textContent !== hint) this.hint.textContent = hint;
    if (!active) this.action.textContent = phase === 'ready' ? L('Couper le contact', 'Cut the ignition') : phase === 'stopped' ? L('Redémarrer', 'Restart the engine') : L('Se garer près de la maison', 'Park beside the house');
  }

  update(dt: number): void {
    if (this.paused || this.leaving) return;
    this.age += dt;
    const d = this.drive;
    if (d.heard) this.alertAge += dt;
    if (d.phase !== 'rolling' && d.phase !== 'powered') {
      if (d.phase === 'arrived' && this.action.disabled && this.age - this.arrivedAt >= 1.2) this.sync();
      return;
    }
    const before = d.phase;
    const heard = d.heard;
    const bumped = d.bumped;
    const elapsed = this.rollingTime;
    this.rollingTime += dt;
    if (elapsed < .6 && this.rollingTime >= .6) say('vo_coast_descent', { interrupt: true });
    d.update(dt, Number(this.keys.has('ArrowRight')) - Number(this.keys.has('ArrowLeft')), this.keys.has('Space'));
    if (d.metres >= this.nextTyre) {
      audio.play(d.grass ? 'hedge_leaves' : 'coast_gravel', d.grass ? .22 : .33 + .25 * d.speed, .87 + .11 * d.speed);
      this.nextTyre = d.metres + (d.grass ? 1.8 : 1.32);
    }
    if (!bumped && d.bumped) {
      audio.play('hedge_twig', .64);
      audio.play('coast_jars', .87, .91);
    }
    const bumps = [2.7, 10.8];
    if (this.jarAt < bumps.length && d.metres >= bumps[this.jarAt]!) {
      audio.play('coast_jars', d.grass ? .42 : .76, this.jarAt ? .92 : 1);
      this.jarAt++;
    }
    if (!heard && d.heard) audio.play('groan', .47);
    if (d.metres >= COAST_METRES) {
      this.arrivedAt = this.age;
      if (before === 'powered') { audio.fadeOut('engine', .25); audio.play('engine_stop', .6); }
      audio.setAmbience('none');
      if (this.app.state) {
        this.app.state = finishCoastHome(this.app.state, d.heard ? 'followed' : 'quiet');
        this.app.save();
      }
    }
    this.sync();
  }

  onKeyDown(code: string, event: KeyboardEvent): void {
    if (code === 'Escape') { this.togglePause(); return; }
    if (this.paused) return;
    if (code === 'Enter' && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); this.ignition(); }
    if (['ArrowLeft', 'ArrowRight', 'Space'].includes(code) && !this.controls.hidden) {
      event.preventDefault(); this.keys.add(code);
    }
  }
  onKeyUp(code: string): void { this.keys.delete(code); }
  onBlur(): void {
    this.keys.clear();
    if (!this.paused && this.drive.phase !== 'ready' && this.drive.phase !== 'arrived') this.togglePause(true);
  }
  private togglePause(auto = false): void {
    if (this.leaving) return;
    this.paused = !this.paused;
    this.keys.clear();
    if (this.paused) this.pause.open(() => this.togglePause(), () => goTitle(this.app), auto);
    else this.pause.close();
  }
  render(ctx: CanvasRenderingContext2D): void { drawCoast(ctx, this.art, this.drive, this.age, this.alertAge, this.reduced, (this.app.state?.yard.houseHp ?? HOUSE_MAX_HP) / HOUSE_MAX_HP); }
  exit(): void {
    this.keys.clear();
    audio.setAmbience('none');
    audio.fadeOut('engine', .22);
    audio.fadeOut('coast_gravel', .12);
    audio.fadeOut('coast_jars', .12);
    hush();
  }
}
