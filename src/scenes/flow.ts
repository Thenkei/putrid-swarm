// Scene navigation in one place. Scenes call these instead of constructing each other,
// which keeps the phase order (day → night → morning → …) readable and avoids import knots.

import { LAST_NIGHT } from '../core/data/waves';
import type { Encounter } from '../core/game';
import type { GameState, Inventory, LocationId } from '../core/types';
import type { App } from '../engine/app';
import { DayScene } from './day';
import { EndScene } from './end';
import { LocationScene } from './location';
import { MapScene } from './map';
import { MorningScene } from './morning';
import { NightScene, NightfallScene } from './night';
import { TitleScene } from './title';
import { TravelScene, type TravelOptions } from './travel';

export const goTitle = (app: App): void => app.go(() => new TitleScene(app));
export const goDay = (app: App, options: { reveal?: boolean } = {}): void => app.go(() => new DayScene(app, options));
export const goMap = (app: App): void => app.go(() => new MapScene(app));
export const goLocation = (app: App, id: LocationId, encounter: Encounter | null, leftWith?: Inventory): void =>
  app.go(() => new LocationScene(app, id, encounter, leftWith));
export const goTravel = (app: App, options: TravelOptions): void => app.go(() => new TravelScene(app, options));
export const goNightfall = (app: App): void => app.go(() => new NightfallScene(app));
export const goNight = (app: App): void => app.go(() => new NightScene(app));
export const goMorning = (app: App): void => app.go(() => new MorningScene(app));
export const goEnd = (app: App): void => app.go(() => new EndScene(app));

/** Puts a loaded save back on the right screen. */
export function resumeGame(app: App, state: GameState): void {
  app.state = state;
  switch (state.phase) {
    case 'day':
      if (state.where === 'home') goDay(app);
      else goLocation(app, state.where, null);
      break;
    case 'morning':
      goMorning(app);
      break;
    case 'night':
      goNightfall(app);
      break;
    case 'lost':
    case 'won':
      goEnd(app);
      break;
  }
}

export { LAST_NIGHT };
