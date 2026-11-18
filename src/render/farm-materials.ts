import {
  EquirectangularReflectionMapping,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  Vector2,
  type MeshStandardMaterialParameters,
} from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { surfaceImage, type SurfaceChannel, type SurfaceId } from '../engine/material-images';

const textures = new WeakMap<HTMLImageElement, Texture>();
export function surfaceTexture(id: SurfaceId, channel: SurfaceChannel): Texture | null {
  const image = surfaceImage(id, channel);
  if (!image) return null;
  let texture = textures.get(image);
  if (!texture) {
    texture = new Texture(image);
    texture.colorSpace = channel === 'albedo' ? SRGBColorSpace : NoColorSpace;
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    textures.set(image, texture);
  }
  return texture;
}

export function farmSurface(id: SurfaceId, normalStrength = 1, options: MeshStandardMaterialParameters = {}): MeshStandardMaterial {
  const response = surfaceTexture(id, 'surface');
  return new MeshStandardMaterial({
    map: surfaceTexture(id, 'albedo'),
    normalMap: surfaceTexture(id, 'normal'),
    normalScale: new Vector2(normalStrength, normalStrength),
    roughnessMap: response,
    roughness: 1,
    metalnessMap: response,
    metalness: response ? 1 : 0,
    ...options,
  });
}

let environment: Promise<Texture | null> | undefined;
/** Reflect the real sky and dark tree line in glazing, cast iron and painted steel. */
export function loadOutdoorLight(): Promise<Texture | null> {
  environment ??= new HDRLoader().loadAsync(import.meta.env.BASE_URL + 'assets/materials/farm-light.hdr').then(
    (texture) => {
      texture.mapping = EquirectangularReflectionMapping;
      return texture;
    },
    (error) => {
      environment = undefined;
      console.warn('[materials] outdoor reflections unavailable', error);
      return null;
    },
  );
  return environment;
}
