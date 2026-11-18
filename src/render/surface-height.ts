// Recover small cracks and grain from the paint. Subtracting the local average keeps broad
// colour changes and baked illumination from turning into bumps. White is the highest point.
export function surfaceHeight(source: HTMLCanvasElement | HTMLImageElement, maxSize = 768): HTMLCanvasElement {
  const width = source.width,
    height = source.height;
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const result = document.createElement('canvas');
  result.width = Math.max(1, Math.round(width * scale));
  result.height = Math.max(1, Math.round(height * scale));
  const ctx = result.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, result.width, result.height);
  const fine = ctx.getImageData(0, 0, result.width, result.height);
  const coarse = document.createElement('canvas');
  coarse.width = Math.max(1, Math.round(result.width / 10));
  coarse.height = Math.max(1, Math.round(result.height / 10));
  coarse.getContext('2d')!.drawImage(result, 0, 0, coarse.width, coarse.height);
  ctx.drawImage(coarse, 0, 0, result.width, result.height);
  const low = ctx.getImageData(0, 0, result.width, result.height).data;
  const luma = (pixels: Uint8ClampedArray, i: number) => 0.25 * pixels[i]! + 0.6 * pixels[i + 1]! + 0.15 * pixels[i + 2]!;
  for (let i = 0; i < fine.data.length; i += 4) {
    const value = 130 + (luma(fine.data, i) - luma(low, i)) * 1.75;
    fine.data[i] = fine.data[i + 1] = fine.data[i + 2] = value;
    fine.data[i + 3] = 255;
  }
  ctx.putImageData(fine, 0, 0);
  return result;
}
