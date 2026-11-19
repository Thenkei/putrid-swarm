import type { EnemyTypeId } from '../core/types';
import layout from './mob-gaits.json';

interface MobCycle {
  readonly timing: readonly (readonly [number, 'a' | 'b' | 'p'])[];
  readonly stride: number;
  readonly flex: number;
  readonly lean: number;
  readonly lift: number;
  readonly drag: number;
  readonly mirrorFront?: boolean;
}

const profiles = import.meta.glob<MobCycle>('./mob-cycles/*.json', { eager: true, import: 'default' });

export const mobCycle = (type: EnemyTypeId): MobCycle | undefined => profiles[`./mob-cycles/${type}.json`];

export const mobGaitAssetKey = (type: string): string => `mob_gait_${type}`;

const { columns, frames, cellWidth, cellHeight } = layout;
export const mobGaitSheets = Object.fromEntries(Object.keys(profiles).map((path) => {
  const type = path.slice('./mob-cycles/'.length, -'.json'.length);
  const key = mobGaitAssetKey(type);
  return [key, { file: `sprites/${key}.webp`, w: columns * cellWidth, h: Math.ceil(2 * frames / columns) * cellHeight }];
}));
