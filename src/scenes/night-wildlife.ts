type YardSound = 'owl_call' | 'hedge_leaves' | 'hedge_twig';

export interface NightOwl {
  age: number;
  opacity: number;
  /** Seconds since the bird started pushing off the mailbox. */
  flightAge: number | null;
}

const FLIGHT_SECONDS = 2.85;

/** Runs on the watch clock. All cameras share one bird and one sound schedule. */
export class NightWildlife {
  owl: NightOwl | null = null;
  foxAge: number | null = null;
  private nextFox = 0;
  private clock = 0;
  private clearFor = 0;
  private nextVisit = 0;
  private nextTexture: number;
  private twigNext: boolean;
  private called = false;
  private active = false;

  constructor(private readonly random: () => number = Math.random) {
    this.nextTexture = 4 + random() * 5;
    this.twigNext = random() < .35;
  }

  private fly(dt: number): void {
    if (!this.owl) return;
    this.owl.flightAge = (this.owl.flightAge ?? 0) + dt;
    if (this.owl.flightAge >= FLIGHT_SECONDS) this.owl = null;
  }

  hush(dt = 0): boolean {
    const active = this.active;
    this.active = false;
    this.advanceFox(dt);
    this.clearFor = 0;
    this.fly(dt);
    return active;
  }

  private advanceFox(dt: number): void {
    if (this.foxAge === null) return;
    this.foxAge += dt;
    if (this.foxAge >= 2) this.foxAge = null;
  }

  step(dt: number, outside: number, nextSpawn: number | null, speaking: boolean, hedgeDisturbed = false): YardSound | undefined {
    this.active = true;
    this.advanceFox(dt);
    this.clock += dt;
    this.clearFor = outside ? 0 : this.clearFor + dt;
    const room = nextSpawn ?? Infinity;
    if (this.owl && (outside || room <= .45 || this.owl.flightAge !== null)) this.fly(dt);
    else if (!outside && !this.owl && this.clearFor >= .30 && this.clock >= this.nextVisit && room > 1.55) {
      this.owl = { age: 0, opacity: 0, flightAge: null };
      this.called = false;
      this.nextVisit = this.clock + 14 + this.random() * 12;
    }
    if (this.owl?.flightAge === null) {
      this.owl.age += dt;
      this.owl.opacity = Math.min(1, this.owl.age / .18);
      if (!this.called && this.owl.age >= .16 && room > 1.32) {
        this.called = true;
        this.nextTexture = Math.max(this.nextTexture, this.clock + 2.2);
        return 'owl_call';
      }
    }
    if (this.clock < this.nextTexture) return;
    // Recheck after a busy moment instead of unleashing a backlog of sounds.
    if (speaking || hedgeDisturbed || outside > 3 || room < .8) {
      this.nextTexture = this.clock + 1.3 + this.random() * 2;
      return;
    }
    const twig = this.twigNext;
    this.twigNext = !twig && this.random() < .72;
    this.nextTexture = this.clock + 6 + this.random() * 9;
    if (twig && outside <= 1 && this.clock >= this.nextFox && this.random() < .35) {
      this.foxAge = 0;
      this.nextFox = this.clock + 45;
    }
    return twig ? 'hedge_twig' : 'hedge_leaves';
  }
}
