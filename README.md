# Putrid Swarm

A 2D isometric survival and defense game. By day, take the old yellow break into the village, search what the neighbours left behind and set improvised traps around the house. By night, sit at the camera desk: the simple traps go off by themselves, the big ones wait for your signal, one sector at a time, while familiar neighbours come back as bosses who still cling to their habits.

The game is playable from the opening on the protagonist's computer screen to the seventh dawn. French is the source language; English is available in the options.

## Play

Online: <https://thenkei.github.io/putrid-swarm/> (built and deployed from `main` by `.github/workflows/deploy.yml`).

Locally:

```bash
pnpm install
pnpm dev        # http://localhost:5173
```

```bash
pnpm test       # simulation and campaign rules (Vitest)
pnpm typecheck
pnpm build      # static build in dist/
pnpm check      # typecheck + tests + build: what the deployment runs
```

### Controls

| When | Input | Action |
| --- | --- | --- |
| Day | click a device, then a tile | build |
| Day | hold and drag with the palisade selected | draw a line of palisades (they turn to follow the stroke, diagonals included) |
| Day | `F` or right click | turn the piece in hand, or the placed device under the pointer |
| Day | `1`–`7` | pick a device |
| Day | `R` | look at the lot from the other side |
| Day | `T` | show or hide the predicted walking routes |
| Day | wheel, drag | zoom, pan |
| Outing | click a spot | search it; a spot with a face on it is claimed by someone: click it to talk |
| Encounter | `1`–`6` | pick a way out (each shows what it costs before it is chosen) |
| Encounter | `Space` or click the plank | throw a washer where the marker is |
| Night | `1`–`4`, `Tab` | switch camera (or click a thumbnail) |
| Night | `Space` | jump to the most threatened camera |
| Night | `A Z E R T Y` (the top-left letter row on any layout) | fire the hand-fired traps of the current camera |
| Night | click a hand-fired trap in the feed | fire it |
| Night | `Esc` / `P` | pause |
| Night | `F3` | debug overlay: phase, wave, balances, per-sector counts, trap states |
| Title | click the monitor's power button, the joint, the mug, the speaker (wheel for fine volume) | nothing useful |

## The loop as built

1. **Day — 12 hours.** Driving, searching and building all draw on the same daylight. The car must be home before dark, so an outing is refused if the drive back no longer fits.
   **What is found is not yet brought home.** A search loads the boot; the refuge's stock only grows when the break pulls into the yard. Between the two, someone may want the same thing:
   - **A disputed lot.** Where no neighbour minds the place any more, a survivor may already be standing at the best spot left. That spot cannot be searched behind their back; it is settled with them: share it, trade for it from the boot, wager it on three washers, insist, come to blows over it, or leave it. The rest of the place can be searched first, which is how the boot gets something to trade. Driving off leaves them the lot.
   - **A roadblock on the way home.** With a loaded boot, from the second day, a group may bar the road and ask for a share of the load: pay it (the player picks the pieces), settle it with the one thing they came for, call in a favour from a face in the group, go round at the price of daylight, or stand one's ground.
   - **They remember.** Each survivor is a stranger, owes a favour, or holds a grudge. Leaving someone a lot earns a favour, good for one whole lot or one open road. A threat or a scuffle earns a grudge: next time their half is already loaded, they neither wager nor give way, they ask more, and the group they stand with asks one piece more.

   Every way out states the most daylight it can cost and is refused if the drive home would no longer fit; one way out always costs nothing. Nothing in an encounter can reach the refuge's stock.
2. **Night.** Four cameras, one per approach: Portail, Grange, Arrière, Verger. The simulation runs on its own clock; switching camera only changes what you look at. Traps come in two kinds:
   - **Automatic** (Pieux, Filet) go off as soon as enough infected step into them, then re-arm by themselves. They never need a key.
   - **Hand-fired** (Rondin, Barrière, Klaxon, Projecteur) wait for the desk. When enough is standing under one, its key turns bright yellow and beats, on the trap bar, in the feed and on the thumbnail of its camera: that is the moment. `Space` jumps to it.

   A trap leaves its armed state only when it fires, so repeated input can neither repeat the effect nor spend battery twice.
3. **Morning.** The report shows what the night actually did. The yard handed to the next day is the simulation's own result: broken traps stay broken, the mown strip stays mown.

The house falls when its integrity reaches zero; infected only get in through a door whose barricade is down. A night ends when the lot is clear or at first light, whichever comes first.

