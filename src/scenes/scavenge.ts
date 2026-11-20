import { SEARCH_HOURS, type SearchSpot } from '../core/data/locations';
import { COURSE, GATE_WINDOW, gateResult } from '../core/fairground';
import { GATE_HALF_ANGLE, Padlock } from '../core/padlock';
import type { Rng } from '../core/rng';
import { circuitTiles, PORTS, shuffled, traceCircuit, turnTile, type Puzzle } from '../core/scavenge';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { fmt, hours, S } from '../engine/i18n';
import { assetUrl } from '../engine/assets';

export class ScavengePanel {
  readonly root = el('div', { class: 'modal scavenge' });
  private readonly board = el('div', { class: 'salvage-board' });
  private readonly status = el('div', { class: 'salvage-status' });
  private readonly instruction = el('p', { class: 'salvage-instruction' });
  private advance: ((dt: number) => void) | null = null;

  private started = false;
  private finished = false;

  constructor(
    puzzle: Puzzle, spotName: string, spot: SearchSpot, plate: string, rng: Rng,
    private readonly solved: () => void, readonly cancel: () => void,
    private readonly onStart: () => void, private readonly onFailure: (message: string) => void,
  ) {
    const s = S().scavenge;
    const photo = el('aside', { class: 'salvage-photo', style: { backgroundPosition: `${spot.x * 100}% ${spot.y * 100}%` } }, [
      el('div', { class: 'salvage-caption' }, [el('strong', { text: spotName }), el('small', { text: fmt(s.cost, { h: hours(SEARCH_HOURS) }) })]),
    ]);
    const closeUp = puzzle.kind === 'records' ? 'plate_records' : spot.fatalMiss === 'lift' ? 'plate_lift_raised' : null;
    const url = (closeUp && assetUrl(closeUp)) || assetUrl(plate);
    if (spot.fatalMiss === 'lift') photo.style.backgroundPosition = '54% center';
    if (puzzle.kind === 'records') {
      photo.style.backgroundPosition = 'center';
      photo.classList.add('records-photo');
    }
    if (url) photo.style.backgroundImage = `url("${url}")`;
    this.instruction.textContent = s[puzzle.kind];
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', puzzle.title);
    this.status.setAttribute('role', 'status');
    this.board.classList.add(`board-${puzzle.kind}`);
    const fairground = puzzle.kind === 'vachette';
    this.root.append(el('div', { class: fairground ? 'salvage-case vachette-case' : 'salvage-case' }, [fairground ? null : photo, el('div', { class: 'salvage-sheet' }, [
      el('h2', { text: puzzle.title }), el('p', { class: 'salvage-clue', text: puzzle.clue }),
      spot.fatalMiss ? el('strong', { class: 'salvage-danger', text: s.liftWarning }) : null,
      fairground ? el('small', { class: 'vachette-cost', text: fmt(s.cost, { h: hours(SEARCH_HOURS) }) }) : null,
      this.instruction, this.board, this.status,
      el('button', { class: 'salvage-back', text: s.back, onClick: cancel }),
    ])]));
    switch (puzzle.kind) {
      case 'scale': this.scale(puzzle.unit, rng); break;
      case 'circuit': this.circuit(rng); break;
      case 'padlock': this.padlock(rng); break;
      case 'timing': this.timing(puzzle.action, rng); break;
      case 'records': this.records(puzzle, rng); break;
      case 'directory': this.directory(puzzle.entries, rng); break;
      case 'vachette': this.vachette(); break;
    }
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.onStart();
  }

  showFailure(message: string, retry: (() => void) | null): void {
    const s = S().scavenge;
    this.board.replaceChildren(el('strong', { text: fmt(s.spent, { h: hours(SEARCH_HOURS) }) }));
    this.board.className = 'salvage-board';
    this.status.textContent = message;
    if (retry) {
      const button = el('button', { class: 'salvage-piece salvage-retry', text: fmt(s.retry, { h: hours(SEARCH_HOURS) }), onClick: () => {
        if (!button.isConnected || button.disabled) return;
        button.disabled = true;
        retry();
      } });
      this.board.append(button);
      button.focus();
    } else this.root.querySelector<HTMLButtonElement>('.salvage-back')?.focus();
  }

  focus(): void {
    this.board.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }

