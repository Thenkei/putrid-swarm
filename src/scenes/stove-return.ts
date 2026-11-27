import morningPlate from '../assets/epic-stove-morning.webp';
import { sprite } from '../engine/assets';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { line } from '../engine/i18n';
import { calmMotion } from '../render/lighting';
import { hash2, valueNoise } from '../render/noise';
import './stove-return.css';

/** Broken bands of soot from the same fingertips, on both sides of dawn. */
function sootPrint(): HTMLCanvasElement {
  const canvas = el('canvas', { class: 'stove-soot-print' });
  canvas.width = 120;
  canvas.height = 112;
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  for (const [x, y, r, angle] of [[27, 40, 10, -.43], [50, 22, 11, -.17], [72, 25, 10, .02], [91, 37, 8, .27], [39, 77, 16, -.75]] as const) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(1, 1.44);
    const stain = ctx.createRadialGradient(0, 0, 1, 1, 2, r + 2);
    stain.addColorStop(0, '#211b16ac');
    stain.addColorStop(1, '#302a2000');
    ctx.fillStyle = stain;
    ctx.fillRect(-r - 4, -r - 4, r * 2 + 8, r * 2 + 8);
    ctx.strokeStyle = '#1c1915ae';
    for (let ridge = 2; ridge < r; ridge += 2) {
      ctx.beginPath();
      ctx.arc(0, 1, ridge, .8 + ridge * .036, 5.4 + Math.cos(ridge));
      ctx.stroke();
    }
    ctx.restore();
  }
  return canvas;
}

export function stoveMorning(soot: boolean): HTMLDetailsElement {
  const photo = el('img');
  photo.src = morningPlate;
  photo.alt = line('La boîte de raviolis ouverte, une fourchette dedans, à la place de la gazinière.', 'An open tin of ravioli with a fork where the stove used to stand.');
  photo.width = 860;
  photo.height = 573;
  const detail = el('details', { class: 'epic-object stove-morning' }, [
    el('summary', { text: line('Rectangle de lino propre', 'Clean patch of lino') }),
    el('div', { class: 'stove-morning-photo' }, [photo, soot ? sootPrint() : null]),
    el('p', { text: line('Deux raviolis. Froids.', 'Two ravioli. Cold.') +
      (soot ? line(' Tes doigts ont laissé du noir autour de la serrure.', 'Your fingertips left soot around the lock.') : '') }),
  ]);
  return detail;
}

function handSprite(gripping: boolean, blackened: boolean) {
  const hand = el('canvas', { class: 'stove-hand' });
  const art = sprite(gripping ? 'shed_hands_key' : 'desk_hand_open');
  if (!art) return hand;
  hand.width = art.w;
  hand.height = art.h;
  const ctx = hand.getContext('2d');
  if (!ctx) return hand;
  ctx.drawImage(art.img, 0, 0, art.w, art.h);
  if (!blackened) return hand;
  // Stipple the finger pads into the existing painted shadows. The direction of
  // the long streak over the knuckles changes when the hand closes.
  const deposits: Array<[number, number, number, number]> = gripping
    ? [[.22,.164,.17,.047], [.46,.151,.20,.045], [.65,.203,.17,.052], [.59,.277,.095,.054]]
    : [[.32,.028,.23,.075], [.48,.053,.19,.051], [.68,.085,.18,.057], [.81,.14,.13,.046], [.09,.14,.17,.055], [.48,.293,.07,.048]];
  const skin = ctx.getImageData(0, 0, art.w, Math.ceil(art.h * .37));
  for (let y = 0; y < skin.height; y++) for (let x = 0; x < skin.width; x++) {
    const i = 4 * (y * art.w + x);
    if (!skin.data[i + 3]) continue;
    let coverage = 0;
    for (const [cx, cy, rx, ry] of deposits) {
      const dx = (x / art.w - cx) / rx, dy = (y / art.h - cy) / ry;
      coverage = Math.max(coverage, 1 - dx * dx - dy * dy);
    }
    if (coverage === 0) continue;
    const grit = valueNoise(x * .13, y * .065, 63) * .56 + hash2(x, y, 91) * .44;
    const density = Math.min(.93, coverage * (.5 + grit * .77));
    for (let c = 0; c < 3; c++) {
      const value = skin.data[i + c]!;
      skin.data[i + c] = value + (value * .09 + 14 - value) * density;
    }
  }
  ctx.putImageData(skin, 0, 0);
  return hand;
}

