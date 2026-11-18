import { ENEMIES } from '../core/data/enemies';
import { type App, type Scene } from '../engine/app';
import { assetUrl, loadYardScenery } from '../engine/assets';
import { loadSurfaceImages } from '../engine/material-images';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S } from '../engine/i18n';
import type { GuidePreview } from '../render/guide-preview';
import { CATALOG, clipLength, entryArt, entryName, entryText, stageName, stagesFor, type GuideEntry, type GuideStage } from './guide-catalog';
import './field-guide.css';

const WIDTH = 986;
const HEIGHT = 462;
const INITIAL_YAW = -0.57;

function press(button: HTMLButtonElement, value: boolean): void {
  button.setAttribute('aria-pressed', String(value));
}
function iconButton(icon: string, label: string, action: () => void): HTMLButtonElement {
  const button = el('button', { text: icon, title: label, onClick: action });
  button.setAttribute('aria-label', label);
  return button;
}

/** Standalone at ?showcase or entered from a live preparation scene. No campaign state is written here. */
export class FieldGuideScene implements Scene {
  private entry: GuideEntry;
  private stages: readonly GuideStage[];
  private step: GuideStage;
  private age = 0;
  private paused = false;
  private tour = false;
  private yaw = INITIAL_YAW;
  private zoom = 1;
  private night = false;
  private alive = false;
  private loading = true;
  private preview: GuidePreview | undefined;
  private listKind: GuideEntry['kind'] | undefined;
  private drag: { from: number; yaw: number } | null = null;
  private readonly root = el('div', { class: 'field-guide' });
  private readonly list = el('div', { class: 'guide-list' });
  private readonly tabs = el('div', { class: 'guide-tabs' });
  private readonly heading = el('h2');
  private readonly category = el('div', { class: 'guide-category' });
  private readonly description = el('p', { class: 'guide-description' });
  private readonly view = el('div', { class: 'guide-inspection' });
  private readonly illustration = el('img', { class: 'guide-illustration' });
  private readonly stagesRow = el('div', { class: 'guide-stages' });
  private readonly progress = el('i');
  private readonly pauseButton = el('button');
  private readonly tourButton = el('button', { class: 'guide-tour' });
  private readonly lightSwitch = el('div', { class: 'guide-light-switch' });
  private readonly notice = el('span', { class: 'guide-view-note' });

  constructor(
    private readonly app: App,
    private readonly back: () => Scene,
    initial = '',
  ) {
    this.entry = CATALOG.find((a) => a.id === initial) ?? CATALOG[0]!;
    this.stages = stagesFor(this.entry);
    this.tour = initial === 'all';
    this.step = this.stages[this.tour || this.entry.kind === 'mob' ? 0 : 1]!;
  }

