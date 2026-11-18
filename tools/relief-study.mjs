// GPU readback used by gate-study through the game's Vite server. Ambient light isolates UV
// displacement from bump lighting. A recessed stripe moves relative to a raised stripe.
import { AmbientLight, DataTexture, Mesh, OrthographicCamera, PlaneGeometry, Scene, WebGLRenderTarget } from 'three';
import { yardModels } from '../src/scenes/yard-renderer';

export function measureParallax() {
  const yard = yardModels();
  const ground = yard.scene.children.find((o) => o.material?.reliefDepth || (o.material?.bumpMap && !o.material.userData.atlas));
  const mat = ground.material.clone();
  mat.transparent = false;
  const stripe = new Uint8Array(128 * 2 * 4);
  const heights = new Uint8Array(stripe.length);
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 128; x++) {
      const i = (y * 128 + x) * 4;
      if (Math.abs(x - 63.5) < 6) stripe[i + y] = 255;
      stripe[i + 3] = 255;
      heights.fill(y ? 255 : 32, i, i + 4);
    }
  mat.map = new DataTexture(stripe, 128, 2);
  const shape = new DataTexture(heights,128,2);
  const normal = new DataTexture(new Uint8Array([128,128,255,255]),1,1);
  if(mat.reliefDepth) {
    mat.roughnessMap = shape;
    mat.normalMap = normal;
  } else mat.bumpMap = shape;
  mat.map.needsUpdate = shape.needsUpdate = normal.needsUpdate = true;
  const scene = new Scene();
  const geometry = new PlaneGeometry(2, 1);
  scene.add(new Mesh(geometry, mat), new AmbientLight(0xffffff, Math.PI));
  const camera = new OrthographicCamera(-1.25, 1.25, 0.75, -0.75, 0.1, 8);
  const gl = yard.gl;
  const previous = gl.getRenderTarget();
  const target = new WebGLRenderTarget(200, 120);
  const pixels = new Uint8Array(200 * 120 * 4);
  function centroid(y, channel) {
    let sum = 0,
      weight = 0;
    for (let x = 30; x < 170; x++) {
      const value = pixels[4 * (y * 200 + x) + channel];
      sum += x * value;
      weight += value;
    }
    if (!weight) throw Error('Parallax test stripe missing');
    return sum / weight;
  }
  try {
    gl.setRenderTarget(target);
    return [-0.72, 0, 0.72].map((angle) => {
      camera.position.set(3 * Math.sin(angle), 0, 3 * Math.cos(angle));
      camera.lookAt(0, 0, 0);
      const disparity = (depth) => {
        if(mat.reliefDepth) mat.reliefDepth.value = depth;
        else mat.bumpScale = depth;
        gl.render(scene, camera);
        gl.readRenderTargetPixels(target, 0, 0, 200, 120, pixels);
        return centroid(37, 0) - centroid(83, 1);
      };
      return +(disparity(0.17) - disparity(0)).toFixed(2);
    });
  } finally {
    gl.setRenderTarget(previous);
    mat.map.dispose();
    shape.dispose();
    normal.dispose();
    mat.dispose();
    geometry.dispose();
    target.dispose();
  }
}