**The first night teaches itself.** The yard starts with a palisade across the drive, automatic stakes in its one gap, a log over the front step and stakes on the barn doorstep. The night holds still twice, the first time each thing matters: once until the log has been dropped, once until the camera has been switched. After that the yellow key is the only prompt.

**The placement rule is visible.** Palisades block walkers and reshape their routes; the red dashed lines and the worn ground under them show where they will walk. While a trap is being placed the game says whether any predicted route comes within its reach, each door shows how many working traps stand on the way to it, and the "tonight" card names the approaches with fresh tracks. A palisade that would cut a stretch of tree line off from every door is refused, with the reason.

| Device | Fires | Role |
| --- | --- | --- |
| Palissade | — | shapes routes; rams go through, jumpers over |
| Pieux | by itself | damage on one tile, fast re-arm, breaks a wind-up |
| Filet | by itself, on two or more | pins a group; held targets take more damage |
| Rondin | by hand | heavy area damage, stun and knock-back, slow re-arm |
| Barrière | by hand | stands up briefly and holds the queue |
| Klaxon | by hand | lures nearby infected; spends battery |
| Projecteur | by hand | slows and weakens what it lights; spends battery |

| Night | Arrival | What changes |
| --- | --- | --- |
| 1 | villagers | the gate, then a few by the barn: to learn the desk |
| 2 | Le Tondeur | mows a straight lane from door to door; flattens palisades in it |
| 3 | prowlers, rams, jumpers | flanking, breaching, clearing obstacles |
| 4 | Le Dépanneur | winds up, then rams with his hoist |
| 5 | La Dernière Tournée | two knocks per door, exploits any breach |
| 6 | Le Chef de la Police | shields the queue around him, makes it ignore the horn |
| 7 | Le Maire | every speech brings reinforcements to another sector |

Each neighbour is met alive at their place until the day of their night.

## Decisions taken for this build

The handoff listed these as open. They are settled here so the game could be built, and remain the creator's to overturn.

| Open question | Chosen for this build |
| --- | --- |
| Engine and platform | TypeScript, Vite, Canvas 2D, no game engine; runs in a desktop browser |
| Projection | 2D isometric; the back of the house is seen by rotating the view 180° |
| Cameras | four, with live thumbnails and a threat alert per sector |
| Day clock | 12 hours shared by travel, search and construction; forced return before dark |
| Trap activation | mixed, after the first playtest: stakes and nets automatic, the rest fired by hand on a visible cue |
| Turning devices | a facing per device, cosmetic only: traps act in a circle and a palisade blocks its cell whichever way it faces. Traps have two sides; palisades four, so a run laid corner to corner is drawn as a straight fence (it was already sealed: nobody slips between two palisades that touch by a corner) |
| Encounters on outings | built from [`docs/RENCONTRES_EN_VOITURE.md`](docs/RENCONTRES_EN_VOITURE.md), its first prototype and no more: two survivors, two groups, one wager (washers), one scuffle by decisions capped at three exchanges, no weapons, nobody dies. At most one encounter per outing and two per day; the first of each kind is certain, the rest are rolled |
| Who can be fought | only survivors who never come back as bosses. The neighbours keep their own greetings: the campaign cannot yet explain a boss who was beaten up at noon |
| Load and stock | separate. An encounter can only take from the boot, and only what it announced |
| Chance in encounters | rolled once when the encounter appears (who, which lot, their three washers, their three intentions) and saved; no outcome is drawn after a button is pressed, and a reload replays nothing |
| Power | one battery gauge per night, spent only by the horn and the floodlight |
| Loss | house integrity reaches zero |
| Campaign | seven scripted nights; neighbours turn on fixed nights |
| Setting | a French village, following the concept art; names stay role labels |

Still open: the protagonist's identity, what the opening ellipsis covers, the truth about patient zero, and whether the run should continue past the seventh night. The broadcast is newly written from the provisional one in `docs/LORE.md`. The protagonist speaks with a young male French voice because a voice had to be chosen; his lines say nothing about who he is.

## Layout