  update(dt: number): void {
    this.advance?.(dt);
  }

  private button(label: string, action: () => void): HTMLButtonElement {
    return el('button', { class: 'salvage-piece', text: label, onClick: () => {
      if (this.finished || !this.root.isConnected) return;
      this.start();
      audio.play('click');
      action();
    } });
  }

  private miss(message: string): void {
    this.finished = true;
    this.advance = null;
    audio.play('deny');
    this.onFailure(message);
  }

  private vachette(): void {
    const { fairground: s, take } = S().scavenge;
    const arenaArt = assetUrl('plate_vachette');
    const cowArt = assetUrl('vachette_cow');
    const cow = cowArt ? el('img', { class: 'vachette-cow' }) : null;
    if (cow && cowArt) {
      cow.src = cowArt;
      cow.alt = '';
    }
    const marker = el('i', { class: 'vachette-marker' });
    const gates = COURSE.map(gate => {
      const span = gate.to - gate.from;
      return el('i', {
        class: 'vachette-gate',
        style: { left: `${gate.from + span * GATE_WINDOW.opens}%`, width: `${span * (GATE_WINDOW.closes - GATE_WINDOW.opens)}%` },
      });
    });
    const arena = el('div', { class: 'vachette-arena' }, [cow, el('div', { class: 'vachette-track' }, [...gates, marker])]);
    if (arenaArt) arena.style.backgroundImage = `url("${arenaArt}")`;
    arena.setAttribute('aria-hidden', 'true');
    const controls = el('div', { class: 'vachette-controls' });
    const leadIn = 0.55;
    let index = 0;
    let elapsed = -leadIn;
    let untimed = false;

    const paint = (progress: number): void => {
      const gate = COURSE[index]!;
      const position = gate.from + (gate.to - gate.from) * Math.max(0, Math.min(1, progress));
      arena.style.setProperty('--vachette-position', `${position}%`);
      arena.dataset.inBand = String(gateResult(progress) === 'caught');
    };
    const setGate = (): void => {
      elapsed = -leadIn;
      this.status.textContent = fmt(s.gate, { n: index + 1, total: COURSE.length });
      gates.forEach((gate, i) => { gate.dataset.state = i < index ? 'closed' : i === index ? 'active' : 'pending'; });
      paint(untimed ? (GATE_WINDOW.opens + GATE_WINDOW.closes) / 2 : 0);
    };
    const action = this.button(s.close, () => {
      if (!untimed && elapsed < 0) return;
      const gate = COURSE[index]!;
      const result = untimed ? 'caught' : gateResult(elapsed / gate.seconds);
      if (result !== 'caught') return this.miss(s[result]);
      gates[index]!.dataset.state = 'closed';
      if (++index < COURSE.length) {
        setGate();
        return;
      }
      this.advance = null;
      arena.dataset.inBand = 'false';
      arena.style.setProperty('--vachette-position', `${gate.to}%`);
      this.status.textContent = s.clear;
      const collect = this.button(take, this.solved);
      controls.replaceChildren(collect);
      collect.focus();
    });
    const begin = (withoutTimer: boolean): void => {
      untimed = withoutTimer;
      controls.replaceChildren(action);
      action.focus();
      setGate();
      if (!untimed) {
        this.advance = dt => {
          elapsed += dt;
          const progress = elapsed / COURSE[index]!.seconds;
          if (progress >= 1) return this.miss(s.late);
          paint(progress);
        };
      }
    };
    paint(0);
    controls.append(this.button(s.start, () => begin(false)), this.button(s.untimed, () => begin(true)));
    this.board.append(arena, controls);
  }

  private records(puzzle: Extract<Puzzle, { kind: 'records' }>, rng: Rng): void {
    const albums = el('div', { class: 'record-albums' });
    for (const [cover, album] of puzzle.albums.entries()) {
      const button = this.button(album, () => this.chooseRecordTarget(puzzle, album, rng));
      button.dataset.cover = String(cover);
      albums.append(button);
    }
    this.board.append(albums);
  }