  enter(): void {
    this.alive = true;
    audio.setMusic('none');
    audio.setAmbience('day');
    const g = S().guide;
    const heading = el('h1', { text: g.title });
    const back = el('button', { class: 'guide-back', onClick: () => this.leave() }, [el('span', { text: '←' }), g.back]);
    back.setAttribute('aria-label', g.back);
    for (const [kind, label] of [
      ['defence', g.defences],
      ['mob', g.infected],
    ] as const) {
      const count = CATALOG.filter((e) => e.kind === kind).length;
      this.tabs.append(
        el(
          'button',
          {
            data: { kind },
            onClick: () => {
              if (kind !== this.entry.kind) this.select(CATALOG.find((e) => e.kind === kind)!);
            },
          },
          [label, el('small', { text: String(count) })],
        ),
      );
    }
    this.tourButton.onclick = () => this.toggleTour();
    const rail = el('aside', { class: 'guide-rail' }, [back, heading, this.tabs, this.list, this.tourButton]);

    this.illustration.alt = '';
    this.view.append(this.illustration);
    this.view.onpointerdown = (e) => {
      if (e.button !== 0) return;
      this.view.setPointerCapture(e.pointerId);
      this.drag = { from: e.clientX, yaw: this.yaw };
    };
    this.view.onpointermove = (e) => {
      if (this.drag) this.yaw = this.drag.yaw - (6 * (e.clientX - this.drag.from)) / this.view.getBoundingClientRect().width;
    };
    this.view.onlostpointercapture = () => {
      this.drag = null;
    };
    this.view.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom = Math.max(0.75, Math.min(2.65, this.zoom * Math.exp(-e.deltaY * 0.0014)));
      },
      { passive: false },
    );
    for (const [night, label] of [
      [false, g.day],
      [true, g.night],
    ] as const) {
      this.lightSwitch.append(
        el('button', {
          text: label,
          data: { night: String(night) },
          onClick: () => {
            this.night = night;
            audio.setAmbience(night ? 'night' : 'day');
            this.status();
          },
        }),
      );
    }
    this.lightSwitch.setAttribute('role', 'group');
    this.lightSwitch.setAttribute('aria-label', g.light);
    this.stagesRow.setAttribute('role', 'group');
    this.stagesRow.setAttribute('aria-label', g.sequence);
    this.pauseButton.className = 'guide-pause';
    this.pauseButton.onclick = () => this.togglePause();
    const turning = el('div', { class: 'guide-turn' }, [
      iconButton('−', g.zoomOut, () => { this.zoom = Math.max(0.75, this.zoom / 1.35); }),
      iconButton('+', g.zoomIn, () => { this.zoom = Math.min(2.65, this.zoom * 1.35); }),
      iconButton('↶', g.turnLeft, () => {
        this.yaw -= Math.PI / 4;
      }),
      iconButton('↷', g.turnRight, () => {
        this.yaw += Math.PI / 4;
      }),
    ]);
    const stage = el('main', { class: 'guide-stage' }, [
      el('header', { class: 'guide-header' }, [el('div', {}, [this.category, this.heading]), this.lightSwitch]),
      this.view,
      el('div', { class: 'guide-view-tools' }, [this.notice, turning]),
      el('footer', { class: 'guide-controls' }, [
        this.description,
        el('div', { class: 'guide-transport' }, [this.pauseButton, this.stagesRow]),
        el('div', { class: 'guide-progress' }, [this.progress]),
      ]),
    ]);
    this.root.append(rail, stage);
    this.app.ui.append(this.root);
    this.subject();
    this.notice.textContent = S().title.loading;
    void this.openPreview();
  }

  private async openPreview(): Promise<void> {
    try {
      const [{ GuidePreview }, environment] = await Promise.all([
        import('../render/guide-preview'), import('../render/farm-materials').then(({ loadOutdoorLight }) => loadOutdoorLight()),
        loadYardScenery('defences'), loadSurfaceImages('guide'),
      ]);
      if (!this.alive) return;
      this.preview = new GuidePreview(environment);
      this.preview.select(this.entry);
      this.preview.canvas.setAttribute('aria-label', entryName(this.entry));
      this.preview.canvas.addEventListener('webglcontextlost', this.onContextLost);
      this.view.append(this.preview.canvas);
      this.illustration.hidden = true;
      this.notice.textContent = S().guide.inspect;
    } catch (error) {
      if (!this.alive) return;
      console.warn('[field guide] using campaign illustrations', error);
      this.useIllustrations();
    } finally {
      this.loading = false;
    }
  }

  private onContextLost = (): void => {
    if (this.alive) this.useIllustrations();
  };
  private useIllustrations(): void {
    this.releaseViewer();
    this.illustration.hidden = false;
    this.notice.textContent = S().guide.illustrated;
  }
  private releaseViewer(): void {
    if (!this.preview) return;
    this.preview.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.preview.canvas.remove();
    this.preview.dispose();
    this.preview = undefined;
  }
  exit(): void {
    this.alive = false;
    this.releaseViewer();
  }
  private leave(): void {
    const url = new URL(location.href);
    if (url.searchParams.has('showcase')) {
      url.searchParams.delete('showcase');
      history.replaceState(history.state, '', url);
    }
    this.app.go(this.back);
  }

  private select(entry: GuideEntry, tour = false): void {
    this.entry = entry;
    this.stages = stagesFor(entry);
    this.step = this.stages[tour || entry.kind === 'mob' ? 0 : 1]!;
    this.age = 0;
    this.tour = tour;
    this.paused = false;
    this.zoom = 1;
    this.preview?.select(entry);
    this.subject();
  }
  private subject(): void {
    const entry = this.entry;
    this.root.dataset.asset = entry.id;
    const { category, description } = entryText(entry);
    this.category.textContent = category;
    this.heading.textContent = entryName(entry);
    this.description.textContent = description;
    if (this.preview) this.preview.canvas.setAttribute('aria-label', entryName(entry));
    if (this.listKind !== entry.kind) {
      this.listKind = entry.kind;
      this.list.replaceChildren(
        ...CATALOG.filter((e) => e.kind === entry.kind).map((e) => {
          const img = el('img');
          img.alt = '';
          const art = assetUrl(entryArt(e));
          if (art) img.src = art;
          return el('button', { class: 'guide-item', data: { asset: e.id }, onClick: () => this.select(e) }, [
            img,
            el('span', { text: entryName(e) }),
          ]);
        }),
      );
    }
    for (const button of this.tabs.querySelectorAll('button')) press(button, button.dataset.kind === entry.kind);
    for (const button of this.list.querySelectorAll('button')) {
      const selected = button.dataset.asset === entry.id;
      press(button, selected);
      if (selected) button.scrollIntoView({ block: 'nearest' });
    }
    this.stagesRow.replaceChildren(
      ...this.stages.map((stage) =>
        el('button', {
          text: stageName(entry, stage),
          data: { stage },
          onClick: () => {
            this.tour = false;
            this.paused = false;
            this.changeStage(stage);
          },
        }),
      ),
    );
    this.status();
  }

  private changeStage(stage: GuideStage): void {
    this.step = stage;
    this.age = 0;
    this.status();
  }
  private togglePause(): void {
    this.paused = !this.paused;
    this.status();
  }
  private toggleTour(): void {
    if (this.tour) {
      this.tour = false;
      this.status();
    } else this.select(CATALOG[0]!, true);
  }
  private status(): void {
    const g = S().guide;
    this.root.dataset.stage = this.step;
    this.root.dataset.light = this.night ? 'night' : 'day';
    press(this.tourButton, this.tour);
    this.tourButton.textContent = (this.tour ? '■  ' : '▶  ') + (this.tour ? g.stop : g.playAll);
    this.pauseButton.textContent = this.paused ? '▶' : 'Ⅱ';
    const play = this.paused ? g.play : g.pause;
    this.pauseButton.title = play;
    this.pauseButton.setAttribute('aria-label', play);
    for (const b of this.lightSwitch.querySelectorAll('button')) press(b, b.dataset.night === String(this.night));
    for (const b of this.stagesRow.querySelectorAll('button')) press(b, b.dataset.stage === this.step);
  }

  update(dt: number): void {
    if (this.paused || this.loading) return;
    const duration = clipLength(this.entry, this.step);
    this.age += dt;
    if (this.age < duration) return;
    if (this.tour) {
      const next = this.stages[this.stages.indexOf(this.step) + 1];
      if (next) this.changeStage(next);
      else {
        const entry = CATALOG[CATALOG.indexOf(this.entry) + 1];
        if (entry) this.select(entry, true);
        else {
          this.tour = false;
          this.paused = true;
          this.age = duration;
          this.status();
        }
      }
    } else if (this.step === 'fallen' || this.step === 'broken') this.age = duration;
    else this.age %= duration;
  }

  render(): void {
    const length = clipLength(this.entry, this.step);
    this.progress.style.transform = 'scaleX(' + Math.min(1, this.age / length) + ')';
    if (this.preview) this.preview.draw(this.step, this.age, length, this.yaw, this.zoom, this.night, WIDTH, HEIGHT, this.app.pixelRatio);
    else this.drawIllustration();
  }

  private drawIllustration(): void {
    const { entry, step, age } = this;
    let key = entryArt(entry),
      tilt = 0,
      lift = 0,
      shift = 0;
    const back = Math.cos(this.yaw) < 0;
    if (entry.kind === 'defence') {
      const state =
        step === 'broken'
          ? 'broken'
          : step === 'impact' || step === 'active'
            ? 'triggered'
            : step === 'rearming'
              ? 'resting'
              : entry.id === 'fence'
                ? 'resting'
                : 'armed';
      key = 'dev_' + entry.id + '_' + state;
      if (step === 'impact') tilt = 3 * Math.exp(-7 * (age % 0.86)) * Math.sin(age * 23);
    } else {
      const side = back ? 'back' : 'front';
      const base = (ENEMIES[entry.id].boss ? 'boss_' : 'en_') + entry.id + '_' + side;
      const move = step === 'walk' || step === 'bound' || step === 'charge',
        f = Math.floor(age * (step === 'charge' ? 9 : 6));
      const pose = move ? ['a', 'p', 'b', 'p'][f % 4] : step === 'hit' || step === 'fallen' ? 'p' : ['a', 'x'][f % 2];
      key = assetUrl(base + '_' + pose) ? base + '_' + pose : base;
      lift = move ? -Math.abs(Math.sin(age * 7)) * (step === 'bound' ? 38 : 5) : 0;
      if (step === 'hit') tilt = -8 * Math.max(0, 1 - (age % 0.57) / 0.18);
      if (step === 'fallen') {
        const drop = Math.min(1, age / 0.72);
        tilt = 82 * drop;
        shift = -120 * drop;
      }
    }
    const url = assetUrl(key) ?? assetUrl(entryArt(entry));
    if (url && url !== this.illustration.getAttribute('src')) this.illustration.src = url;
    this.illustration.style.transform =
      'translateX(-50%) translate(' +
      shift +
      'px,' +
      lift +
      'px) scale(' +
      this.zoom * (Math.sin(this.yaw) > 0 ? -1 : 1) +
      ',' +
      this.zoom +
      ') rotate(' +
      tilt +
      'deg)';
  }

  onKeyDown(code: string, event: KeyboardEvent): void {
    if (code === 'Escape') this.leave();
    if (code === 'ArrowLeft' || code === 'ArrowRight') {
      event.preventDefault();
      this.yaw += ((code === 'ArrowLeft' ? -1 : 1) * Math.PI) / 4;
    }
    if (code === 'Space' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      this.togglePause();
    }
  }
}
