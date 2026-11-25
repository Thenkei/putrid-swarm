// Application shell: one canvas, one HUD layer, one active scene, one fixed-step loop.

import { CampaignStorage } from './campaign-storage';
import { S } from './i18n';
import type { GameState } from '../core/types';
import { audio, type Sfx } from './audio';
import { el } from './dom';
import { hearKey } from './keys';

export const STAGE_W = 1280;
export const STAGE_H = 720;
const MAX_FRAME = 0.1;

export interface Pointer {
  x: number;
  y: number;
  down: boolean;
  overCanvas: boolean;
}

export interface Scene {
  enter?(): void;
  exit?(): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  onPointerDown?(pointer: Pointer, event: PointerEvent): void;
  onPointerMove?(pointer: Pointer): void;
  onPointerUp?(pointer: Pointer): void;
  /** End an interrupted gesture without committing its release action. */
  onPointerCancel?(): void;
  onKeyDown?(code: string, event: KeyboardEvent): void;
  onKeyUp?(code: string, event: KeyboardEvent): void;
  /** The window lost focus or the document was hidden. */
  onBlur?(): void;
  /** The keyboard turned out not to be the one guessed: key labels on screen are out of date. */
  onKeyLabels?(): void;
  onWheel?(deltaY: number, pointer: Pointer): void;
}

export class App {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly ui: HTMLElement;
  readonly pointer: Pointer = { x: 0, y: 0, down: false, overCanvas: false };
  /** The campaign. Null until a run is started or loaded. */
  state: GameState | null = null;
  time = 0;

  private scene: Scene | null = null;
  private readonly stage: HTMLElement;
  private readonly toastHost: HTMLElement;
  private readonly saves = new CampaignStorage();
  private readonly saveStatus = el('div', { class: 'save-status' });
  private scale = 1;
  private dpr = 1;
  private last = 0;
  private fade = 0;
  private fadeTarget = 0;
  private pendingScene: (() => Scene) | null = null;
  private canvasPointer: number | null = null;
  private clientPointer: { x: number; y: number } | null = null;