  private directory(entries: readonly string[], rng: Rng): void {
    const s = S().scavenge;
    const screen = el('div', { class: 'directory-screen' });
    const open = this.button(s.directoryOpen, () => {
      audio.play('radio_squelch', 0.6);
      screen.replaceChildren(...shuffled([0, 1, 2], rng).map(index => this.button(entries[index]!, () => {
        if (index !== 0) {
          this.miss(s.directoryMiss);
          return;
        }
        audio.play('ready');
        const mark = this.button(s.directoryMark, this.solved);
        screen.replaceChildren(el('p', { text: s.directoryCache }), mark);
        mark.focus();
      })));
      this.focus();
    });
    screen.append(open);
    this.board.append(screen);
  }

  private chooseRecordTarget(puzzle: Extract<Puzzle, { kind: 'records' }>, album: string, rng: Rng): void {
    const s = S().scavenge;
    const targets = shuffled([
      { label: puzzle.target, miss: null, sound: 'tin' },
      { label: puzzle.decoys[0][0], miss: puzzle.decoys[0][1], sound: 'thud' },
      { label: puzzle.decoys[1][0], miss: puzzle.decoys[1][1], sound: 'broken' },
    ] as const, rng);
    const lane = el('div', { class: 'record-lane' });
    const buttons = el('div', { class: 'record-targets' }, targets.map((target, index) => this.button(target.label, () => {
      this.finished = true;
      for (const button of buttons.querySelectorAll('button')) button.disabled = true;
      const disc = el('span', { class: 'record-flight' });
      disc.style.setProperty('--record-landing', `${(index + 0.5) * 100 / targets.length}%`);
      let remaining = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.58;
      lane.append(disc);
      audio.play('fling', 0.6);
      this.advance = (dt) => {
        remaining -= dt;
        if (remaining > 0) return;
        this.advance = null;
        this.instruction.hidden = true;
        audio.play(target.sound);
        if (target.miss !== null) {
          this.miss(target.miss);
          return;
        }
        const take = el('button', { class: 'salvage-piece', text: s.take, onClick: this.solved });
        this.board.replaceChildren(take);
        this.status.textContent = s.recordClear;
        take.focus();
      };
    })));
    this.instruction.textContent = fmt(s.recordAim, { album });
    this.board.replaceChildren(lane, buttons);
    this.focus();
  }

  private scale(unit: string, rng: Rng): void {
    const s = S().scavenge;
    const weights = shuffled([1, 2, 3, 4, 5, 6, 7, 8], rng).slice(0, 5);
    const target = weights[0]! + weights[1]!;
    const selected = new Set<number>();
    const load = el('b');
    const dial = el('div', { class: 'salvage-readout' }, [
      el('span', {}, [s.target, el('b', { class: 'scale-target', text: `${target} ${unit}` })]), el('span', {}, [s.loaded, load]),
    ]);
    const pieces = el('div', { class: 'salvage-weights' });
    const update = (): number => {
      const sum = [...selected].reduce((n, value) => n + value, 0);
      load.textContent = `${sum} ${unit}`;
      for (const btn of pieces.querySelectorAll('button')) btn.setAttribute('aria-pressed', String(selected.has(Number(btn.value))));
      return sum;
    };
    for (const weight of shuffled(weights, rng)) {
      const button = this.button(`${weight} ${unit}`, () => {
        if (selected.has(weight)) selected.delete(weight);
        else selected.add(weight);
        const sum = update();
        this.status.textContent = '';
        if (selected.size !== 2) return;
        if (sum === target) this.solved();
        else this.miss(fmt(s.wrongSum, { n: sum }));
      });
      button.value = String(weight);
      pieces.append(button);
    }
    update();
    this.board.append(dial, pieces);
  }

