import doorUrl from '../assets/camper-back-door.webp';
import sillUrl from '../assets/camper-broken-sill.webp';
import { el } from '../engine/dom';
import { line } from '../engine/i18n';
import { calmMotion } from '../render/lighting';
import './camper-door.css';

type DoorPose = 'holding' | 'bracing' | 'watching' | 'stepping' | 'inside' | 'empty';
const CEL: Record<DoorPose, number> = { holding: 0, bracing: 1, watching: 0, stepping: 1, inside: 2, empty: 3 };

/** The exterior and the interior insert share one impact clock, even when the feed is a thumbnail. */
function camperDoorPose(held: boolean, intact: boolean, hitAge: number, turnAge: number): DoorPose | null {
  if (turnAge >= 0) return turnAge < 1.55 ? 'inside' : turnAge < 4 ? 'empty' : null;
  if (!held) return null;
  const contact = hitAge >= 0 && hitAge < .54;
  if (intact) return contact ? 'bracing' : 'holding';
  return contact ? 'stepping' : 'watching';
}

export class CamperDoorFeed {
  private readonly painting = new Image();
  private readonly broken = new Image();
  private readonly canvas = el('canvas');
  private readonly ctx = this.canvas.getContext('2d');
  private readonly monitor = el('figure', { class: 'camper-door' }, [
    this.canvas, el('figcaption', { text: line('INT. · PORTE ARRIÈRE', 'INT. · BACK DOOR') }),
  ]);
  private readonly descriptions: Record<DoorPose, string> = {
    holding: line('La polaire rouille du Campeur est coincée entre son épaule et la porte.', 'The camper’s rust fleece is pressed between his shoulder and the door.'),
    bracing: line('Sous la poussée, le Campeur replante sa botte contre les lattes.', 'Under the shove, the camper plants his boot against the floorboards.'),
    watching: line('Le battant est tombé. Le Campeur surveille le passage, la main sur le montant brisé.', 'The door is gone. The camper watches the opening with one hand on the splintered jamb.'),
    stepping: line('Il écarte sa botte du passage quand une silhouette franchit le seuil.', 'He draws his boot back as a figure passes the open sill.'),
    inside: line('Le Campeur frappe la porte de l’intérieur.', 'The camper strikes the door from inside.'),
    empty: line('Le couloir est vide. Personne ne retient plus la porte.', 'The hall is empty. No one is holding the door now.'),
  };
  private lastFrame = '';
  private previous: DoorPose | null = null;
  private changedAt = 0;

  constructor() {
    this.painting.src = doorUrl;
    this.broken.src = sillUrl;
    this.canvas.width = 420;
    this.canvas.height = 280;
    this.monitor.setAttribute('role', 'img');
  }

  update(parent: HTMLElement, time: number, held: boolean, intact: boolean, hitAge: number, turnAge: number) {
    const pose = camperDoorPose(held, intact, hitAge, turnAge);
    if (!pose) {
      this.monitor.remove();
      return;
    }
    if (this.monitor.parentElement !== parent) parent.append(this.monitor);
    const door = intact ? 'boarded' : 'broken';
    if (this.monitor.dataset.pose !== pose || this.monitor.dataset.door !== door) {
      this.previous = this.monitor.dataset.door === door ? (this.monitor.dataset.pose as DoorPose | undefined) ?? null : null;
      this.changedAt = time;
      this.monitor.dataset.pose = pose;
      this.monitor.dataset.door = door;
      const description = !intact && pose === 'inside'
        ? line('Depuis le couloir, le Campeur cogne le montant brisé.', 'From inside the hall, the camper strikes the splintered jamb.')
        : this.descriptions[pose];
      this.monitor.setAttribute('aria-label', description);
    }
    const art = intact ? this.painting : this.broken;
    if (!this.ctx || !art.complete || !art.naturalWidth) return;
    // A short camera tremor originates at real contact. In steady motion mode the four poses carry it alone.
    const age = pose === 'inside' ? turnAge : pose === 'bracing' ? hitAge : Infinity;
    const still = calmMotion();
    const kick = age < .32 && !still ? Math.round(Math.sin(age * 47) * (1 - age / .32) * 3) : 0;
    const mix = this.previous && !still ? Math.min(1, Math.round((time - this.changedAt) * 30) / (pose === 'empty' ? 6 : 3)) : 1;
    const frame = door + pose + kick + '/' + mix;
    if (frame === this.lastFrame) return;
    this.lastFrame = frame;
    if (this.previous && mix < 1) this.draw(art, this.ctx, this.previous, 0);
    this.ctx.globalAlpha = mix;
    this.draw(art, this.ctx, pose, kick);
    this.ctx.globalAlpha = 1;
  }

  private draw(art: HTMLImageElement, ctx: CanvasRenderingContext2D, pose: DoorPose, kick: number) {
    const col = CEL[pose] % 2, row = Math.floor(CEL[pose] / 2);
    const width = art.naturalWidth / 2, height = art.naturalHeight / 2;
    ctx.drawImage(art, col * width + 4 + kick, row * height + 3, width - 8, height - 6, 0, 0, this.canvas.width, this.canvas.height);
  }
}
