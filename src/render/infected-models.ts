import { Group, Mesh, MeshLambertMaterial, MeshStandardMaterial, TorusGeometry, Vector3 } from 'three';
import { ENEMIES } from '../core/data/enemies';
import { animateInfected, collapseInfected, type ActorJoints, type MobPose, type MobFall } from './infected-motion';
import type { EnemyTypeId } from '../core/types';
import { paintedFace } from './painted-surfaces';
import { castor, dressEquipment, loudhailer } from './infected-equipment';
import { material, part, spar } from './gate-models';
import { armAndHand, cap, legAndBoot, occupationalTorso, torso, uniformCap } from './infected-sculpt';
import { addInfectedHead, type InfectedDetail } from './infected-head';
import { animalFeatures, animalFoot, furShell, type HideSection } from './infected-animals';
import { batch, solid } from './yard-meshes';

interface Rig {
  body: Group;
  head: Group;
  limbs: Group[];
  equipment: Group | null;
  mechanism: Group | null;
  reel: Group | null;
}
// Give skin and clothing a minimum signal in the blue surveillance exposure. A short
// emissive flash follows the simulation's hit timer and is shared by actors in the same state.
const infrared = new Map<MeshLambertMaterial, [MeshLambertMaterial, MeshLambertMaterial]>();
// Cool grazing light separates turning shoulders and faces from the ground on the night
// monitor. Sampling the actual cloth colour lets dark folds retain their contrast.
function sensorRim(material: MeshLambertMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `
      vec3 eye = isOrthographic ? vec3(0.,0.,1.) : normalize(vViewPosition);
      float edge = 1. - clamp(dot(normal,eye),0.,1.);
      float sky = smoothstep(-0.38,0.76,dot(normal,vec3(-0.48,0.79,0.37)));
      outgoingLight += vec3(.13,.165,.16) * edge*edge*sky + diffuseColor.rgb*0.13;
      #include <opaque_fragment>
    `,
    );
  };
}
const rigs = new Map<string, Rig>();

