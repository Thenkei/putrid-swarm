// Art manifest: every runtime image, where it comes from and how it is cut.
//
// kind:
//   plate    – full-frame illustration, kept opaque, resized to `w` wide (webp)
//   sprite   – single object on magenta, keyed + trimmed, resized to `w` wide or `h` tall
//   split    – `cols`x`rows` objects on magenta, cut at the gaps, each keyed + trimmed
//              (`cut: 'gaps'` when the objects are too uneven for a grid: cuts at the widest gaps)
//   texture  – `cols`x`rows` opaque swatches cut at exact fractions (inner crop)
//   poses    – 2x2 animation poses of one character (`sheet` is its existing turnaround, attached as a reference);
//              every pose is keyed, scaled by the same factor and anchored on its feet, as `<base>_<name>`
//   atlas    – transparent, already registered cels; encode the entire sheet without trimming
//
// source:
//   (default)          – generated with codex image generation, using `refs` (files in art/concepts) as style references
//   { concept, crop? } – the creator's concept image is used directly (copied, never modified in place)
//
// Generated images are production derivatives of the creator's concept art in art/concepts;
// the concept originals stay untouched.

const STYLE =
  'Art style: match the attached reference image(s) precisely — detailed hand-inked 2D illustration with fine hatching, crisp dark outlines and warm painterly colouring, ' +
  'a rural French village in autumn: ochre stone and half-timbered walls, terracotta roof tiles, weathered wood, rust, mustard yellow, muted teal shadows, sickly pale-green infected skin. ' +
  'Tone: domestic zombie horror played straight with dry absurd ("cocasse") humour. ' +
  'Absolutely no text, no letters, no numbers, no labels, no captions, no logos, no watermark, no UI elements, no frame, no border, no parchment background.';

const KEY =
  'Background: one perfectly flat, uniform pure magenta (#FF00FF) fill covering the whole canvas — no gradient, no ground patch, no grass tuft, ' +
  'no cast shadow, no vignette, no texture. Do not use magenta or pink anywhere on the subject. ' +
  'Keep generous magenta margins around every subject; nothing may touch the image edges.';

const ISO =
  'Projection: classic isometric game view (2:1 dimetric, camera looking down at roughly 30 degrees), ' +
  'chunky readable silhouette that still reads when shrunk to 80 pixels.';

const charPair = (desc) =>
  `Character turnaround sheet with exactly TWO full-body views of the same character, side by side with a wide empty gap between them. ` +
  `LEFT view: seen from the front in three-quarter view, body and face turned toward the lower-left, mid-stride. ` +
  `RIGHT view: the same character seen from behind in three-quarter view, moving away toward the upper-right, mid-stride. ` +
  `Both views the same size, feet on the same baseline. Character: ${desc} ${ISO} ${KEY} ${STYLE}`;

const POSE_VIEW = {
  front: 'seen from the front in three-quarter view, body and face turned toward the lower-left — the same angle as the LEFT figure of the character sheet',
  back: 'seen from behind in three-quarter view, moving away toward the upper-right — the same angle as the RIGHT figure of the character sheet',
};

const poseSheet = (view, desc, poses) =>
  `Animation sprite sheet: a 2x2 grid showing the SAME character four times, one pose per quadrant, each figure centred in its own quadrant with wide empty margins; no figure may cross into a neighbouring quadrant. ` +
  `The first attached image is the existing character sheet of this character: reproduce exactly that character — same face, hair, clothes, colours, props and proportions — in all four poses. ` +
  `All four figures are ${POSE_VIEW[view]}, drawn at the same scale with the feet on the same baseline inside their quadrant. Character: ${desc} ` +
  `Top-left: ${poses[0]} Top-right: ${poses[1]} Bottom-left: ${poses[2]} Bottom-right: ${poses[3]} ${ISO} ${KEY} ${STYLE}`;

const portraitPair = (alive, infected) =>
  `Two head-and-shoulders bust portraits of the same person, side by side with a wide empty gap between them, same size and framing. ` +
  `LEFT portrait (alive, before the outbreak): ${alive} ` +
  `RIGHT portrait (infected, weeks later): ${infected} Same clothes and same signature prop in both so the person is instantly recognisable. ` +
  `${KEY} ${STYLE}`;

const stateSheet = (subject, states) =>
  `Game asset sheet: a 2x2 grid showing the SAME ${subject} in four states, one per quadrant, each centred in its quadrant with wide empty margins. ` +
  `Top-left: ${states[0]}. Top-right: ${states[1]}. Bottom-left: ${states[2]}. Bottom-right: ${states[3]}. ` +
  `Same size, same angle and same position in every quadrant. ${ISO} ${KEY} ${STYLE}`;

const plate = (desc) => `Wide landscape illustration (3:2), full bleed. ${desc} ${STYLE}`;

const interior = (desc) =>
  plate(
    `Isometric cutaway interior of ${desc} Seen from above at a 30 degree isometric angle like the reference, two back walls visible and the floor filling most of the frame, ` +
      `warm dusty daylight through a window, abandoned in a hurry, no people at all. Five or six clearly distinct, well separated searchable containers or furniture pieces spread across the room. ` +
      `Foliage and a strip of yard outside the cut walls.`,
  );

const C = (n) => `art/concepts/${n}`;
const REF_VILLAGE = C('05-neighborhood-scavenging.png');
const REF_NEIGHBORS = C('06-neighbors-before-after.png');
const REF_AUTHORITIES = C('07-authorities-before-after.png');
const REF_TOWN = C('08-town-supply-run.png');
const REF_TRUNK = C('09-car-trunk-resources.png');
const REF_STORYBOARD = C('11-opening-storyboard.png');
const REF_DEVICES = C('13-defense-device-states.png');
const REF_ANIMALS = C('14-infected-animal-bestiary.png');
const REF_GARAGE = C('15-neighbor-garage-interior.png');
const REF_MAYOR_WAVE = C('16-mayor-wave-camera.png');
const REF_MORNING = C('17-morning-after.png');
const REF_HOMESTEAD = C('01-day-night-homestead.png');
const REF_PROJECTION = C('03-2d-projection-comparison.png');
const YARD_STYLE_REFS = ['art/raw/obj_trees.png', 'art/raw/obj_house_front.png'];
const CAR_SPRITE_REF = 'public/assets/sprites/obj_car_front.webp';
const HERO_APPROACH_BRIEF =
  'Use case: stylized-concept. Original game sprite atlas for Putrid Swarm. Draw exactly EIGHT isolated full-body animation ' +
  'cels in a regular FOUR-column, TWO-row grid, wide landscape 1792×1024 or wider. The first reference depicts the exact ' +
  'protagonist: scruffy dark-haired adult man with short stubble, worn mustard yellow hooded field jacket with hood down, ' +
  'dark charcoal cargo trousers and brown work boots. Keep his clothing, realistic body proportions, muted ink texture, and ' +
  'fine dark brown contours identical. True transparent RGBA background. NO car, house, terrain, objects, cast shadows, ' +
  'dividers, scenery, borders, letters or numbers. Strict empty padding on every edge of EVERY cel, never cross a cell ' +
  'boundary. Same physical character scale throughout, upright walking figures roughly 70% of one cel height. High isometric ' +
  'three-quarter fixed camera, looking down about 25 degrees. Top row left to right: a four-frame walk cycle with the man ' +
  'headed DOWN-RIGHT, chest and face seen in three-quarter, walking with intent. Frame one: right boot leads on heel, left ' +
  'trails and hand naturally swings. Frame two: mid-crossing with body upright, left boot passes under him as right supports. ' +
  'Frame three: left boot leads on heel, right trails. Frame four: reverse passing stride, right boot passes under him while ' +
  'left supports. Maintain facing, scale and body centre across the walk cycle. Bottom row left to right comprises four ' +
  'distinctly different climbing cels from the FRONT, facing the viewer and slightly to the right, on the same isometric ' +
  'camera. Frame one: seated on an invisible upper window sill, one knee comes over, boots forward and below, one hand ' +
  'pushing down against the invisible sill. Frame two: low squat balancing with both boots planted, torso leans forward as he ' +
  'moves along an invisible sloping porch roof. Frame three: a straight hanging pose with hand or hands above his head ' +
  'gripping the edge of an invisible roof, feet completely off the ground, both boots pointed down, coat drapes vertically. ' +
  'Frame four: soft landing on both feet, knees deeply bent, head down, one hand forward for balance and a visibly distinct ' +
  'lower body silhouette. All figures fully in frame including overhead grips and boots. No furniture or props may be drawn; ' +
  'the game will provide the house.';
const DRIVE_PLATE_BRIEF =
  'Use case: illustration-story. An original full-bleed landscape 16:9 in-game travel illustration for Putrid Swarm. Match ' +
  'the linked game\'s detailed hand-inked drawing, fine dark contours, distressed painterly colours, dusty old France and ' +
  'rural autumn. Soft neutral mid-afternoon daylight, muted forest greens and warm ochre. Keep the main focal information in ' +
  'the central upper two-thirds, with a dark or low-detail lower quarter for the game\'s destination overlay. Clean artwork, ' +
  'no text, logos, brands, watermarks, caption, border, or UI.';
const CAR_BOARDING_BRIEF =
  'Use case: stylized-concept, production animation sprites for the original game Putrid Swarm. Deliver one wide 3:2 sprite ' +
  'atlas, EXACTLY a perfectly regular 2×2 grid of four distinct frames, each composition wholly inside its cell with generous ' +
  'transparent gutters, no graphic dividers. Genuine transparent background, no ground or cast shadows, no labels. The first ' +
  'reference is the EXACT existing game vehicle sprite: trace/replicate its silhouette, orientation and proportions and ' +
  'preserve its detailed inked texture. Fixed high isometric front driver-side view: grille points DOWN LEFT, rear points UP ' +
  'RIGHT, near-side front door is red, wood roof rack on top. Left-hand drive, driver enters through that visible red front ' +
  'door. Keep the car body including tires, hood, rack and rear completely stationary and exactly the same scale and ' +
  'coordinates within each cell. All vehicles centered with a slight left shift within each cell to leave room on the right ' +
  'for the man. No lighting or perspective changes. The second reference is the exact protagonist identity and clothing, a ' +
  'scruffy dark-haired adult man with short stubble, worn mustard yellow hooded field jacket (hood down), dark charcoal cargo ' +
  'trousers, brown work boots. Keep his scale consistent: upright he is about as tall as the car is from tire to rack, his ' +
  'waist at the handle. Keep ink-and-painted storybook game artwork, rust and crisp brown contours. Each frame has one car and ' +
  'one person only. Red driver\'s door opens outward on its front hinge and remains partly in front of the man\'s legs when ' +
  'open. Camera never moves. Match full car placement when comparing any two cells.';

