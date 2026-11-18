import { sprite, type Sprite } from '../engine/assets';
import type { Rot } from './projection';
import type { Foot } from './registration';

type Sheet = 'forest_stands' | 'yard_flora' | 'yard_scatter';

interface VegetationView {
  key: string;
  art: Sprite;
  mirror: boolean;
  foot: Foot;
}

/** Each planting has a fixed half-turn in world space. Both painted faces are lit from the
 * upper left of the view; reflecting a single painting would also reflect its lighting. */
export function vegetationView(sheet: Sheet, species: string, facingBack: boolean, rot: Rot): VegetationView | undefined {
  const back = facingBack !== (rot === 1);
  const key = back ? `${sheet}_back_${species}` : `${sheet}_${species}`;
  const art = sprite(key);
  if (art) return { key, art, mirror: false, foot: [art.footX ?? 0.5, art.footY ?? 1] };
  // Missing optional art can still show the other side reflected about its actual root.
  const otherKey = back ? `${sheet}_${species}` : `${sheet}_back_${species}`;
  const other = sprite(otherKey);
  if (other) return { key: otherKey, art: other, mirror: true, foot: [other.footX ?? 0.5, other.footY ?? 1] };
}