  private circuit(rng: Rng): void {
    const board = circuitTiles(rng);
    const { tiles } = board;
    const s = S().scavenge;
    const grid = el('div', { class: 'wire-grid' });
    grid.style.setProperty('--inlet-row', String(board.inlet));
    grid.style.setProperty('--outlet-row', String(board.outlet));
    const buttons = tiles.map((_, index) => this.button('', () => {
      tiles[index] = turnTile(tiles[index]!);
      draw();
    }));
    let previousRoute: string | null = null;
    const draw = (): void => {
      const trace = traceCircuit(board);
      const order = [...trace.lit];
      const route = order.map(index => `${index}:${tiles[index]}`).join(',');
      const traceChange = previousRoute !== null && route !== previousRoute;
      previousRoute = route;
      buttons.forEach((button, i) => {
        const ends = PORTS.filter(port => tiles[i]! & port);
        const leads = ends.map(port => el('i', { class: `lead lead-${port}` }));
        const step = order.indexOf(i);
        if (traceChange && step >= 0) {
          const glint = el('i', { class: 'route-glint', style: { animationDelay: `${step * 65}ms` } });
          glint.setAttribute('aria-hidden', 'true');
          leads.push(glint);
        }
        button.replaceChildren(...leads);
        button.classList.toggle('connected', step >= 0);
        const sides = ends.map(port => s.directions[PORTS.indexOf(port)]).join(' / ');
        button.setAttribute('aria-label', `${fmt(s.tile, { n: i + 1 })} · ${sides}`);
      });
    };
    draw();
    grid.append(...buttons);
    this.board.append(grid, this.button(s.routeTest, () => {
      if (traceCircuit(board).complete) this.solved();
      else this.miss(s.routeBroken);
    }));
  }

  private padlock(rng: Rng): void {
    const lock = new Padlock(rng);
    const s = S().scavenge;
    const rings = lock.angles.map(() => el('i', { class: 'lock-ring' }));
    const dial = el('div', { class: 'lock-dial' }, [...rings, el('i', { class: 'lock-spindle' }), el('i', { class: 'lock-guide' })]);
    dial.style.setProperty('--gate', `${GATE_HALF_ANGLE}deg`);
    const housing = el('div', { class: 'lock-housing' }, [el('i', { class: 'lock-shackle' }), dial]);
    housing.setAttribute('aria-hidden', 'true');
    const stamps = rings.map((_, i) => el('span', { text: String(i + 1) }));
    const progress = el('div', { class: 'lock-progress' }, stamps);
    progress.setAttribute('aria-hidden', 'true');
    const action = this.button(s.catchRing, () => {
      if (lock.open) return this.solved();
      if (!lock.catchRing()) {
        this.miss(`${fmt(s.ringCount, { n: lock.setRings })} · ${s.slipped}`);
        return;
      }
      paint();
      if (lock.open) {
        audio.play('unlock');
        action.textContent = s.take;
        this.advance = null;
      }
    });
    const rotate = (index: number): void => {
      rings[index]!.style.transform = `rotate(${lock.angles[index]}deg)`;
    };
    const paint = (): void => {
      rings.forEach((ring, i) => {
        rotate(i);
        ring.classList.toggle('turning', i === lock.setRings);
        ring.classList.toggle('latched', i < lock.setRings);
        stamps[i]!.classList.toggle('latched', i < lock.setRings);
      });
      housing.classList.toggle('unlatched', lock.open);
      housing.classList.toggle('aligned', lock.aligned);
      this.status.textContent = lock.open ? s.lockOpen : fmt(s.ringCount, { n: lock.setRings });
    };
    const speed = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.55 : 1;
    this.advance = dt => {
      lock.advance(dt * speed);
      rotate(lock.setRings);
      housing.classList.toggle('aligned', lock.aligned);
    };
    paint();
    this.board.append(housing, el('div', { class: 'lock-controls' }, [progress, action]));
  }

  private timing(action: string, rng: Rng): void {
    const s = S().scavenge;
    const needle = el('i', { class: 'catch-needle' });
    const band = el('i', { class: 'catch-band' });
    const track = el('div', { class: 'catch-track' }, [band, needle]);
    let count = 0;
    let phase = rng.next();
    let position = 0;
    const width = 0.23;
    let start = rng.int(15, 35) / 100;
    const placeBand = () => {
      band.style.left = `${start * 100}%`;
      band.style.width = `${width * 100}%`;
    };
    this.advance = dt => {
      phase = (phase + dt * 0.62) % 2;
      position = 1 - Math.abs(phase - 1);
      needle.style.left = `${position * 100}%`;
    };
    this.advance(0);
    placeBand();
    this.status.textContent = fmt(s.caught, { n: 0 });
    this.board.append(track, this.button(action, () => {
      if (position < start || position > start + width) {
        this.miss(`${fmt(s.caught, { n: count })} · ${s.missed}`);
        return;
      }
      if (++count === 2) return this.solved();
      start = 0.72;
      placeBand();
      this.status.textContent = fmt(s.caught, { n: count });
    }));
  }
}
