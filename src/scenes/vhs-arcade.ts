import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { sprite } from '../engine/assets';
import { drawMobStride } from '../render/infected';
import { calmMotion } from '../render/lighting';
import { CASE_LIFETIME, drawVhsCasesAndSmoke, drawVhsMuzzle, type VhsShot } from '../render/vhs-gunfire';
import { VhsImpacts } from '../render/vhs-impacts';
import { line as L } from '../engine/i18n';
import { heroArt } from './common';
import './vhs-arcade.css';

type Target = { lane: number; depth: number; speed: number; kind: 'runner' | 'brute' | 'cart' | 'mail'; hp: number; struck: number };
type Impact = { x: number; y: number; at: number; points: number; armor: boolean };
const PATTERN = [0, -1, 1, 0, 1, -1, 0, -1, 1, -1, 0, 1] as const;
const DURATION = 28;
const W = 960, H = 412;
const foot = (depth: number) => 103 + 274 * depth * depth;
const across = (lane: number, depth: number) => W / 2 + lane * (39 + 204 * depth * depth);

// Each entry is painted looking inward from that lane. Each cel registers its muzzle and port.
const FACINGS = [
  { key: 'epic_vhs_hero', angle: -.331, mounts: [
    [.916,.340,.763,.398], [.911,.337,.761,.394], [.914,.324,.764,.378], [.928,.350,.779,.410],
  ] },
  { key: 'epic_vhs_hero_center', angle: -1.51, mounts: [
    [.672,.074,.664,.189], [.672,.074,.664,.189], [.672,.074,.664,.189], [.660,.106,.647,.218],
  ] },
  { key: 'epic_vhs_hero_left', angle: -2.58, mounts: [
    [.076,.087,.298,.193], [.080,.087,.302,.193], [.080,.087,.302,.193], [.080,.087,.302,.193],
  ] },
] as const;
const HERO_HEIGHT = 166;
const HERO_WIDTH = HERO_HEIGHT * .75;
const ROUND_INTERVAL = .115;
const SHOT_PITCH = [1, .97, 1.035, 1.015, .985] as const;
const ROAD_STRIKES = [.41, .31, .48, .36, .44] as const;