type AnimalId = Extract<EnemyTypeId, 'dog' | 'deer' | 'boar'>;
const flanks: Record<AnimalId, HideSection[]> = {
  dog: [
    [-0.61, 0.65, 0.044, 0.08],
    [-0.45, 0.68, 0.168, 0.234],
    [-0.16, 0.69, 0.132, 0.166],
    [0.13, 0.64, 0.196, 0.254],
    [0.35, 0.67, 0.181, 0.248],
    [0.49, 0.7, 0.108, 0.145],
  ],
  boar: [
    [-0.66, 0.71, 0.065, 0.15],
    [-0.48, 0.77, 0.265, 0.312],
    [-0.14, 0.84, 0.336, 0.39],
    [0.18, 0.86, 0.36, 0.445],
    [0.43, 0.77, 0.298, 0.351],
    [0.56, 0.68, 0.185, 0.242],
  ],
  deer: [
    [-0.68, 1.09, 0.035, 0.09],
    [-0.5, 1.09, 0.164, 0.222],
    [-0.19, 1.1, 0.144, 0.199],
    [0.12, 1.07, 0.171, 0.237],
    [0.34, 1.09, 0.168, 0.281],
    [0.46, 1.18, 0.114, 0.187],
  ],
};
const muzzles: Record<AnimalId, HideSection[]> = {
  dog: [
    [0.33, 0.69, 0.13, 0.152],
    [0.49, 0.73, 0.182, 0.175],
    [0.64, 0.69, 0.161, 0.165],
    [0.77, 0.63, 0.12, 0.102],
    [0.9, 0.6, 0.068, 0.069],
  ],
  boar: [
    [0.32, 0.74, 0.22, 0.27],
    [0.49, 0.7, 0.27, 0.266],
    [0.71, 0.58, 0.193, 0.215],
    [0.88, 0.48, 0.137, 0.138],
    [0.96, 0.47, 0.09, 0.073],
  ],
  deer: [
    [0.27, 1.19, 0.113, 0.212],
    [0.38, 1.36, 0.115, 0.218],
    [0.48, 1.51, 0.126, 0.144],
    [0.62, 1.48, 0.115, 0.136],
    [0.76, 1.405, 0.064, 0.064],
  ],
};
function model(type: EnemyTypeId, detail: InfectedDetail): Rig {
  const body = new Group();
  const head = new Group();
  // These pieces move independently of the torso, including after a body lands.
  const equipment = new Group(),
    mechanism = new Group(),
    reel = new Group();
  const gearPivot = new Vector3(),
    mechanismPivot = new Vector3();
  const limbs: Group[] = [];
  const animal = type === 'dog' || type === 'deer' || type === 'boar';
  const art = (type === 'shambler' || type === 'brute' || type === 'runner' || animal ? 'en_' : 'boss_') + type;
  const legLength = type === 'deer' ? 0.88 : type === 'dog' ? 0.42 : type === 'boar' ? 0.36 : 0.69;
  const limb = (x: number, y: number, z: number, arm: boolean, index: number): void => {
    const upper = new Group(),
      lower = new Group();
    const length = arm ? (type === 'brute' ? 0.66 : 0.59) : legLength;
    const jointY = -length * 0.53,
      jointZ = animal && z < 0 ? -0.048 : 0.055;
    if (animal) {
      const width = type === 'boar' ? 0.14 : 0.092;
      const tipZ = z < 0 ? -0.022 : 0.025;
      const upperY = type === 'boar' ? 0.29 : type === 'dog' ? 0.22 : 0.26;
      furShell(
        upper,
        type,
        [
          [upperY, width * 0.04, width * 0.33, width * 0.41],
          [upperY * 0.57, -0.015, width * 1.07, width * 1.06],
          [0.018, 0.005, width * 1.04, width * 1.01],
          [jointY * 0.54, jointZ * 0.4, width * 0.77, width * 0.83],
          [jointY - 0.026, jointZ, width * 0.54, width * 0.58],
        ],
        'leg',
      );
      furShell(
        lower,
        type,
        [
          [jointY + 0.028, jointZ, width * 0.53, width * 0.58],
          [jointY - 0.043, jointZ, width * 0.58, width * 0.63],
          [-length + 0.1, tipZ, width * 0.37, width * 0.46],
          [-length + 0.044, tipZ + 0.014, width * 0.42, width * 0.52],
        ],
        'leg',
      );
      animalFoot(lower, type, length, tipZ, width);
    } else if (arm) {
      armAndHand(upper, lower, type, Math.sign(x), length, jointY, jointZ);
    } else {
      legAndBoot(upper, lower, type, Math.sign(x), length, jointY, jointZ);
    }
    const segment = batch(upper);
    lower.position.set(0, -jointY, -jointZ);
    const hinge = batch(lower);
    hinge.position.set(0, jointY, jointZ);
    hinge.name = 'hinge';
    segment.add(hinge);
    segment.position.set(x, y, z);
    segment.name = 'limb-' + index;
    limbs.push(segment);
  };
  if (animal) {
    const thick = type === 'boar' ? 0.66 : 0.42;
    const coat = flanks[type],
      face = muzzles[type];
    furShell(body, type, coat, 'flank');
    furShell(head, type, face, 'face');
    animalFeatures(head, type);
    for (const side of [-1, 1]) for (const end of [-1, 1]) limb(side * thick * 0.35, legLength, end * 0.39, false, limbs.length);
    if (type === 'dog') {
      const collar = new Mesh(new TorusGeometry(0.149, 0.022, 8, 20), material('#936543'));
      collar.position.set(0, 0.72, 0.45);
      collar.scale.y = 1.11;
      collar.rotation.x = -0.35;
      body.add(collar);
      mechanismPivot.set(0, 0.62, 0.64);
      solid(mechanism, 0, 0.562, 0.746, 0.153, 0.067, 0.253, '#6e584b');
      solid(mechanism, 0, 0.588, 0.751, 0.128, 0.029, 0.217, '#694541');
      for (const side of [-1, 1]) {
        solid(mechanism, side * 0.052, 0.606, 0.799, 0.029, 0.051, 0.03, '#d4bd8d', 'cone');
        solid(head, side * 0.065, 0.6, 0.79, 0.038, 0.073, 0.039, '#e8d7ac', 'cone').rotation.z = Math.PI;
      }
    }
    const tail = type === 'dog' ? 0.64 : type === 'deer' ? 0.23 : 0.3,
      rump = coat[0]!;
    gearPivot.set(0, rump[1] + 0.1, rump[0] + 0.13);
    furShell(
      equipment,
      type,
      [
        [rump[0] - tail * 0.83, rump[1] - 0.095, 0.013, 0.016],
        [rump[0] - tail * 0.59, rump[1] - 0.06, 0.04, 0.051],
        [rump[0] - tail * 0.28, rump[1] + 0.023, 0.047, 0.058],
        [rump[0] + 0.04, rump[1] + 0.083, 0.043, 0.052],
        [rump[0] + 0.15, rump[1] + 0.102, 0.029, 0.038],
      ],
      'tail',
    );
  } else {
    if (type === 'shambler' || type === 'runner' || type === 'brute') torso(body, type);
    else occupationalTorso(body, type);
    if (type === 'runner') {
      cap(head, true);
      const wheel = new Group();
      wheel.position.set(0.13, 1.17, -0.168);
      wheel.rotation.set(0.12, -0.1, -0.24);
      wheel.add(new Mesh(new TorusGeometry(0.376, 0.025, 6, 28), material('#635043')));
      wheel.add(new Mesh(new TorusGeometry(0.351, 0.011, 5, 28), material('#baa88a')));
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5;
        spar(wheel, [0, 0, i % 2 ? -0.022 : 0.022], [Math.sin(a) * 0.35, Math.cos(a) * 0.35, 0], 0.012, '#b5a785', true);
      }
      gearPivot.copy(wheel.position);
      equipment.add(wheel);
      spar(body, [-0.16, 1.4, 0.206], [0.18, 0.88, 0.111], 0.032, '#76553c');
    } else if (type === 'brute') {
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const link = solid(body, 0.31 - 0.083 * t, 1.44 - 0.5 * t, 0.206 + 0.183 * Math.sin(t * Math.PI * 0.64), 0.095, 0.128, 0.089, '#89422e');
        link.rotation.z = -0.21;
      }
    } else if (type === 'shambler') {
      cap(head, false);
    }
    // A separate neck and jaw maintain the profile as the skull turns.
    solid(body, 0, 1.46, 0.114, 0.22, 0.25, 0.22, '#938972');

    for (const s of [-1, 1]) {
      limb(s * (type === 'brute' ? 0.174 : type === 'runner' ? 0.112 : 0.131), 0.69, 0, false, limbs.length);
      limb(s * (type === 'brute' ? 0.393 : type === 'runner' ? 0.238 : 0.269), 1.36, 0.04, true, limbs.length);
    }
    if (type === 'mail' || type === 'chief') {
      const peak = new Group();
      uniformCap(peak, type === 'chief');
      peak.position.y = 0.032;
      head.add(peak);
    }
    if (type === 'mail') {
      spar(body, [-0.23, 1.4, 0.21], [0.25, 0.85, 0.21], 0.075, '#ac8151');
      gearPivot.set(0.28, 1.014, -0.015);
      mechanismPivot.set(0.3, 1.014, 0.04);
      part(equipment, 0.28, 0.84, 0, 0.24, 0.36, 0.38, '#966d44');
      for (const sign of [-1, 1])
        paintedFace(
          equipment,
          art + '_front',
          [
            [0.28 + 0.123 * sign, 1.025, 0.18],
            [0.28 + 0.123 * sign, 1.025, -0.18],
            [0.28 + 0.123 * sign, 0.67, -0.18],
            [0.28 + 0.123 * sign, 0.67, 0.18],
          ],
          [
            [368, 239],
            [430, 211],
            [464, 272],
            [394, 303],
          ],
        );
      part(equipment, 0.402, 0.918, 0.004, 0.029, 0.146, 0.356, '#a5764b').rotation.z = -0.08;
      part(equipment, 0.414, 0.874, -0.018, 0.018, 0.087, 0.046, '#bda574');
      // Letters fan out of the tilted leather flap on impact.
      for (let i = 0; i < 3; i++) {
        const letter = new Group();
        letter.position.set(0.291 + i * 0.025, 1.014 + i * 0.023, 0.045 - i * 0.044);
        letter.rotation.set(0.12, 0.1 + i * 0.27, 0.04 - i * 0.095);
        part(letter, 0, 0, 0, 0.065, 0.137, 0.198, i === 1 ? '#bdab83' : '#e3cda0');
        part(letter, 0.035, 0.039, 0.041, 0.012, 0.039, 0.042, '#98614f');
        mechanism.add(letter);
      }
    } else if (type === 'mayor') {
      spar(body, [-0.2, 1.4, 0.24], [0.21, 0.89, 0.24], 0.09, '#e8ccac');
      gearPivot.set(0, 0.14, 0.04);
      mechanismPivot.set(0.255, 1.27, 0.394);
      loudhailer(mechanism);
      // The mayor addresses the crowd from a wheeled lectern.
      part(equipment, 0, 0.26, 0.04, 0.99, 0.2, 1.04, '#97744d');
      part(equipment, 0, 0.69, 0.38, 0.74, 0.74, 0.18, '#966643');
      part(equipment, 0, 1.06, 0.38, 0.88, 0.09, 0.34, '#ce9e6d');
      paintedFace(
        equipment,
        art + '_front',
        [
          [-0.37, 1.055, 0.477],
          [0.37, 1.055, 0.477],
          [0.37, 0.327, 0.477],
          [-0.37, 0.327, 0.477],
        ],
        [
          [192, 266],
          [354, 237],
          [354, 403],
          [191, 428],
        ],
      );
      paintedFace(
        equipment,
        art + '_front',
        [
          [0.37, 1.055, 0.284],
          [-0.37, 1.055, 0.284],
          [-0.37, 0.327, 0.284],
          [0.37, 0.327, 0.284],
        ],
        [
          [192, 266],
          [354, 237],
          [354, 403],
          [191, 428],
        ],
      );
      for (const side of [-1, 1]) {
        part(equipment, side * 0.45, 0.45, -0.025, 0.035, 0.055, 0.87, '#ac8d64');
        for (const z of [-0.41, 0.35]) part(equipment, side * 0.45, 0.35, z, 0.04, 0.25, 0.055, '#716951');
      }
      part(equipment, -0.32, 0.47, -0.29, 0.22, 0.27, 0.24, '#5a6255');
      for (const x of [-0.38, -0.25]) part(equipment, x, 0.63, -0.29, 0.045, 0.045, 0.055, '#b79f78');
      for (const x of [-0.48, 0.48]) for (const z of [-0.34, 0.4]) castor(equipment, 'mayor', x, 0.15, z, 0.145, 0.11);
      for (const x of [-0.355, 0.355]) {
        part(equipment, x, 0.667, 0.381, 0.045, 0.724, 0.202, '#97744d');
        for (const y of [0.406, 0.95]) part(equipment, x, y, 0.491, 0.037, 0.032, 0.031, '#bfa378', true).rotation.x = Math.PI / 2;
      }
      const papers = part(equipment, 0.06, 1.118, 0.381, 0.376, 0.017, 0.235, '#d8c99f');
      papers.rotation.y = 0.17;
      part(equipment, 0.061, 1.131, 0.375, 0.27, 0.013, 0.183, '#ebd9b0').rotation.y = -0.09;
      for (const x of [-0.465, 0.465]) {
        spar(equipment, [x, 0.319, -0.489], [x, 0.563, -0.518], 0.046, '#ac8d64');
        spar(equipment, [x, 0.538, -0.519], [x, 0.551, 0.259], 0.042, '#ac8d64');
      }
    } else if (type === 'chief') {
      part(body, -0.13, 1.27, 0.259, 0.09, 0.12, 0.04, '#e0bc68');
      gearPivot.set(-0.32, 1.04, 0.333);
      part(equipment, -0.32, 0.9, 0.34, 0.43, 0.94, 0.11, '#716e5d').rotation.z = -0.09;
      paintedFace(
        equipment,
        art + '_front',
        [
          [-0.49, 1.38, 0.406],
          [-0.063, 1.34, 0.406],
          [-0.145, 0.407, 0.406],
          [-0.593, 0.446, 0.406],
        ],
        [
          [74, 154],
          [225, 179],
          [160, 488],
          [10, 459],
        ],
      );
      for (const x of [-0.491, -0.15]) {
        for (const y of [0.575, 1.134]) solid(equipment, x, y, 0.407, 0.041, 0.041, 0.024, '#bdad86');
      }
      // Recessed grips and edge binding show the reverse when the shield slides across the ground.
      for (const x of [-0.433, -0.214]) {
        for (const y of [0.78, 1.044]) part(equipment, x, y, 0.267, 0.044, 0.048, 0.081, '#bfa378');
        spar(equipment, [x, 0.78, 0.227], [x, 1.044, 0.227], 0.046, '#694e3b');
      }
      for (const x of [-0.521, -0.107]) part(equipment, x, 0.903, 0.345, 0.036, 0.894, 0.117, '#746d59').rotation.z = -0.09;
      // The whistle rises with the officer's right hand when the nearby mob surges.
      mechanismPivot.set(0.2, 1.326, 0.272);
      part(mechanism, 0.2, 1.326, 0.29, 0.075, 0.063, 0.117, '#c4af81', true).rotation.x = Math.PI / 2;
      part(mechanism, 0.2, 1.331, 0.235, 0.04, 0.036, 0.055, '#d5c5a2');
      part(body, 0.25, 0.94, 0.16, 0.11, 0.23, 0.1, '#585447');
    } else if (type === 'mechanic') {
      gearPivot.set(0.42, 0.12, 0.13);
      mechanismPivot.set(0.46, 1.867, 0.915);
      for (const x of [0.22, 0.75]) {
        part(equipment, x, 0.2, 0.38, 0.105, 0.16, 1.19, '#9e5539');
        for (const z of [-0.06, 0.82]) {
          castor(equipment, 'mechanic', x, 0.097, z, 0.097, 0.083);
          part(equipment, x, 0.168, z, 0.124, 0.063, 0.139, '#998e75');
        }
      }
      spar(equipment, [0.45, 0.24, 0.02], [0.46, 1.73, 0.17], 0.14, '#ab5b3d');
      spar(equipment, [0.46, 1.73, 0.17], [0.46, 1.88, 0.92], 0.115, '#aa6542');
      // The last links come down with the engine; the first stays on the raised arm.
      for (let i = 0; i < 7; i++) {
        const link = new Mesh(new TorusGeometry(0.034, 0.009, 5, 10), material('#6c6759'));
        link.position.set(0.46, 1.833 - i * 0.057, 0.92);
        link.scale.y = 1.35;
        link.rotation.y = ((i % 2) * Math.PI) / 2;
        (i === 0 ? equipment : mechanism).add(link);
      }
      part(mechanism, 0.46, 1.23, 0.88, 0.45, 0.3, 0.38, '#706d5b');
      for (const sign of [-1, 1]) {
        paintedFace(
          mechanism,
          art + '_front',
          [
            [0.235, 1.383, 0.88 + sign * 0.193],
            [0.685, 1.383, 0.88 + sign * 0.193],
            [0.685, 1.075, 0.88 + sign * 0.193],
            [0.235, 1.075, 0.88 + sign * 0.193],
          ],
          [
            [368, 217],
            [519, 232],
            [510, 343],
            [363, 337],
          ],
        );
        spar(mechanism, [0.46, 1.66, 0.92], [0.46 + sign * 0.19, 1.38, 0.89], 0.027, '#76664e');
      }
      paintedFace(
        mechanism,
        art + '_front',
        [
          [0.242, 1.38, 1.073],
          [0.678, 1.38, 1.073],
          [0.678, 1.084, 1.073],
          [0.242, 1.084, 1.073],
        ],
        [
          [352, 226],
          [469, 229],
          [459, 344],
          [347, 331],
        ],
      );
      for (const r of [-1, 1]) {
        part(mechanism, 0.46 + r * 0.228, 1.216, 0.902, 0.22, 0.041, 0.22, '#746d59', true).rotation.z = Math.PI / 2;
        part(mechanism, 0.46 + r * 0.254, 1.216, 0.902, 0.118, 0.032, 0.118, '#c2a771', true).rotation.z = Math.PI / 2;
      }
      part(equipment, 0.436, 1.655, 0.276, 0.217, 0.317, 0.047, '#694e3b');
      paintedFace(
        equipment,
        art + '_front',
        [
          [0.335, 1.805, 0.301],
          [0.531, 1.805, 0.301],
          [0.531, 1.51, 0.301],
          [0.335, 1.51, 0.301],
        ],
        [
          [312, 53],
          [363, 54],
          [360, 133],
          [308, 135],
        ],
      );
      part(equipment, 0.43, 1.804, 0.304, 0.083, 0.038, 0.024, '#bfa378');
      for (const x of [0.29, 0.655]) {
        spar(equipment, [x, 0.251, 0.01], [0.46, 0.68, 0.087], 0.062, '#9e5539');
        part(equipment, x, 0.266, 0.009, 0.061, 0.046, 0.061, '#bfa378', true);
      }
      for (const z of [0.791, 0.976]) {
        part(mechanism, 0.46, 1.39, z, 0.389, 0.071, 0.08, '#918777');
        for (const x of [0.345, 0.565]) part(mechanism, x, 1.443, z, 0.058, 0.045, 0.052, '#685f4d', true);
      }
      spar(equipment, [0.42, 0.32, 0.11], [0.46, 1.35, 0.4], 0.057, '#9b9485', true);
      part(equipment, 0.46, 1.73, 0.17, 0.158, 0.105, 0.158, '#b09a76', true).rotation.z = Math.PI / 2;
      spar(equipment, [0.04, 1.108, 0.205], [0.433, 1.108, 0.169], 0.047, '#746d59');
      spar(equipment, [0.429, 1.108, 0.169], [0.46, 1.108, 0.094], 0.047, '#998e75');
    } else if (type === 'mower') {
      gearPivot.set(0, 0.155, 0.71);
      mechanismPivot.set(0, 0.51, 0.556);
      part(equipment, 0, 0.214, 0.696, 0.782, 0.084, 0.637, '#986244');
      for (const side of [-1, 1]) part(equipment, side * 0.355, 0.315, 0.818, 0.065, 0.203, 0.489, '#986244');
      part(equipment, 0, 0.421, 0.769, 0.7, 0.041, 0.426, '#986244');
      const axle = part(reel, 0, 0.302, 0.922, 0.083, 0.705, 0.083, '#b4a17a', true);
      axle.rotation.z = Math.PI / 2;
      for (let i = 0; i < 4; i++) {
        for (let span = 0; span < 4; span++) {
          const edge = (t: number): [number, number, number] => [
            -0.344 + 0.688 * t,
            0.296 + 0.103 * Math.cos((i * Math.PI) / 2 + t * 1.56),
            0.923 + 0.104 * Math.sin((i * Math.PI) / 2 + t * 1.56),
          ];
          spar(reel, edge(span / 4), edge((span + 1) / 4), 0.026, '#bfa378');
        }
      }
      part(equipment, 0, 0.248, 1.061, 0.788, 0.035, 0.034, '#986244');
      for (const x of [-0.13, -0.066, 0, 0.066, 0.13]) part(mechanism, x, 0.595, 0.74, 0.032, 0.018, 0.27, '#838372');
      for (const s of [-1, 1]) {
        spar(equipment, [s * 0.32, 0.36, 0.68], [s * 0.27, 1.08, 0.28], 0.055, '#ada997');
        castor(equipment, 'mower', s * 0.415, 0.226, 0.839, 0.223, 0.111);
        castor(equipment, 'mower', s * 0.283, 0.104, 0.481, 0.089, 0.079);
      }
      part(mechanism, 0, 0.544, 0.757, 0.536, 0.077, 0.424, '#a47753');
      for (const x of [-0.22, 0.22]) {
        part(mechanism, x, 0.547, 0.758, 0.033, 0.069, 0.35, '#886349');
        part(equipment, x, 0.291, 1.1, 0.077, 0.077, 0.13, '#b39a70', true);
      }
      part(equipment, 0.222, 0.45, 0.778, 0.17, 0.117, 0.144, '#7f7461', true).rotation.z = Math.PI / 2;
      spar(equipment, [-0.276, 1.076, 0.281], [0.276, 1.076, 0.281], 0.063, '#746d59');
    }
  }
  const neckY = animal ? legLength + 0.17 : 1.46,
    neckZ = animal ? 0.41 : 0.115;
  head.position.set(0, -neckY, -neckZ);
  const skull = batch(head);
  if (!animal) addInfectedHead(skull, type, detail);
  skull.position.set(0, neckY, neckZ);
  if (!animal) skull.scale.set(type === 'brute' ? 1.13 : 0.93, type === 'brute' ? 1.02 : 1.08, 0.97);
  const pivotPiece = (piece: Group, pivot: Vector3): Group | null => {
    if (!piece.children.length) return null;
    piece.position.copy(pivot).negate();
    const node = batch(piece);
    node.position.copy(pivot);
    return node;
  };
  dressEquipment(equipment, type);
  dressEquipment(mechanism, type, true);
  dressEquipment(reel, type);
  return {
    body: batch(body),
    head: skull,
    limbs,
    equipment: pivotPiece(equipment, gearPivot),
    mechanism: pivotPiece(mechanism, mechanismPivot),
    reel: pivotPiece(reel, new Vector3(0, 0.302, 0.922)),
  };
}

