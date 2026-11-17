// Scene navigation in one place. Scenes call these instead of constructing each other,
// which keeps the phase order (day → night → morning → …) readable and avoids import knots.

import { LAST_NIGHT } from '../core/data/waves';
import { affordableDevices } from '../core/yard';
import { units } from '../core/encounters';
import { arriveHome, type NeighborMeeting } from '../core/game';
import type { GameState, LocationId } from '../core/types';
import type { App } from '../engine/app';
import { S, fmt } from '../engine/i18n';
import { tripLine } from './common';
import { DayScene } from './day';
import { EndScene } from './end';
import { AmbushScene } from './encounter';
import { LocationScene } from './location';
import { MapScene } from './map';
import { MorningScene } from './morning';
import { NightScene, NightfallScene } from './night';
import { TitleScene } from './title';
import { TravelScene, type TravelOptions } from './travel';

export const goTitle = (app: App): void => app.go(() => new TitleScene(app));
export const goDay = (app: App, options: { reveal?: boolean } = {}): void => app.go(() => new DayScene(app, options));
export const goMap = (app: App): void => app.go(() => new MapScene(app));
export const goLocation = (app: App, id: LocationId, meeting: NeighborMeeting | null): void => app.go(() => new LocationScene(app, id, meeting));
export const goAmbush = (app: App): void => app.go(() => new AmbushScene(app));
export const goTravel = (app: App, options: TravelOptions): void => app.go(() => new TravelScene(app, options));
export const goNightfall = (app: App): void => app.go(() => new NightfallScene(app));
export const goNight = (app: App): void => app.go(() => new NightScene(app));
export const goMorning = (app: App): void => app.go(() => new MorningScene(app));
export const goEnd = (app: App): void => app.go(() => new EndScene(app));

/** Pulls into the yard: the load joins the refuge's stock, and the day goes on from there. */
function unload(app: App): void {
  const state = app.state;
  if (state) {
    const arrival = arriveHome(state);
    if (arrival.ok) {
      app.state = arrival.value.state;
      app.save();
    }
  }
  goDay(app);
  if (state) tripLine('home', state.day);
}

/**
 * The last stretch of the road: shows what is still in the boot and what was left on the way,
 * then unloads. Nothing is counted as brought home before this.
 */
export function goHomeStretch(app: App, sub = ''): void {
  const state = app.state;
  const outing = state?.outing;
  if (!state || !outing) {
    goDay(app);
    return;
  }
  const s = S();
  const buildable = affordableDevices(state.inventory, outing.trunk, state.hoursLeft).map((type) => s.device[type].name);
  goTravel(app, {
    plate: units(outing.trunk) > 0 ? 'plate_trunk' : 'plate_return',
    title: s.location.home,
    sub,
    loot: outing.trunk,
    lost: outing.parted,
    note: buildable.length > 0 ? fmt(s.encounter.arrival.canBuild, { list: buildable.join(', ') }) : s.encounter.arrival.cannotBuild,
    next: () => unload(app),
  });
}

/** Puts a loaded save back on the right screen. */
export function resumeGame(app: App, state: GameState): void {
  app.state = state;
  switch (state.phase) {
    case 'day':
      if (state.where === 'home') goDay(app);
      // A save made on the road: whoever barred it is still there; otherwise the drive is simply over.
      else if (state.where === 'road') state.encounter ? goAmbush(app) : unload(app);
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