export const ART = [
  // ───────────────────────────── Plates taken directly from the concept art ─────────────────────────────
  { id: 'plate_control_room', kind: 'plate', w: 1280, source: { concept: C('12-surveillance-room.png') } },
  { id: 'plate_morning', kind: 'plate', w: 1280, source: { concept: C('17-morning-after.png') } },
  { id: 'plate_loc_garage', kind: 'plate', w: 1280, source: { concept: C('15-neighbor-garage-interior.png') } },
  { id: 'plate_town', kind: 'plate', w: 1280, source: { concept: C('08-town-supply-run.png') } },
  { id: 'plate_trunk', kind: 'plate', w: 1280, source: { concept: C('09-car-trunk-resources.png') } },
  { id: 'plate_return', kind: 'plate', w: 1280, source: { concept: C('10-return-before-night.png') } },
  { id: 'plate_village', kind: 'plate', w: 1280, source: { concept: C('05-neighborhood-scavenging.png') } },

  // Outbound travel, shown in rotation across confirmed outings.
  {
    id: 'plate_drive_road', kind: 'plate', w: 1280, refs: ['art/raw/car_driver.png', REF_VILLAGE, REF_TRUNK],
    prompt: DRIVE_PLATE_BRIEF + ' ' +
      'A cinematic wide exterior from above the roadside verge, showing the exact old mustard-yellow 1980s station wagon with its ' +
      'mismatched red left driver\'s door, muddy tires and roof rack of strapped planks. Car is rolling along the centre of a ' +
      'winding pale gravel road away from a dark autumn woodland into a French countryside valley. See the left side and front ' +
      'three-quarter silhouette, the road disappearing between hedges into the distance. A light streak of loose dust behind the ' +
      'rear wheels. The windshield reflects the sky so no hands or body parts can be distinguished. One car only, no people ' +
      'outside, no animals. Place car at 44% of image width and 50% height, keep the car well clear of crop boundaries. Apply the ' +
      'actual worn, inked vehicle design from image 1 and the village art style from image 2.' +
      '\n\nFinal direction retouch: ' +
      'Use case: precise-object-edit, landscape 16:9 travel painting for the original game Putrid Swarm. Image 1 is the exact ' +
      'painting to edit. Keep its original countryside, forest, gravel curve, village on upper right hillside, framing, light, ' +
      'ink work, colour and subdued lower quarter. Only reverse the DIRECTION OF TRAVEL of the painted car. Redraw the rusty ' +
      'mustard-yellow 1980s station wagon in the same foreground position on the exact same road, seen from the rear ' +
      'three-quarter, clearly driving AWAY from the viewer toward the upper-right curve and the village. Its closed rear tailgate ' +
      'and dull red tail-lights are the closest part and point toward the bottom left. Its bonnet and front wheels point toward ' +
      'the upper right, parallel to the curve that continues to the town. The road behind the car is bottom-left, and the light ' +
      'dust trail also falls toward the bottom left only. Preserve the black roof rack with the strapped planks and the iconic ' +
      'red left driver\'s door if that side is visible. Image 2 is a supporting reference for the precise car\'s shape and worn ' +
      'rear details; in the travel painting its rear hatch is closed, with shallow sky reflections, and the car is moving with ' +
      'nobody visible inside or out. Do not put the village behind the vehicle; its front points toward the village. No legible ' +
      'text, no overlays. Maintain source aspect ratio.',
  },
  {
    id: 'plate_drive_cabin', kind: 'plate', w: 1280, refs: ['art/raw/car_driver.png', REF_VILLAGE],
    prompt: DRIVE_PLATE_BRIEF + ' ' +
      'A driver\'s-eye view from INSIDE the same 1980s French left-hand-drive station wagon through its windshield as it travels a ' +
      'narrow empty country road. The windshield fills most of the frame: oncoming bend, French stone boundary wall covered with ' +
      'ivy and a distant few terracotta roofs, leaves along the road. See scuffed mustard-painted A-pillars at edges, aged black ' +
      'textured dash, rearview mirror at top reflecting only sky, an instrument hood and only the top rim of the aged left-hand ' +
      'steering wheel along the very bottom. No person, clothing, arms or hands are in frame. The only car is the one enclosing ' +
      'the camera. Clear layered depth between interior and road. The same car\'s worn dark dashboard, faded tan trim and ' +
      'mustard-painted exterior are the design reference. No modern tech, no signs with legible lettering. Wide visible ' +
      'windshield guides the eye into the road.',
  },
  {
    id: 'plate_drive_radio', kind: 'plate', w: 1280, refs: ['art/raw/car_driver.png', REF_TRUNK],
    prompt: DRIVE_PLATE_BRIEF + ' ' +
      'Close passenger-seat view of an old car radio set into the scuffed matte charcoal dashboard of this exact 1980s station ' +
      'wagon. Only the console, amber-lit analog frequency scale, fluted knobs and a little daylight through the windscreen are ' +
      'visible. The tuner is a wide HORIZONTAL straight inset glass scale, almost front-on, at mid-height around 51 percent down, ' +
      'spanning from about 34 to 66 percent of the image width. Put only fine cream tick marks on this dark flat amber-brown ' +
      'band, no letters, no numerals, no frequency pointer inside the band because the game will draw its own moving needle. The ' +
      'AM/FM radio appears integrated into the aged dashboard with discrete knobs under the scale, with dormant subtle green ' +
      'pilot lamp. Show a blurred sliver of autumn road in the windshield in the upper background. No faces, bodies, hands or ' +
      'limbs. Keep a dark low-detail lower quarter. Preserve worn brown plastic and illustrated ink textures of the references.',
  },

  // ───────────────────────────── The protagonist with one arm ─────────────────────────────
  // Once the orchard has taken his left arm, every picture he is in is shown from its twin below:
  // a retouch of the same picture with that one change (scenes/common.ts `heroArt` picks it).
  // Which arm is his left is read from the way he faces: turned toward the right of the picture, his
  // left side is the far one, so the arm that goes is the one the picture hardly shows, and the knot
  // may not show at all.
  ...[
    {
      id: 'plate_control_room_one_arm',
      edit: C('12-surveillance-room.png'),
      change:
        'The scruffy bearded man seated at the desk, seen from behind and turned toward the computer on the right, has lost his LEFT arm, which is the arm on the FAR side of his body: the one reaching past his near arm to the computer MOUSE. ' +
        'That forearm and that hand disappear completely, and the mouse lies alone on its mat with no hand on it. ' +
        'The arm NEARER to the viewer — the one with the stitched patch on its elbow, whose hand rests on the small wooden box with three coloured buttons — stays EXACTLY as it is: same sleeve, same elbow patch, same hand on the box, no knot on it.',
    },
    {
      id: 'plate_morning_one_arm',
      edit: C('17-morning-after.png'),
      change:
        'The bearded man standing in the doorway with a steaming mug, facing the viewer, has lost his LEFT arm, which is the arm on the RIGHT side of the picture: in the original its hand is tucked in his trouser pocket. ' +
        'Redraw that side of him with NO arm at all: no hand in the pocket, no forearm, no elbow — the trouser pocket is empty and flat, and between his body and the door frame there is only the dark wooden door. ' +
        'From his shoulder on that side hangs only a short empty mustard-yellow sleeve, flattened, folded up and tied in one big knot just below the shoulder, so the missing arm is obvious at a glance. ' +
        'His right hand, on the LEFT side of the picture, still holds the steaming mug exactly as before.',
    },
    {
      id: 'plate_loc_garage_one_arm',
      edit: C('15-neighbor-garage-interior.png'),
      change:
        'The man with the backpack at the workbench, seen from behind, has lost his LEFT arm, which is the one on the left side of the picture, whose hand rests on the car battery on the bench: it is gone, and the battery stays on the bench with no hand on it. ' +
        'The empty left sleeve of his mustard-yellow jacket is folded up and tied in a single knot. His right hand still holds the lit torch, exactly as before.',
    },
    {
      id: 'plate_town_one_arm',
      edit: C('08-town-supply-run.png'),
      change:
        'The man with the backpack pushing the shopping trolley toward the left of the picture has lost his LEFT arm, which is the one nearer to the viewer, gripping the trolley handle in front of his body: it is gone, and the empty mustard-yellow sleeve is folded up and tied in a single knot. ' +
        'He pushes the loaded trolley with his right hand alone, on the far side of his body, its hand on the handle.',
    },
    {
      id: 'plate_trunk_one_arm',
      edit: C('09-car-trunk-resources.png'),
      change:
        'The bearded man crouching on the left of the picture, turned toward the open boot on the right, has lost his LEFT arm, which is the arm on the FAR side of his body: the one whose hand is raised to his chin. ' +
        'That hand and the forearm leading up to it disappear completely; his bearded chin and jaw are seen clearly, untouched. ' +
        'The arm NEARER to the viewer, hanging from his shoulder down to the hand resting on his knee, stays EXACTLY as it is: same sleeve, same hand on the knee, no knot on it. He still looks at the open boot, thinking.',
    },
    {
      id: 'plate_return_one_arm',
      edit: C('10-return-before-night.png'),
      change:
        'The man in the yellow hooded jacket carrying a car battery from the station wagon to the workbench has lost his LEFT arm. ' +
        'He now carries the car battery with his right hand alone, by the handle on its top, the battery hanging at his side; his left arm is not there.',
    },
    {
      id: 'plate_village_one_arm',
      edit: C('05-neighborhood-scavenging.png'),
      change:
        'The man with the backpack carrying a car battery toward the open boot of the station wagon, on the left, has lost his LEFT arm. ' +
        'He now carries the car battery with his right hand alone, by the handle on its top, the battery hanging at his side; the empty left sleeve of his mustard-yellow jacket, on the side nearer to the viewer, is folded up and tied in a single knot.',
    },
    {
      id: 'plate_van_one_arm',
      edit: 'art/raw/plate_van.png',
      change:
        'The man in the mustard-yellow jacket with the backpack, walking away from the viewer toward the white van, has lost his LEFT arm, which is the arm on the LEFT side of the picture, swinging beside his body. ' +
        'That arm must disappear completely: no hand, no forearm, nothing swinging. On that side the empty sleeve is folded up and tied in a single knot at the height of his ribs, against his side. His other arm stays hidden by his body and the backpack, as before.',
    },
  ].map(({ id, edit, change }) => ({
    id,
    kind: 'plate',
    w: 1280,
    edit,
    prompt:
      'Edit the attached illustration. Reproduce it EXACTLY — same composition and framing, every person and object in the same position and at the same size, same line work, same colours, same light, same canvas proportions — with only this change. ' +
      `${change} ` +
      'Paint in cleanly whatever the missing arm and hand used to hide. No blood, no bandage, no stump showing. Nobody and nothing else in the picture changes.',
  })),

  // ───────────────────────────── Generated plates ─────────────────────────────
  {
    id: 'plate_appraisal_radio', kind: 'plate', w: 640, refs: [REF_TOWN],
    prompt: `Portrait 2:3 still life of an ordinary black portable radio half out of its faded cardboard box on a French flea-market table. Two blank paper tags and checked red cloth. No lettering or branding. ${STYLE}`,
  },
  {
    id: 'plate_crossbow', kind: 'plate', w: 1280, refs: [REF_GARAGE],
    prompt: `Wide 16:9 garage close-up. A closed olive canvas case on a teal workbench, two feathered wings embroidered on its cream shoulder strap, a worn motorcycle glove and a swallow-shaped key tag. Leave the lower edge in shadow for the caption. ${STYLE}`,
  },
  {
    id: 'plate_crossbow_road', kind: 'plate', w: 1280, refs: [REF_STORYBOARD],
    prompt: `Wide 16:9 view through the windshield of a stalled French estate car at blue dusk. Warm low beams light an empty wet lane, a mossy stone gatepost and hazel hedges. A low, dark dashboard frames the bottom. Leave the lane clear for animated characters. ${STYLE}`,
  },
  {
    id: 'plate_crossing', kind: 'plate', w: 1280, refs: [REF_STORYBOARD],
    prompt: `16:9 through the old yellow estate car’s windshield, looking at an empty road and a limestone farm lane in autumn. A cream enamel coffee cup sits at bottom left. Keep the central road clear for animated deer. ${STYLE}`,
  },
  // Three consecutive frames of the same garage accident, from the original generated filmstrip.
  ...[
    ['raised', 'The rusty blue car is raised. The scavenger in his ochre jacket reaches for a crate beneath it.'],
    ['fall', 'The same lift gives way. The car drops, the crate tips and dust erupts.'],
    ['end', 'The car rests low and crooked. The dead scavenger lies pinned beneath its near edge, face and ochre jacket visible.'],
  ].map(([frame, action]) => ({
    id: `plate_lift_${frame}`, kind: 'plate', w: 1280, refs: [REF_GARAGE],
    prompt: `Full-bleed 16:9 garage cutscene, fixed floor-level camera, red lift posts, amber daylight. ${action} No gore. ${STYLE}`,
  })),

  {
    // First pass of the title desk. Not shipped: plate_title_desk below is a retouch of it.
    id: 'plate_title_desk_base',
    kind: 'plate',
    rawOnly: true,
    w: 1280,
    refs: [REF_STORYBOARD],
    prompt: plate(
      'The desk from panel 01 of the reference storyboard, as one single full-frame picture (not a storyboard, no panels): first-person view of a cluttered wooden desk at night in a rural house. ' +
        'Dead centre: the same big old beige CRT computer monitor seen straight on; its screen is switched on but completely EMPTY — a plain, even, very dark teal glow with nothing on it — and it occupies about 46% of the image width and 52% of its height. ' +
        'On the right of the desk: the stone ashtray with a lit hand-rolled joint, a thin ribbon of smoke rising; the forest mug; the car key with its yellow keyring. ' +
        'Beige keyboard and mouse in front, small speaker and a trailing pothos plant on the left, warm brass desk lamp on the right, paper map sheets, dark window with forest behind.',
    ),
  },
  {
    // Second pass: the painted smoke taken out (the game animates its own, see scenes/title.ts) and the
    // sticky note moved off the glass and signed. Not shipped either: the mug and the joint are still in it.
    id: 'plate_title_desk_set',
    kind: 'plate',
    rawOnly: true,
    w: 1280,
    edit: 'art/raw/plate_title_desk_base.png',
    prompt:
      'Edit the attached illustration. Reproduce it EXACTLY — same composition and framing, every object in the same position and at the same size, same line work, same colours, same canvas size — with only these changes: ' +
      '(1) Remove every wisp of smoke and steam: nothing rises from the joint in the ashtray and nothing rises from the mug. Paint in cleanly what was behind them: the wooden wall planks, the shelf with its books, the lamp. ' +
      '(2) The yellow sticky note at the top-left corner of the monitor is moved up and to the left and made about one and a half times bigger: it is now stuck on the outer top-left corner of the beige plastic monitor casing, overhanging outward over the wall and the plant, ' +
      'and no part of it covers the dark glass any more. Where it used to be, restore the rounded corner of the dark screen and the beige bezel. ' +
      '(3) On that sticky note, handwritten in dark blue ballpoint pen, exactly two lines: a large first line reading A²&M (capital A, a small superscript 2, an ampersand, capital M) and, under it, a smaller second line reading 2013 · Le Puy-en-Velay. Spell both exactly. No other writing anywhere. ' +
      'The monitor screen stays completely empty: a plain dark teal glow.',
  },
  {
    // The desk as shipped: the mug and the joint are gone from the picture because the game draws them
    // itself (`desk` sheet below), so a hand can pick them up. Each retouch keeps every other object
    // where it was to the pixel, which the title scene's hot spots and CRT overlay rely on.
    id: 'plate_title_desk',
    kind: 'plate',
    w: 1280,
    edit: 'art/raw/plate_title_desk_set.png',
    prompt:
      'Edit the attached illustration. Reproduce it EXACTLY — same composition and framing, every object in the same position and at the same size, same line work, same colours, same canvas size, the sticky note and its handwriting untouched — with only these two changes: ' +
      '(1) Remove the hand-rolled joint from the ashtray. The stone ashtray stays exactly where it is, with its ash and its leaf emblem; its rim is simply empty. ' +
      '(2) Remove the enamel mug completely. Where it stood, paint the wooden desk top and, behind it, the wooden wall planks and the base of the shelf, lit by the lamp like the rest. No ring, no stain, no shadow left behind. ' +
      'Nothing else changes. The monitor screen stays completely empty: a plain dark teal glow.',
  },
  {
    // What the hand on the title screen can pick up, and the hand itself, seen by its owner.
    id: 'desk',
    kind: 'split',
    cols: 5,
    rows: 1,
    names: ['mug', 'joint', 'hand_open', 'hand_joint', 'hand_mug'],
    // The open pose on the source sheet is left-handed. The desk gestures use the right hand.
    mirrorSprites: ['desk_hand_open'],
    // Two small objects and three tall arms: cut at the gaps between them, not on an even grid.
    cut: 'gaps',
    h: 640,
    refs: [REF_STORYBOARD],
    sheet: 'art/raw/plate_title_desk_set.png',
    prompt:
      'Game asset sheet: FIVE separate objects standing in a single row, evenly spaced with wide empty gaps between them, each centred in its own fifth of the canvas. ' +
      'The first attached image is a desk scene: objects 1 and 2 are taken from it and must look exactly like they do there. From left to right: ' +
      '(1) The enamel camping mug from the desk scene: cream enamel, dark rim, the black print of pine trees and a mountain, handle on the left, full of black coffee, seen from the same slightly raised angle. Alone, upright. ' +
      '(2) The lit hand-rolled joint from the desk scene, alone, lying at the same slant: twisted paper tip at the lower left, glowing orange ember and a little ash at the upper right. ' +
      '(3) A man’s right hand and forearm seen from his own eyes (first-person view): the back of the hand at the top, fingers relaxed and half open, reaching away from the viewer toward the top of the image; the wrist and a long forearm in the worn mustard-yellow sleeve of a work jacket run straight down below it. ' +
      'The sleeve is long — about twice the length of the hand — and ends at the bottom in a clean straight horizontal cut. ' +
      '(4) The same first-person right hand and long mustard sleeve, same angle and size, now holding the lit joint pinched between thumb and index finger, the glowing ember end pointing up and away from the viewer. ' +
      '(5) The same first-person right hand and long mustard sleeve, same angle and size, now holding the enamel mug by its handle, the mug upright with its forest print visible. ' +
      `All five lit by a warm lamp from the upper right, like the desk scene. The three arms are tall figures that nearly fill the height of the canvas; the mug and the joint are small. ${KEY} ${STYLE}`,
  },
  {
    id: 'plate_news',
    kind: 'plate',
    w: 1280,
    refs: [REF_STORYBOARD],
    prompt: plate(
      'Full-frame television news broadcast picture as in panel 02 of the reference storyboard, without the monitor around it: the same worried news anchor (wavy brown hair, dark blazer, hoop earrings) at the left, ' +
        'and on the right an inset picture of a small provincial hospital at dusk with a police van, barriers, hazard tape and officers. ' +
        'The lower quarter of the frame is an empty plain dark red band and there is a small empty red tag in the top-right corner (both left blank). Subtle CRT scanlines.',
    ),
  },
  {
    id: 'plate_smoke',
    kind: 'plate',
    w: 1280,
    refs: [REF_STORYBOARD],
    prompt: plate(
      'Panel 03 of the reference storyboard as one single full-frame picture: the same scruffy bearded man in a mustard work jacket leaning back in a worn armchair at his desk at night, eyes half closed, ' +
        'holding a hand-rolled joint, exhaling a huge slow cloud of smoke that billows toward the right half of the frame and starts to swallow the glowing CRT monitor behind him. Warm lamp light, teal night shadows.',
    ),
  },
  {
    id: 'plate_map',
    kind: 'plate',
    w: 1280,
    refs: [REF_VILLAGE, REF_TOWN],
    prompt: plate(
      'Illustrated isometric overview map of a small French village and its surroundings ringed by dark autumn forest, in clear late-afternoon daylight, seen from high above. ' +
        'Eight well separated landmarks connected by winding cracked lanes, each with clear empty space around it: ' +
        '(1) bottom-left, isolated at the forest edge: a fortified stone cottage with a wooden palisade, a vegetable garden and a yellow station wagon; ' +
        '(2) close to it, a tidy neighbour cottage with a garden shed and one immaculate striped lawn; ' +
        '(3) centre-left: a mechanic garage with a roller door, stacked tyres and an engine hoist; ' +
        '(4) centre: a hardware shop with a striped awning, planks and rolls of wire mesh outside; ' +
        '(5) centre-right: a small grocery with a striped awning and crates; ' +
        '(6) a small post office with a yellow mail van; ' +
        '(7) a small police station with a blue patrol car and traffic cones; ' +
        '(8) top-right: a town hall with a clock tower, bunting and a little square. Abandoned cars, overturned bins, no people.',
    ),
  },
  {
    id: 'plate_loc_shed',
    kind: 'plate',
    w: 1280,
    refs: [REF_GARAGE],
    prompt: interior(
      "a fussy neighbour's immaculate garden shed: an obsessively tidy tool wall with a painted outline for every tool, a workbench with a vice, a neat stack of planks, rolls of wire mesh, a cabinet of seed drawers, a jerrycan, a shelf of lawn-care trophies, and a clean rectangle on the floor where a push reel lawn mower is normally parked.",
    ),
  },
  {
    id: 'plate_loc_hardware',
    kind: 'plate',
    w: 1280,
    refs: [REF_GARAGE, REF_TOWN],
    prompt: interior(
      'a small village hardware shop: tall shelves of paint tins and boxes of screws, a rack of planks and timber, big rolls of wire mesh and coils of rope, a wall of hand tools, a counter with an old till, a bin of springs and hinges, a wheelbarrow of sandbags.',
    ),
  },
  {
    id: 'plate_loc_grocery',
    kind: 'plate',
    w: 1280,
    refs: [REF_GARAGE, REF_TOWN],
    prompt: interior(
      'a small looted village grocery: half-empty wooden shelves with a few tins, a toppled rack, a checkout counter with a till and a battery display stand, a fridge with its door hanging open, stacked wooden fruit crates and pallets, shopping baskets, a shopping trolley on its side.',
    ),
  },
  {
    id: 'plate_records', kind: 'plate', w: 640, refs: [REF_TOWN],
    prompt: `Portrait 2:3 close-up in the closed grocery. A stack of old vinyl sleeves in a red plastic milk crate, a black record halfway out of a blue illustrated sleeve, and galvanized shopping baskets near the shop door in the background. ${STYLE}`,
  },
  {
    id: 'plate_loc_post',
    kind: 'plate',
    w: 1280,
    refs: [REF_GARAGE],
    prompt: interior(
      'a small village post office sorting room: wooden pigeonhole sorting shelves, canvas mail sacks, a parcel trolley stacked with boxes, a counter with brass scales, rolls of string and wire, a locked parcel cage, a delivery bicycle with panniers, scattered blank envelopes on the floor.',
    ),
  },
  { id: 'plate_vachette', kind: 'plate', w: 900, source: { concept: 'art/raw/plate_vachette.png' } },
  { id: 'vachette_cow', kind: 'atlas', w: 450, source: { concept: 'art/raw/vachette_cow.png' } },
  {
    id: 'plate_loc_police',
    kind: 'plate',
    w: 1280,
    refs: [REF_GARAGE],
    prompt: interior(
      'a tiny village police station: a front desk, a holding cell with the door open, a steel evidence locker, a rack of traffic cones and folded crowd-control barriers, riot shields leaning on the wall, a radio charging station with batteries, a tidy desk with a single mug and a whistle on a cord.',
    ),
  },
  {
    id: 'plate_loc_townhall',
    kind: 'plate',
    w: 1280,
    refs: [REF_GARAGE],
    prompt: interior(
      "a small village town hall function room being used as a campaign office: stacks of wooden election boards with blank faces, a lectern, a spare megaphone on a table, folding chairs, a PA amplifier with a battery pack, bunting, boxes of blank leaflets, a ribbon and giant scissors on a velvet cushion, a mayor's portrait frame hanging crooked (showing only a featureless silhouette).",
    ),
  },
  {
    id: 'plate_gameover',
    kind: 'plate',
    w: 1280,
    refs: [REF_MAYOR_WAVE, REF_MORNING],
    prompt: plate(
      'Isometric night view of the same fortified stone cottage being overrun: the porch door barricade smashed inward, a crowd of infected villagers pressing into the doorway, ' +
        'one upstairs window lit by a flickering teal monitor glow, the yellow station wagon abandoned with a door open, broken palisade, dark forest all around. Bleak and quiet rather than gory, deep teal night palette with one warm lantern.',
    ),
  },
  {
    id: 'plate_victory',
    kind: 'plate',
    w: 1280,
    refs: [REF_MORNING],
    prompt: plate(
      'Isometric view at sunrise of the same battered but still standing fortified stone cottage, the yellow station wagon parked beside it, the lane finally empty and quiet: ' +
        'a megaphone and a toppled wooden lectern with a rosette lying in the grass, scattered blank leaflets, a push reel lawn mower on its side at the end of one impeccably mown strip, a mail satchel, a police cap, a riot shield. ' +
        'Golden light breaking over the forest, a thin ribbon of chimney smoke, a crow on the palisade. No people.',
    ),
  },

  // ───────────────────────────── World objects ─────────────────────────────
  {
    id: 'obj_house_front',
    kind: 'sprite',
    w: 760,
    refs: [REF_PROJECTION, REF_MORNING],
    prompt:
      'Single isometric game building sprite of the fortified French cottage from the references (ochre stone and half-timbered walls, steep terracotta tile roof, stone chimney, boarded shutters with warm light behind). ' +
      'Compact, almost square footprint. The camera sees the two lower walls: ' +
      'the wall facing LOWER-LEFT has the front door in its centre under a small tiled porch with two steps, and one boarded window; ' +
      'the wall facing LOWER-RIGHT has, in its centre, a lean-to wooden barn extension with a wide closed double barn door and a lantern. ' +
      'Pale limewashed plaster over chipped limestone, burnt sienna tiles patched with galvanized sheet, weathered hand-cut timbers, warm amber glazing. A small CCTV camera under each eave, cables stapled along the walls, ivy. ' +
      `Only the building: no garden, no fence, no ground plane, no base. ${ISO} ${KEY} ${STYLE}`,
  },
  {
    id: 'obj_house_back',
    kind: 'sprite',
    w: 760,
    refs: [REF_PROJECTION, REF_MORNING],
    prompt:
      'Single isometric game building sprite: the REAR view of the fortified French cottage from the references (ochre stone and half-timbered walls, steep terracotta tile roof, stone chimney, boarded shutters with warm light behind). ' +
      'Compact, almost square footprint. The camera sees the two lower walls: ' +
      'the wall facing LOWER-LEFT has a plain back kitchen door in its centre with one stone step and a rain barrel beside it; ' +
      'the wall facing LOWER-RIGHT has, in its centre, a tall French window (glazed double door) with half-closed wooden shutters, and climbing red vine. ' +
      'Pale limewashed plaster over chipped limestone, burnt sienna tiles patched with galvanized sheet, weathered hand-cut timbers, warm amber glazing. A small CCTV camera under each eave, cables stapled along the walls. ' +
      `Only the building: no garden, no fence, no ground plane, no base. ${ISO} ${KEY} ${STYLE}`,
  },
  ...['front', 'back'].map((side) => ({
    id: `obj_house_${side}_damaged`,
    kind: 'sprite',
    w: 760,
    edit: `art/raw/obj_house_${side}.png`,
    prompt:
      'Paint damage on this exact building. Keep the chimney, windows, door sills, footprint, projection and framing in place. ' +
      'Splinter the lower door, hang one broken shutter askew, expose a patch of laths under slipped roof tiles, break plaster to show masonry beneath. Preserve warm light in the windows. ' +
      `The entire cottage alone on a transparent background, no garden or ground. ${STYLE}`,
  })),
  ...['front', 'back'].flatMap((side) => Object.entries({
    stripped: 'Rip both upper-left shutters away, remove the central roof patch and expose a rectangle of laths. Strip a patch of plaster beside the lower door.',
    failing: 'Keep shutters and roof patch missing. Tear away two fifths of the near roof and half the porch canopy, exposing rafters. Break the upper window pane; the lower pane stays amber.',
    ruin: 'Tear open the attic, leaving splintered rafters, a jagged border of tiles, and genuine sky holes. The porch loses its cover and the wall opens to timber laths; the upper-left window is a dark empty frame.',
  }).map(([stage, description]) => ({
    id: `obj_house_${side}_${stage}`,
    kind: 'sprite',
    w: 760,
    edit: `art/raw/obj_house_${side}_damaged.png`,
    prompt: `Edit the existing damaged cottage in place. ${description} Preserve its exact projection, footprint, chimney, sills, doors, other lights and camera fixtures. Keep the entire sprite on transparency with no ground or debris beyond its footprint. ${STYLE}`,
  }))),
  {
    id: 'yard_scatter',
    kind: 'split', cols: 3, rows: 2, w: 128,
    names: ['straw', 'fern', 'stones', 'leaves', 'yarrow', 'dock'],
    refs: YARD_STYLE_REFS,
    prompt:
      'Three columns by two rows of individual low ground details, isolated with empty gutters. ' +
      'Upper row: sparse ochre autumn grass tussock, olive bracken fern, loose group of flat slate stones. ' +
      'Lower row: small drift of curled tawny oak leaves and a twig, small ivory yarrow flowerheads and sage blades, short meadow grass with dock leaves. ' +
      `Echo the apple tree’s dark broken contours, folded leaf shapes and ochre highlights at ground-cover scale. Nearly flat on the ground, three-quarter top-down angle, no dirt base. ${ISO} ${KEY} ${STYLE}`,
  },
  {
    id: 'yard_flora',
    kind: 'split', cols: 3, rows: 3, w: 168,
    names: ['foxtail', 'knapweed', 'clover', 'bramble', 'hazel', 'nettle', 'cabbage', 'leeks', 'chicory'],
    refs: YARD_STYLE_REFS,
    prompt:
      'Transparent three-by-three sprite sheet of nine low plants for a French farm, each clump isolated with generous clear space. ' +
      'First row: a windswept silver-green foxtail fan with tawny seed heads, muted purple knapweed, and spreading ivory-flowered clover. ' +
      'Middle row: an arching russet blackberry cane with dark berries, a golden heart-leaved hazel sapling, and a dense triangle of serrated dark-green nettles. ' +
      'Bottom row: a pair of blue-sage and plum cabbages, strap-leaved leeks with two cream allium umbels, and a low roadside chicory with faded periwinkle flowers. ' +
      'Use the orchard tree’s warm brown ink, overlapping leaf groups and short broken shadow strokes. Keep the interior shapes legible at 25 pixels, light from upper left, clear background.',
  },
  {
    id: 'yard_masonry',
    kind: 'split', cols: 2, rows: 2, w: 256,
    names: ['barn', 'hall', 'limestone', 'moss'],
    refs: [REF_GARAGE, REF_MORNING],
    prompt:
      'Two by two isolated inserts. Upper row: straight-on rectangles filled edge to edge with a dim timber barn interior, and a dark cottage hallway with distant cold window light. ' +
      'Lower row: an isolated oblong buff limestone paving flag, then a second darker mossy slab. Stones viewed straight from above, with irregular hewn edges and cracks. ' +
      `Empty gutters. ${KEY} ${STYLE}`,
  },
  {
    id: 'obj_car',
    kind: 'split',
    cols: 2,
    rows: 1,
    names: ['front', 'back'],
    w: 320,
    refs: [REF_TRUNK, REF_TOWN],
    prompt:
      'Vehicle turnaround sheet with exactly TWO views of the same car side by side with a wide empty gap between them. The car is the one from the references: a rusty mustard-yellow 1980s station wagon with one mismatched red door, ' +
      'a black roof rack carrying strapped planks, mud on the sills, all doors and tailgate closed. ' +
      'LEFT view: isometric three-quarter FRONT view, bonnet pointing to the lower-left. RIGHT view: isometric three-quarter REAR view, tailgate pointing to the lower-left. Same size in both. ' +
      `${ISO} ${KEY} ${STYLE}`,
  },
  // Registered transparent cels, read in place to keep the body of the break steady.
  {
    id: 'car_boarding', kind: 'atlas', w: 1152, source: { concept: 'art/raw/car_boarding.png' },
    refs: [CAR_SPRITE_REF, REF_TRUNK],
    prompt: CAR_BOARDING_BRIEF + ' ' +
      'The character has both arms. Top left: he is one stride from the CLOSED driver\'s door, one boot forward mid-step, angled ' +
      'toward screen upper left, his body entirely recognizable to the right of the front door. Top right: red front driver\'s door ' +
      'wide open; he stands beside the opening with a hand on the top outer edge, turns his shoulder toward the seat and starts ' +
      'leaning to duck in. Bottom left: red front door open; he is visibly halfway inside, torso and head partly occluded by the ' +
      'door frame, bending forward across the driver\'s seat while one boot is still on the ground. Bottom right: he is now fully ' +
      'seated, all legs inside, his head and shoulder visible through the doorway as he draws the red door inward with his hand, ' +
      'door still a little ajar.',
  },
  {
    id: 'car_boarding_one_arm', kind: 'atlas', w: 1152, source: { concept: 'art/raw/car_boarding_one_arm.png' },
    refs: [CAR_SPRITE_REF, 'art/raw/plate_trunk_one_arm.png'],
    prompt: CAR_BOARDING_BRIEF + ' ' +
      'The man permanently lost his LEFT arm at the shoulder. Depict only his anatomical RIGHT arm, with a visibly short ' +
      'folded/pinned empty left sleeve. He has exactly ONE hand in every frame. No wound or blood. Top left: he is one stride from ' +
      'the CLOSED driver\'s door and is reaching across with his RIGHT hand toward the latch, his body entirely recognizable to the ' +
      'right of the front door. Top right: red driver\'s door open; he has shuffled around it and braces his right palm against the ' +
      'upper door frame, body twisted to line up with the opening, empty left sleeve visible. Bottom left: red driver\'s door open; ' +
      'he leans heavily on his right hand at the frame, body visibly halfway inside and head lowered, one boot still on the ground ' +
      'as he pauses and repositions. Bottom right: he is fully seated, all legs inside, twisted back toward the opening to take a ' +
      'second grip on the still-partly-open red door with his only right hand; his head and right shoulder visible through the ' +
      'doorway.' +
      '\n\nRetouch of the original atlas: ' +
      'Use case: precise-object-edit, production correction to a transparent 1536×1024 2×2 animation atlas for Putrid Swarm. The ' +
      'supplied atlas is the edit target. Keep the same four quadrants, crops, fixed camera, car pixels, matching wheel positions, ' +
      'texture, colours, doors and true alpha. Keep BOTH top-row cells exactly as supplied: they already use his anatomical right ' +
      'hand and clearly show his empty LEFT sleeve cinched close to his LEFT shoulder. Edit ONLY the pose of the protagonist in ' +
      'the two bottom cells. He is an adult man with a fully healed left shoulder amputation; a short, tied, empty ochre sleeve ' +
      'clearly ends immediately below the LEFT shoulder. Exactly ONE arm. His only hand is his anatomical RIGHT hand. LOWER LEFT: ' +
      'keep one boot on the ground and his head bent as he inches into the seat, but redraw his chest slightly toward the viewer, ' +
      'with his right shoulder on the screen-LEFT side of his sternum. His single RIGHT arm braces close to his body on the ' +
      'windshield-side vertical frame, clearly emerging from that screen-left shoulder and staying left of the red door window. ' +
      'His screen-right SHOULDER ends in a short definitely empty knotted sleeve, in plain view next to the red door. REMOVE the ' +
      'hand currently resting on the top of the door and the arm attached to it. LOWER RIGHT: he is seated and both legs are ' +
      'inside. Turn his chest toward the doorway and viewer so both shoulders are readable. Open jacket reveals dark shirt, and ' +
      'the old mustard short empty LEFT sleeve on the SCREEN-RIGHT side is pinned up and fully visible at his shoulder with clear ' +
      'space below it. His only right arm originates at the screen-LEFT shoulder by the windshield pillar, bends at the elbow, ' +
      'then reaches diagonally ACROSS the front of his dark chest from screen left to right. That one right hand is pulling the ' +
      'inner edge of the near red door inward, with fingers gripping the door frame near chest height. Make the path from RIGHT ' +
      'shoulder across torso to the right hand unmistakable. Do not place an arm under the empty screen-right sleeve, do not have ' +
      'a hand dangling over the window ledge, and do not leave a second arm half hidden by the door. Preserve the real car and its ' +
      'registration, the man\'s facial identity, the exact four-step action sequence and genuinely transparent empty gutters. No ' +
      'blood, no lettering, no added marks. Reproduce the original 1536×1024 canvas size.',
  },
  {
    id: 'car_driver', kind: 'atlas', w: 676, source: { concept: 'art/raw/car_driver.png' },
    edit: CAR_SPRITE_REF, refs: ['art/raw/car_boarding.png'],
    prompt:
      'Use case: precise-object-edit, isolated sprite for Putrid Swarm. Image 1 is the edit target and exact game sprite. Image 2 ' +
      'is the boarding sequence and character reference. Reproduce the car from image 1 EXACTLY, with identical silhouette, ' +
      'front-left isometric angle, scale and proportions, red driver door completely latched, car nose at bottom left, rear at top ' +
      'right, roof rack and planks. Make only a small change within the windshield and front side glass: draw the protagonist ' +
      'seated behind the wheel by the visible red driver\'s door. Show his dark hair, head facing toward the front of the car, and ' +
      'the collar/shoulder of his ochre jacket behind the existing reflective glass. His arms and hands stay below the windowsill, ' +
      'hidden behind the body. Preserve the original windshield reflections and the game\'s ink texture. No other changes or ' +
      'additions. Single full isolated car with narrow transparent margin on all sides. Genuine transparent background, no floor, ' +
      'no shadow, no other figures, text or graphics.',
  },
  {
    id: 'car_turn_road', kind: 'atlas', w: 1152, source: { concept: 'art/raw/car_turn_road.png' },
    refs: ['art/raw/car_driver.png'],
    prompt:
      'Use case: stylized-concept. Create one transparent 1536×1024 production sprite atlas for the isometric game Putrid Swarm. ' +
      'EXACT evenly spaced 2×2 grid, one complete car per quadrant, ample clear margins so no car crosses a cell boundary. The ' +
      'supplied isolated sprite is the exact rusty mustard-yellow 1980s station wagon, dark roof rack with strapped wood, red ' +
      'left-hand driver\'s door on the driver\'s side only, seated scruffy dark-haired driver in an ochre jacket in the left seat. ' +
      'Match its inked, painted detailing, proportions and fixed elevated orthographic camera (about 27 degrees above the ground). ' +
      'All views at the same physical scale, with the chassis horizontal on a level ground plane, wheels touching that plane. All ' +
      'four are NEW ground-plane rotations of the reference. The car\'s nose turns from the reference\'s bottom-left orientation ' +
      'TOWARDS the bottom of the page and then to the RIGHT. Top left: the nose points STEEPLY down-left at 50 degrees below ' +
      'horizontal, two headlights prominently visible and the red driver\'s door is visible on the right of the image in a narrow ' +
      'foreshortened side plane. Top right: the car is aimed EXACTLY STRAIGHT DOWN at the middle of the lower margin of its ' +
      'quadrant. Symmetric straight-on front view still distinctly elevated, with both headlamps aligned, both front tyres ' +
      'aligned, the entire roof rack visible and the driver on the VIEWER\'S RIGHT through the glass. No side panels visible. ' +
      'Bottom left: nose points STEEPLY down-right at 50 degrees below horizontal, front grille prominent and a little of the ' +
      'MUSTARD-yellow passenger-side flank visible on the left side of the image. Bottom right: nose points DIAGONALLY DOWN-RIGHT ' +
      'at 27 degrees below horizontal, the mustard-yellow PASSENGER side is closest to the camera, red door is on the FAR side and ' +
      'hidden, the left-hand driver is visible through the far half of the front windshield. Do not horizontally mirror the driver ' +
      'or the red door. Same stationery rack, closed doors, round treaded tyres, no shadows or floors, no background, genuinely ' +
      'transparent RGBA, no text, no frame, no guides or marks. The nose faces the viewer in every view, DO NOT draw any rear ' +
      'view.',
  },
  // Shared walk cycles and the four poses used on the upper-window route.
  {
    id: 'hero_departure', kind: 'atlas', w: 1328, source: { concept: 'art/raw/hero_departure.png' },
    refs: ['art/raw/car_boarding.png', REF_TRUNK],
    prompt: HERO_APPROACH_BRIEF + ' ' +
      'The protagonist has two ordinary arms. Keep both arms anatomically correct. In the hanging pose both hands are up, two ' +
      'boots below.',
  },
  {
    id: 'hero_departure_one_arm', kind: 'atlas', w: 1328, source: { concept: 'art/raw/hero_departure_one_arm.png' },
    refs: ['art/raw/car_boarding_one_arm.png', REF_TRUNK],
    prompt: HERO_APPROACH_BRIEF + ' ' +
      'The protagonist has lost his anatomical LEFT arm at the shoulder. He has exactly one RIGHT arm ending in exactly ONE hand ' +
      'in every drawing. The visible empty ochre LEFT sleeve is a very short folded and tied sleeve ending at his shoulder. The ' +
      'right arm always starts on the screen-LEFT side of his chest when facing the viewer. In the hanging pose his single RIGHT ' +
      'arm reaches above his head from that shoulder, and the short empty LEFT sleeve is obvious on the screen-RIGHT shoulder. ' +
      'For poses that angle his body, keep the anatomical same side and don\'t mirror. He balances with planted boots and his ' +
      'right arm. No blood, no injury detail.',
  },
  {
    id: 'hero_departure_left', kind: 'atlas', w: 1328, source: { concept: 'art/raw/hero_departure_left.png' },
    refs: ['art/raw/car_boarding.png', 'art/raw/car_boarding_one_arm.png'],
    prompt:
      'Use case: stylized-concept. One original transparent game sprite atlas for Putrid Swarm, exact regular FOUR columns by TWO ' +
      'rows of fully isolated animation cels on a wide roughly 1664×948 canvas. Each row is a four-frame walk cycle of the exact ' +
      'same male protagonist in the reference artwork, at identical camera, body scale, and physical location in each cell. ' +
      'Camera high three-quarter isometric, seeing his face and the front of his jacket. He walks toward SCREEN LOWER LEFT, ' +
      'diagonally toward the camera. Rusty ochre hooded jacket hood down, dark charcoal cargo pants, brown boots, scruffy dark ' +
      'hair and short stubble, detailed hand-inked 2D game art. In BOTH rows left to right: first right boot leading to the lower ' +
      'left with naturally swinging arms, then a passing pose with one boot beneath the body, then left boot leading to the same ' +
      'lower left, then opposite passing pose. TOP ROW is healthy with both arms. BOTTOM ROW is the same man after his left arm ' +
      'has been removed at the shoulder, with a visible short tied empty anatomical LEFT sleeve on the screen-right side of his ' +
      'chest, and only one anatomical RIGHT arm on the screen-left side of his chest. Preserve this asymmetry through all four ' +
      'poses in that row. Never mirror the character. The references show each arm state and the outfit. Leave generous actual ' +
      'transparent gutters, especially the row boundary. All head, boots, sleeves and hands must be wholly in their own cells. ' +
      'All upright walking figures are approximately 75 percent of their cell height. True RGBA: no background, cast shadow, ' +
      'floor, scenery, text, letters, borders, guides, props or effects.',
  },
  {
    id: 'obj_trees',
    kind: 'split',
    cols: 3,
    rows: 1,
    names: ['pine', 'oak', 'apple'],
    h: 430,
    refs: [REF_PROJECTION],
    prompt:
      'Three separate isometric game tree sprites side by side with wide empty gaps between them. LEFT: a tall dark, slightly menacing fir tree. ' +
      'CENTRE: a gnarled autumn oak with rust-red leaves. RIGHT: a small orchard apple tree with a few red apples. ' +
      `Each tree complete from the base of the trunk to the top, with no ground. ${ISO} ${KEY} ${STYLE}`,
  },
  {
    id: 'forest_stands',
    kind: 'split', cols: 3, rows: 2, h: 430,
    names: ['fir', 'firpair', 'beech', 'birch', 'oak', 'coppice'],
    refs: YARD_STYLE_REFS,
    prompt:
      'Six distinct woodland cutouts from a French farm in late autumn, in a three-column, two-row sheet. ' +
      'Top row: a tall windswept silver fir, paired young spruces, a copper beech with an open crown. ' +
      'Bottom row: three silver birches with flecked white trunks, a broad gnarled russet oak, low multi-stem hazel coppice. ' +
      'Match the orchard tree’s broken dark contours, clustered leaves, forked branches and warm bark hatching. Keep each species recognizable by its trunk and crown. Upper-left light, transparent gutters and no ground or cast shadows. ' +
      `${ISO} ${STYLE}`,
  },
  {
    id: 'obj_props',
    kind: 'split',
    cols: 2,
    rows: 2,
    names: ['well', 'woodpile', 'veg', 'campole'],
    h: 230,
    refs: [REF_PROJECTION, REF_MORNING],
    prompt:
      'Game prop sheet: a 2x2 grid of four separate isometric props, one per quadrant, each centred with wide empty margins. ' +
      'Top-left: an old round stone well with a small tiled roof and a bucket. Top-right: a neat stack of split firewood under a small lean-to roof. ' +
      'Bottom-left: a raised wooden vegetable bed with cabbages and staked tomatoes. Bottom-right: an improvised CCTV camera with a red light, taped to the top of a wooden pole with a dangling cable. ' +
      `${ISO} ${KEY} ${STYLE}`,
  },
  {
    id: 'obj_props2',
    kind: 'split',
    cols: 2,
    rows: 2,
    names: ['bush', 'rock', 'barrel', 'mailbox'],
    h: 170,
    refs: [REF_PROJECTION, REF_VILLAGE],
    prompt:
      'Game prop sheet: a 2x2 grid of four separate isometric props, one per quadrant, each centred with wide empty margins. ' +
      'Top-left: a round autumn bush with red leaves. Top-right: a mossy grey boulder. ' +
      'Bottom-left: a weathered oak rain barrel. Bottom-right: a small red French letter box on a wooden post. ' +
      `${ISO} ${KEY} ${STYLE}`,
  },
  {
    id: 'yard_rear', kind: 'split', cols: 3, rows: 3, h: 320,
    names: ['mailbox', 'well', 'woodpile', 'veg', 'barrel', 'rock', 'apple', 'oak', 'bush'],
    // Both long sides of the shed occupy the same diagonal in the ground plane.
    mirrorSprites: ['yard_rear_woodpile'],
    refs: ['art/raw/obj_props.png', 'art/raw/obj_props2.png', 'art/raw/obj_trees.png'],
    prompt:
      'True reverse views of the nine fixed homestead props after the isometric camera turns 180 degrees. ' +
      'Row one: the plain mounting plate and bolts on the back of the red mailbox, the reverse well with bucket on the left, ' +
      'the boarded rear of the firewood shelter. Row two: the near tomato trellis and far cabbages in the raised bed, ' +
      'the reverse of the lidded barrel, the opposite ledge of the mossy boulder. Row three: the backs of the apple tree, red oak and rust-red shrub. ' +
      `Preserve original material, footprint and height, separated by transparent gutters. ${ISO} ${STYLE}`,
  },
  {
    id: 'logo',
    kind: 'sprite',
    w: 900,
    refs: [REF_STORYBOARD],
    prompt:
      'Game title logo lettering exactly like the one on the computer screen in panel 01 of the reference: it reads exactly "PUTRID SWARM" in two stacked lines (PUTRID above SWARM), spelled exactly, all capitals. ' +
      'PUTRID in rough bone-white brush lettering, SWARM in dripping blood-red brush lettering, a thin dark ink outline around every letter, a few small flies around the letters. Only the lettering, nothing else. ' +
      `${KEY} No other text, no watermark.`,
  },

  // ───────────────────────────── Enemies (front | back) ─────────────────────────────
  {
    id: 'en_shambler',
    kind: 'split',
    cols: 2,
    rows: 1,
    names: ['front', 'back'],
    h: 200,
    refs: [REF_MAYOR_WAVE, REF_NEIGHBORS],
    prompt: charPair('a shambling infected French villager in a torn waistcoat, rolled shirt sleeves, braces and a flat cap, pale greenish skin, vacant white eyes, arms half raised.'),
  },
  {
    id: 'en_runner',
    kind: 'split',
    cols: 2,
    rows: 1,
    names: ['front', 'back'],
    h: 200,
    refs: [REF_NEIGHBORS],
    prompt: charPair(
      'a lean, fast infected amateur racing cyclist on foot: garish lycra jersey and shorts, cycling cap, clip shoes, a bent bicycle wheel still hooked over one shoulder, pale greenish skin, sprinting with pumping arms.',
    ),
  },
  {
    id: 'en_brute',
    kind: 'split',
    cols: 2,
    rows: 1,
    names: ['front', 'back'],
    h: 245,
    refs: [REF_NEIGHBORS],
    prompt: charPair(
      'a huge, heavy infected village butcher with rolled sleeves and a stained striped apron, a string of sausages over one shoulder, pale greenish skin, small pale eyes, lumbering forward with fists clenched.',
    ),
  },
  {
    id: 'en_dog',
    kind: 'split',
    cols: 2,
    rows: 1,
    names: ['front', 'back'],
    h: 120,
    refs: [REF_ANIMALS],
    prompt: charPair('the infected farm dog from the reference ("the prowler"): a lean brown mutt with patchy fur, a leather collar, pale glowing eyes, low fast prowling run on four legs.'),
  },
  {
    id: 'en_boar',
    kind: 'split',
    cols: 2,
    rows: 1,
    names: ['front', 'back'],
    h: 155,
    refs: [REF_ANIMALS],
    prompt: charPair('the infected wild boar from the reference ("the battering ram"): massive shoulders, bristling dark brown fur with bald patches, pale eyes, tusks, head lowered charging on four legs.'),
  },
  {
    id: 'en_deer',
    kind: 'split',
    cols: 2,
    rows: 1,
    names: ['front', 'back'],
    h: 215,
    refs: [REF_ANIMALS],
    prompt: charPair('the infected stag from the reference ("the jumper"): thin and tall, big antlers with an oak leaf caught on one tine, mossy greenish patches on its flank, pale eyes, mid-bound on four legs.'),
  },
  {
    id: 'boss_mower',
    kind: 'split',
    cols: 2,
    rows: 1,
    names: ['front', 'back'],
    h: 250,
    refs: [REF_NEIGHBORS],
    prompt: charPair(
      'the INFECTED lawn-mowing neighbour from the reference ("Le Tondeur", bottom-left figure): dark wavy hair and thick moustache, torn green polo shirt with pencils in the pocket, khaki shorts, white socks with green stripes, work gloves, pale greenish skin and white eyes, ' +
        'hunched forward furiously pushing his rusty red push reel lawn mower, grass clippings flying. Man and mower are one unit.',
    ),
  },
  {
    id: 'boss_mechanic',
    kind: 'split',
    cols: 2,
    rows: 1,
    names: ['front', 'back'],
    h: 265,
    refs: [REF_NEIGHBORS],
    prompt: charPair(
      'the INFECTED breakdown mechanic from the reference ("Le Dépanneur", bottom-centre figure): grey beard, dark blue oil-stained dungarees, red rag in the pocket, pale greenish skin and white eyes, ' +
        'leaning his whole weight into a rusty red wheeled engine hoist with a car engine block hanging from its chain like a battering ram, a clipboard with an invoice still clipped to the hoist. Man and hoist are one unit.',
    ),
  },
  {
    id: 'boss_mail',
    kind: 'split',
    cols: 2,
    rows: 1,
    names: ['front', 'back'],
    h: 240,
    refs: [REF_NEIGHBORS],
    prompt: charPair(
      'the INFECTED mail carrier from the reference ("La Dernière Tournée", bottom-right figure): a wiry woman with short brown hair, blue postal jacket and cap with an envelope badge, leather satchel spilling letters, a stack of letters under one arm, ' +
        'pale greenish skin and white eyes, sprinting while holding a parcel out in front of her.',
    ),
  },
  {
    id: 'boss_chief',
    kind: 'split',
    cols: 2,
    rows: 1,
    names: ['front', 'back'],
    h: 260,
    refs: [REF_AUTHORITIES],
    prompt: charPair(
      'the INFECTED police chief from the reference (bottom-left figure): stocky, grey moustache, dark blue uniform and peaked cap with a gold badge, whistle clenched in his teeth, radio on the belt, pale greenish skin and white eyes, ' +
        'advancing behind a big scratched steel riot shield held in one arm, the other arm raised in a commanding traffic-stop gesture.',
    ),
  },
  {
    id: 'boss_mayor',
    kind: 'split',
    cols: 2,
    rows: 1,
    names: ['front', 'back'],
    h: 275,
    refs: [REF_AUTHORITIES, REF_MAYOR_WAVE],
    prompt: charPair(
      'the INFECTED mayor from the reference (bottom-right figure): an elegant older woman with swept-back grey hair and earrings, torn burgundy blazer, ceremonial sash across the chest, a fixed campaign smile, pale greenish skin and white eyes, ' +
        'standing on a small rusty four-wheeled cart behind a wooden lectern tied with a red ribbon and powered by a car battery, shouting into a megaphone held in one hand and waving to the crowd with the other. Mayor and cart are one unit.',
    ),
  },

  // ───────────────────────────── Portraits (alive | infected) ─────────────────────────────
  {
    id: 'por_mower',
    kind: 'split',
    cols: 2,
    rows: 1,
    names: ['alive', 'infected'],
    h: 360,
    refs: [REF_NEIGHBORS],
    prompt: portraitPair(
      'the lawn-mowing neighbour from the reference ("Le Tondeur"): dark wavy hair, thick moustache, green polo shirt with pencils in the pocket, chin raised, inspecting a blade of grass with fussy disapproval.',
      'the same man with pale greenish skin and white eyes, torn polo, grass clippings in his hair and moustache, the same fussy disapproving frown.',
    ),
  },
  {
    id: 'por_mechanic',
    kind: 'split',
    cols: 2,
    rows: 1,
    names: ['alive', 'infected'],
    h: 360,
    refs: [REF_NEIGHBORS],
    prompt: portraitPair(
      'the breakdown mechanic from the reference ("Le Dépanneur"): weathered face, grey beard, dark blue oil-stained dungarees over a beige shirt, a spanner over his shoulder, a clipboard with an invoice under his arm, gruff but friendly.',
      'the same mechanic with pale greenish skin and white eyes, an oil smear across the cheek, the spanner still on his shoulder and the invoice clipboard still under his arm.',
    ),
  },
  {
    id: 'por_mail',
    kind: 'split',
    cols: 2,
    rows: 1,
    names: ['alive', 'infected'],
    h: 360,
    refs: [REF_NEIGHBORS],
    prompt: portraitPair(
      'the mail carrier from the reference ("La Dernière Tournée"): a cheerful wiry woman with short brown hair, blue postal jacket and cap with an envelope badge, satchel strap across her chest, proudly holding up a parcel.',
      'the same mail carrier with pale greenish skin and white eyes, cap askew, satchel strap still on, the same parcel now crushed and stained, still holding it up.',
    ),
  },
  {
    id: 'por_chief',
    kind: 'split',
    cols: 2,
    rows: 1,
    names: ['alive', 'infected'],
    h: 360,
    refs: [REF_AUTHORITIES],
    prompt: portraitPair(
      'the police chief from the reference: stocky, grey moustache, dark blue uniform and peaked cap with a gold badge, blowing a whistle with one palm raised to stop traffic.',
      'the same police chief with pale greenish skin and white eyes, uniform torn, the whistle clenched between his teeth, palm still raised.',
    ),
  },
  {
    id: 'por_mayor',
    kind: 'split',
    cols: 2,
    rows: 1,
    names: ['alive', 'infected'],
    h: 360,
    refs: [REF_AUTHORITIES],
    prompt: portraitPair(
      'the mayor from the reference: an elegant older woman with swept-back grey hair and earrings, burgundy blazer, ceremonial sash across the chest, a confident vote-winning smile and an open welcoming arm.',
      'the same mayor with pale greenish skin and white eyes, blazer torn, sash still on, exactly the same campaign smile, a megaphone raised to her mouth.',
    ),
  },

  // ───────────────────────────── Encounters on outings ─────────────────────────────
  // Living survivors met over a disputed lot, the groups that stop the break on the way home,
  // and what those scenes are played on.
  {
    id: 'por_rival',
    kind: 'split',
    cols: 2,
    rows: 1,
    names: ['dealer', 'camper'],
    h: 360,
    refs: [REF_NEIGHBORS],
    prompt:
      `Two head-and-shoulders bust portraits of two DIFFERENT living (not infected) people, side by side with a wide empty gap between them, same size and framing as the busts in the reference. ` +
      `LEFT portrait: a sturdy flea-market dealer in her sixties ("La Brocanteuse"): grey hair under a knotted headscarf, reading glasses on a chain, a quilted sleeveless jacket over a thick jumper, a money belt across her chest, ` +
      `a dented round biscuit tin held under one arm, weighing you up with a shrewd half-smile and one raised eyebrow. ` +
      `RIGHT portrait: a lanky sunburnt holidaymaker in his thirties stranded far from home ("Le Campeur"): a faded bucket hat, a camping headlamp hanging around his neck, a fleece zipped to the chin, ` +
      `clutching a creased folded road map against his chest, anxious eyes looking sideways, a nervous apologetic smile. ` +
      `Healthy skin tones, normal eyes. ${KEY} ${STYLE}`,
  },
  {
    id: 'por_group',
    kind: 'split',
    cols: 2,
    rows: 1,
    names: ['committee', 'van'],
    h: 360,
    refs: [REF_NEIGHBORS, REF_AUTHORITIES],
    prompt:
      `Two small group portraits of living (not infected) people, side by side with a wide empty gap between them, each group drawn waist-up and tightly packed like one bust portrait, both groups the same size. ` +
      `LEFT group (a village neighbourhood committee of three): in front, a brisk woman in her fifties with a neat bob, a hi-vis armband over a cardigan, holding a clipboard and rattling a metal collection tin; ` +
      `behind her left shoulder a hesitant balding man in a knitted waistcoat holding a garden rake as if he would rather not; behind her right shoulder a stern tall woman in an apron with her arms crossed. ` +
      `RIGHT group (two strangers from another town): a broad man in a worn work jacket with a set of jump leads slung over his shoulder and a flat cap, and beside him a wiry woman in a beanie resting a crowbar on her shoulder, both tired, wary and unsmiling. ` +
      `Healthy skin tones, normal eyes. ${KEY} ${STYLE}`,
  },
  {
    id: 'plate_roadblock',
    kind: 'plate',
    w: 1280,
    refs: [REF_VILLAGE, REF_TOWN],
    prompt: plate(
      'Isometric late-afternoon view of a narrow village lane between stone walls, seen from above like the reference. In the lower left, the rusty yellow station wagon with a loaded roof rack has stopped, seen from behind, brake lights on. ' +
        'Across the lane ahead of it, a makeshift checkpoint made by neighbours: a trestle table, two garden chairs, a wheelbarrow and a striped parasol barring the way, a string of bunting between two posts. ' +
        'Three living villagers stand at the table, one holding a clipboard, one with a rake. On the right, a muddy farm track leaves the lane through an open field gate, clearly passable. ' +
        'Long warm shadows, autumn leaves, no infected anywhere, calm but tense.',
    ),
  },
  {
    id: 'plate_van',
    kind: 'plate',
    w: 1280,
    refs: [REF_VILLAGE, REF_TOWN],
    prompt: plate(
      'Isometric late-afternoon view of a country road at the edge of the village, seen from above like the reference. In the lower left, the rusty yellow station wagon with a loaded roof rack has stopped, seen from behind, brake lights on. ' +
        'Ahead of it a dented white builder\'s van from another town is parked sideways across the road, bonnet open, sliding door open on tools and blankets. ' +
        'Two living strangers wait beside it: a broad man with jump leads over his shoulder and a wiry woman with a crowbar, a third figure walking around toward the back of the station wagon. ' +
        'On the left a narrow orchard path between apple trees leads around the van. Long warm shadows, autumn leaves, no infected anywhere, calm but tense.',
    ),
  },
  {
    id: 'washers_board',
    kind: 'sprite',
    w: 860,
    refs: [REF_GARAGE, REF_DEVICES],
    prompt:
      'A single game prop seen exactly from directly above (flat top-down view, no perspective): one long weathered wooden workbench plank lying perfectly horizontal and filling the width of the image, about five times longer than it is tall, with nail heads, scratches and old paint stains. ' +
      'Toward the right end of the plank sits one open round biscuit tin seen from directly above, empty, its inside dark and scratched, dented rim, about two thirds of the plank\'s height in diameter. ' +
      'A rough white chalk ring is drawn on the plank around the tin, a little wider than the tin. Near the left end of the plank, one short white chalk line across it marks the throwing line. Nothing else on the plank: no washers, no tools, no hands. ' +
      `${KEY} ${STYLE}`,
  },

  // ───────────────────────────── The orchard, the morning after night 2 ─────────────────────────────
  // A played cut-scene seen through the protagonist's eyes: one wide shot to walk in on, three places to
  // stand at, and what is picked up there drawn separately so it can leave the picture.
  {
    id: 'plate_orchard',
    kind: 'plate',
    w: 1280,
    refs: [REF_MORNING, REF_HOMESTEAD],
    prompt: plate(
      'First-person view, seen from the standing eye level of someone who has just stepped out of the back door (no person and no hands in the frame), of a small old apple orchard behind a stone cottage at cold dawn after a bad night: ' +
        'low mist between the trunks, tall wet grass, long pale light, a few dark stains and trampled patches left by the night. Composition, left to right: ' +
        'on the LEFT, one big gnarled old apple tree with a few last red apples and a pile of pruned branches at its foot; ' +
        'in the CENTRE, further away, a rough wooden pole about three metres tall with a salvaged security camera strapped to its top with tape and wire, an orange cable running down the pole and then through the grass toward the viewer; ' +
        'a tiny fluffy white rabbit sits at the foot of the pole, seen from behind; ' +
        'on the RIGHT, a sagging wire fence with crooked wooden posts, an old wheelbarrow and apple crates against it, dark forest beyond. Quiet, eerie, beautiful.',
    ),
  },
  {
    id: 'plate_orchard_pole',
    kind: 'plate',
    w: 1280,
    refs: ['art/raw/plate_orchard.png', REF_MORNING],
    prompt: plate(
      'The first attached picture shows an orchard at dawn with a wooden camera pole in its centre: this new picture is a much closer first-person view of the foot of that same pole, same light, same mist, same wet grass (no person, no hands, no animal in the frame). ' +
        'Seen from standing eye level, looking slightly down: the base of the rough wooden pole stands in the upper centre, the orange cable comes down it and lies across the grass toward the bottom of the frame. ' +
        'Halfway along, the cable has been gnawed clean through: two frayed ends with bare copper strands, a hand apart, in the lower right. ' +
        'In the lower centre, right beside the gnawed cable, a round patch of flattened grass is completely EMPTY — nothing sits or lies on it. ' +
        'Misty apple trunks in the background, dew, two fallen red apples.',
    ),
  },
  {
    id: 'plate_orchard_tree',
    kind: 'plate',
    w: 1280,
    refs: ['art/raw/plate_orchard.png', REF_MORNING],
    prompt: plate(
      'The first attached picture shows an orchard at dawn with a big gnarled apple tree on its left: this new picture is a much closer first-person view of the foot of that same tree, same light, same mist, same wet grass (no person, no hands, no animal, no tool in the frame). ' +
        'Seen from standing eye level, looking slightly down: the thick twisted trunk fills the left half, with exposed roots, a pile of pruned branches behind it and fallen red apples in the grass. ' +
        'Between two roots in the lower centre-right, a patch of bare dark earth against the trunk is completely EMPTY — nothing leans or lies there. ' +
        'An old wooden step-ladder leans against a branch in the background, mist beyond.',
    ),
  },
  {
    id: 'plate_orchard_fence',
    kind: 'plate',
    w: 1280,
    refs: ['art/raw/plate_orchard.png', REF_MORNING],
    prompt: plate(
      'The first attached picture shows an orchard at dawn with a sagging wire fence on its right: this new picture is a much closer first-person view of that same fence, same light, same mist, same wet grass (no person, no hands, no animal in the frame). ' +
        'Seen from standing eye level: one thick crooked wooden fence post stands in the centre, rusty wire sagging away from it on both sides, a big bent rusty nail near its top. The upper half of the post is completely BARE — nothing hangs on the nail. ' +
        'On the right, an old wooden wheelbarrow full of windfall apples and two stacked apple crates; on the left, tall grass and nettles. Beyond the fence, the dark forest in the mist.',
    ),
  },
  {
    // What the protagonist looks at while he saws: anything but his arm.
    id: 'plate_orchard_canopy',
    kind: 'plate',
    w: 1280,
    refs: [REF_MORNING],
    prompt: plate(
      'Looking straight up from the ground through the bare twisted branches of an old apple tree at a pale, washed-out dawn sky: a few last red apples, some yellow leaves, drifting mist, one leaf falling. ' +
        'The view is slightly tilted, as if dizzy. No people, no hands, no birds.',
    ),
  },
  {
    // Every way the morning can end badly, seen from the grass.
    id: 'plate_orchard_end',
    kind: 'plate',
    w: 1280,
    refs: ['art/raw/plate_orchard.png', REF_ANIMALS],
    prompt: plate(
      'View from the ground in the same orchard as the first attached picture, same dawn light and mist: the viewer lies on their side in the wet grass, so the horizon is tilted about 30 degrees; big blurred grass blades and one fallen red apple are very close in the foreground. ' +
        'A few steps away, sharp and in the centre, a small fluffy white rabbit sits upright and looks straight at the viewer, perfectly calm: its muzzle and chest fur are stained dark brownish red, one eye is milky white. ' +
        'Behind it, the wooden camera pole and misty apple trees. Eerie, quiet, faintly absurd. No people, no hands.',
    ),
  },
  {
    id: 'orchard_rabbit',
    kind: 'split',
    cols: 2,
    rows: 2,
    names: ['back', 'bolt', 'infected', 'lunge'],
    h: 460,
    refs: [REF_ANIMALS],
    prompt:
      'Game asset sheet: a 2x2 grid showing the SAME small fluffy white rabbit four times, one per quadrant, each centred in its quadrant with wide empty margins, all at the same scale, seen from the eye level of a person standing over it. ' +
      'Top-left: the rabbit seen from BEHIND, sitting upright: round fluffy back and tail toward the viewer, long ears up, head bent down, busy nibbling something held low in front of it. Adorable, perfectly clean white fur. ' +
      'Top-right: the same clean rabbit seen from behind, startled and bolting: body stretched low, ears pinned back, hind legs kicking off as it leaps away from the viewer. ' +
      'Bottom-left: the same rabbit now turned to FACE the viewer, sitting upright, and clearly infected: one side of its face has lost its fur and shows grey-green rotting skin, one eye milky white and bulging, the other dark red, ' +
      'long yellow incisors bared and dripping dark brownish-red blood, chest fur matted and stained, a short strand of orange cable hanging from its mouth. Horrifying — with the dry humour that it is still a small fluffy rabbit. ' +
      'Bottom-right: the same infected rabbit leaping straight AT the viewer, strongly foreshortened: wide open bloody mouth and incisors first, front paws spread, ears streaming back. ' +
      `The insides of the ears are pale grey-beige, never pink. ${KEY} ${STYLE}`,
  },
  {
    id: 'orchard_items',
    kind: 'split',
    cols: 2,
    rows: 1,
    names: ['saw', 'rope'],
    h: 520,
    refs: [REF_DEVICES, REF_GARAGE],
    prompt:
      'Game asset sheet: TWO separate objects side by side with a wide empty gap between them, each centred in its half, seen straight on at eye level. ' +
      'LEFT: an old rusty bow saw for pruning trees — a curved tubular steel frame with a thin toothed blade stretched across it, rust-brown all over, flaking red paint on the grip — standing upright on the tip of its frame and leaning slightly to the right, as if propped against a tree trunk. ' +
      'RIGHT: a coil of old frayed hemp rope hanging as if from a nail: several loops gathered and bound in the middle, one loose end dangling. ' +
      `${KEY} ${STYLE}`,
  },
  {
    id: 'orchard_clap',
    kind: 'sprite',
    h: 640,
    refs: [REF_STORYBOARD],
    sheet: 'art/raw/desk.png',
    prompt: 'Single first-person right hand poised to clap, nearly edge-on, palm facing left, fingers extended together. Long vertical mustard work-jacket sleeve with a brown knitted cuff and a flat cut at the bottom. ' + KEY + ' ' + STYLE,
  },
  {
    // The left arm, seen by its owner: raised against the rabbit, bitten, then tied off.
    id: 'orchard_arm',
    kind: 'split',
    cols: 3,
    rows: 1,
    names: ['guard', 'bitten', 'tied'],
    cut: 'gaps',
    h: 640,
    refs: [REF_STORYBOARD, REF_ANIMALS],
    sheet: 'art/raw/desk.png',
    prompt:
      'Game asset sheet: THREE separate first-person views of a man’s LEFT arm seen from his own eyes, standing in a single row, evenly spaced with wide empty gaps between them. ' +
      'The first attached image shows this man’s right hand in the worn mustard-yellow sleeve of his work jacket: the left arm wears the same sleeve and has the same skin and the same drawing style. From left to right: ' +
      '(1) The left forearm raised across the view as a shield, running diagonally from the lower left to the upper right, fist clenched: a small fluffy white infected rabbit (milky eye, patchy grey-green face) is clamped onto the middle of the forearm, biting through the sleeve, hind legs kicking in the air, seen from very close; a dark brownish-red stain spreads in the sleeve around its teeth. ' +
      '(2) The left forearm and hand reaching straight up from the bottom of the image, elbow at the bottom, the back of the trembling half-open hand at the top: the sleeve is torn open around a deep ragged bite in the middle of the forearm, dark brownish-red blood running toward the elbow. The arm ends at the bottom in a clean straight horizontal cut. ' +
      '(3) Exactly the same arm as (2), same angle and same size, now with a tourniquet: old hemp rope wound three times, very tight, around the arm just below the bite (between the bite and the elbow), knotted, with a short stick twisted into the knot. ' +
      `Cold dawn daylight. The three figures are tall and nearly fill the height of the canvas. ${KEY} ${STYLE}`,
  },

  {
    // More of the rabbit, so that it moves instead of being swapped: it stops chewing, it looks round, it gathers itself.
    id: 'orchard_rabbit_more',
    kind: 'split',
    cols: 2,
    rows: 2,
    names: ['ears', 'side', 'snarl', 'leap'],
    h: 460,
    refs: [REF_ANIMALS],
    sheet: 'art/raw/orchard_rabbit.png',
    prompt:
      'Game asset sheet: a 2x2 grid showing the SAME small fluffy white rabbit four times, one per quadrant, each centred in its quadrant with wide empty margins, all at the same scale. ' +
      'The first attached image is the existing sheet of this rabbit: it must be exactly the same animal — same fur, same proportions, same drawing style, same size in its quadrant. ' +
      'Top-left: seen from BEHIND, sitting upright exactly like the top-left figure of the attached sheet, but it has stopped nibbling: head raised, both ears standing straight up and swivelled back toward the viewer, body tense and still. Perfectly clean white fur. ' +
      'Top-right: still seen from behind, the body in the same sitting position, but the head is turning round over its shoulder: the head is in profile and shows only the clean, healthy side of its face — one dark shiny eye, nose, whiskers. Still adorable. Clean white fur. ' +
      'Bottom-left: the infected rabbit of the bottom-left figure of the attached sheet (one side of the face rotten grey-green, one milky eye, bloody chest, strand of orange cable in the mouth), facing the viewer, now crouched low on its haunches ready to spring: shoulders down, hindquarters bunched, ears flat back, lips pulled up over long yellow incisors. ' +
      'Bottom-right: the same infected rabbit just leaving the ground, jumping toward the viewer and upward: body stretched, front paws reaching forward, mouth half open — earlier in the leap, and smaller in its quadrant, than the bottom-right figure of the attached sheet. ' +
      `The insides of the ears are pale grey-beige, never pink. ${KEY} ${STYLE}`,
  },
  {
    // What is between the eye and the picture: it slides faster than the plate behind it, which is what gives the orchard depth.
    id: 'orchard_fg',
    kind: 'split',
    cols: 3,
    rows: 1,
    names: ['grass_a', 'grass_b', 'branch'],
    cut: 'gaps',
    h: 560,
    refs: ['art/raw/plate_orchard_pole.png'],
    prompt:
      'Game asset sheet: THREE separate foreground elements standing in a row with wide empty gaps between them, drawn like the wet grass and the apple trees of the attached picture but darker and simpler, as things seen very close and slightly out of focus, with a thin rim of cold dawn light. From left to right: ' +
      '(1) a tall clump of wild grass and nettles beaded with dew, growing straight up from a flat bottom edge, the blades leaning to the right; ' +
      '(2) a different tall clump of grass with seed heads and one dandelion clock, growing up from a flat bottom edge, the blades leaning to the left; ' +
      '(3) the end of an apple-tree branch hanging down from a flat top edge: twisted dark twigs, yellow and orange autumn leaves, one small red apple. ' +
      `No flowers, nothing pink or purple. Each element is tall and nearly fills the height of the canvas. ${KEY} ${STYLE}`,
  },

  // ───────────────────────────── The shed, the morning after night 4 ─────────────────────────────
  // A played cut-scene in the same shed as the last scene, by day: one wide shot to walk in on, three places
  // to stand at, a wall to look at instead, and the man chained to the post drawn separately so he can move.
  {
    id: 'plate_shed',
    kind: 'plate',
    w: 1280,
    refs: ['art/raw/plate_finale_shed.png', REF_MORNING],
    prompt: plate(
      'First-person view from standing eye level in the open doorway of the same old wooden garden shed as the first attached picture, looking INTO it, but on a cold misty morning: pale daylight falls in from behind the viewer in a long slanting beam full of dust, the back of the shed stays dim. No person, no hands, no animal in the frame. ' +
        'Composition, left to right: on the LEFT wall, a long scarred workbench under a wall of hanging tools (coiled orange hose, pruning saw, spade, pliers), a car battery and a tangle of red and black jump leads lying on the bench, a claw hammer beside them; ' +
        'in the CENTRE at the back, a thick square wooden roof post rising from the earth floor to the roof beam, a heavy rusty iron chain padlocked around its foot and lying slack on the floor; the patch of trampled floor just in front of the post is completely EMPTY — nobody sits there — with a dented white enamel bowl knocked over beside it; ' +
        'on the RIGHT, a low plank shelf with a blue plastic water jerrycan with a tap, an open plain paper sack of flour with a tin scoop in it, glass jars; and in the far right corner, something big hidden under a dirty olive-green canvas tarpaulin tied down with orange ratchet straps — a low wide hump in front and two tall boxy shapes behind it — one thick orange cable snaking out from under the tarpaulin to a row of three car batteries on the floor. ' +
        'Cobwebs, a small dusty window high on the right wall, flowerpots, sacks. Quiet, uneasy, a little absurd.',
    ),
  },
  {
    id: 'plate_shed_post',
    kind: 'plate',
    w: 1280,
    refs: ['art/raw/plate_shed.png', 'art/raw/plate_finale_shed.png'],
    prompt: plate(
      'The first attached picture shows the inside of a wooden garden shed on a misty morning with a thick wooden post at the back: this new picture is a much closer first-person view of the foot of that same post, same light, same dust, same earth floor (no person, no hands, no animal in the frame). ' +
        'Seen from standing eye level, looking slightly down: the thick square wooden post rises in the upper centre, a heavy rusty iron chain wrapped twice around its foot and closed with a big old brass padlock, the free end of the chain lying in loose coils on the floor toward the lower left. ' +
        'The whole lower centre of the picture, in front of the post, is a patch of trampled earth floor that is completely EMPTY — nothing sits, lies or stands there — with scuff marks and a little spilled flour. ' +
        'Behind the post, the dim plank back wall of the shed with a hanging coil of rope and a cobweb; a pale stripe of daylight from the door crosses the floor.',
    ),
  },
  {
    id: 'plate_shed_bench',
    kind: 'plate',
    w: 1280,
    refs: ['art/raw/plate_shed.png', 'art/raw/plate_finale_shed.png'],
    prompt: plate(
      'The first attached picture shows the inside of a wooden garden shed on a misty morning with a workbench on its left: this new picture is a much closer first-person view of that same workbench, same light, same dust (no person, no hands in the frame). ' +
        'Seen from standing eye level: the scarred wooden workbench runs across the lower half; on it, on the LEFT, a heavy old car battery with a pair of red and black jump leads coiled beside it, their copper clamps open; in the CENTRE-RIGHT a claw hammer lying on its side, a vice, screws in a tin. ' +
        'Above the bench, the plank wall with hanging tools: a coiled orange hose, a pruning saw, a spade, pliers, a pair of shears; a small grimy window with cobwebs letting in pale light at the top right. Jerrycans under the bench.',
    ),
  },
  {
    // The same bench with nothing left lying on it: the scene paints a piece of this one over whatever
    // has been picked up (scenes/shed.ts `BENCH_ITEMS`), so the leads and the hammer leave the picture.
    id: 'plate_shed_bench_bare',
    kind: 'plate',
    w: 1280,
    edit: 'art/raw/plate_shed_bench.png',
    prompt:
      'Edit the attached illustration. Reproduce it EXACTLY — same composition and framing, every object in the same position and at the same size, same line work, same colours, same light, same canvas proportions — with only this change: ' +
      'two things are taken off the workbench. (1) The coiled red and black jump leads with their copper clamps, lying on the bench top between the car battery and the hammer, are gone. (2) The claw hammer with the wooden handle lying on the bench top is gone. ' +
      'Where they were, paint the bare scarred wooden bench top, continuing its planks, stains, wear and light exactly as around it, and the foot of the plank wall behind. ' +
      'The car battery on the left, the tin of screws, the vice, the tools hanging on the wall, the hose, the window, the drawers and the jerrycans stay exactly as they are. Nothing else in the picture changes.',
  },
  {
    id: 'plate_shed_shelf',
    kind: 'plate',
    w: 1280,
    refs: ['art/raw/plate_shed.png', 'art/raw/plate_finale_shed.png'],
    prompt: plate(
      'The first attached picture shows the inside of a wooden garden shed on a misty morning with a shelf and a tarpaulin-covered shape on its right: this new picture is a much closer first-person view of that same corner, same light, same dust (no person, no hands in the frame). ' +
        'Seen from standing eye level: on the LEFT half, a low rough plank shelf holding a blue plastic water jerrycan with a little tap, an open plain brown paper sack of flour with a tin scoop stuck in it and some flour spilled on the plank, glass jars and a stack of old terracotta flowerpots; ' +
        'on the RIGHT half, the side of something big hidden under a dirty olive-green canvas tarpaulin held down by tight orange ratchet straps: the tarpaulin drapes over a tall flat-fronted boxy shape, and at its lower corner it has slipped a hand’s width, showing only a strip of black speaker-grille cloth and one chrome metal corner protector. ' +
        'A thick orange cable comes out from under the tarpaulin and runs along the floor to a row of three car batteries. Nothing explains what it is.',
    ),
  },
  {
    // Where the protagonist looks while the current runs: anything but the man.
    id: 'plate_shed_wall',
    kind: 'plate',
    w: 1280,
    refs: ['art/raw/plate_shed.png'],
    prompt: plate(
      'Inside the same wooden garden shed as the attached picture, a close first-person view of a bare stretch of its plank wall beside the small cobwebbed window, on a misty morning: thin bright stripes of daylight come through the gaps between the weathered vertical planks and lie across the wall, dust hangs in them. ' +
        'The middle of the wall is a large, plain, evenly lit area of old pale planks with nothing hanging on it, like a screen. At the top, the dim roof beam with a cobweb; at the bottom edge, the top of a stack of empty flowerpots. No person, no shadow of a person, no hands.',
    ),
  },
  {
    // The way the morning in the shed ends a run, seen from the floor.
    id: 'plate_shed_end',
    kind: 'plate',
    w: 1280,
    refs: ['art/raw/plate_shed.png', REF_NEIGHBORS],
    prompt: plate(
      'View from the earth floor of the same wooden garden shed as the first attached picture, misty morning light: the viewer lies on their side, so the picture is tilted about 25 degrees; a knocked-over white enamel bowl and a spill of flour are very close in the foreground. ' +
        'A few steps away, sitting calmly against the wooden post with a slack iron chain at his ankle, an infected village baker — round, balding, grey moustache, white flour-dusted vest and a long white apron, pale grey-green skin, one milky white eye — looks straight at the viewer with an almost apologetic expression, a little flour on his cheek and dark blood on his chin. ' +
        'Dust in the slanting light. Eerie, quiet, faintly absurd. No other people, no hands.',
    ),
  },
  {
    // The man chained to the post. Four states of the same figure, all sitting at the same place on the floor.
    id: 'shed_baker',
    kind: 'split',
    cols: 2,
    rows: 2,
    names: ['feral', 'drift', 'lucid', 'lunge'],
    h: 560,
    refs: [REF_NEIGHBORS],
    prompt:
      'Game asset sheet: a 2x2 grid showing the SAME man four times, one pose per quadrant, each figure centred in its quadrant with wide empty margins, all at the same scale, seen from the front at the eye level of a person standing in front of him. ' +
      'He is the village baker, infected, drawn like the infected neighbours of the attached concept art: a round, heavy-set man in his fifties, balding with a grey fringe and a thick grey moustache, bare thick forearms, a white sleeveless vest and a long white baker’s apron, both dusted with flour and stained, rolled grey trousers, worn clogs; pale grey-green skin with dark veins at the temples. ' +
      'An old iron shackle is closed around his left ankle (no chain attached in the picture). ' +
      'Top-left (FERAL): crouched low on his haunches on the floor, straining forward, shoulders hunched, both hands clawed, lips pulled back over his teeth, both eyes milky white, a snarl. ' +
      'Top-right (DRIFTING): sitting on the floor with his legs folded, slumped, head lolling to one side, mouth half open, eyes half closed and cloudy; his hands in his lap are busy kneading the air as if working an invisible ball of dough — an old habit. ' +
      'Bottom-left (LUCID): sitting up straight on the floor, looking straight at the viewer; his left eye is still milky white but his right eye has come back — a clear, warm brown, human eye — tired, sad and a little embarrassed, the corner of his moustache lifting in a faint apologetic smile, hands resting open on his knees. ' +
      'Bottom-right (LUNGE): launching himself straight AT the viewer on hands and knees, strongly foreshortened, both arms flung forward, fingers spread, mouth wide open, both eyes white. ' +
      `${KEY} ${STYLE}`,
  },
  {
    // More of him, so that he moves instead of being swapped.
    id: 'shed_baker_more',
    kind: 'split',
    cols: 2,
    rows: 2,
    names: ['drink', 'knead', 'slump', 'stand'],
    h: 560,
    refs: [REF_NEIGHBORS],
    sheet: 'art/raw/shed_baker.png',
    prompt:
      'Game asset sheet: a 2x2 grid showing the SAME man four times, one pose per quadrant, each figure centred in its quadrant with wide empty margins, all at the same scale as in the attached sheet, seen from the front at the eye level of a person standing in front of him. ' +
      'The first attached image is the existing sheet of this man, the infected village baker: he must be exactly the same man — same face, moustache, white vest and apron, flour, grey-green skin, iron shackle on the left ankle, same drawing style, same size in his quadrant. ' +
      'Top-left (DRINKING): sitting on the floor, leaning forward with his chin raised and his lips pushed out toward something held just in front of his face, eyes closed, both hands raised and cupped in the air in front of his chest. ' +
      'Top-right (KNEADING): sitting on the floor with his legs folded, his hands and forearms white with flour, kneading a small lump of flour paste on his apron with tender concentration, looking down at his hands; his right eye is a clear human brown, a calm, almost happy face. ' +
      'Bottom-left (SPENT): sitting on the floor, slumped forward and to the side, exhausted, head hanging low, hair stuck with sweat, arms limp, trembling, a thin wisp of smoke rising from the singed edge of his apron, both eyes white and empty. ' +
      'Bottom-right (STANDING): standing up straight, seen from the front, his right hand pressed flat on his heart and his head bowed in a small grateful nod, his right eye clear and human, a little flour on his cheek, the open iron shackle lying at his feet. ' +
      `${KEY} ${STYLE}`,
  },
  {
    // The protagonist's right hand, for every gesture of the scene.
    id: 'shed_hands',
    kind: 'split',
    cols: 5,
    rows: 1,
    names: ['bowl', 'flour', 'key', 'leads', 'hammer'],
    cut: 'gaps',
    h: 640,
    refs: [REF_STORYBOARD],
    sheet: 'art/raw/desk.png',
    prompt:
      'Game asset sheet: FIVE separate first-person views of a man’s RIGHT hand and forearm seen from his own eyes, standing in a single row, evenly spaced with wide empty gaps between them, each centred in its own fifth of the canvas. ' +
      'The first attached image shows this man’s right hand in the worn mustard-yellow sleeve of his work jacket: every hand here is that same hand, same sleeve, same skin and same drawing style — the back of the hand at the top, reaching away from the viewer, and the long sleeve running straight down below it, ending at the bottom in a clean straight horizontal cut. From left to right: ' +
      '(1) the hand holding a dented white enamel bowl full of clear water from underneath, fingers spread under it, the bowl level; ' +
      '(2) the hand cupped palm up, holding a small heap of white flour, a little of it dusting off the fingers; ' +
      '(3) the hand holding a small old iron key pinched between thumb and index finger, the key pointing up and away; ' +
      '(4) the hand holding a red copper battery clamp of a jump lead, the clamp open, its red cable running down along the sleeve; ' +
      '(5) the hand gripping a claw hammer by its wooden handle, the steel head up. ' +
      `Cold daylight from the upper left. The five arms are tall figures that nearly fill the height of the canvas. ${KEY} ${STYLE}`,
  },
  {
    // What is between the eye and the picture: it slides faster than the plate behind it.
    id: 'shed_fg',
    kind: 'split',
    cols: 3,
    rows: 1,
    names: ['door', 'pots', 'rope'],
    cut: 'gaps',
    h: 600,
    refs: ['art/raw/plate_shed.png'],
    prompt:
      'Game asset sheet: THREE separate foreground elements standing in a row with wide empty gaps between them, drawn like the wooden shed of the attached picture but darker and simpler, as things seen very close and slightly out of focus, with a thin rim of cold morning light. From left to right: ' +
      '(1) the edge of an open wooden shed door seen edge-on: a tall narrow strip of weathered grey-green planks with a rusty iron hinge and a cross brace, standing up from a flat bottom edge to nearly the full height; ' +
      '(2) a stack of old terracotta flowerpots and a slumped hessian sack, growing up from a flat bottom edge; ' +
      '(3) a coil of old hemp rope and a dusty hurricane lantern hanging down on a hook from a flat top edge, with a cobweb. ' +
      `Nothing pink or purple. Each element is tall and nearly fills the height of the canvas. ${KEY} ${STYLE}`,
  },

  // ───────────────────────────── The radio, the morning after night 6 ─────────────────────────────
  // A played cut-scene at the camera desk: the old CB set that only ever gave static, seen from the chair,
  // then close on its front panel. The needle, the readout, the trace on the monitor, the knob turning and
  // the microphone are drawn or moved by the scene: the plates leave them blank or empty.
  {
    id: 'plate_radio',
    kind: 'plate',
    w: 1280,
    refs: [C('12-surveillance-room.png'), REF_MORNING],
    prompt: plate(
      'First-person view from the wooden chair of the improvised surveillance room in the first attached picture (same room, same desk, same boarded window, same salvaged monitors, same desk lamp, same warm brown wood), looking down at the desk on a grey early morning. No person, no hands, no arms in the frame. ' +
        'Pale cold daylight comes through the gaps between the planks nailed over the window on the LEFT; the desk lamp is still on and throws a warm pool of light; dust hangs in the light. ' +
        'In the CENTRE of the desk, pulled to the front edge and filling the lower middle of the picture, an old 1970s CB radio transceiver: a wide, low box in a dented grey-green metal case with wood-grain side panels. On its front panel, from left to right: a round analog signal meter with a plain cream dial face behind a small glass window, with NO needle and NO markings on it; a dark empty rectangular readout window; a thumb-and-finger-sized scalloped black bakelite tuning knob; a row of small chrome toggle switches along the bottom edge. ' +
        'On the right side of the set, an empty bent-wire hook where a hand microphone should hang, and a curly black coiled cable coming out of the set. A thin antenna wire runs from the back of the set up to the window frame, taped with grey tape. ' +
        'Around it on the desk: a chipped enamel mug of coffee, an ashtray with old butts, a notepad with illegible pencil scribbles, a screwdriver, two cassette tapes, a pencil, a battery. Behind the set, the stack of salvaged CCTV monitors on their wooden shelf, every screen showing grey snow. ' +
        'Quiet, lonely, a little absurd.',
    ),
  },
  {
    id: 'plate_radio_set',
    kind: 'plate',
    w: 1280,
    refs: ['art/raw/plate_radio.png', C('12-surveillance-room.png')],
    prompt: plate(
      'The first attached picture shows an old CB radio transceiver on a wooden desk in a dim room at dawn: this new picture is a much closer first-person view of the FRONT PANEL of that same transceiver, same set, same colours, same light, seen straight on from the chair, slightly from above. No person, no hands, no microphone in the frame. ' +
        'The front panel fills most of the picture: on the LEFT third, a large round analog signal meter behind a glass window, its cream dial face completely plain and empty — NO needle, NO scale, NO markings at all — with a faint warm backlight; in the CENTRE, a wide dark rectangular readout window, plain black glass, empty; on the RIGHT third, uninterrupted worn metal where the separate tuning knob sprite will go; along the bottom edge, a row of small chrome toggle switches and a small round speaker grille. ' +
        'The dented grey-green metal case, scratched, with wood-grain side panels; on the right edge of the set, an empty bent-wire hook where a hand microphone hangs. Around the set, the edge of the wooden desk, a mug, a pencil, cigarette ash, cassette tapes; the lamp light warm from the upper left, cold daylight from a boarded window. Dust in the air.',
    ),
  },
  {
    id: 'radio_tuning_knob',
    kind: 'sprite',
    h: 320,
    refs: ['art/raw/radio_parts.png'],
    prompt: 'One perfectly round black bakelite tuning knob seen straight along its shaft. Scalloped grip, worn finish, thin ivory pointer at twelve and one recessed finger dimple. No mount, side view or cast shadow. ' + KEY + ' ' + STYLE,
  },
  {
    id: 'radio_parts',
    kind: 'split',
    cols: 2,
    rows: 1,
    // The hand microphone is the second cell of the original parts sheet.
    names: [null, 'mic'],
    cut: 'gaps',
    h: 420,
    refs: ['art/raw/plate_radio.png'],
    prompt:
      'Game asset sheet: TWO separate objects side by side with a wide empty gap between them, drawn like the old CB radio of the attached picture. ' +
      '(1) LEFT: one very big round black bakelite tuning knob seen exactly from the front, perfectly circular, a knurled ridged rim, a slightly domed centre with a little chrome cap, and one thin white pointer line painted from the centre to the rim, pointing straight up. ' +
      '(2) RIGHT: a chunky black 1970s CB hand microphone seen from the front, hanging upright: a rounded rectangular body with a perforated chrome grille on its upper half, a ridged push-to-talk bar along its left side, and a short stub of black curly coiled cord coming out of its bottom end and cut off. ' +
      `Nothing pink or purple. ${KEY} ${STYLE}`,
  },
  {
    // The protagonist's right hand on the set: turning the knob, or holding the microphone up to his mouth.
    id: 'radio_hands',
    kind: 'split',
    cols: 2,
    rows: 1,
    names: ['dial', 'mic'],
    // The dial pose on this sheet shows the back of a left hand.
    mirrorSprites: ['radio_hands_dial'],
    cut: 'gaps',
    h: 640,
    refs: [REF_STORYBOARD, 'art/raw/plate_radio.png'],
    sheet: 'art/raw/desk.png',
    prompt:
      'Game asset sheet: TWO separate first-person views of a man’s RIGHT hand and forearm seen from his own eyes, standing side by side with a wide empty gap between them, each centred in its own half of the canvas. ' +
      'The first attached image shows this man’s right hand in the worn mustard-yellow sleeve of his work jacket: every hand here is that same hand, same sleeve, same skin and same drawing style — the hand at the top, reaching away from the viewer, and the long sleeve running straight down below it, ending at the bottom in a clean straight horizontal cut. ' +
      '(1) LEFT: the hand seen from above and behind, its thumb and fingertips curled and pinched together around the rim of a big round knob that is NOT drawn — an empty circle of air between the fingertips, as if turning a radio dial, the wrist slightly twisted. ' +
      '(2) RIGHT: the hand holding a chunky black 1970s CB hand microphone upright, the thumb pressing the ridged push-to-talk bar on its side, the perforated chrome grille at the top pointing away, a black curly coiled cord hanging from the bottom of the microphone down along the sleeve. ' +
      `Grey dawn light from the upper left. The two arms are tall figures that nearly fill the height of the canvas. ${KEY} ${STYLE}`,
  },
  {
    // Who calls when the run met nobody: never seen in the scene, only on the card at the end.
    id: 'por_ham',
    kind: 'sprite',
    h: 360,
    refs: [REF_NEIGHBORS],
    prompt:
      'One head-and-shoulders bust portrait of a living (not infected) old man, framed like the busts in the reference: a radio amateur in his seventies on a hill farm, thin white hair and big ears, a grey stubble, a shapeless brown cardigan buttoned wrong over a checked flannel shirt, a pair of old binoculars hanging from his neck, big old-fashioned headphones pushed down around his neck, holding a black CB hand microphone close to his mouth with both hands as if it were precious; ' +
      'he smiles politely at nobody, eyes a little wet, a hopeful and very lonely face. Healthy skin tones, normal eyes. Only the one person, centred, with wide margins. ' +
      `${KEY} ${STYLE}`,
  },

  // ───────────────────────────── The end ─────────────────────────────
  // The house always falls in the end. Early on, that is the desk and a door giving way; from the
  // fifth night it is the ride-on mower from the shed, two amplifier stacks and a guitar.
  {
    id: 'plate_finale_desk',
    kind: 'plate',
    w: 1280,
    refs: [C('12-surveillance-room.png'), REF_NEIGHBORS, REF_MAYOR_WAVE],
    prompt: plate(
      'First-person view from the swivel chair of the improvised surveillance room in the reference (no part of the viewer in the frame), turned away from the desk toward the door of the room, at night: ' +
        'the wooden door has just been smashed off its hinges and a crowd of infected villagers (pale grey-green skin, white eyes, torn everyday clothes, some in slippers and aprons) is pouring in through the doorway and over the fallen door, ' +
        'the nearest ones already very close, arms stretched toward the viewer, mouths open. On the left edge, part of the desk with its glowing salvaged monitors and tangled cables, one screen showing only static; a knocked-over mug. ' +
        'Cold blue monitor light on the infected, warm hallway light behind them, dust and splinters in the air. Frightening, crowded, with the dry humour of very ordinary neighbours.',
    ),
  },
  {
    id: 'plate_finale_shed',
    kind: 'plate',
    w: 1280,
    refs: ['art/raw/plate_orchard.png', REF_DEVICES, REF_HOMESTEAD],
    prompt: plate(
      'Night, at the bottom of a country garden: the double doors of an old wooden garden shed have just been thrown wide open, seen from outside from a low heroic angle. Inside, lit by one bare hanging bulb and its own two headlights, stands a home-modified ride-on lawn mower (a small red garden tractor): ' +
        'a huge sharpened steel blade, like a snowplough made from mower blades and sheet metal, is bolted across its front; two enormous black guitar amplifier stacks are strapped upright behind the seat with ratchet straps, wired to a row of car batteries with thick orange cables; ' +
        'a battered electric guitar hangs by its strap from the steering wheel. Tools, jerrycans and coils of cable on the shed walls, moths in the headlight beams, mist on the grass outside. Nobody in the picture. Ridiculous and magnificent.',
    ),
  },
  {
    // Scrolled sideways behind the mower, tiled with its own mirror image: both side edges must be plain.
    id: 'plate_finale_run',
    kind: 'plate',
    w: 1280,
    refs: [REF_VILLAGE, REF_MAYOR_WAVE],
    prompt: plate(
      'A side-on view (like a theatre backdrop, the horizon perfectly level, no perspective lines leading into the picture) of a country lane at night along the edge of a French village: ' +
        'in the bottom third a flat band of trampled grass and a dirt track running straight from the left edge to the right edge; behind it a low stone wall, garden fences, apple trees, two half-timbered cottages with dark windows, a leaning street lamp, a burning barricade throwing orange light and sparks; ' +
        'dark forest and a big pale moon behind thin clouds at the top. No people, no infected, no vehicles. The left and right edges of the picture show only plain night sky, hedge and grass, so the picture can be repeated side by side.',
    ),
  },
  {
    id: 'plate_finale_swarmed',
    kind: 'plate',
    w: 1280,
    refs: ['art/raw/plate_finale_shed.png', REF_NEIGHBORS, REF_MAYOR_WAVE],
    prompt: plate(
      'Night, in a village lane, seen from a little above: the modified red ride-on lawn mower from the first attached picture (huge blade at the front, two giant black amplifier stacks strapped behind the seat) has stopped, out of petrol, in the middle of an enormous crowd of infected villagers (pale grey-green skin, white eyes, everyday clothes) ' +
        'that closes over it from every side like a wave — dozens and dozens of them, climbing the amplifiers, filling the whole picture to its edges. In the very centre, above the heads, one arm in a mustard-yellow work jacket sleeve still holds an electric guitar up by the neck, triumphant, lit by the mower headlights and a shower of sparks from a toppling amplifier. ' +
        'A trail of flattened infected behind the mower shows the way it came. Orange firelight, big moon. Defeat, but a glorious one.',
    ),
  },
  {
    // The seventh dawn: the quiet village of plate_victory, and then the same picture with everyone in it.
    // An edit, so the two can be dissolved into one another without anything else moving.
    id: 'plate_finale_dawn',
    kind: 'plate',
    w: 1280,
    edit: 'art/raw/plate_victory.png',
    prompt:
      'Edit the attached illustration. Reproduce it EXACTLY — same composition and framing, the same cottage, car, fences, vegetable beds, mown strip and objects lying in the grass, every one in the same position and at the same size, the same golden sunrise light, the same line work and colours, the same canvas size — with only this change: ' +
      'the garden, the mown strip, the vegetable beds, the lane and the hillside beyond the gate are now crowded with infected villagers, about forty of them, standing perfectly still, every one of them turned toward the front door of the cottage, arms hanging, waiting: ' +
      'pale grey-green skin, white eyes, torn everyday autumn clothes — knitted cardigans, aprons, flat caps, slippers, overalls, a dressing gown. Each casts a long morning shadow. Nobody moves and nobody attacks: they simply did not leave at sunrise. ' +
      'The crow is still on the fence post. Unsettling, quiet and absurdly patient.',
  },
  {
    // How it ends after the seventh dawn: the same picture as plate_finale_swarmed, in the morning.
    id: 'plate_finale_swarmed_dawn',
    kind: 'plate',
    w: 1280,
    edit: 'art/raw/plate_finale_swarmed.png',
    prompt:
      'Edit the attached illustration. Reproduce it EXACTLY — same composition and framing, the same mower, amplifier stacks, raised guitar, sparks and crowd, every figure in the same position and at the same size, the same line work, the same canvas size — with only this change: it is early morning instead of night. ' +
      'Remove the moon and the dark night sky: a pale sunrise sky, pink and gold, the low sun breaking between the rooftops at the top left; long golden morning light rakes across the crowd from the left; thin morning mist in the lane behind; the street lamps and the windows are unlit. The mower headlights and the sparks still glow. Nothing else changes.',
  },
  {
    // With one arm there is one hand on the guitar: the one at the top of the neck goes.
    id: 'plate_finale_swarmed_one_arm',
    kind: 'plate',
    w: 1280,
    edit: 'art/raw/plate_finale_swarmed.png',
    prompt:
      'Edit the attached illustration. Reproduce it EXACTLY — same composition and framing, every figure and object in the same position and at the same size, same line work, same colours, same light, same canvas proportions — with only this change: ' +
      'the electric guitar raised above the crowd in the centre is held up by ONE hand only, the hand at the end of the single mustard-yellow sleeve rising from the mower seat. Remove the other hand, the one gripping the top of the guitar neck near the headstock, and its wrist: paint the sparks, the orange glow and the night behind it instead. ' +
      'The mustard-yellow sleeved arm, its hand, the guitar and its strap stay exactly as they are. Nobody and nothing else in the picture changes.',
  },
  {
    // The same, for the morning the seventh dawn ends on.
    id: 'plate_finale_swarmed_dawn_one_arm',
    kind: 'plate',
    w: 1280,
    edit: 'art/raw/plate_finale_swarmed_dawn.png',
    prompt:
      'Edit the attached illustration. Reproduce it EXACTLY — same composition and framing, every figure and object in the same position and at the same size, same line work, same colours, same morning light, same canvas proportions — with only this change: ' +
      'the electric guitar raised above the crowd in the centre is held up by ONE hand only, the hand at the end of the single mustard-yellow sleeve rising from the mower seat. Remove the other hand, the one gripping the top of the guitar neck near the headstock, and its wrist: paint the sparks and the pale morning sky behind it instead. ' +
      'The mustard-yellow sleeved arm, its hand, the guitar and its strap stay exactly as they are. Nobody and nothing else in the picture changes.',
  },
  {
    id: 'finale_mower',
    kind: 'split',
    cols: 2,
    rows: 1,
    // The one-armed rider of this sheet lost the wrong arm (the near one, his right): it is redrawn below.
    names: ['rider', null],
    h: 520,
    refs: ['art/raw/plate_finale_shed.png', 'art/raw/plate_smoke.png'],
    prompt:
      'Game asset sheet: the SAME vehicle and rider drawn TWICE, side by side with a wide empty gap between them, same size, same pose, both seen exactly from the side and facing RIGHT. ' +
      'The vehicle is the modified red ride-on lawn mower of the first attached picture: a huge sharpened steel blade bolted across its front (on the right), two enormous black guitar amplifier stacks strapped upright at the back (on the left), car batteries and orange cables, headlights on. ' +
      'The rider is the scruffy bearded man in the mustard-yellow work jacket of the second attached picture: he stands on the footplates, legs apart, head thrown back, mouth open in a yell, playing a battered electric guitar slung on a strap. ' +
      'LEFT drawing: he has both arms — left hand on the neck of the guitar, right hand strumming. ' +
      'RIGHT drawing: identical in every respect except that his left arm is missing below the shoulder — the empty left jacket sleeve is knotted — and he plays with his right hand alone, hammering the strings on the neck. ' +
      `${KEY} ${STYLE}`,
  },

  {
    // The rider of the sheet above, his left arm gone. Seen from the side facing right, his left arm is
    // the far one, whose hand is on the neck; the near one, his right, keeps strumming.
    id: 'finale_mower_rider_one_arm',
    kind: 'sprite',
    h: 520,
    refs: ['art/raw/finale_mower.png'],
    prompt:
      'Game asset: ONE single drawing, centred, with wide empty margins. Draw again, identically, the LEFT drawing of the attached sheet — the modified red ride-on lawn mower with the huge steel blade at the front (on the right) and the two black amplifier stacks strapped at the back (on the left), and the scruffy bearded man in the mustard-yellow work jacket standing on its footplates, head thrown back, yelling — same mower, same man, same pose, same angle (exactly from the side, facing RIGHT), same proportions, same colours, same line work. ' +
      'Only one change: the man has lost his LEFT arm, which — as he faces right with his chest toward the viewer — is the arm on the FAR side of his body, the one that reaches forward along the guitar neck to the frets. ' +
      'That arm and its hand are gone: nothing holds the guitar neck, which points up and forward, the guitar hanging on its strap. At his far shoulder, partly hidden behind his chest and the guitar neck, only a short empty sleeve tied in a knot. ' +
      'The arm NEARER to the viewer — the one on the LEFT side of the drawing, coming down from the shoulder closest to the amplifiers — keeps its full sleeve, no knot, and its hand strums hard over the strings on the body of the guitar, exactly as in the attached left drawing. ' +
      `${KEY} ${STYLE}`,
  },
  {
    // What comes into the picture at the desk, from its edges.
    id: 'finale_hands',
    kind: 'split',
    cols: 3,
    rows: 1,
    names: ['a', 'b', 'c'],
    cut: 'gaps',
    h: 600,
    refs: ['art/raw/plate_finale_desk.png', REF_NEIGHBORS],
    prompt:
      'Game asset sheet: THREE separate infected arms reaching toward the viewer, standing in a row with wide empty gaps between them, each seen from the eyes of the person they are reaching for, drawn like the infected villagers of the first attached picture: grey-green skin, dark veins, broken dirty nails. From left to right: ' +
      '(1) a man’s forearm and hand in a torn checked shirt sleeve, reaching straight up from a flat bottom edge, fingers spread wide to grab; ' +
      '(2) an old woman’s forearm and hand in a frayed burgundy knitted cardigan sleeve, reaching straight up from a flat bottom edge, the hand hooked like a claw; ' +
      '(3) a forearm and hand in a navy-blue postal uniform sleeve with a brass button, reaching straight up from a flat bottom edge, fingers curling closed as if about to catch hold. ' +
      `Each arm is tall and nearly fills the height of the canvas, and ends at the bottom in a clean straight horizontal cut. ${KEY} ${STYLE}`,
  },

  // ───────────────────────────── Devices (2x2 state sheets) ─────────────────────────────
  {
    id: 'dev_net',
    kind: 'split',
    cols: 2,
    rows: 2,
    names: ['resting', 'armed', 'triggered', 'broken'],
    h: 190,
    refs: [REF_DEVICES],
    prompt: stateSheet('improvised net trap from the top row of the reference ("le filet"): a rope net slung from a wooden frame of two posts and a crossbeam with red-painted feet', [
      'resting — the net coiled and tied to one post',
      'armed — the net hung open and taut between the posts, ready to drop',
      'triggered — the net dropped and spread wide over the ground in front of the frame, with motion lines',
      'broken — crossbeam snapped, net torn and tangled on the ground',
    ]),
  },
  {
    id: 'dev_barrier',
    kind: 'split',
    cols: 2,
    rows: 2,
    names: ['resting', 'armed', 'triggered', 'broken'],
    h: 170,
    refs: [REF_DEVICES],
    prompt: stateSheet('improvised pop-up barrier from the middle row of the reference ("la barrière"): heavy red-and-white striped planks hinged on a low timber base with an orange beacon lamp', [
      'resting — planks folded flat on the base, beacon off',
      'armed — planks half folded and cocked, beacon glowing orange',
      'triggered — planks snapped fully upright into a solid striped wall, beacon flashing, little dust puffs at the base',
      'broken — planks splintered and hanging off the base, beacon cracked',
    ]),
  },
  {
    id: 'dev_horn',
    kind: 'split',
    cols: 2,
    rows: 2,
    names: ['resting', 'armed', 'triggered', 'broken'],
    h: 180,
    refs: [REF_DEVICES],
    prompt: stateSheet('improvised lure from the bottom row of the reference ("le klaxon"): a big brass horn mounted on a rusty shopping trolley, wired to a blue car battery standing beside it', [
      'resting — silent, cable unplugged on the ground',
      'armed — cable connected, a small orange beacon glowing on the trolley handle',
      'triggered — horn blaring and shaking, bold yellow sound-wave marks radiating from it, beacon flashing',
      'broken — trolley tipped over and crushed, horn dented on the ground, cable torn',
    ]),
  },
  {
    id: 'dev_log',
    kind: 'split',
    cols: 2,
    rows: 2,
    names: ['resting', 'armed', 'triggered', 'broken'],
    h: 230,
    refs: [C('04-night-camera-controls.png'), REF_DEVICES],
    prompt: stateSheet('swinging log trap ("le rondin") like the one in the reference camera view: a heavy tree-trunk log hanging on ropes from a sturdy timber A-frame gallows with a hand winch on one leg', [
      'resting — log hanging straight down and still, ropes slack on the winch',
      'armed — log winched far back and held high by a taut rope, ready to swing',
      'triggered — log swinging forward through the bottom of its arc at full speed with bold motion lines and splinters',
      'broken — frame cracked and leaning, one rope snapped, the log lying on the ground',
    ]),
  },
  {
    id: 'dev_spikes',
    kind: 'split',
    cols: 2,
    rows: 2,
    names: ['resting', 'armed', 'triggered', 'broken'],
    h: 130,
    refs: [C('10-return-before-night.png'), REF_DEVICES],
    prompt: stateSheet('pop-up picket contraption ("les pieux") like the hinged wooden frame lying on the ground in the reference: a shallow square timber frame covering one ground tile, with a hinged plank lid, big coil springs and a row of pointed wooden fence pickets folded inside', [
      'resting — lid closed flat, nothing showing',
      'armed — lid closed, a small red flag raised on one corner, coil springs visibly compressed in a gap',
      'triggered — the wooden pickets popped straight up out of the frame at full height like a little fence, lid flung open, motion lines',
      'broken — frame split, pickets snapped and leaning in all directions, a coil spring popped out beside it',
    ]),
  },
  {
    id: 'dev_floodlight',
    kind: 'split',
    cols: 2,
    rows: 2,
    names: ['resting', 'armed', 'triggered', 'broken'],
    h: 230,
    refs: [C('02-night-defense-overview.png'), REF_DEVICES],
    prompt: stateSheet('improvised floodlight ("le projecteur"): an old metal-shade yard lamp strapped to the top of a tall wooden pole with rope, a cable running down to a blue car battery at its foot', [
      'resting — lamp off and dark',
      'armed — lamp off, a small orange standby light glowing on the battery',
      'triggered — lamp switched on: the bulb and the inside of the shade painted solid bright yellow-white, with a few short solid yellow ray strokes around the shade (no translucent glow, no light cone, no haze)',
      'broken — pole snapped in half, lamp shade smashed on the ground, a wisp of smoke',
    ]),
  },
  {
    // Palisades laid corner to corner: the two diagonals of the grid are the screen's horizontal and its depth.
    id: 'fence_diag',
    kind: 'split',
    cols: 2,
    rows: 2,
    names: ['flat', 'flat_hurt', 'deep', 'deep_hurt'],
    h: 150,
    refs: [REF_PROJECTION, REF_DEVICES],
    prompt:
      'Game asset sheet: a 2x2 grid showing one short segment of rough wooden palisade fence like the ones in the reference ' +
      '(four or five upright mismatched planks lashed with rope between two stout posts), one view per quadrant, each centred in its quadrant with wide empty margins. ' +
      'Top-left: the segment seen face-on, running exactly horizontally from left to right, intact and solid. ' +
      'Top-right: the same face-on horizontal segment, damaged — planks cracked and leaning, a gap opening. ' +
      'Bottom-left: the same segment turned a quarter, seen end-on: it runs straight away from the viewer, from the bottom of the quadrant toward the top, strongly foreshortened, the near post in front and the planks receding behind it, intact. ' +
      'Bottom-right: the same end-on receding segment, damaged — planks cracked and leaning. ' +
      `Seen from above at the same 30 degree camera height in all four. ${ISO} ${KEY} ${STYLE}`,
  },
  {
    id: 'dev_fence',
    kind: 'split',
    cols: 2,
    rows: 2,
    names: ['resting', 'armed', 'triggered', 'broken'],
    h: 150,
    refs: [REF_PROJECTION, REF_DEVICES],
    prompt: stateSheet(
      'short straight segment of rough wooden palisade fence like the ones in the reference (four or five upright mismatched planks lashed with rope between two stout posts), the segment running diagonally from the upper-left to the lower-right',
      [
        'intact and solid',
        'intact, with a sheet of rusty corrugated metal nailed across it',
        'damaged — planks cracked and leaning, a gap opening',
        'destroyed — posts snapped, planks scattered flat on the ground',
      ],
    ),
  },
  {
    id: 'dev_barricade',
    kind: 'split',
    cols: 2,
    rows: 2,
    names: ['resting', 'armed', 'triggered', 'broken'],
    h: 200,
    refs: [REF_MORNING, REF_DEVICES],
    prompt: stateSheet(
      'door barricade standing upright as a flat panel that faces the lower-left: mismatched planks, a kitchen table top and an old shutter nailed and braced across a doorway, with no wall around it',
      [
        'solid and freshly nailed',
        'solid, reinforced with a sheet of corrugated metal and two steel bars',
        'badly damaged — planks cracked, gaps, claw marks',
        'destroyed — only splintered stumps and debris on the ground',
      ],
    ),
  },

  // ───────────────────────────── Textures, icons, fx ─────────────────────────────
  {
    id: 'tex_ground',
    kind: 'texture',
    cols: 2,
    rows: 2,
    names: ['grass', 'path', 'gravel', 'forest'],
    w: 256,
    refs: YARD_STYLE_REFS,
    prompt:
      'Texture swatch sheet: the square canvas is divided into exactly four equal square quadrants, each completely filled edge to edge with a different flat TOP-DOWN ground texture, no perspective, no objects, no shadows, even lighting, ' +
      'in the same inked and painted style as the ground in the reference. ' +
      'Top-left: earthy olive turf, a few groups of dry ochre blades. Top-right: warm sienna silt with broken ink marks on compressed earth. Bottom-left: muted grey gravel with small faceted slate chips. Bottom-right: dark umber loam, copper leaves and pine needles. Keep broad shapes quiet, with short pen strokes like the shadows under the apple branches. ' +
      STYLE,
  },
  {
    id: 'icons',
    kind: 'split',
    cols: 3,
    rows: 2,
    names: ['wood', 'scrap', 'springs', 'wire', 'battery', 'crate'],
    h: 96,
    refs: [REF_TRUNK],
    prompt:
      'Game inventory icon sheet in the style of the salvaged objects in the reference: a 3x2 grid of six separate chunky icons, one per cell, each centred with wide empty margins, simple and readable at 32 pixels. ' +
      'Top row, left to right: a strapped bundle of wooden planks; a pile of rusty scrap metal with a gear and a bent pipe; two big coil springs. ' +
      'Bottom row, left to right: a roll of wire mesh with a coil of orange cable; a blue car battery with two terminals; an open wooden crate. ' +
      `${KEY} ${STYLE}`,
  },
  {
    id: 'fx',
    kind: 'split',
    cols: 2,
    rows: 2,
    names: ['splat', 'dust', 'burst', 'smoke'],
    h: 160,
    prompt:
      'Game effects sheet: a 2x2 grid of four separate effect sprites, one per quadrant, each centred with wide empty margins. ' +
      'Top-left: a dark green-brown splat stain seen from above. Top-right: a beige dust cloud puff. ' +
      'Bottom-left: a comic impact starburst in pale yellow with wood splinters. Bottom-right: a soft pale grey smoke puff. ' +
      `${KEY} Art style: hand-inked 2D game art with crisp dark outlines and flat painterly colouring. No text, no watermark.`,
  },

  // ───────────────────────────── The credits ─────────────────────────────
  // Where the game comes from: a sofa in a student flat, one summer, three friends. The room and the
  // sofa are two pictures, so the camera can move between them; nothing in either is taken from a
  // photograph, and the three are only ever seen from behind.
  {
    // The photograph the credits end on: the three of them, that summer. A real picture, used as it is
    // (only the phone's frame cut off), shown on the monitor.
    id: 'credits_photo',
    kind: 'plate',
    w: 720,
    source: { concept: 'art/photos/summer-2013.jpg' },
  },
  {
    id: 'plate_credits_flat',
    kind: 'plate',
    w: 1280,
    refs: ['art/raw/plate_title_desk.png', C('12-surveillance-room.png')],
    prompt: plate(
      'The living room of a cheap student flat under the roof of an old stone town house in a small French town, on a warm SUMMER evening around 2013 (summer, not autumn: green leaves, golden dusk). Nobody in the room: no person, no hands, no animal. ' +
        'Seen from standing height at the back of the room, looking toward the far wall. The LOWER THIRD of the picture is empty worn wooden floorboards with a faded rug: leave that whole strip clear, a sofa will be added there later. ' +
        'Beyond it, in the middle distance: a low coffee table made of a pallet, covered with open pizza boxes, beer bottles, mugs, a full ashtray, dice, loose sheets of paper covered in pencil doodles of monsters and house plans, pencils, a laptop. ' +
        'Against the far wall, centre-left: an old bulky cathode-ray television on a wooden crate, switched on, its screen a plain pale blue-white glow lighting the table, with a games console and tangled cables below it. ' +
        'On the RIGHT, a tall open window with shutters folded back: outside, terracotta rooftops at dusk under an orange and pink sky, and far away a steep volcanic rock needle with a tiny stone chapel on its top, and on another rocky hill a tall dark red statue. Swifts in the sky. A thin curtain moves. ' +
        'Around the room, things that will matter one day: a battered electric guitar leaning against a small amplifier, a white plush rabbit on a shelf, an old CB radio set on top of a bookcase full of comics and DVDs, a rusty hand saw hung on a nail as a joke, a baguette sticking out of a paper bag, a string of fairy lights, posters with pictures only, a clothes rack, a bicycle wheel. ' +
        'Warm, messy, happy, lived-in. Light: golden dusk from the window on the right, cold glow from the television on the left.',
    ),
  },
  {
    id: 'credits_sofa',
    kind: 'sprite',
    w: 1180,
    refs: ['art/raw/plate_credits_flat.png', 'art/raw/plate_title_desk.png'],
    // Their hair, the hat, the T-shirts and the arms round the shoulders are those of the photograph
    // the credits end on (art/photos/summer-2013.jpg), described in words: the photograph itself is
    // never sent to the image generator.
    prompt:
      'One single object for a layered illustration: a wide, sagging, worn three-seater sofa seen STRICTLY FROM BEHIND, with three friends in their early twenties sitting on it side by side, close together, also seen strictly from behind. ' +
      'Only the BACK of the sofa is visible (its tall worn fabric backrest, a patched corner, a blanket thrown over one end, its two back feet), and above the backrest only the backs of three heads, necks and shoulders: no face, no profile, nobody turning round. ' +
      'They are ordinary, living, healthy young people on a summer evening in 2013, long before any outbreak — NOT infected: natural healthy skin, no wounds, no sores, no stains, no green or grey skin, clean untorn T-shirts. ' +
      'The one on the LEFT has thick wavy dark-brown hair and a navy-blue T-shirt. The one in the MIDDLE wears a pale straw trilby hat over short brown hair and a black T-shirt, and has BOTH arms spread wide along the top of the backrest and round the shoulders of the other two, one hand resting on each friend’s far shoulder. ' +
      'The one on the RIGHT has short black hair cut very short on the sides and a violet-blue T-shirt. All three have their heads tilted back, looking UP at the ceiling above them, as if watching something rise. Hair drawn as compact shapes with clean outlines, no loose wisps. ' +
      'The sofa is worn and patched but dry and clean: nothing drips from it. ' +
      'Lit for the room in the first attached picture: a warm golden rim of dusk light on the right-hand edges of heads and shoulders, a cold blue-white television glow outlining them from the front, the back of the sofa itself in soft shadow. ' +
      'The sofa spans almost the full width of the canvas, centred, its feet near the bottom edge. Nothing else: no floor, no rug, no table, no wall. ' +
      `${KEY} ${STYLE}`,
  },
];

