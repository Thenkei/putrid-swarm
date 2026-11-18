import { ExtrudeGeometry, Group, Mesh, Shape, TorusGeometry } from 'three';
import { material, part, spar } from './gate-models';
import { fittedWheel, sheetMetal, wagonFinish, wagonPanel, type CarUV } from './wagon-finish';

const wood = '#946e47',
  metal = '#545950';
type Point = [number, number, number];
// A usable spare, a slatted tool chest and the webbing that holds them to the roof rack.
function rackCargo(g: Group): void {
  const spare = fittedWheel();
  spare.position.set(-0.02, 1.56, -0.66);
  g.add(spare);
  const z = -0.025;
  part(g, 0, 1.65, z, 0.79, 0.32, 0.38, wood).material = wagonFinish().wood;
  for (const side of [-1, 1]) {
    for (const x of [-0.31, 0.31]) part(g, x, 1.66, z + side * 0.195, 0.07, 0.32, 0.031, '#715945');
    part(g, 0, 1.66, z + side * 0.2, 0.79, 0.026, 0.025, '#684f3c');
  }
  for (let i = -1; i <= 1; i++) part(g, i * 0.27, 1.821, z, 0.253, 0.043, 0.43, wood).material = wagonFinish().wood;
  for (const x of [-0.245, 0.245]) {
    part(g, x, 1.848, z, 0.058, 0.012, 0.44, '#58635a');
    for (const side of [-1, 1]) part(g, x, 1.65, z + side * 0.219, 0.058, 0.386, 0.018, '#58635a');
    part(g, x, 1.68, z + 0.233, 0.078, 0.068, 0.02, '#ab9b76');
  }
  spar(g, [-0.41, 1.47, -0.86], [-0.28, 1.65, -0.79], 0.04, '#b2a178');
  spar(g, [-0.28, 1.65, -0.79], [0.26, 1.65, -0.52], 0.04, '#b2a178');
  spar(g, [0.26, 1.65, -0.52], [0.48, 1.48, -0.41], 0.04, '#b2a178');
}

const rubber = '#393932',
  enamel = '#cb9842';
function glazing(g: Group, corners: Point[], pixels: CarUV[]): void {
  wagonPanel(g, corners, pixels, wagonFinish().glass);
  for (let i = 0; i < 4; i++) spar(g, corners[i]!, corners[(i + 1) % 4]!, 0.034, rubber);
}