function danglingKey(): HTMLCanvasElement {
  const key = el('canvas', { class: 'epic-key' });
  key.width = 50;
  key.height = 108;
  const ctx = key.getContext('2d');
  if (!ctx) return key;
  ctx.translate(50, 108);
  ctx.rotate(Math.PI);
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#49331f';
  ctx.beginPath();
  ctx.ellipse(26, 90, 12, 14, -.2, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#d6b67d';
  ctx.stroke();
  const art = sprite('shed_hands_key');
  if (art) ctx.drawImage(art.img, 0, 0, 44, 75, 0, 0, 44, 75);
  else {
    ctx.fillStyle = '#b89a66';
    ctx.fillRect(23, 8, 6, 69);
    ctx.fillRect(27, 8, 13, 7);
    ctx.fillRect(27, 21, 10, 5);
  }
  return key;
}

export function stoveReturn(field: HTMLElement, note: HTMLElement, tap: HTMLButtonElement,
  windowExit: HTMLButtonElement, blackened: boolean, onMiss: () => void, rememberPrint: () => void, finish: () => void) {
  const reduced = calmMotion();
  const tolerance = reduced ? .46 : .34;
  const slot = el('div', { class: 'epic-slot' });
  slot.style.width = 78 * tolerance + '%';
  const marker = el('i', { class: 'stove-marker' });
  const gauge = el('div', { class: 'stove-gauge' }, [slot, marker]);
  const key = danglingKey();
  const cord = el('canvas', { class: 'stove-cord' });
  cord.width = 900;
  cord.height = 450;
  const ctx = cord.getContext('2d');
  const open = handSprite(false, blackened);
  const grip = handSprite(true, blackened);
  grip.hidden = true;
  const door = el('div', { class: 'epic-key-door stove-return', data: { beat: 'fumble' } }, [cord, key, open, grip, gauge]);
  door.setAttribute('aria-hidden', 'true');
  field.append(door);
  const fumble = reduced ? .28 : .71;
  let t = 0, missedAt = -2, caughtAt = -1, catchX = 50, catchY = 50;
  let previouslyAligned = false;
  const swingAt = () => Math.sin(Math.max(0, t - fumble) * (reduced ? 1.7 : 3) - Math.PI / 2);
  const aligned = () => Math.abs(swingAt()) < tolerance;
  const keyX = (swing: number) => 50 + 32 * swing;
  const keyY = (swing: number) => 50 - 10 * swing * swing;
  function pose(hand: HTMLElement, x: number, y: number, angle: number) {
    hand.style.left = x + '%';
    hand.style.top = y + '%';
    hand.style.transform = 'translateX(' + (hand === grip ? '-9%' : '-23%') + ') rotate(' + angle + 'deg)';
  }
  tap.setAttribute('aria-disabled', 'true');
  tap.addEventListener('click', () => {
    if (t < fumble || caughtAt >= 0) return;
    if (aligned()) {
      caughtAt = t;
      catchX = keyX(swingAt());
      catchY = keyY(swingAt());
      door.dataset.beat = 'caught';
      open.hidden = key.hidden = cord.hidden = true;
      grip.hidden = false;
      gauge.hidden = true;
      tap.setAttribute('aria-disabled', 'true');
      windowExit.disabled = true;
      note.textContent = line('Cette fois, tu la tiens.', 'Got it this time.');
      audio.play('shop_keys', .38);
    } else {
      missedAt = t;
      onMiss();
      audio.play('tin', .25, .8);
      note.textContent = line('Raté. La porte encaisse. Vise le centre ou passe par la fenêtre.', 'Missed. The door takes a hit. Aim for the middle or use the window.');
    }
  });
  function draw(dt: number) {
    t += dt;
    if (caughtAt >= 0) {
      const approach = Math.min(1, (t - caughtAt) / .24);
      const ease = approach * approach * (3 - 2 * approach);
      const turn = Math.min(1, Math.max(0, (t - caughtAt - .24) / .34));
      pose(grip, catchX + (50 - catchX) * ease, catchY + (50 - catchY) * ease, reduced ? -20 : -24 + 28 * turn);
      if (turn > .48 && door.dataset.beat !== 'unlock') {
        door.dataset.beat = 'unlock';
        audio.play('door', .7);
        if (blackened) {
          door.insertBefore(sootPrint(), grip);
          rememberPrint();
        }
      }
      if (t - caughtAt >= .72) finish();
      return;
    }
    const intro = Math.min(1, t / fumble);
    const swing = intro < 1 ? -.64 - .36 * intro : swingAt();
    const x = keyX(swing), y = keyY(swing);
    key.style.left = x + '%';
    key.style.top = y + '%';
    key.style.setProperty('--tilt', (reduced ? 0 : swing * 16) + 'deg');
    if (ctx) {
      ctx.clearRect(0, 0, 900, 450);
      ctx.beginPath();
      ctx.moveTo(450, -15);
      ctx.quadraticCurveTo(450 + (x - 50) * 4.5, 45, x * 9, y * 4.5);
      ctx.strokeStyle = '#21190f';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = '#ae8150';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    const ready = intro === 1 && aligned();
    if (ready && !previouslyAligned) audio.play('tin', .25, 1.35);
    previouslyAligned = ready;
    slot.dataset.aligned = String(ready);
    marker.style.left = 50 + 39 * swing + '%';
    if (intro < 1) {
      const reach = reduced ? .4 : Math.sin(intro * Math.PI);
      pose(open, 42 - 13 * reach, 70 - 24 * reach, -36 + reach * 7);
    } else {
      tap.removeAttribute('aria-disabled');
      const retry = Math.max(0, 1 - (t - missedAt) / .36);
      door.dataset.beat = retry ? 'missed' : 'wait';
      const reach = reduced ? 0 : Math.sin(retry * Math.PI);
      pose(open, 48 + (x - 48) * reach, 71 - 19 * reach, -30 + 8 * reach);
    }
  }
  draw(0);
  return draw;
}
