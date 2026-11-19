import type { SectorThreat } from './night';
import type { SectorId } from './types';

interface CameraStatus {
  readonly sector: SectorId;
  readonly threat: SectorThreat;
  readonly doorRatio: number;
  readonly dark: boolean;
  readonly cue: boolean;
}

export interface CameraPriority {
  readonly sector: SectorId;
  readonly reason: 'breached' | 'critical' | 'movement';
}

export function cameraPriority(cameras: readonly CameraStatus[], current: SectorId): CameraPriority | null {
  let target: CameraPriority | null = null;
  let bestRank = 0;
  let bestScore = 0;
  for (const { sector, threat, doorRatio, dark, cue } of cameras) {
    // The door can still be heard after its camera goes dark.
    const count = dark ? 0 : threat.count;
    const score = threat.atDoor * 3 + count + (!dark && threat.boss ? 6 : 0) + (!dark && cue ? 8 : 0);
    if (score === 0) continue;
    const pressured = threat.atDoor > 0 || count > 0;
    const rank = threat.breached && pressured ? 3 : threat.atDoor > 0 && doorRatio <= 0.25 ? 2 : 1;
    if (rank < bestRank || (rank === bestRank && (score < bestScore || (score === bestScore && sector !== current)))) continue;
    target = { sector, reason: rank === 3 ? 'breached' : rank === 2 ? 'critical' : 'movement' };
    bestRank = rank;
    bestScore = score;
  }
  return target;
}
