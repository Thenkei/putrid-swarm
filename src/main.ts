import { App, STAGE_H, STAGE_W, type Scene } from './engine/app';
import { loadAssets } from './engine/assets';
import { audio } from './engine/audio';
import { readPointers, touchOnly } from './engine/device';
import { el } from './engine/dom';
import { S, initLang } from './engine/i18n';
import { resolveKeyLabels } from './engine/keys';
import { WarningScene, keyboardGate, warningSeen } from './scenes/notice';
import { TitleScene } from './scenes/title';

/** Used at boot and when a player leaves the desk before the campaign art is ready. */
class LoadingScene implements Scene {
  private readonly bar = el('i');

  constructor(private readonly app: App, private readonly advance: () => void) {}

  enter(): void {
    this.app.ui.append(el('div', { class: 'loading' }, [S().title.loading, el('div', { class: 'meter' }, [this.bar])]));
  }

  progress(done: number, total: number): void {
    this.bar.style.width = `${total > 0 ? (done / total) * 100 : 100}%`;
  }

  update(): void { this.advance(); }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#0d0b09';
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  }
}

async function boot(): Promise<void> {
  initLang();
  // Said before anything heavy is fetched: on a phone there is no point in loading the game to find out.
  if (touchOnly(readPointers())) await keyboardGate();
  const app = new App();
  let campaignReady = false;
  let queued: (() => void) | null = null;
  const loading = new LoadingScene(app, () => {
    if (campaignReady && queued) {
      const launch = queued;
      queued = null;
      launch();
    }
  });
  const whenReady = (launch: () => void): void => {
    if (campaignReady) launch();
    else {
      queued = launch;
      app.go(() => loading);
    }
  };
  const title = (): Scene => new TitleScene(app, whenReady);
  const openDesk = (): void => app.go(warningSeen() ? title : () => new WarningScene(app, title));
  app.start(loading);

  // Sound loads alongside the art but never holds the game back: a failure only means synthesised effects.
  void audio.preload().catch(error => console.warn('[audio] preload failed; using available audio', error));
  const [report] = await Promise.all([loadAssets((done, total) => loading.progress(done, total), openDesk), resolveKeyLabels()]);
  campaignReady = true;
  if (report.failed.length > 0) console.warn(`[assets] ${report.failed.length} asset(s) missing, using placeholders:`, report.failed);

  // Handy in development: `__app.state` in the console.
  if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = app;
}

boot().catch((error: unknown) => {
  console.error('[boot] failed to start', error);
  document.body.append(el('pre', { style: { color: '#f88', padding: '24px', position: 'fixed', inset: '0', zIndex: '99' }, text: `Putrid Swarm failed to start.\n${String(error)}` }));
});