```
src/core/      simulation and rules: no DOM, deterministic, unit-tested
  data/        every tunable number: devices, infected, waves, locations
  night.ts     the night simulation
  yard.ts      building, repairing, the placement rule
  game.ts      campaign transitions: day (refuge ⇄ outing ⇄ road) → night → morning
  encounters.ts  disputed lots and roadblocks: who appears, every way out, what each costs
src/render/    isometric renderer, night lighting, CCTV effect, the infected's gaits
src/scenes/    title and opening (desk.ts: the desk and what can be poked on it), day, map, interiors, encounters (encounter.ts, washers.ts), night desk, morning, endings
src/engine/    app shell, assets, audio (recordings over a synthesised fallback), voice lines, variant decks, translations
tests/         rule tests and the automatic operator used for balancing
tools/         art and audio pipelines, development aids
docs/          concept, lore and art direction
```

Tuning never requires touching combat logic: change `src/core/data/*`, then run `pnpm balance` to replay all seven nights against reference layouts. Encounter numbers (odds, tolls, prices, daylight, how well each survivor throws) are in `src/core/data/rivals.ts`.

`node tools/encounter-shots.mjs <dir> [url]` opens a running dev server on each kind of encounter, plays through the ways out and saves a screenshot of every step (`PS_LANG=en` for the English texts).

## Art

`art/concepts/` holds the creator's seventeen concept images, untouched. Several are used directly as full-screen plates (surveillance room, morning after, the garage, the village, the car boot, the return before night).

Everything else was generated with the codex image tool, using those concepts as style and character references, then keyed and cut into runtime assets:

```bash
pnpm art:gen       # art/raw/<id>.png, one codex call per entry of tools/art-manifest.mjs
pnpm art:process   # public/assets/ + manifest.json (chroma key, cut, resize)
```

Every infected and every neighbour has an animation sheet per view: three poses of a walk cycle and one action pose (attack, wind-up, speech), generated with the character's own turnaround as reference and cut so that all poses share one scale and one centre line. The renderer plays them at each kind's cadence (a limp, a sprint, a gallop), and falls back to the single turnaround sprite wherever a pose is missing.

The title desk is a retouch of a first pass (`edit:` entries): the painted smoke, the mug and the joint were taken out because the game draws its own, and the sticky note was moved off the glass and signed.

`tools/art-manifest.mjs` is the single list of every image, its prompt and its references. The game tolerates missing art and draws placeholders, so one sprite can be regenerated without touching code. Generated images are derivatives of the concepts, not recovered originals; the old `Thendeo/PutridSwarm` ArtWorks folder is still unrecovered.

## Sound

Effects, ambient beds, music and voices are generated with ElevenLabs and shipped as MP3 in `public/assets/audio/`:

```bash
pnpm audio:gen       # art/audio/raw/<id>.mp3, one request per entry of tools/audio-manifest.mjs
pnpm audio:process   # public/assets/audio/ + manifest.json (trim, effect chain, levelling; needs ffmpeg)
```

`tools/audio-manifest.mjs` is the single list of every sound: its prompt or spoken text, its voice, its mix level. `audio:gen` needs `ELEVENLABS_API_KEY` in the environment or in a git-ignored `.env`; every request is billable, so existing files are only regenerated with `--force` (`--only id,id` and `--dry-run` are available). The account allows two requests at a time.

- **Voices** are French: the news anchor, the protagonist's asides, and what is left of the neighbours' catchphrases. Every line has a subtitle, which carries the English translation and shows with the sound off.
- **Music** is streamed per phase: title, day, night, a sinister musette waltz while a neighbour is on the lot, morning, ending.
- **Nothing repeats, nothing stops dead.** Sounds heard often have several recordings (five engine starts, a pick-up sound per resource, ten lines for leaving in the break and ten for coming back…), dealt like a shuffled deck so none comes twice in a row. Whatever the generator cut off while it was still sounding is faded out at processing time; beds, voices and music are always faded, never stopped; looping music restarts under its own tail; arriving somewhere switches the engine off.
- The original WebAudio synthesis is still underneath: a missing or still-loading recording falls back to a synthesised effect, and to silence for music and voices. Options has separate switches for sound and music, and a volume (also on the speaker of the title desk).

## Documents

- [Game concept](docs/CONCEPT.md), [lore bible](docs/LORE.md), [art and audio direction](docs/ART_DIRECTION.md)
- [Making outings interesting](docs/RENCONTRES_EN_VOITURE.md) (in French): the proposal the encounters were built from, with what is in and what is not
- [Original handoff](HANDOFF.md) and [source register](docs/sources/CONVERSATION.md)
- [Concept art index](art/concepts/README.md)