// The outer pressings and wheel arch trim follow the same cutouts as the chassis.
function bodywork(g: Group): void {
  const sill: [number, number][] = [[-1.45, 0.35]];
  for (const hub of [-0.93, 1.0]) {
    for (let i = 0; i <= 14; i++) {
      const a = Math.PI - (i * Math.PI) / 14;
      sill.push([hub + 0.354 * Math.cos(a), 0.32 + 0.354 * Math.sin(a)]);
    }
  }
  sill.push([1.46, 0.34]);
  const belt = (z: number) => (z > 0.81 ? 0.8 - (z - 0.81) * 0.092 : 0.8);
  const shape = new Shape();
  shape.moveTo(-1.45, 0.8);
  shape.lineTo(0.81, 0.8);
  shape.lineTo(1.46, belt(1.46));
  for (const [z, y] of [...sill].reverse()) shape.lineTo(z, y);
  shape.closePath();
  const core = new Mesh(
    new ExtrudeGeometry(shape, { depth: 1.36, bevelEnabled: true, bevelSize: 0.022, bevelThickness: 0.018, bevelSegments: 2 }),
    material(enamel),
  );
  core.rotation.y = -Math.PI / 2;
  core.position.x = 0.68;
  g.add(core);
  // Make the curved bonnet and vertical grille meet at a slightly dropped leading edge.
  sheetMetal(g, 8, 22, (u, t) => {
    const x = (u - 0.5) * 1.408;
    return [x, 0.82 - 0.065 * t + 0.035 * (1 - (x / 0.704) ** 2) + 0.012 * Math.sin(t * Math.PI), 0.81 + 0.674 * t];
  });
  for (const s of [-1, 1]) {
    const lower = (z: number) => {
      const fromHub = Math.min(Math.abs(z + 0.93), Math.abs(z - 1));
      return fromHub < 0.354 ? 0.32 + Math.sqrt(0.354 ** 2 - fromHub ** 2) : 0.35;
    };
    const sideX = (y: number) => 0.704 + 0.021 * Math.sin(Math.PI * Math.min(1, Math.max(0, (y - 0.345) / 0.46)));
    sheetMetal(
      g,
      8,
      100,
      (u, v) => {
        const z = -1.45 + 2.91 * (s === 1 ? u : 1 - u),
          sillY = lower(z);
        const y = sillY + (belt(z) - sillY) * v;
        return [s * sideX(y), y, z];
      },
      true,
    );
    for (let i = 1; i < sill.length; i++) {
      const [za, ya] = sill[i - 1]!,
        [zb, yb] = sill[i]!;
      if (yb > 0.35 || ya > 0.35) {
        spar(g, [s * (sideX(ya) + 0.006), ya, za], [s * (sideX(yb) + 0.006), yb, zb], 0.021, '#735d47');
        spar(g, [s * (sideX(ya + 0.019) + 0.006), ya + 0.019, za], [s * (sideX(yb + 0.019) + 0.006), yb + 0.019, zb], 0.013, '#cba266');
      }
    }
    // Thin recessed lines trace the two doors through the mid-panel pressing.
    for (const [az, bz, bottom] of [
      [-0.76, -0.66, 0.567],
      [-0.23, -0.18, 0.381],
      [0.81, 0.62, 0.386],
    ]) {
      const profile: Point[] = [
        [s * (sideX(0.794) + 0.005), 0.794, az!],
        [s * (sideX(0.654) + 0.005), 0.654, az! - 0.012],
        [s * (sideX(bottom! + 0.036) + 0.005), bottom! + 0.036, bz!],
        [s * (sideX(bottom!) + 0.005), bottom!, bz! - 0.031],
      ];
      for (let k = 1; k < profile.length; k++) spar(g, profile[k - 1]!, profile[k]!, 0.013, '#4f4638');
    }
    spar(g, [s * 0.728, 0.595, -0.69], [s * 0.728, 0.595, 0.6], 0.012, '#c3aa7f');
    for (const z of [-0.1, -0.695]) {
      part(g, s * 0.724, 0.746, z, 0.035, 0.049, 0.146, '#45443c');
      part(g, s * 0.743, 0.75, z, 0.032, 0.018, 0.11, '#b7b09a');
    }
    part(g, s * 0.71, 0.4, -0.01, 0.055, 0.048, 1.19, '#796e56');
    for (const z of [-0.93, 1]) {
      const wheel = fittedWheel();
      wheel.position.set(s * 0.704, 0.321, z);
      wheel.rotation.z = (-s * Math.PI) / 2;
      g.add(wheel);
    }
  }
  const trim = wagonFinish().trim;
  const endPanel = (left: number, right: number, top: number, bottom: number, depth: number, region: CarUV[], material = trim) => {
    wagonPanel(
      g,
      [
        [left, top, depth],
        [right, top, depth],
        [right, bottom, depth],
        [left, bottom, depth],
      ],
      region,
      material,
    );
  };
  endPanel(-0.704, 0.704, 0.754, 0.35, 1.483, [
    [35, 915],
    [594, 915],
    [594, 1100],
    [35, 1100],
  ]);
  endPanel(0.704, -0.704, 0.8, 0.34, -1.479, [
    [663, 849],
    [1220, 849],
    [1220, 1088],
    [663, 1088],
  ]);
  part(g, 0, 0.601, 1.495, 0.69, 0.205, 0.053, '#363a35');
  for (let j = 0; j < 5; j++) {
    const y = 0.524 + j * 0.038,
      py = 1017 - j * 19;
    part(g, 0, y, 1.527, 0.66, 0.012, 0.021, '#847f71');
    endPanel(-0.332, 0.332, y + 0.008, y - 0.008, 1.539, [
      [168, py - 4],
      [465, py - 4],
      [465, py + 3],
      [168, py + 3],
    ]);
  }
  endPanel(-0.043, 0.043, 0.659, 0.557, 1.542, [
    [298, 954],
    [333, 954],
    [333, 998],
    [298, 998],
  ]);
  for (const s of [-1, 1]) {
    const x = s * 0.495,
      px = s < 0 ? 56 : 469;
    part(g, x, 0.61, 1.507, 0.25, 0.205, 0.06, metal);
    endPanel(
      x - 0.109,
      x + 0.109,
      0.692,
      0.534,
      1.546,
      [
        [px, 942],
        [px + 97, 942],
        [px + 97, 1014],
        [px, 1014],
      ],
      wagonFinish().beam,
    );
    part(g, s * 0.661, 0.6, 1.499, 0.083, 0.17, 0.06, '#b87630');
    part(g, s * 0.604, 0.586, -1.495, 0.14, 0.27, 0.046, '#883a2f');
    part(g, s * 0.604, 0.65, -1.524, 0.136, 0.08, 0.022, '#c68038');
  }
  for (const z of [-1.5, 1.51]) {
    part(g, 0, 0.396, z, 1.41, 0.094, 0.115, '#9f9c89');
    for (const s of [-1, 1]) part(g, s * 0.66, 0.391, z * 0.983, 0.118, 0.114, 0.181, rubber);
    part(g, 0, 0.36, z * 1.046, 0.354, 0.112, 0.019, '#a99b76');
    const f = Math.sign(z),
      end = z + f * 0.058,
      l = -f * 0.688,
      r = f * 0.688,
      u = f > 0 ? 29 : 654;
    endPanel(l, r, 0.441, 0.351, end, [
      [u, 1029],
      [u + 562, 1029],
      [u + 562, 1089],
      [u, 1089],
    ]);
    const plateX = f > 0 ? 216 : 847,
      plateY = f > 0 ? 1060 : 939;
    endPanel(-f * 0.175, f * 0.175, 0.414, 0.308, z * 1.046 + f * 0.011, [
      [plateX, plateY],
      [plateX + 200, plateY],
      [plateX + 200, plateY + 41],
      [plateX, plateY + 41],
    ]);
  }
}