  constructor() {
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.ui = document.getElementById('ui') as HTMLElement;
    this.stage = document.getElementById('stage') as HTMLElement;
    this.toastHost = document.getElementById('toast') as HTMLElement;
    this.saveStatus.setAttribute('role', 'status');
    this.stage.append(this.saveStatus);

    window.addEventListener('resize', () => this.resize());
    this.resize();

    const toStage = (event: PointerEvent | WheelEvent): void => {
      // A mouse cursor stays on screen when the viewport changes. A touch ends with its gesture.
      this.clientPointer = event instanceof PointerEvent && event.pointerType === 'touch'
        ? null : { x: event.clientX, y: event.clientY };
      this.locatePointer(event.clientX, event.clientY, event.target);
    };
    this.canvas.addEventListener('pointerdown', (event) => {
      if (this.pendingScene || !event.isPrimary || this.canvasPointer !== null) return;
      audio.unlock();
      toStage(event);
      this.canvasPointer = event.pointerId;
      this.pointer.down = true;
      this.scene?.onPointerDown?.(this.pointer, event);
    });
    window.addEventListener('pointermove', (event) => {
      if (!event.isPrimary || (this.canvasPointer !== null && this.canvasPointer !== event.pointerId)) return;
      // A mouse can be released outside this window and return without a pointerup.
      if (this.canvasPointer !== null && event.buttons === 0) this.cancelPointer();
      toStage(event);
      if (!this.pendingScene) this.scene?.onPointerMove?.(this.pointer);
    });
    window.addEventListener('pointerup', (event) => {
      if (event.pointerId !== this.canvasPointer) return;
      toStage(event);
      this.canvasPointer = null;
      this.pointer.down = false;
      if (!this.pendingScene) this.scene?.onPointerUp?.(this.pointer);
    });
    const cancel = (event: PointerEvent) => {
      if (event.pointerId === this.canvasPointer) this.cancelPointer();
    };
    window.addEventListener('pointercancel', cancel);
    this.canvas.addEventListener('lostpointercapture', cancel);
    this.canvas.addEventListener('wheel', (event) => {
      toStage(event);
      if (!this.pendingScene) this.scene?.onWheel?.(event.deltaY, this.pointer);
      event.preventDefault();
    }, { passive: false });
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('keydown', (event) => {
      if (this.pendingScene) return;
      audio.unlock();
      if (event.repeat) return;
      // What the key types is what is printed on it: the prompts follow the keyboard actually in use.
      if (hearKey(event.code, event.key)) this.scene?.onKeyLabels?.();
      this.scene?.onKeyDown?.(event.code, event);
    });
    window.addEventListener('keyup', (event) => this.scene?.onKeyUp?.(event.code, event));
    const blur = () => {
      this.clientPointer = null;
      this.cancelPointer();
      this.scene?.onBlur?.();
    };
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) blur();
    });
    this.ui.addEventListener('pointerdown', () => audio.unlock(), true);
  }

  private cancelPointer(): void {
    if (this.canvasPointer === null) return;
    this.canvasPointer = null;
    this.pointer.down = false;
    this.pointer.overCanvas = false;
    this.scene?.onPointerCancel?.();
  }

  private locatePointer(clientX: number, clientY: number, target: EventTarget | null): void {
    const rect = this.stage.getBoundingClientRect();
    this.pointer.x = (clientX - rect.left) / this.scale;
    this.pointer.y = (clientY - rect.top) / this.scale;
    this.pointer.overCanvas = target === this.canvas;
  }

  private resize(): void {
    // Stage coordinates change under a held button. Reframe without committing the old gesture.
    this.cancelPointer();
    this.scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    this.stage.style.setProperty('--stage-scale', String(this.scale));
    this.stage.style.transform = `translate(-50%, -50%) scale(${this.scale})`;
    this.dpr = Math.min(2, Math.max(1, (window.devicePixelRatio || 1) * Math.min(1.5, this.scale)));
    this.canvas.width = Math.round(STAGE_W * this.dpr);
    this.canvas.height = Math.round(STAGE_H * this.dpr);
    if (this.clientPointer) {
      const { x, y } = this.clientPointer;
      this.locatePointer(x, y, document.elementFromPoint(x, y));
      if (!this.pendingScene) this.scene?.onPointerMove?.(this.pointer);
    }
  }

  /** Device pixels per stage unit; offscreen layers use it to stay sharp. */
  get pixelRatio(): number {
    return this.dpr;
  }

  start(scene: Scene): void {
    this.swap(scene);
    this.last = performance.now();
    const frame = (now: number): void => {
      const dt = Math.min(MAX_FRAME, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /** Play a delayed cue only while the scene that requested it is still active. */
  playSceneCue(effect: Sfx, delayMs: number): void {
    const owner = this.scene;
    window.setTimeout(() => {
      if (owner === this.scene && !this.pendingScene) audio.play(effect);
    }, delayMs);
  }

  /** Switches scene behind a short fade to black. */
  go(factory: () => Scene): void {
    if (this.pendingScene) return;
    this.pendingScene = factory;
    this.ui.inert = true;
    this.fadeTarget = 1;
  }

  private swap(scene: Scene): void {
    this.cancelPointer();
    this.scene?.exit?.();
    this.ui.replaceChildren();
    this.ui.inert = false;
    this.pointer.down = false;
    this.toastHost.replaceChildren();
    this.scene = scene;
    scene.enter?.();
  }

  private tick(dt: number): void {
    this.time += dt;
    try {
      if (this.fade !== this.fadeTarget) {
        const step = dt / 0.22;
        this.fade = this.fadeTarget > this.fade ? Math.min(this.fadeTarget, this.fade + step) : Math.max(this.fadeTarget, this.fade - step);
      }
      // A scene may request its successor during enter(), while the screen is already black.
      if (this.fade === 1 && this.pendingScene) {
        const factory = this.pendingScene;
        this.pendingScene = null;
        this.fadeTarget = 0;
        this.swap(factory());
      }
      this.scene?.update(dt);
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, STAGE_W, STAGE_H);
      this.scene?.render(ctx);
      if (this.fade > 0) {
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.globalAlpha = this.fade;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, STAGE_W, STAGE_H);
        ctx.globalAlpha = 1;
      }
      this.ui.style.opacity = String(1 - this.fade);
    } catch (error) {
      // A scene bug must be loud in the console but must not freeze the loop silently.
      console.error('[app] frame failed', error);
    }
  }

  // ───────────────────────────── Feedback ─────────────────────────────

  toast(message: string, kind: 'info' | 'error' | 'good' = 'info'): void {
    if (!message) return;
    const node = el('div', { class: `toast toast-${kind}`, text: message });
    this.toastHost.replaceChildren(node);
    window.setTimeout(() => node.classList.add('toast-out'), 2200);
    window.setTimeout(() => node.remove(), 2700);
  }

  // ───────────────────────────── Persistence ─────────────────────────────

  save(): void {
    if (!this.state) return;
    this.saves.save(this.state);
    this.updateSaveStatus();
  }

  loadSave(): GameState | null {
    const state = this.saves.load();
    this.updateSaveStatus();
    return state;
  }

  clearSave(): void {
    this.saves.clear();
    this.updateSaveStatus();
  }

  private updateSaveStatus(): void {
    const scope = this.saves.scope;
    const message = scope === 'device' ? '' : S().saveStatus[scope];
    if (this.saveStatus.textContent !== message) this.saveStatus.textContent = message;
  }
}
