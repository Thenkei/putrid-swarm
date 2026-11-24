// Scene navigation in one place. Scenes call these instead of constructing each other,
// which keeps the phase order (day → night → morning → …) readable and avoids import knots.

import { coastForNight, finishCoastHome, finishCoastParking, shouldCoastHome, type CoastArrival } from '../core/coast-home';
import { CoastHomeScene } from './coast-home';
import { epicFlag, mopedCargo } from '../core/epics';
import type { ChapterId } from '../core/chapters';
import { LOCATIONS } from '../core/data/locations';
import { LAST_NIGHT } from '../core/data/waves';
import { affordableDevices } from '../core/yard';
import { units } from '../core/encounters';
import { arriveHome, type NeighborMeeting } from '../core/game';
import type { GameState, LocationId } from '../core/types';
import type { App, Scene } from '../engine/app';
import { S, fmt, hours, line } from '../engine/i18n';
import { tripLine } from './common';
import { DayScene, type DayOptions } from './day';
import { EndScene, type EndOptions } from './end';
import { FinaleScene, type FinaleOptions } from './finale';
import { AmbushScene } from './encounter';
import { CrossbowRoadScene } from './crossbow-road';
import { CrossingScene } from './crossing';
import { LocationScene } from './location';
import { MapScene } from './map';
import { MorningScene } from './morning';
import { NightScene, NightfallScene } from './night';
import { OrchardScene } from './orchard';
import { RadioScene } from './radio';
import { ShedScene } from './shed';
import { TitleScene } from './title';
import { TravelScene, type TravelOptions } from './travel';

export const goTitle = (app: App): void => app.go(() => new TitleScene(app));
export const goDay = (app: App, options: DayOptions = {}): void => app.go(() => new DayScene(app, options));
export const goMap = (app: App): void => app.go(() => new MapScene(app));
export const goCrossing = (app: App, id: LocationId): void => app.go(() => new CrossingScene(app, id));
export const goLocation = (app: App, id: LocationId, meeting: NeighborMeeting | null): void => app.go(() => new LocationScene(app, id, meeting));
export const goAmbush = (app: App): void => app.go(() => new AmbushScene(app));
export const goTravel = (app: App, options: TravelOptions): void => app.go(() => new TravelScene(app, options), options.parkingEntry ? 'cut' : 'fade');
export const goNightfall = (app: App): void => app.go(() => new NightfallScene(app));
export const goNight = (app: App): void => app.go(() => new NightScene(app));
export const goMorning = (app: App): void => app.go(() => new MorningScene(app));
export const goEnd = (app: App, options: EndOptions = {}): void => app.go(() => new EndScene(app, options));
export const goOrchard = (app: App): void => app.go(() => new OrchardScene(app));

/** The played chapters: the scene each one is, and the picture a run it ended is remembered by. */
const CHAPTER_SCENES: Readonly<Record<ChapterId, { readonly scene: (app: App) => Scene; readonly endPlate: string }>> = {
  orchard: { scene: (app) => new OrchardScene(app), endPlate: 'plate_orchard_end' },
  shed: { scene: (app) => new ShedScene(app), endPlate: 'plate_shed_end' },
  // Nothing on the radio ends a run: its plate is never shown as an end, it is only the desk it happens at.
  radio: { scene: (app) => new RadioScene(app), endPlate: 'plate_radio' },
};
export const goChapter = (app: App, chapter: ChapterId): void => app.go(() => CHAPTER_SCENES[chapter].scene(app));
export const chapterEndPlate = (chapter: ChapterId): string => CHAPTER_SCENES[chapter].endPlate;
/** How a finished run plays out — a house lost, or the seventh dawn — before the end screen. */
export const goFinale = (app: App, options: FinaleOptions = {}): void => app.go(() => new FinaleScene(app, options));

/** Pulls into the yard: the load joins the refuge's stock, and the day goes on from there. */
function unload(app: App): void {
  const state = app.state;
  const arrival = state ? arriveHome(state) : null;
  if (arrival?.ok) {
    app.state = arrival.value.state;
    app.save();
  }
  goDay(app, { arrivedByCar: arrival?.ok === true, deliveredMoped: !!(arrival?.ok && state && epicFlag(state, 'loaded')) });
  if (state) tripLine('home', state);
}

/**
 * The last stretch of the road: shows what is still in the boot and what was left on the way,
 * then unloads. Nothing is counted as brought home before this.
 */
export function goHomeStretch(app: App, sub = '', ignitionAt?: number, parkingEntry?: CoastArrival): void {
  const state = app.state;
  const outing = state?.outing;
  if (!state || !outing) {
    goDay(app);
    return;
  }
  if (outing.crossbowStop) {
    app.go(() => new CrossbowRoadScene(app, sub));
    return;
  }
  if (shouldCoastHome(state)) {
    app.go(() => {
      TravelScene.prepareParking();
      return new CoastHomeScene(app, (outcome, entry) => {
        app.state = finishCoastHome(state, outcome);
        app.save();
        goHomeStretch(app, sub, undefined, entry);
      });
    });
    return;
  }
  const s = S();
  const moped = epicFlag(state, 'loaded') ? mopedCargo(outing.trunk) : undefined;
  const cargo = moped?.kept ?? outing.trunk;
  const outcome = (outing.coastParking || outing.coastParked) && coastForNight(state);
  const nightHint = outcome === 'followed'
    ? line('Ils nous ont suivis. Ces deux-là seront au portail dès le début de la vague.', 'They followed us. Those two will be at the gate when the wave starts.')
    : outcome === 'quiet' ? line('Ils ont continué leur chemin. Ce soir, ils arriveront avec le reste de la vague.', 'They walked on. Tonight they’ll arrive with the rest of the wave.') : '';
  const tripSummary = sub || (moped ? fmt(s.loc.leaveCost, { h: hours(LOCATIONS[outing.to].travelHours) }) : '');
  const buildable = affordableDevices(state.inventory, cargo, state.hoursLeft).map((type) => s.device[type].name);
  goTravel(app, {
    plate: !moped && units(cargo) > 0 ? 'plate_trunk' : 'plate_return',
    title: s.location.home,
    sub: [tripSummary, nightHint].filter(Boolean).join(' '),
    ...(ignitionAt !== undefined && { ignitionAt }),
    parked: outing.coastParked === true,
    parking: outing.coastParking === true,
    ...(parkingEntry && { parkingEntry }),
    onParked: () => {
      if (!app.state?.outing?.coastParking) return;
      app.state = finishCoastParking(app.state);
      app.save();
    },
    loot: cargo,
    lost: outing.parted,
    ...(moped && { mopedDisplaced: moped.displaced }),
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
      // Resume unfinished road encounters and show the load before delivering the moped.
      else if (state.where === 'road') {
        if (state.encounter) goAmbush(app);
        else if (shouldCoastHome(state) || state.outing?.coastParking || state.outing?.coastParked || state.outing?.crossbowStop || epicFlag(state, 'loaded')) goHomeStretch(app);
        else unload(app);
      }
      else goLocation(app, state.where, null);
      break;
    case 'morning':
      goMorning(app);
      break;
    case 'night':
      goNightfall(app);
      break;
    // A run that is over reopens on its end screen, from which the song can still be played again.
    case 'lost':
    case 'held':
      goEnd(app);
      break;
  }
}

export { LAST_NIGHT };