// ───────────────────────────── Animation poses ─────────────────────────────
// Three poses of a walk cycle (played a → p → b → p) and one action pose (x) per character and per view.
// The runtime falls back to the single turnaround sprite wherever a pose is missing.

export const POSE_NAMES = ['a', 'p', 'b', 'x'];

const WALK = [
  'walk cycle, contact pose: one leg stepping far forward with the heel down, the other leg trailing behind on its toes, arms as on the character sheet.',
  'walk cycle, passing pose: standing tall on one straight leg while the other knee is lifted and swings past under the body, feet close together, arms hanging nearer the body.',
  'walk cycle, opposite contact pose: the legs swapped compared with the top-left pose — the other leg is now forward and the first one trails — and the arms swapped too.',
];
const RUN = [
  'sprint cycle, full stride: front knee driven high, back leg kicked up behind, arms pumping hard.',
  'sprint cycle, airborne: both feet off the ground and gathered under the body, arms close to the chest.',
  'sprint cycle, opposite full stride: the legs and the arms swapped compared with the top-left pose.',
];
const GALLOP = [
  'gallop cycle, fully stretched: forelegs reaching far forward, hind legs stretched out behind, body long and low.',
  'gallop cycle, gathered: all four legs tucked together under the body, back arched.',
  'gallop cycle, landing: forelegs planted on the ground, hindquarters raised and hind legs swinging forward.',
];
const PUSH = [
  'pushing forward, contact pose: one leg stepping far forward, the other trailing behind, whole weight on the machine.',
  'pushing forward, passing pose: upright on one straight leg, the other knee swinging past under the body, feet close together.',
  'pushing forward, opposite contact pose: the legs swapped compared with the top-left pose.',
];

