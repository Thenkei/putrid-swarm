import { DEVICES } from '../core/data/devices';
import { ENEMIES } from '../core/data/enemies';
import { DEVICE_TYPE_IDS, ENEMY_TYPE_IDS, type DeviceTypeId, type EnemyTypeId, type NeighborId } from '../core/types';
import { S } from '../engine/i18n';
import { MOB_ACTIONS, type MobAction } from '../render/infected-motion';

export type GuideEntry = { kind: 'defence'; id: DeviceTypeId } | { kind: 'mob'; id: EnemyTypeId };
export type GuideStage = MobAction | 'ready' | 'impact' | 'active' | 'rearming' | 'broken' | 'hit' | 'fallen';
export const CATALOG: readonly GuideEntry[] = [
  ...DEVICE_TYPE_IDS.map((id) => ({ kind: 'defence' as const, id })),
  ...ENEMY_TYPE_IDS.map((id) => ({ kind: 'mob' as const, id })),
];

export function stagesFor(entry: GuideEntry): readonly GuideStage[] {
  if (entry.kind === 'mob') return [...MOB_ACTIONS[entry.id], 'hit', 'fallen'];
  return entry.id === 'fence' ? ['ready', 'impact', 'broken'] : ['ready', 'active', 'rearming', 'broken'];
}

export function stageName(entry: GuideEntry, stage: GuideStage): string {
  return stage === 'attack' && entry.kind === 'mob' ? S().guide.moves[entry.id] : S().guide.stages[stage];
}

export function entryName(entry: GuideEntry): string {
  return entry.kind === 'defence' ? S().device[entry.id].name : S().enemy[entry.id];
}

const isNeighbour = (id: EnemyTypeId): id is NeighborId => ENEMIES[id].boss !== null;

export function entryText(entry: GuideEntry): { category: string; description: string } {
  const s = S();
  if (entry.kind === 'defence') return { category: s.guide.category[DEVICES[entry.id].mode], description: s.device[entry.id].desc };
  if (isNeighbour(entry.id)) return { category: s.guide.category.boss, description: s.neighbor[entry.id].boss };
  return { category: s.guide.category.infected, description: s.guide.subjects[entry.id] };
}

export function entryArt(entry: GuideEntry): string {
  if (entry.kind === 'defence') return 'dev_' + entry.id + (entry.id === 'fence' ? '_resting' : '_armed');
  return (ENEMIES[entry.id].boss ? 'boss_' : 'en_') + entry.id + '_front';
}

// A long-running device demonstrates several seconds of its effect, then its full
// reset travel fits into a single clip. The game still owns its actual durations.
export function clipLength(entry: GuideEntry, stage: GuideStage): number {
  if (stage === 'ready') return 1.15;
  if (stage === 'active' && entry.kind === 'defence') return Math.min(3, Math.max(1.5, DEVICES[entry.id].activeSeconds));
  if (stage === 'broken' || stage === 'fallen') return 2.15;
  if (stage === 'windup' && entry.kind === 'mob') return Math.max(1, ENEMIES[entry.id].windupSeconds);
  if (stage === 'hit') return 1.1;
  return 1.9;
}
