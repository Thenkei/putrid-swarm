import type { DeviceTypeId } from '../core/types';
import { TH, TW, type Rot } from './projection';
import { fitGroundFrame, type Foot, type PaintFit } from './registration';

export type DefensePose = 'resting' | 'armed' | 'triggered' | 'broken';
interface Mount { h: number; foot: Foot; fit?: PaintFit }
type Landmark = readonly [x: number, y: number];

// The left and right corners are opposite ends of a diagonal of the stake box.
// Fit both rails to the tile axes and keep the original resting board's 39px span.
function stake(width: number, left: Landmark, near: Landmark, right: Landmark): Mount {
  return fitGroundFrame(width, 130, 39, left, near, right);
}

// Post and rail landmarks are in the same 200-square coordinates as the animations.
// A vertical shear puts the feet on one grid axis and preserves each upright's height.
function rail(h: number, aspect: number, direction: 1 | -1, left: Landmark, right: Landmark, centre: Landmark): Mount {
  const paintedSlope = (right[1] - left[1]) / ((right[0] - left[0]) * aspect);
  const slope = direction * TH / TW;
  const interceptPerHeight = (left[1] - centre[1] - paintedSlope * aspect * (left[0] - centre[0])) / 200;
  return { h, foot: [centre[0] / 200, centre[1] / 200], fit: { shearY: slope - paintedSlope, scaleY: 1, support: { slope, interceptPerHeight } } };
}

const frontFence = rail(42, 169 / 150, 1, [30, 146], [176, 197], [103, 167]);
const backFence = rail(42, 169 / 150, 1, [26, 142], [174, 197], [100, 165]);
type Poses = Record<DefensePose, Mount>;

// Pixel landmarks on the shipped paintings. The front spike cels are 120×130,
// the reverse cels are 121×130. The loose spring is outside the planted frame.
const mounts = {
  spikes: [
    {
      resting:   stake(120, [12, 80], [66, 104], [114, 71]),
      armed:     stake(120, [2, 83],  [55, 106], [104, 73]),
      triggered: stake(120, [13, 78], [64, 99],  [107, 67]),
      broken:    stake(120, [1, 77],  [50, 94],  [94, 68]),
    }, {
      resting:   stake(121, [15, 96], [70, 128], [119, 73]),
      armed:     stake(121, [14, 95], [70, 128], [119, 73]),
      triggered: stake(121, [15, 95], [72, 128], [119, 74]),
      broken:    stake(121, [17, 90], [74, 125], [119, 73]),
    },
  ],
  net: [
    {
      resting:   rail(64, 185 / 190, -1, [46, 195], [158, 167], [102, 176]),
      armed:     rail(64, 185 / 190, -1, [28, 193], [142, 168], [85, 176]),
      triggered: rail(64, 185 / 190, -1, [39, 172], [158, 141], [98.5, 152]),
      broken:    rail(64, 185 / 190, -1, [20, 166], [135, 142], [77.5, 150]),
    }, {
      resting:   rail(64, 184 / 190, -1, [54, 183], [170, 162], [112, 168]),
      armed:     rail(64, 184 / 190, -1, [54, 183], [170, 163], [112, 168]),
      triggered: rail(64, 184 / 190, -1, [58, 184], [170, 162], [114, 168]),
      broken:    rail(64, 184 / 190, -1, [55, 148], [177, 161], [116, 150]),
    },
  ],
  barrier: [
    {
      resting:   rail(54, 186 / 170, -1, [70, 190], [178, 164], [106, 164]),
      armed:     rail(54, 186 / 170, -1, [50, 198], [161, 174], [90, 174]),
      triggered: rail(54, 186 / 170, -1, [55, 186], [164, 161], [99, 165]),
      broken:    rail(54, 186 / 170, -1, [34, 179], [148, 150], [81, 156]),
    }, {
      resting:   rail(54, 187 / 170, -1, [50, 197], [175, 174], [101, 171]),
      armed:     rail(54, 187 / 170, -1, [41, 197], [167, 174], [95, 176]),
      triggered: rail(54, 187 / 170, -1, [41, 197], [167, 174], [95, 176]),
      broken:    rail(54, 187 / 170, -1, [44, 197], [174, 173], [96, 176]),
    },
  ],
  fence: [
    { resting: frontFence, armed: frontFence, triggered: frontFence, broken: rail(42, 169 / 150, 1, [29, 137], [178, 187], [103.5, 158]) },
    { resting: backFence, armed: backFence, triggered: backFence, broken: rail(42, 169 / 150, 1, [24, 134], [176, 197], [100, 162]) },
  ],
} satisfies Record<string, [Poses, Poses]>;

const fixed = {
  flat: [40, [0.5, 0.958], [0.5, 0.953]], deep: [60, [0.5, 0.74], [0.5, 0.74]],
  log: [74, [0.484, 0.833], [0.50, 0.83]], horn: [54, [0.438, 0.83], [0.593, 0.818]],
  floodlight: [78, [0.584, 0.963], [0.573, 0.965]],
} as const;

export function defenseMount(angle: DeviceTypeId | 'flat' | 'deep', pose: DefensePose, rot: Rot): Mount {
  if (angle === 'spikes' || angle === 'net' || angle === 'barrier' || angle === 'fence') return mounts[angle][rot][pose];
  const [h, front, rear] = fixed[angle];
  return { h, foot: rot === 0 ? front : rear };
}
