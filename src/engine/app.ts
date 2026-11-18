// Application shell: one canvas, one HUD layer, one active scene, one fixed-step loop.

import { deserialize, serialize } from '../core/save';
import type { GameState } from '../core/types';
import { audio } from './audio';
import { el } from './dom';
import { hearKey } from './keys';

export const STAGE_W = 1280;
export const STAGE_H = 720;
const SAVE_KEY = 'putrid-swarm.save.v1';
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
  onKeyDown?(code: string, event: KeyboardEvent): void;
  onKeyUp?(code: string, event: KeyboardEvent): void;
  /** The window lost focus: whatever was held is no longer known to be. */
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
  private scale = 1;
  private dpr = 1;
  private last = 0;
  private fade = 0;
  private fadeTarget = 0;
  private pendingScene: (() => Scene) | null = null;

  constructor() {
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.ui = document.getElementById('ui') as HTMLElement;
    this.stage = document.getElementById('stage') as HTMLElement;
    this.toastHost = document.getElementById('toast') as HTMLElement;

    window.addEventListener('resize', () => this.resize());
    this.resize();

    const toStage = (event: PointerEvent | WheelEvent): void => {
      const rect = this.stage.getBoundingClientRect();
      this.pointer.x = (event.clientX - rect.left) / this.scale;
      this.pointer.y = (event.clientY - rect.top) / this.scale;
      this.pointer.overCanvas = event.target === this.canvas;
    };
    this.canvas.addEventListener('pointerdown', (event) => {
      audio.unlock();
      toStage(event);
      this.pointer.down = true;
      this.scene?.onPointerDown?.(this.pointer, event);
    });
    window.addEventListener('pointermove', (event) => {
      toStage(event);
      this.scene?.onPointerMove?.(this.pointer);
    });
    window.addEventListener('pointerup', (event) => {
      toStage(event);
      this.pointer.down = false;
      this.scene?.onPointerUp?.(this.pointer);
    });
    this.canvas.addEventListener('wheel', (event) => {
      toStage(event);
      this.scene?.onWheel?.(event.deltaY, this.pointer);
      event.preventDefault();
    }, { passive: false });
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('keydown', (event) => {
      audio.unlock();
      if (event.repeat) return;
      // What the key types is what is printed on it: the prompts follow the keyboard actually in use.
      if (hearKey(event.code, event.key)) this.scene?.onKeyLabels?.();
      this.scene?.onKeyDown?.(event.code, event);
    });
    window.addEventListener('keyup', (event) => this.scene?.onKeyUp?.(event.code, event));
    window.addEventListener('blur', () => this.scene?.onBlur?.());
    this.ui.addEventListener('pointerdown', () => audio.unlock(), true);
  }

  private resize(): void {
    this.scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    this.stage.style.transform = `translate(-50%, -50%) scale(${this.scale})`;
    this.dpr = Math.min(2, Math.max(1, (window.devicePixelRatio || 1) * Math.min(1.5, this.scale)));
    this.canvas.width = Math.round(STAGE_W * this.dpr);
    this.canvas.height = Math.round(STAGE_H * this.dpr);
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

  /** Switches scene behind a short fade to black. */
  go(factory: () => Scene): void {
    if (this.pendingScene) return;
    this.pendingScene = factory;
    this.fadeTarget = 1;
  }

  private swap(scene: Scene): void {
    this.scene?.exit?.();
    this.ui.replaceChildren();
    this.toastHost.replaceChildren();
    this.scene = scene;
    scene.enter?.();
  }

  private tick(dt: number): void {
    this.time += dt;
    if (this.fade !== this.fadeTarget) {
      const step = dt / 0.22;
      this.fade = this.fadeTarget > this.fade ? Math.min(this.fadeTarget, this.fade + step) : Math.max(this.fadeTarget, this.fade - step);
      if (this.fade >= 1 && this.pendingScene) {
        const factory = this.pendingScene;
        this.pendingScene = null;
        this.swap(factory());
        this.fadeTarget = 0;
      }
    }
    try {
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
    try {
      localStorage.setItem(SAVE_KEY, serialize(this.state));
    } catch (error) {
      console.warn('[save] could not write the save', error);
    }
  }

  loadSave(): GameState | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const state = deserialize(raw);
      if (!state) console.warn('[save] ignoring an unreadable save');
      return state;
    } catch (error) {
      console.warn('[save] could not read the save', error);
      return null;
    }
  }

  clearSave(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // Non-fatal.
    }
  }
}
