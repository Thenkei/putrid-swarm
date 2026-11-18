// Use the production meshes and gait on a neutral background to inspect joints and both
// sides of the paint without foreground traps, the surveillance overlay or aim markers.
import { Color, DirectionalLight, HemisphereLight, Mesh, MeshLambertMaterial, OrthographicCamera, PlaneGeometry, Scene, WebGLRenderTarget } from 'three';
import { Matrix4 } from 'three';
import { isBuildable, GRID_W } from '../src/core/map';
import { InfectedFigure } from '../src/render/infected-models';
import { ENEMIES } from '../src/core/data/enemies';
import { yardModels } from '../src/scenes/yard-renderer';
import { sprite, yardSprite } from '../src/engine/assets';
import clothUrl from '../src/render/textures/infected-cloth.webp?url';

export function definitionStudy() {
  const yard = yardModels();
  const gl = yard?.gl.getContext();
  return {
    stageDensity: window.__app.pixelRatio, viewWidth: window.__app.scene.view.w,
    renderWidth: gl?.getParameter(gl.VIEWPORT)[2] ?? 0, glError: gl?.getError(), sunX: yard?.sun.position.x,
    wagonTexture: [sprite('obj_car_front').w, yardSprite('obj_car_front').w],
  };
}

// Both maps can arrive after the first wave has already drawn the neutral material.
export function infectedSurfaceReady() {
  const actor = new InfectedFigure('shambler');
  let ready = false;
  actor.root.traverse(part => {
    const surface = part.material;
    const colour = surface?.map?.image;
    if (colour?.naturalWidth && new URL(colour.currentSrc).pathname === new URL(clothUrl, location.href).pathname && surface.normalMap?.image?.naturalWidth) ready = true;
  });
  return ready;
}

export function infectedBudget() {
  return Object.fromEntries(Object.keys(ENEMIES).map(type => {
    const actor = new InfectedFigure(type);
    let triangles = 0, draws = 0;
    actor.root.traverse(part => {
      if (!part.isMesh) return;
      draws++;
      triangles += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3;
    });
    return [type, { triangles, draws }];
  }));
}

export function infectedStudy({ types = ['shambler', 'runner', 'brute', 'dog'], rotate = false, frames = 16, w = 820, h = 340, margin = 0 } = {}) {
  const gl = yardModels().gl;
  const scene = new Scene();
  scene.background = new Color('#30372f');
  scene.add(new HemisphereLight(0xece9d3, 0x9b8872, 1.85));
  const sun = new DirectionalLight(0xffe6c5, 2.25);
  sun.position.set(-3, 6, 4);
  scene.add(sun);
  const halfWidth = 0.89 * types.length + margin;
  const camera = new OrthographicCamera(-halfWidth, halfWidth, (halfWidth * h) / w, (-halfWidth * h) / w, 0.1, 30);
  camera.position.set(0, 3.37, 9);
  camera.lookAt(0, 1.05, 0);
  const floor = new Mesh(new PlaneGeometry(24, 24), new MeshLambertMaterial({ color: 0x424b3e }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const figures = types.map((type, i) => {
    const actor = new InfectedFigure(type),
      enemy = {
        type,
        def: ENEMIES[type],
        id: i + 1,
        x: (i - (types.length - 1) / 2) * 1.72,
        y: 0,
        fx: type === 'dog' ? -0.84 : i === 1 ? -0.5 : 0.48,
        fy: type === 'dog' ? 0.53 : 0.87,
        action: 'walk',
        hitFlash: 0,
        hasteFor: 0,
        nettedFor: 0,
        stunnedFor: 0,
      };
    scene.add(actor.root);
    return { actor, enemy };
  });
  const target = new WebGLRenderTarget(w, h, { samples: 4 });
  target.texture.colorSpace = gl.outputColorSpace;
  const previous = gl.getRenderTarget(),
    pixels = new Uint8Array(w * h * 4);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d'),
    image = ctx.createImageData(w, h);
  const images = [];
  try {
    gl.setRenderTarget(target);
    for (let i = 0; i < frames; i++) {
      for (const { actor, enemy } of figures) {
        if (rotate) {
          const yaw = 0.34 + i * 2 * Math.PI / frames;
          enemy.fx = Math.sin(yaw); enemy.fy = Math.cos(yaw);
        }
        actor.pose(enemy, 0.35 + i / 12);
      }
      gl.render(scene, camera);
      gl.setRenderTarget(previous);
      gl.readRenderTargetPixels(target, 0, 0, w, h, pixels);
      gl.setRenderTarget(target);
      for (let y = 0; y < h; y++) image.data.set(pixels.subarray((h - 1 - y) * 4 * w, (h - y) * 4 * w), y * 4 * w);
      ctx.putImageData(image, 0, 0);
      images.push(canvas.toDataURL('image/png').split(',')[1]);
    }
    return images;
  } finally {
    gl.setRenderTarget(previous);
    target.dispose();
    floor.geometry.dispose();
    floor.material.dispose();
  }
}

// Read the actual instance buffer for a plant in a buildable cell. Clearing the mask
// must put the very same plant back, including its tilt, rotation and scale.
export function verifyCover(frame) {
  const cover = yardModels().cover,
    matrix = new Matrix4();
  let sample;
  for (const layer of cover.groups) {
    for (let i = 0; i < layer.mesh.count; i++) {
      layer.mesh.getMatrixAt(i, matrix);
      const x = Math.floor(matrix.elements[12]),
        y = Math.floor(matrix.elements[14]);
      if (matrix.determinant() !== 0 && isBuildable(x, y)) {
        sample = { mesh: layer.mesh, i, x, y };
        break;
      }
    }
    if (sample) break;
  }
  if (!sample) throw Error('No meadow clump on a buildable cell');
  const { mesh, i, x, y } = sample,
    original = matrix.clone(),
    empty = { devices: [], decals: [], ghost: null };
  try {
    for (const occupied of [{ ghost: { x, y } }, { devices: [{ x, y }] }, { decals: [{ x, y, kind: 'mown' }] }]) {
      cover.sync({ ...empty, ...occupied });
      mesh.getMatrixAt(i, matrix);
      if (matrix.determinant() !== 0) throw Error('Ground cover still visible on cell ' + (x + GRID_W * y));
      cover.sync(empty);
      mesh.getMatrixAt(i, matrix);
      if (!matrix.equals(original)) throw Error('Ground cover failed to recover after clearing the cell');
    }
  } finally {
    cover.sync(frame);
  }
}