export class InfectedFigure {
  readonly root = new Group();
  private readonly joints: ActorJoints;
  private readonly surfaces: { mesh: Mesh; pair: [MeshLambertMaterial, MeshLambertMaterial] }[] = [];
  private flashing = false;
  constructor(
    private readonly type: EnemyTypeId,
    detail: InfectedDetail = 'camera',
  ) {
    const key = type + ':' + detail;
    let rig = rigs.get(key);
    if (!rig) {
      rig = model(type, detail);
      rigs.set(key, rig);
    }
    const puppet = new Group(),
      head = rig.head.clone();
    const limbs = rig.limbs.map((segment) => segment.clone());
    for (const limb of limbs) limb.rotation.order = 'YXZ';
    const hinges = limbs.map((segment) => segment.getObjectByName('hinge') as Group);
    puppet.add(rig.body.clone(), head, ...limbs);
    this.root.add(puppet);
    const gear = rig.equipment?.clone(),
      mechanism = rig.mechanism?.clone();
    const vehicle = type === 'mechanic' || type === 'mower' || type === 'mayor';
    const gearCarrier = vehicle ? this.root : puppet;
    if (gear) gearCarrier.add(gear);
    const carrier = type === 'dog' ? head : type === 'mail' || type === 'mechanic' || type === 'mower' ? gear! : puppet;
    if (mechanism) {
      carrier.add(mechanism);
      if (carrier !== puppet) mechanism.position.sub(carrier.position);
    }
    const reel = rig.reel?.clone();
    if (reel && gear) {
      reel.position.sub(gear.position);
      gear.add(reel);
    }
    this.joints = {
      root: this.root,
      gripTarget: new Vector3(),
      puppet,
      head,
      limbs,
      hinges,
      reel: reel ?? null,
      gear: gear ? { node: gear, rest: gear.position.clone(), carrier: gearCarrier } : null,
      mechanism: mechanism ? { node: mechanism, rest: mechanism.position.clone(), carrier } : null,
    };
    this.root.traverse((mesh) => {
      if (!(mesh instanceof Mesh)) return;
      const source = mesh.material as MeshLambertMaterial;
      let pair = infrared.get(source);
      if (!pair) {
        const normal = source.clone(),
          hit = source.clone();
        if (source instanceof MeshStandardMaterial) normal.emissive.setRGB(0.002, 0.0025, 0.002);
        else if (source.map && !source.vertexColors) {
          normal.emissive.setRGB(0.23, 0.21, 0.17);
          normal.emissiveMap = source.map;
        } else normal.emissive.addScalar(source.map ? 0.006 : 0.023);
        hit.emissive.setRGB(0.68, 0.47, 0.23);
        if (!(source instanceof MeshStandardMaterial)) sensorRim(normal);
        pair = [normal, hit];
        infrared.set(source, pair);
      }
      mesh.material = pair[0];
      this.surfaces.push({ mesh, pair });
    });
    this.root.scale.setScalar(ENEMIES[type].size * (type === 'dog' ? 1.14 : 1));
  }
  private flash(on: boolean): void {
    if (on === this.flashing) return;
    this.flashing = on;
    for (const { mesh, pair } of this.surfaces) mesh.material = on ? pair[1] : pair[0];
  }

  pose(enemy: MobPose, time: number): void {
    this.flash((enemy.hitFlash ?? 0) > 0.08);
    animateInfected(this.type, this.joints, enemy, time);
  }

  fall(dead: MobFall): void {
    this.flash(false);
    collapseInfected(this.type, this.joints, dead);
  }
}