const ANIMATED = [
  {
    base: 'en_shambler',
    h: 200,
    refs: [REF_NEIGHBORS],
    desc: 'the shambling infected villager from the character sheet: torn waistcoat, braces, rolled shirt sleeves, flat cap, pale greenish skin, white eyes. He limps and drags one foot.',
    poses: [...WALK, 'attacking pose: leaning forward with both arms raised high above the head, hands clawed, about to slam down on a door, mouth wide open.'],
  },
  {
    base: 'en_runner',
    h: 200,
    refs: [REF_NEIGHBORS],
    desc: 'the infected racing cyclist on foot from the character sheet: garish lycra, cycling cap, clip shoes, the bent bicycle wheel hooked over one shoulder, pale greenish skin.',
    poses: [...RUN, 'attacking pose: lunging forward off one foot with both arms thrust straight out to grab, mouth wide open.'],
  },
  {
    base: 'en_brute',
    h: 245,
    refs: [REF_NEIGHBORS],
    desc: 'the huge infected village butcher from the character sheet: stained striped apron, rolled sleeves, string of sausages over one shoulder, pale greenish skin. Each step is a heavy stomp.',
    poses: [...WALK, 'attacking pose: both enormous fists raised overhead, about to hammer down, shoulders bunched, roaring.'],
  },
  {
    base: 'en_dog',
    h: 120,
    refs: [REF_ANIMALS],
    desc: 'the infected farm dog from the character sheet: lean brown mutt, patchy fur, leather collar, pale glowing eyes.',
    poses: [...GALLOP, 'attacking pose: leaping bite, forelegs off the ground, jaws wide open, ears flat.'],
  },
  {
    base: 'en_boar',
    h: 155,
    refs: [REF_ANIMALS],
    desc: 'the infected wild boar from the character sheet: massive shoulders, bristling dark fur with bald patches, tusks, pale eyes.',
    poses: [...GALLOP, 'attacking pose: ramming, head lowered almost to the ground and tusks hooking upward, hind legs driving, dirt flying from the hooves.'],
  },
  {
    base: 'en_deer',
    h: 215,
    refs: [REF_ANIMALS],
    desc: 'the infected stag from the character sheet: thin and tall, big antlers with an oak leaf caught on one tine, mossy patches on the flank, pale eyes.',
    poses: [...GALLOP, 'attacking pose: reared up on the hind legs, forelegs striking out, antlers thrown forward.'],
  },
  {
    base: 'boss_mower',
    h: 250,
    refs: [REF_NEIGHBORS],
    desc: 'the infected lawn-mowing neighbour from the character sheet with his rusty red push reel mower: moustache, torn green polo, khaki shorts, striped socks. Man and mower are one unit in every pose, the mower identical each time.',
    poses: [...PUSH, 'revving pose: feet planted wide, leaning back and shaking the mower handle furiously so the reel spins, grass clippings spraying up, head thrown back.'],
  },
  {
    base: 'boss_mechanic',
    h: 265,
    refs: [REF_NEIGHBORS],
    desc: 'the infected breakdown mechanic from the character sheet with his rusty red wheeled engine hoist, an engine block hanging from its chain: grey beard, oil-stained dungarees. Man and hoist are one unit in every pose, the hoist identical each time.',
    poses: [...PUSH, 'wind-up pose: feet planted, hauling the chain back with both hands so the engine block swings far back, ready to ram.'],
  },
  {
    base: 'boss_mail',
    h: 240,
    refs: [REF_NEIGHBORS],
    desc: 'the infected mail carrier from the character sheet: wiry woman, blue postal jacket and cap, leather satchel spilling letters, a parcel in her hands.',
    poses: [...RUN, 'delivery pose: skidding to a halt and thrusting the parcel forward at arm’s length with both hands, letters flying out of the satchel.'],
  },
  {
    base: 'boss_chief',
    h: 260,
    refs: [REF_AUTHORITIES],
    desc: 'the infected police chief from the character sheet: stocky, grey moustache, dark blue uniform and peaked cap, whistle in his teeth, advancing behind a big scratched steel riot shield.',
    poses: [...WALK, 'whistle pose: shield planted on the ground, cheeks puffed blowing the whistle, free arm thrust straight up in a traffic-stop gesture.'],
  },
  {
    base: 'boss_mayor',
    h: 275,
    refs: [REF_AUTHORITIES],
    desc: 'the infected mayor from the character sheet, standing on her small rusty four-wheeled cart behind the wooden lectern with the red ribbon and the car battery: grey swept-back hair, torn burgundy blazer, ceremonial sash, megaphone. Mayor and cart are one unit in every pose, the cart identical each time.',
    poses: [
      'campaigning pose: megaphone lowered at her side, free hand raised high in a stiff wave, fixed smile.',
      'campaigning pose: megaphone lowered, free hand waving low to the other side, body swaying with the cart.',
      'campaigning pose: megaphone lowered, leaning over the lectern and pointing at a voter.',
      'speech pose: megaphone at her mouth, shouting, the other fist raised above her head.',
    ],
  },
];

