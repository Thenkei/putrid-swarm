import { sprite } from '../engine/assets';
import { line } from '../engine/i18n';

const WIDTH = 960, HEIGHT = 412;
// Vanishing points are measured on the four paintings. The shooting plane and the art
// share each shot's optical centre, including during the slow push down the street.
const STREETS = [
  { id: 'market', names: ['Les halles', 'Market hall'], x: .516, y: .548, zoom: 1.39, skyline: 160 },
  { id: 'cinema', names: ['Le cinéma', 'The cinema'], x: .500, y: .490, zoom: 1.26, skyline: 158 },
  { id: 'underpass', names: ['Sous les rails', 'Under the tracks'], x: .491, y: .646, zoom: 1.51, skyline: 195 },
  { id: 'garage', names: ['Le garage', 'The garage'], x: .497, y: .456, zoom: 1.19, skyline: 151 },
] as const;

export function vhsStreet(elapsed: number, lane: number, still: boolean) {
  const camera = Math.min(STREETS.length - 1, Math.floor(elapsed / 7));
  const street = STREETS[camera]!;
  const phase = elapsed / 7 - camera;
  const zoom = street.zoom * (1 + (still ? 0 : .045 * phase));
  const center = WIDTH / 2 - (still ? 0 : 5 * lane);
  return { street, camera, phase, center, zoom, left: center - street.x * WIDTH * zoom,
    top: street.skyline - street.y * HEIGHT * zoom };
}

type StreetFrame = ReturnType<typeof vhsStreet>;

export function streetName(frame: StreetFrame) {
  const [fr, en] = frame.street.names;
  return line(fr, en);
}

export function drawVhsStreet(ctx: CanvasRenderingContext2D, frame: StreetFrame, time: number, still: boolean) {
  const { street, zoom, left, top } = frame;
  const back = sprite('epic_vhs_' + street.id);
  if (back) ctx.drawImage(back.img, left, top, WIDTH * zoom, HEIGHT * zoom);
  else {
    // The tape stays readable if an individual background could not be loaded.
    ctx.fillStyle = '#323040';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#30292a';
    ctx.fillRect(0, street.skyline, WIDTH, HEIGHT - street.skyline);
  }
  if (still || !back) return;
  if (street.id === 'underpass') {
    // Leaking bridge joints form rings on the painted road beside the central lane.
    for (const [x, y, offset] of [[.33,.78,0],[.69,.83,.37],[.58,.71,.81]] as const) {
      const age = (time * .78 + offset) % 1;
      ctx.beginPath();
      ctx.ellipse(left + x * WIDTH * zoom, top + y * HEIGHT * zoom,
        1 + age * 10, .5 + age * 2.2, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(171,196,205,' + .37 * (1 - age) + ')';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}