function passengerCabin(g: Group): void {
  const top = 1.3,
    belt = 0.808;
  part(g, 0, 0.816, -0.26, 1.3, 0.044, 2.14, '#4b5047');
  // Bench backs, separate front seats and steering wheel show through the sloped glass.
  for (const x of [-0.31, 0.31]) {
    const seat = part(g, x, 0.988, -0.08, 0.47, 0.33, 0.115, '#956f51');
    seat.rotation.x = -0.12;
    for (const dx of [-0.13, 0, 0.13]) part(g, x + dx, 0.993, -0.013, 0.022, 0.275, 0.026, '#b39169');
    part(g, x, 1.183, -0.1, 0.231, 0.115, 0.114, '#967c5b');
  }
  part(g, 0, 0.99, -0.82, 1.11, 0.278, 0.14, '#816951').rotation.x = -0.12;
  part(g, 0, 0.884, 0.51, 1.21, 0.107, 0.37, '#4f5147');
  const wheel = new Mesh(new TorusGeometry(0.114, 0.018, 8, 18), material('#3c4037'));
  wheel.position.set(0.32, 0.977, 0.362);
  wheel.rotation.x = -0.51;
  g.add(wheel);
  for (const s of [-1, 1]) spar(g, [0.32, 0.975, 0.36], [0.32 + s * 0.082, 1.016, 0.333], 0.025, metal);
  glazing(
    g,
    [
      [-0.603, top, 0.42],
      [0.603, top, 0.42],
      [0.69, belt, 0.81],
      [-0.69, belt, 0.81],
    ],
    [
      [155, 690],
      [473, 690],
      [536, 823],
      [91, 823],
    ],
  );
  glazing(
    g,
    [
      [0.603, top, -1.135],
      [-0.603, top, -1.135],
      [-0.69, belt, -1.433],
      [0.69, belt, -1.433],
    ],
    [
      [780, 701],
      [1110, 701],
      [1162, 841],
      [724, 841],
    ],
  );
  for (const s of [-1, 1]) {
    const rails = [
      [-1.135, -1.433],
      [-0.69, -0.76],
      [-0.13, -0.23],
      [0.42, 0.81],
    ] as const;
    for (let i = 1; i < rails.length; i++) {
      const [a, b] = rails[i - 1]!,
        [c, d] = rails[i]!;
      const panes: CarUV[][] = [
        [
          [1048, 124],
          [898, 124],
          [948, 229],
          [1152, 229],
        ],
        [
          [863, 123],
          [693, 123],
          [690, 236],
          [916, 236],
        ],
        [
          [653, 126],
          [526, 130],
          [411, 242],
          [650, 241],
        ],
      ];
      glazing(
        g,
        [
          [s * 0.605, top, a],
          [s * 0.605, top, c],
          [s * 0.692, belt, d],
          [s * 0.692, belt, b],
        ],
        panes[i - 1]!,
      );
    }
    for (const [a, b] of rails) spar(g, [s * 0.608, top, a], [s * 0.695, belt, b], 0.054, enamel);
    spar(g, [s * 0.7, belt, -1.436], [s * 0.7, belt, 0.808], 0.035, '#b1ab90');
    spar(g, [s * 0.607, top, 0.44], [s * 0.607, top, -1.15], 0.042, '#c7af7c');
    spar(g, [s * 0.69, 0.84, 0.61], [s * 0.83, 0.878, 0.57], 0.045, metal);
    part(g, s * 0.842, 0.905, 0.564, 0.145, 0.098, 0.103, '#7b7769');
    part(g, s * 0.842, 0.905, 0.504, 0.119, 0.078, 0.018, '#a9b7ac');
    for (const z of [-1.0, -0.49, 0.3]) part(g, s * 0.51, 1.381, z, 0.065, 0.13, 0.07, metal);
    spar(g, [s * 0.54, 1.49, -1.04], [s * 0.54, 1.49, 0.34], 0.043, metal);
  }
  part(g, 0, 1.308, -0.35, 1.23, 0.063, 1.6, enamel);
  sheetMetal(g, 5, 12, (u, v) => [(u - 0.5) * 1.23, 1.339 + 0.018 * (1 - (2 * u - 1) ** 2), 0.445 - 1.59 * v]);
  for (let i = 0; i < 6; i++) part(g, (i - 2.5) * 0.16, 1.411, -0.35, 0.149, 0.104, 1.34 + (i % 2) * 0.05, wood).material = wagonFinish().wood;
  for (const x of [-0.32, 0.23]) {
    spar(g, [x - 0.22, 0.835, 0.803], [x - 0.03, 0.881, 0.768], 0.02, rubber);
    spar(g, [x - 0.14, 0.872, 0.781], [x + 0.2, 0.901, 0.763], 0.025, rubber);
  }
  spar(g, [0.31, 0.845, -1.422], [-0.25, 0.89, -1.397], 0.023, rubber);
  rackCargo(g);
}
export function stationWagon(): Group {
  const g = new Group();
  bodywork(g);
  passengerCabin(g);
  return g;
}
