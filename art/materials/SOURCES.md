# Sources for the 3D yard

The photographs and generated reference images are baked into local game assets. The field guide and campaign load the same finished materials.

## Captured surfaces

The yard uses Poly Haven diffuse, OpenGL tangent normal, roughness, metallic and displacement data. The runtime packs height, roughness and metalness into the red, green and blue channels of a single image. The reflection environment comes from the captured [Spruit Sunrise HDR panorama](https://polyhaven.com/a/spruit_sunrise). These works are licensed under [CC0](https://polyhaven.com/license).

| Surface | Capture |
| --- | --- |
| Worn grass | [Leafy Grass](https://polyhaven.com/a/leafy_grass) |
| Meadow turf | [ambientCG Grass004](https://ambientcg.com/a/Grass004), [CC0](https://docs.ambientcg.com/license/) |
| Gravel | [Gravel Floor 02](https://polyhaven.com/a/gravel_floor_02) |
| Exposed soil | [Dirt Floor](https://polyhaven.com/a/dirt_floor) |
| Farm track | [Grass Path 2](https://polyhaven.com/a/grass_path_2) |
| Forest litter | [Leaves Forest Ground](https://polyhaven.com/a/leaves_forest_ground) |
| Timber | [Weathered Brown Planks](https://polyhaven.com/a/weathered_brown_planks) |
| Bark | [Bark Brown 01](https://polyhaven.com/a/bark_brown_01) |
| Iron | [Rusty Metal 04](https://polyhaven.com/a/rusty_metal_04) |
| Plaster | [Rough Plaster Broken](https://polyhaven.com/a/rough_plaster_broken) |
| Masonry | [Rustic Stone Wall](https://polyhaven.com/a/rustic_stone_wall) |
| Pantiles | [Clay Roof Tiles](https://polyhaven.com/a/clay_roof_tiles) |

[Woodland plant and leaf photograph credits](../../public/assets/materials/plant-sources.txt) and [head scan credits](../../public/assets/licenses/infected-head.txt) ship with the game. The scan attribution also appears in the in-game credits.

## Original ImageGen references

These eight references were generated with the built-in ImageGen tool. The workshop bake estimates relief and roughness from the end-grain, rope and chipped enamel references. The human portraits are fitted to the scan. The wardrobe and animal references supply colour and fibre detail. The wagon uses three registered views of the same coachwork. The farmhouse wall combines an original limewash study with fine plaster normals and roughness from a captured surface.

### Villager face

[Original reference](../infected/villager.webp)

Use case: photorealistic-natural. Game production texture source. Create one square high resolution cross-polarized color photograph, frontal facial albedo reference for an original fictional undead rural French man roughly sixty. Perfectly straight-on orthographic ID-scan view, head absolutely level facing camera. The entire bald skull with both ears, eyes, cheekbones, nose, mouth tip of the chin and short upper neck are visible, isolated on a medium flat neutral gray background. Face fills most of the square, forehead at 6 percent and chin at 91 percent, each ear fully in frame. Neutral closed-mouth expression, slightly parted dry lips. Convincing tired, weather-beaten human bone and soft tissue anatomy: gaunt temples, prominent cheekbones, receding gums suggested by lips, very pale grey olive skin with natural broken capillaries, ashen mottling, dust, sunspots, stubble, slightly clouded realistic eyes, dull uneven skin tone and fine pores. Intentionally unsettling, sober, very realistic complexion. No open wounds, wet blood, theatrical prosthetics, exaggerated scowl, fantasy colors, hair on scalp, clothing, jewelry, writing, layout, panels or frame. Flat diffuse light from all directions; directly lit eye sockets/nose and temples, no dramatic cast or baked directional shadows. Sharp across image, 2048x2048 if possible. RAW material photography, no illustration, no CG faceting, no photomontage. This image will be wrapped over animated game geometry, not used as a portrait card.

### Mayor face

[Original reference](../infected/mayor.webp)

Use case: photorealistic-natural. One original fictional face photograph for projecting onto an animated character mesh. Square, high resolution. Frontal cross-polarized human head texture scan of an elderly French woman of about seventy, once the mayor of a small village, now exhausted, pallid and unsettling. Entire head from bald crown at 6% image height to the chin at 91%, both ears visible with room, no hair on scalp (hair will be modelled separately), just upper neck, flat medium gray background. Precisely straight-on, level centred facial axis, eyes open looking straight out, mouth gently closed. Real mature feminine bone and soft tissue, asymmetry, pronounced wrinkles, fine pores, dusky rose dry lips, nasolabial folds, fine brows, clouded hazel eyes, tired sunken lower lids, mottled ashen complexion. Muted flesh tones. Highly detailed RAW medical-grade studio scan appearance, with broad cross-polarized diffuse illumination, no key light, no deep cast shadows, no specular flares. No clothes, accessories, stylized proportions, makeup, gore, graphics, lettering, collage or painted effects.

### Workwear and coat

[Original reference](../infected/surfaces.webp)

Use case: photorealistic-natural. Production albedo atlas for a realistic rural zombie survival game. Square 2048x2048 if possible. Fill a perfectly aligned 2 by 2 grid of four full-bleed square photographs, with straight divisions exactly at horizontal and vertical midpoints. No margins, labels, text, frames or gutters. Each quadrant is one flat, seamless-style macro surface sample photographed perpendicular with cross-polarized flat neutral daylight, absolutely no studio lighting gradients. TOP LEFT dry faded natural khaki work-jacket canvas, compact coarse interwoven fibers and varying warm gray threads, some abrasion, no seams or objects. TOP RIGHT muted charcoal blue denim, dense diagonal twill, visible individual threads, old worn French workwear, no stitching lines or seams. BOTTOM LEFT umber dark brown worn full-grain boot leather, natural pebbled pores and subtle creases with small abraded buff highlights, no holes, no metal. BOTTOM RIGHT short brown deer or hound coat fur lying flat, individual hairs flow from TOP to BOTTOM with soft transitions of neutral brown, tan underfur and dark guard hairs, no animal face or recognizable body. True materials with microstructure, restrained tonal variation, no folds or dramatic shadows, no illustration, nothing that looks like brushstrokes or plastic.

### Workshop

[Original reference](workshop.webp)

Use case: photorealistic-natural. Square production texture atlas, 2×2 grid, four full bleed square photographic MATERIAL CLOSE-UPS, exact divisions at half width and height with NO border lines, no margins, no captions. All are orthographic straight-on cross-polarized diffuse albedo photos of real materials. TOP LEFT a close cut through a single weathered oak log, near-concentric end-grain tree rings with small checking cracks, rings centred in middle of tile, fill tile to edges with timber, no bark rim, no background. TOP RIGHT the outer surface of a tightly twisted, thick, weathered tan hemp cord, extreme macro: a full-frame seamless-style sample of rounded overlapping spiral plies running diagonally bottom-left to top-right, individual frayed fibers. Fill the entire tile edge to edge with the twisted hemp surface. BOTTOM LEFT a broad plate of aged cream-grey enamel, worn chipped industrial paint with tiny scratches and smaller islands of brown oxidized steel showing through, mostly painted surface. BOTTOM RIGHT dark grey brown hammered and rolled iron with subtle isolated rust spotting, metallic grain and naturally less reflective pitted edges, no bolts, no tools, no holes. No recognizable objects, lighting gradients, shadows or crisp outlined digital patterns. Real photography with fine material relief; detailed, unvarnished rural hardware salvaged from a French farm.

### Animal facial coats

[Original reference](../infected/animals.webp)

A veterinary photographic material reference sheet for 3D animal heads. One perfectly square high resolution image with exactly three equal-height horizontal strips neatly stacked vertically, without any text, lines, gaps or borders. In each photograph a single living European animal head and short neck in a TRUE LEFT-FACING SIDE PROFILE, the animal's nose at left, its shoulder at right. Lateral anatomy flat to camera with one eye visible; fit muzzle tip, eye, visible ear, cheek, side of neck fully in its own strip, edge to edge across each wide strip. Top strip: a lean dark sable-and-tan hunting hound dog with black muzzle, short fur and dropped ears. Middle strip: a wild European boar with broad dark slate snout and steel-grey/brown bristles, coarse ruff and small glinting eye. Bottom strip: an adult red deer stag with a pale tawny cheek, gray nasal plane, black nostril, cinnamon neck, bright low muzzle and upright ear, antlers mostly cropped at upper edge of its strip. A single true side profile of the head close up in each strip, as a natural history field recording. Perfectly even neutral diffuse daylight on authentic, fine directional hair, skin folds, color zoning and ear interiors. Matte pale neutral grey backdrop in each strip, no studio shadows, no writing, no graphics, no blood. Maximize photographic detail; do not illustrate. Each animal occupies only its own horizontal third.

### Four neighbours

[Original reference](../infected/neighbours.webp)

Naturalistic character texture photography for a French rural survival game, four DIFFERENT fictional villagers. A square 2 by 2 photographic contact sheet made of four precisely equal square quadrants with no gaps, typography or frames. One level straight-on face centered in each square, identical anatomical framing, temples, both ears, bare crown and chin must be visible, crop ends just below chin. True orthographic frontal view both eyes open, mouth closed, no hat or glasses. Aged slightly sickly pale olive or muted russet skin, diffuse neutral overcast light casting minimal shadow, skin pores, uneven complexion, dirt in creases and hair fibres. Top left is a heavyset 47-year-old butcher with broad jowls, dark short full beard and a distinct broken nose. Top right is a gaunt sunburnt 64-year-old groundskeeper with pronounced laugh lines, greying natural bushy moustache, bald crown. Bottom left is a broad 53-year-old auto mechanic with a squared salt-and-pepper beard, heavy brows and weathered ruddy skin. Bottom right is a lean stern 49-year-old municipal police chief with a neatly trimmed dark moustache, a high forehead and hooded eyes. Neutral closed mouth all four, muted skin, quiet eerie gaze, plain matte charcoal background, visible natural human variation. Exactly these four different faces in this exact order, camera straight-on for EVERY portrait. No wounds, no illustration, no object diagrams. High-frequency photographic maps.

### Station wagon

[Original reference and runtime colour map](../../public/assets/materials/coachwork-albedo.webp)

Use the attached isometric GAME screenshot only for the identity, colors and proportions of the mustard-yellow vintage French station wagon. Make a NEW high-resolution PHOTOGRAPHIC TEXTURE REFERENCE SHEET of an actual abandoned 1980s Renault 18 Break / French estate in those colors, in soft overcast outdoor light, square, absolutely no ground, on a flat warm-grey studio background, no text or graphic labels. Real ordinary vehicle with actual rust, recognisable dark rubber trim, a muted brick-red replacement front passenger door, a warm ochre rear passenger door, speckled oxidation over yellow on front fender, stone chips, streaking below the rubbing strips, grey lower rocker, fine metal and dirt detail. EXACT LAYOUT: Across the TOP HALF a SINGLE LONG PERFECT SIDE ELEVATION photograph, front of car points LEFT, rear to RIGHT; 4 doors with a long estate boot, no roof rack, tyres and steel wheels visible from the side. Fill the entire width with the side view, with a little clear margin all around, with all four roof and sill extremities inside top half. In the BOTTOM HALF there are TWO separate equal-sized photos side by side, bottom LEFT: absolutely straight-on FRONT view including windscreen, dirty real glass, ochre bonnet, rectangular fluted GLASS headlights, grille made of 5 horizontal steel bars and battered bumper; bottom RIGHT: absolutely straight-on REAR view with pale dusty glass, old ribbed red/amber tail lights, yellow hatch, tiny European registration, tarnished chrome bumper. These three orthogonal product photos are of the SAME battered MOT-capable car. Completely flat diffuse lighting to use as photographic surface texture, localized fine wear, body retains recognisable broad regions of faded mustard paint. No fake patchy swirls. Faithful glass, grille detail, grime and real materials that would be legible on a fine miniature scale model, do NOT render the source game style. No border, no letters around images, no dramatic cast shadows, fill each cell without overlap. Avoid other cars or angle views, keep full silhouette for registration.

### Limewashed farmhouse wall

[Original reference and runtime colour map](../../public/assets/materials/limewash-albedo.webp)

A single, completely front-on high-resolution architectural material photograph of a very old rural French farmhouse wall, 4.5 metres wide and 3 metres tall, rectangular landscape image. ENTIRE FRAME IS ONLY THE FLAT FRONT SURFACE OF THE WALL, all four sides crop through the plaster or stones. The foundation bottom 19 percent is many small irregular dark gray-brown rounded basalt rubble stones and lime mortar, the size of human hands. Above it: light warm cream limestone limewash tinged with faded muted yellow, old real sandy lime plaster, layers of fine flaking limewash, an irregular small patch of missing finish reveals the tiny stones and a couple of old narrow bricks. Exposed stone at bottom feathers realistically into the fine pale plaster higher up. Small remaining rust-red virginia-creeper leaves and fine tendrils climb up just the leftmost eighth of the plaster; green moss at the base in a few crevices. Some faint fine rain runs, hairline cracks, true weathered Auvergne farm material, very pale ochre and off-white airy broad areas, fine organic detail. Quiet neutral diffuse daylight for albedo extraction, uniformly lit throughout, no shadows of objects, no strong directionality. ABSOLUTELY no doors, windows, shutters, beams, portals, roofs, eaves, empty square panels or sky, no ground at all, no perspective, no 3D illustration, no art elements or grids. Authentic physical farmhouse photographic surface, not stylized.

## Rebuilding the game assets

Use `node tools/bake-yard-surfaces.mjs [source-cache-directory]` to regenerate the images and outdoor lighting in [public/assets/materials](../../public/assets/materials). The optional cache holds original source files. The bake requires ffmpeg and unzip. The infected bakes and their inputs are listed in [the infected source credits](../infected/CREDITS.md). The finished textures for the articulated models are in [src/render/textures](../../src/render/textures).