// Counterviews use each sheet's original cell ordering and runtime scale.
for (const id of ['forest_stands', 'yard_flora', 'yard_scatter']) {
  const front = ART.find(entry => entry.id === id);
  ART.push({
    ...front, id: `${id}_back`, edit: `art/raw/${id}.png`,
    prompt: 'Paint the same individual in every cell from the opposite side, turning the camera half a circle around the vertical axis. ' +
      'Reverse the order of near and far trunks, heads, twigs or stones; preserve species, size and root. Retain the diffuse key light from screen upper left, empty transparent gutters and cell ordering. ' + STYLE,
  });
}

// Paired front / back cels for each motion, with one foot-registered row per character.
ART.push({ id: 'defense_mob_poses', kind: 'atlas', w: 2688, source: { concept: 'art/raw/defense_mob_poses.png' } });
// A lowering pose and three elbow/paw contacts for each crawling species, from both cameras.
ART.push({ id: 'defense_crawl', kind: 'atlas', w: 864, source: { concept: 'art/raw/defense_crawl.png' } });

// Registered reverse-angle paintings. The winch, hinges, nets and lamps are seen from behind.
for (const [type, h] of Object.entries({ fence: 150, flat: 150, deep: 150, spikes: 130, log: 230, net: 190, barrier: 170, horn: 180, floodlight: 230 })) {
  const names = type === 'deep' ? ['resting', 'triggered', 'broken'] : ['resting', 'armed', 'triggered', 'broken'];
  ART.push({ id: `dev_back_${type}`, kind: 'split', cols: names.length, rows: 1, names, h, source: { concept: `art/raw/dev_back_${type}.png` } });
}

for (const character of ANIMATED) {
  for (const view of ['front', 'back']) {
    ART.push({
      id: `anim_${character.base}_${view}`,
      kind: 'poses',
      base: `${character.base}_${view}`,
      sheet: `art/raw/${character.base}.png`,
      cols: 2,
      rows: 2,
      names: POSE_NAMES,
      h: character.h,
      refs: character.refs,
      prompt: poseSheet(view, character.desc, character.poses),
    });
  }
}
