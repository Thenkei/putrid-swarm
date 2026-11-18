import { CanvasTexture, DynamicDrawUsage, Group, InstancedMesh, MeshBasicMaterial, Object3D, PlaneGeometry, type Vector3 } from 'three';
import type { WorldFrame } from './world';

/** Short-range ambient shadow where movable objects touch the ground, drawn in one pass. */
export class YardContacts extends Group {
  private readonly quad = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly shade: MeshBasicMaterial;
  private readonly pose = new Object3D();
  private stamps?: InstancedMesh;

  constructor() {
    super();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    const fade = ctx.createRadialGradient(48, 48, 0, 48, 48, 47);
    fade.addColorStop(0, 'rgba(35,28,23,0.70)');
    fade.addColorStop(0.36, 'rgba(35,28,23,0.54)');
    fade.addColorStop(0.66, 'rgba(35,28,23,0.22)');
    fade.addColorStop(1, 'rgba(35,28,23,0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, 96, 96);
    this.shade = new MeshBasicMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false });
  }

  sync(f: WorldFrame, car: Vector3): void {
    const count = 5 + f.devices.length + f.enemies.length + (f.fallen?.length ?? 0);
    if (!this.stamps || this.stamps.instanceMatrix.count < count) {
      if (this.stamps) {
        this.remove(this.stamps);
        this.stamps.dispose();
      }
      this.stamps = new InstancedMesh(this.quad, this.shade, 2 ** Math.ceil(Math.log2(count)));
      this.stamps.instanceMatrix.setUsage(DynamicDrawUsage);
      this.stamps.frustumCulled = false;
      this.stamps.renderOrder = -0.5; // After soil and puddles, before route ink.
      this.add(this.stamps);
    }
    const mesh = this.stamps;
    let n = 0;
    const stamp = (x: number, z: number, w: number, d: number, yaw = 0) => {
      this.pose.position.set(x, 0.014, z);
      this.pose.rotation.y = yaw;
      this.pose.scale.set(w, 1, d);
      this.pose.updateMatrix();
      mesh.setMatrixAt(n++, this.pose.matrix);
    };
    if (f.carPresent) {
      stamp(car.x, car.z, 2.05, 3.75);
      for (const side of [-1, 1]) for (const axle of [-0.93, 1]) stamp(car.x + side * 0.7, car.z + axle, 0.43, 0.77);
    }
    for (const d of f.devices) {
      const fence = d.type === 'fence' || d.type === 'barrier';
      const yaw = [0, -Math.PI / 2, Math.PI / 4, -Math.PI / 4][d.facing ?? 0] ?? 0;
      stamp(d.x + 0.5, d.y + 0.5, fence && (d.facing ?? 0) >= 2 ? 1.84 : 1.46, fence ? 0.63 : 1.04, yaw);
    }
    for (const e of f.enemies)
      if (e.alive) {
        const long = e.type === 'dog' || e.type === 'boar' || e.type === 'deer';
        stamp(e.x, e.y, 0.9 * e.def.size, (long ? 1.75 : 0.91) * e.def.size, Math.atan2(e.fx, e.fy));
      }
    for (const e of f.fallen ?? []) stamp(e.x, e.y, 0.85, 1.42, Math.atan2(e.fx, e.fy));
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }
}
