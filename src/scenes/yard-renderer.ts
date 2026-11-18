// Load the mesh yard on first entry. A player's explicit choice lasts across scene changes.
import { el } from '../engine/dom';
import { loadYardScenery } from '../engine/assets';
import { loadSurfaceImages } from '../engine/material-images';
import { S } from '../engine/i18n';
import { loadPlantImages } from '../render/plant-images';
import type { Yard3D } from '../render/yard-3d';

let renderer: Yard3D | undefined;
let enabled = false;
let attempted = false;
let loading: Promise<Yard3D> | undefined;
export const yardModels = (): Yard3D | undefined => enabled && renderer?.available ? renderer : undefined;

export async function enableYardModels(): Promise<void> {
  attempted = true;
  loading ??= Promise.all([
    import('../render/yard-3d'), loadYardScenery(), loadSurfaceImages('yard'),
    loadPlantImages(),
    import('../render/farm-materials').then(({ loadOutdoorLight }) => loadOutdoorLight()),
  ]).then(([{ Yard3D }, , , , environment]) => new Yard3D(environment));
  try {
    renderer = await loading;
    if (!renderer.available) throw new Error('WebGL context lost');
    enabled = true;
  } catch (error) {
    loading = undefined;
    enabled = false;
    console.warn('[yard] 3D preview unavailable', error);
    throw error;
  }
}

export function yardRendererButton(changed: () => void, failed: () => void): HTMLButtonElement {
  const button = el('button', { class: 'btn icon-btn', text: '3D', title: S().day.compare3d });
  const sync = (): void => { button.setAttribute('aria-pressed', String(!!yardModels())); };
  button.setAttribute('aria-label', S().day.compare3d);
  sync();
  if (!attempted || (loading && !renderer)) {
    button.disabled = true;
    void enableYardModels().then(() => {
      if (button.isConnected) changed();
    }, () => {
      if (button.isConnected) failed();
    }).finally(() => { sync(); button.disabled = false; });
  }
  button.onclick = async () => {
    button.disabled = true;
    try {
      if (yardModels()) enabled = false;
      else await enableYardModels();
      changed();
    } catch {
      failed();
    } finally {
      sync();
      button.disabled = false;
    }
  };
  return button;
}