export function playVhs(field: HTMLElement, actions: HTMLElement, note: HTMLElement, sleeve: boolean, armless: boolean, finish: (score: number) => void) {
  const canvas = el('canvas');
  canvas.className = 'vhs-track';
  canvas.width = W;
  canvas.height = H;
  canvas.tabIndex = 0;
  canvas.style.objectFit = 'fill';
  canvas.style.touchAction = 'none';
  canvas.setAttribute('aria-label', L('Piste de la VHS. Flèches gauche et droite pour changer de voie, espace pour tirer.', 'VHS track. Left and right arrows change lanes, space fires.'));
  const ctx = canvas.getContext('2d')!;
  field.replaceChildren(canvas);

  const impacts: Impact[] = [];
  const debris = new VhsImpacts();
  const shots: VhsShot[] = [];
  const dusk = ctx.createLinearGradient(0, 0, 0, H);
  dusk.addColorStop(0, '#271b4188');
  dusk.addColorStop(1, '#171826cc');
  const sets = ['plate_town', 'plate_village', 'plate_return', 'plate_loc_garage'].map(key => heroArt(key, armless));
  const facings = FACINGS.map(facing => ({ ...facing, art: sprite(facing.key) }));
  const fallback = sprite(heroArt('hero_departure', armless));
  const lanes = [L('gauche', 'left'), L('milieu', 'centre'), L('droite', 'right')];
  const targets: Target[] = [];
  let lane = 0, position = 0, elapsed = 0, nextSpawn = 0, serial = 0;
  let fireAt = 0, lastShot = -Infinity, round = 0, hitTime = 0, score = 0, combo = 0, misses = 0;
  let keyFire = false, pointerFire = false, auto = false, done = false;
  let tapped = false;
  let stride = 0;
  const flank = (direction: number) => { lane = Math.max(-1, Math.min(1, lane + direction)); };
  const btn = (text: string, click: () => void) => el('button', { class: 'btn', text, onClick: click });
  const left = btn(L('← Gauche', '← Left'), () => flank(-1));
  const right = btn(L('Droite →', 'Right →'), () => flank(1));
  const autoFire = btn(L('Tir automatique', 'Auto fire'), () => {
    auto = !auto;
    autoFire.setAttribute('aria-pressed', String(auto));
    autoFire.textContent = (auto ? '● ' : '○ ') + L('Tir automatique', 'Auto fire');
  });
  autoFire.setAttribute('aria-pressed', 'false');
  const end = () => {
    if (done) return;
    done = true;
    listeners.abort();
    finish(score);
  };
  actions.replaceChildren(left, right, autoFire, btn(L('Éjecter', 'Eject'), end));
  const dialog = field.parentElement!;
  const listeners = new AbortController();
  const opts = { signal: listeners.signal };
  dialog.addEventListener('keydown', (e) => {
    const direction = ['ArrowLeft', 'KeyA'].includes(e.code) ? -1 : ['ArrowRight', 'KeyD'].includes(e.code) ? 1 : 0;
    if (direction) { e.preventDefault(); if (!e.repeat) flank(direction); }
    if (e.code === 'Space' && e.target === canvas) { e.preventDefault(); if (!e.repeat) keyFire = tapped = true; }
  }, opts);
  dialog.addEventListener('keyup', (e) => { if (e.code === 'Space') keyFire = false; }, opts);
  canvas.addEventListener('blur', () => { keyFire = pointerFire = tapped = false; }, opts);
  const steer = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    lane = Math.max(-1, Math.min(1, Math.floor(3 * (e.clientX - r.left) / r.width) - 1));
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    canvas.focus();
    steer(e);
    canvas.setPointerCapture(e.pointerId);
    pointerFire = tapped = true;
  }, opts);
  canvas.addEventListener('pointermove', (e) => { if (pointerFire && e.isPrimary) steer(e); }, opts);
  canvas.addEventListener('pointercancel', () => { pointerFire = tapped = false; }, opts);
  canvas.addEventListener('lostpointercapture', () => { pointerFire = false; }, opts);
  canvas.focus();

  function spawn() {
    // A staggered file rewards a held burst. Its wing gives the player somewhere to sweep.
    const camera = Math.floor(elapsed / 7);
    const kind = serial % 8 === 6 ? 'mail' : serial % 4 === 3 ? 'cart' : serial % 5 === 4 ? 'brute' : 'runner';
    const lead = PATTERN[serial % PATTERN.length]!;
    const wing = lead === 0 ? (serial % 2 ? 1 : -1) : 0;
    const speed = .29 + .016 * camera;
    targets.push({ kind, depth: .22, lane: lead, speed, hp: kind === 'brute' ? 3 : 1, struck: -Infinity });
    targets.push({ kind: 'runner', depth: .12, lane: wing, speed, hp: 1, struck: -Infinity });
    if (kind !== 'cart' && (camera > 0 || serial % 2 === 0)) {
      targets.push({ kind: 'runner', depth: .045, lane: lead, speed, hp: 1, struck: -Infinity });
    }
    serial++;
    nextSpawn += 1.13 - .08 * camera;
  }

  function step(dt: number) {
    if (done) return;
    elapsed += dt;
    if (elapsed >= DURATION) { end(); return; }
    if (elapsed >= nextSpawn) spawn();
    const distance = Math.min(Math.abs(lane - position), dt * 5);
    position += Math.sign(lane - position) * distance;
    stride += distance;
    debris.update(dt);
    while (shots.length && elapsed - shots[0]!.at >= CASE_LIFETIME) shots.shift();
    hitTime = Math.max(0, hitTime - dt);
    for (let i = targets.length - 1; i >= 0; i--) {
      const t = targets[i]!;
      t.depth += dt * t.speed;
      if (t.kind === 'mail') t.lane = Math.sin((t.depth - .13) * 7);
      if (t.depth < 1) continue;
      if (Math.abs(t.lane - position) < .53) {
        misses++;
        score = Math.max(0, score - 75);
        combo = 0;
        hitTime = .45;
        audio.play('ram', .35);
      }
      targets.splice(i, 1);
    }
    // A quick tap may start and end between frames. Fire when the new lane is in reach.
    if ((auto || keyFire || pointerFire || tapped) && elapsed >= fireAt && (!tapped || Math.abs(position - lane) < .35)) {
      tapped = false;
      // Keep a held burst on the same beat across different refresh rates. After a rest,
      // start a fresh beat rather than playing missed rounds on the first frame.
      fireAt = (elapsed - lastShot <= ROUND_INTERVAL + dt ? fireAt : elapsed) + ROUND_INTERVAL;
      lastShot = elapsed;
      round++;
      audio.play('epic_tape', .74, SHOT_PITCH[round % SHOT_PITCH.length]!);
      const still = calmMotion();
      if (!still) {
        const { muzzleX, muzzleY, portX, portY } = heroPose(still);
        shots.push({ at: elapsed, index: round, muzzleX, muzzleY, portX, portY });
      }
      const hit = aimedTarget();
      let award = 0;
      if (hit) hit.struck = elapsed;
      if (hit && hit.kind !== 'cart' && --hit.hp <= 0) {
        combo++;
        award = (hit.kind === 'mail' ? (sleeve ? 400 : 200) : hit.kind === 'brute' ? 150 : 75) * Math.min(4, 1 + Math.floor(combo / 4));
        score += award;
        targets.splice(targets.indexOf(hit), 1);
        if (hit.kind === 'mail') audio.play('tin', .23, 1.2);
      } else if (hit?.kind === 'cart' && round % 3 === 0) audio.play('washer', .15, 1.1);
      const depth = hit?.depth ?? ROAD_STRIKES[round % ROAD_STRIKES.length]!;
      const x = across(hit?.lane ?? position, depth) + (hit ? 0 : (round % 3 - 1) * 9);
      const groundY = foot(depth);
      const y = hit ? groundY - 16 - 48 * depth : groundY;
      debris.trigger(hit?.kind ?? 'miss', x, y, groundY, depth, still, award > 0);
      if (award || (hit?.kind === 'cart' && !impacts.some(i => i.armor && Math.abs(i.x - x) < 38 && elapsed - i.at < .28))) {
        impacts.push({ x, y, at: elapsed, points: award, armor: !award });
      }
    }
    while (impacts.length && elapsed - impacts[0]!.at > .55) impacts.shift();
    draw();
  }

  function aimedTarget() {
    let nearest: Target | undefined;
    for (const target of targets) {
      if (Math.abs(target.lane - position) < .48 && (!nearest || target.depth > nearest.depth)) nearest = target;
    }
    return nearest;
  }

  function heroPose(still: boolean) {
    const age = elapsed - lastShot;
    const moving = Math.abs(lane - position) > .045;
    // Plant the feet for a whole burst. Only the shoulder kicks on each subsequent round.
    const pose = moving && !still ? (Math.floor(stride * 3) % 2 ? 2 : 1) : age < ROUND_INTERVAL + .06 ? 3 : 0;
    const row = armless ? 1 : 0;
    const kick = still ? 0 : Math.max(0, 1 - age / .085);
    const height = HERO_HEIGHT - 2.6 * kick;
    const left = across(position, 1) - HERO_WIDTH * .51 - 21 * (1 - Math.abs(position));
    const top = H - 5 - height * .965;
    // Anchor the shear at the soles. Belt, receiver and flash move with the shoulder.
    const desired = facings[Math.round(position) + 1]!;
    const facing = desired.art ? desired : facings[0]!;
    const lean = .026 * Math.cos(facing.angle) * kick;
    const [mx, my, px, py] = facing.mounts[pose]!;
    const muzzleX = left + HERO_WIDTH * mx + (my - .965) * height * lean;
    const muzzleY = top + height * my;
    const portX = left + HERO_WIDTH * px + (py - .965) * height * lean;
    const portY = top + height * py;
    return { row, pose, moving, left, top, height, lean, muzzleX, muzzleY, portX, portY, facing };
  }

  function draw() {
    const still = calmMotion();
    ctx.clearRect(0, 0, W, H);
    const camera = Math.min(3, Math.floor(elapsed / 7));
    const back = sprite(sets[camera]!);
    if (back) ctx.drawImage(back.img, 0, 0, W, H);
    ctx.fillStyle = dusk;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#26222dc9';
    ctx.beginPath();
    ctx.moveTo(417, 103);
    ctx.lineTo(543, 103);
    ctx.lineTo(945, H);
    ctx.lineTo(15, H);
    ctx.fill();
    for (const edge of [-1.5, -.5, .5, 1.5]) {
      for (let i = 0; i < 10; i++) {
        const near = ((i + (still ? 0 : elapsed * 2.4)) % 10) / 10;
        const far = Math.max(0, near - .048);
        ctx.beginPath();
        ctx.moveTo(across(edge, far), foot(far));
        ctx.lineTo(across(edge, near), foot(near));
        ctx.lineWidth = 1 + near * 3;
        ctx.strokeStyle = Math.abs(edge) > 1 ? '#dbab9b' : '#c8b278';
        ctx.stroke();
      }
    }
    for (const t of [...targets].sort((a, b) => a.depth - b.depth)) {
      const x = across(t.lane, t.depth), y = foot(t.depth), size = 24 + 112 * t.depth;
      ctx.fillStyle = '#15121b75';
      ctx.beginPath();
      ctx.ellipse(x, y + 1, size * .26, size * .065, 0, 0, Math.PI * 2);
      ctx.fill();
      if (t.kind === 'cart') {
        ctx.fillStyle = '#291a19';
        ctx.fillRect(x - size * .38, y - size * .52, size * .76, size * .46);
        ctx.lineWidth = Math.max(1, size * .023);
        ctx.strokeStyle = '#a39177';
        ctx.beginPath();
        ctx.moveTo(x - size * .51, y - size * .65);
        ctx.lineTo(x - size * .41, y - size * .65);
        ctx.lineTo(x - size * .32, y - size * .11);
        ctx.lineTo(x + size * .31, y - size * .11);
        ctx.stroke();
        ctx.fillStyle = '#57433e';
        for (let bar = -2; bar <= 2; bar++) ctx.fillRect(x + bar * size * .13, y - size * .39, size * .035, size * .24);
        ctx.fillStyle = '#e5ad46';
        ctx.fillRect(x - size * .38, y - size * .52, size * .76, size * .10);
        ctx.fillStyle = '#e6be81';
        ctx.font = 'bold ' + Math.round(size * .36) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('×', x, y - size * .1);
        ctx.fillStyle = '#16121b';
        ctx.fillRect(x - size * .31, y - size * .07, size * .12, size * .12);
        ctx.fillRect(x + size * .2, y - size * .07, size * .12, size * .12);
      } else {
        const name = t.kind === 'mail' ? 'boss_mail_front' : 'en_' + t.kind + '_front';
        ctx.save();
        ctx.translate(x, y);
        if (!still && t.kind === 'brute' && elapsed - t.struck < .12) {
          ctx.transform(1, 0, (1 - (elapsed - t.struck) / .12) * .14, 1, 0, 0);
        }
        const phase = still ? 0 : (t.depth * (t.kind === 'brute' ? 4 : 7)) % 1;
        if (t.kind === 'mail') {
          ctx.fillStyle = '#262331';
          ctx.strokeStyle = '#edc478';
          ctx.lineWidth = Math.max(1, size * .025);
          for (const dx of [-.20, .19]) {
            ctx.beginPath();
            ctx.arc(dx * size, -size * .11, size * .105, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(dx * size, -size * .11);
            ctx.lineTo((dx + Math.cos(phase * Math.PI * 2) * .1) * size, (-.11 + Math.sin(phase * Math.PI * 2) * .1) * size);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.moveTo(-size * .2, -size * .11);
          ctx.lineTo(-size * .04, -size * .30);
          ctx.lineTo(size * .19, -size * .11);
          ctx.stroke();
          ctx.translate(0, -size * .18);
        }
        if (!drawMobStride(ctx, t.kind, phase, size * (t.kind === 'mail' ? .72 : .93))) {
          const single = sprite(name);
          if (single) ctx.drawImage(single.img, -size * .5, -size, size, size);
          else { ctx.fillStyle = '#b19472'; ctx.fillRect(-size * .18, -size * .8, size * .36, size * .8); }
        }
        ctx.restore();
        if (t.kind === 'mail') {
          ctx.fillStyle = '#ffdd74';
          ctx.font = 'bold 17px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('★', x, y - size);
        }
      }
    }
    const locked = aimedTarget();
    if (locked) {
      const aimX = across(locked.lane, locked.depth);
      const aimY = foot(locked.depth) - 16 - 48 * locked.depth;
      const r = 9 + 16 * locked.depth;
      ctx.strokeStyle = locked.kind === 'cart' ? '#eea968' : '#c1d6a5';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const xsign of [-1, 1]) {
        for (const ysign of [-1, 1]) {
          ctx.moveTo(aimX + xsign * (r - 5), aimY + ysign * r);
          ctx.lineTo(aimX + xsign * r, aimY + ysign * r);
          ctx.lineTo(aimX + xsign * r, aimY + ysign * (r - 5));
        }
      }
      ctx.stroke();
      if (locked.kind === 'cart' && locked.depth > .62) {
        ctx.fillStyle = '#f5bd7e';
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(locked.lane === -1 ? '→' : locked.lane === 1 ? '←' : '←   →', aimX, aimY - r - 4);
      }
    }
    debris.draw(ctx);
    const { row, pose, moving, left, top, height, lean, muzzleX, muzzleY, facing } = heroPose(still);
    ctx.fillStyle = '#16142088';
    ctx.beginPath();
    ctx.ellipse(left + HERO_WIDTH * .49, H - 6, moving ? 27 : 36, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.transform(1, 0, lean, 1, left - lean * height * .965, top);
    const hero = facing.art;
    if (hero) {
      const cellW = hero.w / 4, cellH = hero.h / 2;
      ctx.drawImage(hero.img, pose * cellW, row * cellH, cellW, cellH, 0, 0, HERO_WIDTH, height);
    } else if (fallback) {
      // The normal evening hero is already loaded if an optional tape picture failed to load.
      ctx.drawImage(fallback.img, 0, 0, fallback.w / 4, fallback.h * .44, 0, 0, HERO_WIDTH, height);
    }
    ctx.restore();
    if (!still) {
      drawVhsCasesAndSmoke(ctx, shots, elapsed, H - 5);
      drawVhsMuzzle(ctx, muzzleX, muzzleY, facing.angle, elapsed - lastShot, round);
    }
    for (const impact of impacts) {
      const age = elapsed - impact.at;
      ctx.save();
      ctx.translate(impact.x, impact.y);
      ctx.globalAlpha = Math.max(0, 1 - age / .55);
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      const tag = impact.armor ? '×' : '+' + impact.points;
      const lift = still ? -10 : -10 - age * 24;
      ctx.strokeStyle = '#201922';
      ctx.lineWidth = 3;
      ctx.strokeText(tag, 0, lift);
      ctx.fillStyle = impact.armor ? '#e6b87b' : '#ffe7aa';
      ctx.fillText(tag, 0, lift);
      ctx.restore();
    }
    if (hitTime > 0) {
      ctx.strokeStyle = '#be6652';
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, W - 8, H - 8);
    }
    ctx.textAlign = 'left';
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = '#16131dda';
    ctx.fillRect(13, 13, 137, 32);
    ctx.fillStyle = '#f7d990';
    ctx.fillText('▶ CAM 0' + (camera + 1), 25, 35);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#16131dda';
    ctx.fillRect(W - 194, 13, 180, 32);
    ctx.fillStyle = '#f7d990';
    ctx.fillText(String(score).padStart(5, '0') + '  ×' + Math.min(4, 1 + Math.floor(combo / 4)), W - 27, 35);
    const hazard = targets.find(t => t.kind === 'cart');
    const readout = score + ' pts · ' + L('Série ', 'Streak ') + combo + ' · ' + lanes[lane + 1] + ' · ' + Math.ceil(DURATION - elapsed) + ' s' + (hazard ? ' · ' + L('Obstacle ', 'Obstacle ') + lanes[hazard.lane + 1] : '') + (misses ? ' · ' + L('Chocs ', 'Hits ') + misses : '');
    if (note.textContent !== readout) note.textContent = readout;
  }
  draw();
  return step;
}
