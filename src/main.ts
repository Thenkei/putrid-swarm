import { App, STAGE_H, STAGE_W, type Scene } from './engine/app';
import { loadAssets } from './engine/assets';
import { audio } from './engine/audio';
import { el } from './engine/dom';
import { S, initLang } from './engine/i18n';
import { resolveKeyLabels } from './scenes/common';
import { TitleScene } from './scenes/title';

/** Shown while the art loads; replaced by the title as soon as everything is in. */
class LoadingScene implements Scene {
  private readonly bar = el('i');

  constructor(private readonly app: App) {}

  enter(): void {
    this.app.ui.append(el('div', { class: 'loading' }, [S().title.loading, el('div', { class: 'meter' }, [this.bar])]));
  }

  progress(done: number, total: number): void {
    this.bar.style.width = `${total > 0 ? (done / total) * 100 : 100}%`;
  }

  update(): void {}

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#0d0b09';
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  }
}

async function boot(): Promise<void> {
  initLang();
  const app = new App();
  const loading = new LoadingScene(app);
  app.start(loading);

  // Sound loads alongside the art but never holds the game back: a failure only means synthesised effects.
  const [report] = await Promise.all([loadAssets((done, total) => loading.progress(done, total)), resolveKeyLabels(), audio.preload()]);
  if (report.failed.length > 0) console.warn(`[assets] ${report.failed.length} asset(s) missing, using placeholders:`, report.failed);

  app.go(() => new TitleScene(app));

  // Handy in development: `__app.state` in the console.
  if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = app;
}

boot().catch((error: unknown) => {
  console.error('[boot] failed to start', error);
  document.body.append(el('pre', { style: { color: '#f88', padding: '24px', position: 'fixed', inset: '0', zIndex: '99' }, text: `Putrid Swarm failed to start.\n${String(error)}` }));
});
