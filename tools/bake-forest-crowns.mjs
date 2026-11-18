// Bake back-row silhouettes from the same volumetric trees used at the verge.
// Start the gate-study dev server first. The running game never creates a second GPU context.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--use-angle=metal'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.error(err.message));
  await page.addInitScript(() => localStorage.setItem('putrid-swarm.warned', '1'));
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5186/');
  await page.locator('button[aria-label="3D yard preview"][aria-pressed="true"]').waitFor({ timeout: 90000 });
  const captures = await page.evaluate(async () => {
    const treeUrl = new URL('/src/render/yard-meshes.ts', location.href).href;
    const imports = [...(await (await fetch(treeUrl)).text()).matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    const lib = imports.find((u) => u.includes('three') && !u.includes('addons') && !u.includes('BufferGeometryUtils'));
    const three = await import(new URL(lib, treeUrl));
    const { tree } = await import(treeUrl);
    const woodland = new URL(
      imports.find((u) => u.includes('/woodland.ts')),
      treeUrl,
    );
    const importsInWoods = [...(await (await fetch(woodland)).text()).matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    const { plantImage, loadPlantImages } = await import(
      new URL(
        importsInWoods.find((u) => u.includes('/plant-images.ts')),
        woodland,
      )
    );
    await loadPlantImages();
    if (!plantImage('pine')) throw new Error('The photographic sprigs are not ready.');
    const gl = new three.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    gl.setClearColor(0, 0);
    gl.setSize(600, 800);
    const scene = new three.Scene();
    scene.add(new three.HemisphereLight(0xffffff, 0x9d9f93, 2.07));
    const sun = new three.DirectionalLight(0xfff7df, 1.54);
    sun.position.set(2, 6, 3);
    scene.add(sun);
    const cam = new three.OrthographicCamera(-2, 2, 2.67, -2.67, 0.05, 25);
    const result = [];
    for (const [i, pine] of [true, true, false, false].entries()) {
      const specimen = tree(pine, [14, 19, 11, 16][i]);
      specimen.rotation.y = 0.38 + i * 0.98;
      scene.add(specimen);
      const bounds = new three.Box3().setFromObject(specimen);
      const center = bounds.getCenter(new three.Vector3()),
        size = bounds.getSize(new three.Vector3());
      cam.position.set(center.x + 5, center.y + 4.45, center.z + 8);
      cam.lookAt(center);
      const h = Math.max(size.y * 0.58, size.x * 0.7, size.z * 0.7);
      cam.left = -h * 0.75;
      cam.right = h * 0.75;
      cam.top = h;
      cam.bottom = -h;
      cam.updateProjectionMatrix();
      gl.render(scene, cam);
      result.push(gl.domElement.toDataURL().split(',')[1]);
      scene.remove(specimen);
    }
    gl.dispose();
    return result;
  });
  const cells = [];
  for (const [i, png] of captures.entries()) {
    const image = await sharp(Buffer.from(png, 'base64'))
      .trim({ threshold: 4 })
      .resize(380, 500, { fit: 'contain', position: 'south', background: '#00000000' })
      .extend({ left: 2, right: 2, top: 6, bottom: 6, background: '#00000000' })
      .png()
      .toBuffer();
    cells.push({ input: image, left: (i % 2) * 384, top: Math.floor(i / 2) * 512 });
  }
  await sharp({ create: { width: 768, height: 1024, channels: 4, background: '#00000000' } })
    .composite(cells)
    .webp({ quality: 87, alphaQuality: 97 })
    .toFile('public/assets/materials/woodland-crowns.webp');
} finally {
  await browser.close();
}
