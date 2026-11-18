import { DataTexture, DoubleSide, ImageLoader, MeshStandardMaterial, MirroredRepeatWrapping, SRGBColorSpace, Texture } from 'three';
import dogCoat from './textures/infected-coat-dog.webp?url';
import boarCoat from './textures/infected-coat-boar.webp?url';
import stagCoat from './textures/infected-coat-deer.webp?url';
import muzzleURL from './textures/infected-muzzles.webp?url';
import furURL from './textures/infected-fur.webp?url';
import furNormalURL from './textures/infected-fur-normal.webp?url';

const maps = new Map<string, Texture>();
const seedImages = new Map<string, HTMLCanvasElement>();
function seedImage(paint: string): HTMLCanvasElement {
  let canvas = seedImages.get(paint);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = paint;
    ctx.fillRect(0, 0, 1, 1);
    seedImages.set(paint, canvas);
  }
  return canvas;
}
export function infectedMap(url: string, colour: boolean, repeat = false, channel = 0): Texture {
  const key = url + '|' + channel;
  let map = maps.get(key);
  if (!map) {
    // Newly spawned actors can draw before this particular skin has arrived.
    // Give that frame valid cloth colour and a tangent normal that points outwards.
    const texture = new Texture<HTMLCanvasElement | HTMLImageElement>(seedImage(colour ? (url.includes('infected-face') ? '#b3a89c' : '#ddd9d0') : '#8080ff'));
    map = texture;
    if (colour) map.colorSpace = SRGBColorSpace;
    if (repeat) map.wrapS = map.wrapT = MirroredRepeatWrapping;
    map.anisotropy = 4;
    map.channel = channel;
    maps.set(key, map);
    texture.needsUpdate = true;
    new ImageLoader().load(
      url,
      (image) => {
        // Release the 1×1 GPU allocation before uploading the larger image. All
        // already articulated figures keep their reference to this texture.
        texture.dispose();
        texture.image = image;
        texture.needsUpdate = true;
      },
      undefined,
      () => console.warn('[infected] using base colour or normal for ' + url),
    );
  }
  return map;
}
let coat: MeshStandardMaterial | undefined;
export function furMaterial(): MeshStandardMaterial {
  if (!coat) {
    coat = new MeshStandardMaterial({
      map: infectedMap(furURL, true, true),
      normalMap: infectedMap(furNormalURL, false, true),
      vertexColors: true,
      side: DoubleSide,
      roughness: 0.88,
      envMapIntensity: 0.46,
    });
    coat.normalScale.setScalar(0.54);
  }
  return coat;
}
const finish = new Map<string, MeshStandardMaterial>();
let white: DataTexture | undefined;
export function animalFinish(colour: string, roughness: number): MeshStandardMaterial {
  const key = colour + roughness;
  let mat = finish.get(key);
  if (!mat) {
    // A common one-texel map retains the physical material through the yard's static batching.
    if (!white) {
      white = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
      white.needsUpdate = true;
    }
    mat = new MeshStandardMaterial({ color: colour, map: white, roughness, envMapIntensity: 0.62 });
    finish.set(key, mat);
  }
  return mat;
}

let features: MeshStandardMaterial | undefined;
export function muzzleMaterial(): MeshStandardMaterial {
  if (!features) {
    const fibres = infectedMap(furNormalURL, false, true, 1);
    features = new MeshStandardMaterial({
      map: infectedMap(muzzleURL, true),
      normalMap: fibres,
      vertexColors: true,
      side: DoubleSide,
      roughness: 0.86,
      envMapIntensity: 0.48,
    });
    features.normalScale.setScalar(0.31);
  }
  return features;
}

const coats = new Map<string, MeshStandardMaterial>();
export function speciesFur(type: 'dog' | 'boar' | 'deer'): MeshStandardMaterial {
  let coat = coats.get(type);
  if (!coat) {
    const source = { dog: dogCoat, boar: boarCoat, deer: stagCoat }[type];
    coat = furMaterial().clone();
    coat.map = infectedMap(source, true, true);
    coats.set(type, coat);
  }
  return coat;
}
