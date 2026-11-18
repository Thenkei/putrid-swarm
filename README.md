# Putrid Swarm

A 2D isometric survival and defense game. By day, take the old yellow break into the village, search what the neighbours left behind and set improvised traps around the house. By night, sit at the camera desk: the simple traps go off by themselves, the big ones wait for your signal, one sector at a time, while familiar neighbours come back as bosses who still cling to their habits.

The game is playable from the opening on the protagonist's computer screen to the seventh dawn, and past it to the one way every run ends. French is the source language; English is available in the options.

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
| Night, one arm | the same keys | one hand works both rows: a key on the other row than the last one waits for the hand to get there (the hand on the trap bar shows it), then is done by itself |
| Night | click a hand-fired trap in the feed | fire it |
| Night | `Esc` / `P` | pause |
| Night | `F3` | debug overlay: phase, wave, balances, per-sector counts, trap states |
| Orchard | hold `↑` / `←` / `→` (or `W` `A` `D`, by position) | walk in, go closer, go to the next place; letting go steps back |
| Orchard | `←` and `→` together | clap your hands |
| Orchard | `Space` (or `E`) | look, take, raise an arm in time; mash it to tear something off; hold it to tie or to splice |
| Orchard | `↓`, then `←` `→` in turn | kneel with the saw, then saw; `↑` gets up again before the first stroke |
| Orchard | `Esc` | pause (every prompt can also be clicked or held with the pointer) |
| Shed | hold `↑` (or `W`) | walk in; crouch by him (within his reach) |
| Shed | hold `←` / `→` (or `A` `D`) | to the workbench, to the shelf |
| Shed | `Space` (or `E`) at the bench or the shelf, `↑` there | the leads or the bowl; the hammer or the flour (taking one puts the other back) |
| Shed | hold `Space` | sit in silence, out of reach; let him drink; send the current, from the bench; open the padlock |
| Shed | `Space` crouched | flour in his hands, or the hammer |
| Shed | `1`–`4` | ask him something, only while he is there |
| Shed | `↓` | step back, or out of his lunge; held at the post, go back out and leave him chained |
| Radio | hold `↑` (or `W`) | lean in to the set |
| Radio | hold `←` / `→` (or `A` `D`) | turn the dial |
| Radio | `Space` (or `E`) | take the microphone and answer the call; with one arm the hand goes from the dial to the microphone first, and back after |
| Radio | `1`–`3` | say one of the answers, once they have asked |
| Radio | hold `↓` | switch the set off; once answered, hang up |
| The end | hold one of `A Z E R T Y`, hit `Space` | a chord, and the strings; `Enter` leaves once it is offered |
| The end | `←` `→` at the shed, `Tab` during the song | choose how it is played: easy (three keys, slower notes, the default) or furious (six keys) |
| End screen | "Rejouer le morceau" | after the mower: the song again from the shed, for the record; the run stays where it ended |
| Title | click the monitor's power button, the joint, the mug, the speaker (wheel for fine volume) | nothing useful |
| Title | leave the desk alone for forty seconds; or type the code everyone knows | nothing useful either: a screensaver that does, once, land in the corner; a test card |
| Day | click the break, or the well | the horn; a washer for a wish. Neither costs or changes anything |
| Credits | `Esc`, or "Passer" | leave; they end on their own after 74 seconds, back at the title |

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

4. **The orchard, once.** During the second wave of night 2 the orchard camera stops sending: its feed is snow, its thumbnail counts nothing, its traps can still be fired blind and only its door is still heard. The next morning the day does not start before someone has been to look. That is a played cut-scene, seen through the protagonist's eyes: walk in, look around, and find a small white rabbit chewing the cable.
   - **Clap**, and it is gone; the cable is spliced and nothing is lost.
   - **Go up to it**, and it turns round. There is under a second to get the left arm up: too late is the end of the run; in time, the bite is on the arm, the rabbit has to be torn off, and the infection climbs. The saw is at the foot of the apple tree, the rope on the fence. Sawing with the rope tied above the bite costs the left arm; sawing without it, the rest; doing nothing, everything.
   - **One arm, for the rest of the run.** The day it happens starts four and a half hours late; every day after that, an hour and a half late — a dressing takes two hands. It shows on the day's top bar and on the end screen, and in every picture he is in from then on: the left sleeve is empty and knotted.
   - **One hand at the desk.** Two hands work the desk at once, one on the trap row, one on the camera keys. One cannot be on both: after a press on one row, the other row is a second away. A press made in that second is not lost: it waits for the hand and is carried out when it gets there, in the order the keys were pressed — a trap key pressed after a camera key fires on the new camera. Pressing again on the same row costs nothing, and a hand that has rested a second is ready for either. The hand sits on the trap bar between the two rows: where it is, how far along its way, and the keys waiting for it; a trap or a thumbnail waiting for it is outlined. The first one-armed night says so, twice: as it begins, and the first time the hand has to cross.

   A run the orchard ends goes back to that morning, not to the night before.

5. **The shed, once.** At the end of night 4 one of them has got itself shut in the shed at the bottom of the garden, and at dawn the protagonist chained it to the post: it is the baker. The day does not start before someone has been in. Under a tarpaulin in the corner, strapped down, something big that nobody explains.
   - **Between the man and the virus.** A gauge shows where he is: the beast, in between, *him*, and past that, breaking. Left alone, the virus pulls him down; sitting in silence out of reach brings him halfway, water or a handful of flour from the shelf (crouched within his reach) brings him back. The first time he comes back he says who is waiting for him, and from then on talking about her takes him further. Questions (`1`–`4`) can only be asked while he is there: where his van is, who comes tonight, what the chief does, and who the first one was. Each answer costs him: the virus comes back at once, harder each time, and goes for whoever is still crouched by him (a step back in under a second, or it is the end of the run). Asked too low, he is cut off mid-sentence. The first one, he never gets to the end of.
   - **The current.** The jump leads clipped to his chain and the battery on the bench bring him up fast, from out of reach, while the protagonist looks at the wall. It costs what is left of him (shown once it has been used), and held too long nothing is left: he is finished off there and then. Whoever used it cannot let him go.
   - **How it ends.** Let go (only by someone who never hurt him, while he is there): every morning after, a bundle of oven wood at the gate, +2 planks. Left chained (the way out, any time): every morning after, a quarter of an hour taking him water. The hammer, or the current until nothing was left: half an hour digging, that day. The shed takes three quarters of an hour and two minutes per second inside, to the quarter hour, at most four and a half hours, plus half an hour to fetch his van if he said where it is (+6 planks, +2 batteries). What he said about tonight shows on the day's "tonight" card door by door, from the wave table itself; what he said about the chief shows on day 6's, in the chief's own numbers. Five endings, counted on the recap card; a bite retries that morning.

6. **The radio, once.** Among the salvage on the desk there is an old CB set that has only ever given static. The morning after night 6 it catches a living voice, and the last day does not start before someone has answered it — or not. A played cut-scene at the desk, close on the set's front panel: the round meter, the readout with the band drawn as a trace, the big knob, the microphone on its hook.
   - **Finding the voice.** The dial is turned through static (and past the old broadcast, still looping, and the baker's morning round if he was let go). The needle and the trace show what comes in; the static, a whistle near a carrier and the voice itself say it too. Held on it for a moment, the voice is found; it keeps calling until someone takes the microphone. It drifts on the band, and fades now and then wherever the dial is: it has to be held. What is heard of each line is what was tuned while each piece of it was said: the transcript at the top shows the words that got through and static for the rest, and so does the recap card.
   - **Two hands.** A CB wants one on the dial and one on the microphone. With one arm the hand goes from one to the other (a little over a second each way), the dial cannot be turned while it is away, and the voice drifts off meanwhile: the line after each answer starts badly tuned. Keyed too far off the voice, the microphone does not reach them: they keep calling, or ask whether anyone is there.
   - **Who calls.** Whoever the run left a mark on: La Brocanteuse or Le Campeur, owing a favour or holding a grudge (a run with both gets one of them, from the seed). Nobody, or only strangers: an old radio amateur on the hill farm who has been calling for six days. Each of the four survivor calls has a secret that is only ever said once, in one line, and can be lost in the static: the committee listens on the channel; he was bitten; they are six with pitchforks; the van lot are standing next to him.
   - **What is answered.** Once they have asked, three answers (`1`–`3`), and they wait eighteen seconds, asking at nine whether anyone is there. Saying nothing is an answer; so is switching off, at any time nobody is speaking into the set. What follows lands on day 7 and night 7, and nothing in it ends the run:
     - La Brocanteuse owes a crate: the address, and the load is at the gate before noon (+4 planks, +3 scrap, +2 springs, +1 battery) — with the committee behind her if it was listening (4 pieces taken, half an hour at the gate); where you first met, and it is fetched (an hour and a half); "keep it", and she leaves still owing.
     - Le Campeur owes one: "come and hold a door", and on night 7 he holds the back door (its barricade takes half) — if he was bitten, he turns as the second wave starts and that barricade loses half of what is left; "come, but in the shed", and he nails with you all day (+1 h) and spends the night locked in, harmless either way; no.
     - La Brocanteuse for the committee: the address, and they take 3 pieces (6 if they are many), the grudge settled; two planks at the crossroads, settled — unless they are many, who take the planks and come for 4 more; a lie, the police station's basement, and nothing.
     - Le Campeur for the van lot: a battery at the gate (if there is none, they come for 3 pieces); no, and nothing — unless they were next to him (3 pieces); "come alone", and he holds the back door tonight and owes you one — unless they were next to him (4 pieces).
     - The man on the hill: stay on the line, and he says where they will come from tonight, door by door — each door that got through is on day 7's "tonight" card, from the wave table; just ask, and he names the gate, curtly answered; lie that there are many of you, and he lets you go, relieved.
   - **What it costs.** A quarter of an hour and a minute per minute at the set, to the quarter hour, at most two and a half hours, plus what the answer takes. The caller's opinion of the player changes with the answer and is what the last day's outings meet. The last day's "tonight" card says who holds which door, who sleeps in the shed, and what the man on the hill saw. The end screen keeps one line of it, and the mower comes out past the camper if he slept in the shed. Six endings, counted on the recap card: on trust, an arrangement, a lie, no, nobody answered, switched off.

The house falls when its integrity reaches zero; infected only get in through a door whose barricade is down. A night ends when the lot is clear or at first light, whichever comes first.

**Every run ends the same way: eaten.** There is no winning. A house lost on the first four nights is short: the control room door gives way. From the fifth night it goes out through the shed, on a ride-on mower with a blade on the front and two amplifier stacks on the back, the keyboard played like a guitar over eighty seconds of hard rock: a top-row key holds a chord, `Space` hits the strings, right notes on the beat carry further. After thirty seconds leaving is offered; the song can also be played to its last chord. Either way the petrol runs out among them.

**Holding the seventh night earns the best of it.** The seventh dawn comes, the quiet village of the old victory screen with its music and its line, "Sept nuits. Plus personne ne frappe à la porte." Then the same picture with the whole village standing in the garden, facing the door. They do not leave. "Ils attendent un rappel." The shed, in the morning light, and the same song.

**The end screen is the last picture held still.** After the mower it stays on the horde, and writes over it what the song was worth: how many were mown, the best streak, the perfect notes, which way it was played and whether to the last chord, and how that stands against the record kept for that way of playing (a song switched halfway counts as the easy one). A new record lands like a stamp. A lost house offers to replay its night; a run that held all seven does not, it only offers the song again. Its words and its picture follow the ending: the desk, the mower after a lost house, the mower at the seventh dawn, or one of the orchard's three deaths.

**Endings seen.** The game keeps, in this browser, which endings have been reached: the orchard's five, the shed's five, the radio's six and the last scene's four (the desk, the mower after a lost house, the mower at the seventh dawn, and the song played to its last chord). The end screen counts them, and so does a corner of the title monitor once there is one to count.

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
| Loss | house integrity reaches zero — or, once each, the orchard or the shed (never the radio). A run that holds the seventh night is lost too, at dawn, on the mower |
| The orchard | a scripted chapter, not a random event: night 2, second wave, the orchard camera. Its choices are made by doing the gesture (walk up, clap), never from a menu; its whole logic is a pure reducer (`core/orchard.ts`), the scene only draws it. Losing the arm is a standing cost in daylight rather than in combat, so the nights keep their balance |
| What one arm costs | daylight every morning, and a second at the desk each time the hand changes rows. Nothing else changes: the nights, the devices and the waves are the same with one arm. Tuned with `pnpm balance --arm`: a careful operator bound to the desk still holds every night on the yard its daylight pays for, and loses about a third more house over nights 3 to 7 than with two arms (it lost a twentieth more before the desk counted) |
| One hand at the desk | the hand travels between the two rows rather than the keys being locked: a press is queued, never refused (four at most may wait), so the desk never seems to drop a key. The rule lives in `NightSim.act`, passed in like the camera outage; `trigger` stays the trap's own rule |
| The amputation | implied, not shown: the protagonist looks up at the branches while he saws |
| Played chapters | a registry (`core/chapters.ts`): each chapter says which night opens it, whether this morning waits for it, what it still does to every morning after (daylight, things at the gate) and which fates are its own. The morning screen, the next day, the retry after a death and the save loader only ask the registry; a new chapter is an entry there, its strings under `chapter`, and its scene in `scenes/flow.ts` |
| The shed | the morning after night 4, once per run: the baker, a villager who never comes back as a boss. What he gives is bounded and visible (a load added to the stock, two cards of information drawn from the existing tables); what it costs is daylight that day, and a quarter hour a day or two planks a day afterwards, never anything that changes a night |
| The torture | implied, not shown: the current is sent from the bench while the protagonist looks at the shed wall, where only his shadow jerks; the hammer is the same wall and one sound. The scene can be got through without hurting him at all, slower: silence, water, flour, and talking about his wife |
| What he knows | the patient-zero question is always cut off by the virus, at a different place each time (three pieces at most): it touches the open question without settling it |
| The radio | the morning after night 6, once per run: listening rather than doing, and deciding with whatever got through. Who calls is rolled once when night 6 is won (`core/radio.ts`, from the run's own generator) and saved, with where the voice sits on the band and how it drifts. Everything it leads to is one day and one night: a load or a visit through the stock, daylight, the caller's standing for the last day's outings, a door held on night 7 (`NightSim`'s `ally`, handed in like the outage and the one hand), or a line on the "tonight" card. A held door is the back one, the door that gives most often on night 7; `pnpm balance --radio`: held, two arms keep about five more house on average (87 → 92), and lose about five if he turns (→ 82); one arm 77 → 81, or → 75. Nobody loses night 7 over it in sixteen seeds |
| What is heard | each line of theirs is heard in forty pieces, each the best the voice came in while that piece was said; a word gets through above a strength that varies by word (between two bounds), so a weak signal lets some through. The secrets are said once, so what was missed stays missed. The hearing is measured on the French recording; the English subtitle is garbled at the same places of its own line, which is close but not exact |
| What two hands are for, on the radio | the one hand travels between the knob and the microphone and the voice keeps drifting: a careful one-armed listener loses about a fifth of the line after each answer, and sometimes keys the microphone off the voice and has to say it again. A two-armed one holds the dial while he speaks |
| How the cut-scenes move | painted plates brought to life rather than frame-by-frame animation: several poses per character played in sequence (the rabbit stops chewing, pricks its ears, looks round, gathers itself, leaps), the protagonist's own hands coming into the frame for every gesture, a foreground that slides faster than the picture behind it, and procedural mist, leaves, breath and sparks. No blur filters: a whip-pan is the picture and two ghosts of itself |
| How the yard is drawn | from the four painted swatches and nothing else: the borders between terrains are bent and frayed by noise instead of following the cell lines, a second lay of each swatch shows through in patches so no repeat is seen, the turf has a lip, the track has ruts, and the two ways out (the drive, the barn track) run on under the trees. Everything that never moves is painted into the ground once per side of the house: those borders, the shadow of the house and of the scenery, the rows of trees behind the first. What changes is drawn live: the shadows of what the player builds, the wind in the first row of trees, chimney smoke, cloud shadow and falling leaves by day, ground mist and wavering lamps by night, the forest floor carrying on into the dark wherever the view is panned. Light is multiplied in, not laid over: the afternoon warms, goes gold, then blue, and the windows come on before dark. All of it is a function of the time it is handed, so the four cameras agree and a paused night stands still; with `prefers-reduced-motion` what only decorates holds still |
| The last scene | decided by how the run ends: the desk for a house lost up to night 4, the mower for one lost from night 5 and for the seventh dawn. Its chart follows the track as measured, not as heard: `tools/beat.mjs --bars` finds where each bar starts, the riff, the guitar line over it and where it holds a note, the drum fills and the final chord, and the chart gives each its own character — the root while the riff chugs, held notes where the line holds, nothing during a fill, the solo (the second line section, the one guess in it) as the busiest and highest stretch, and the last note on the final chord. Its chords are one recording replayed on a pentatonic, so nothing played can sound wrong. It has no fail state: what is played changes the tally and the record, not the ending |
| Winning | there is none. Holding the seventh night leads to the mower like a house lost on the fifth, through the quiet dawn that used to be the victory; the run is told apart by its words, its morning light, its nights held and by offering no night to replay. A save made as `won` before this loads as a run that held |
| Records and endings seen | kept in the browser's local storage, apart from the save, so a new run keeps them; one record per way of playing; endings listed by chapter in `core/endings.ts`, where a new chapter adds its own in one line. The title only shows the count once one ending has been seen |
| Campaign | seven scripted nights; neighbours turn on fixed nights |
| Before the game | a content warning, shown once per browser before the title; it names the kind of thing shown (violence, blood, flicker) and never a scene, so it cannot give the story away. On a touch screen with no mouse, "you need a keyboard" comes first, before anything heavy is fetched, with a way to go on anyway. The game is for a desk: there are no touch controls |
| Credits | a scene, not a list, opened from the title menu and from the end screen: the camera goes into the sticky note on the monitor ("A²&M, 2013, Le Puy-en-Velay"), comes out that summer behind a sofa in a student flat where three friends are having the idea, and returns to the desk thirteen years later, where the names roll on the protagonist's own screen and leave it to a photograph of that summer — the one real picture in the game (`art/photos/`). The room and the sofa are two layers, so the camera leans in between them; the three on the sofa are drawn only from behind, after that photograph as described in words (it is never sent to the image generator), in the pose it shows them in: arms round shoulders, looking up. What rises from the sofa as ideas is the game's own art, and only what the player has met: the two that give the end away wait for a finished run. Escape leaves at any moment (`scenes/credits.ts`) |
| Key labels | keys are read by position, so any layout plays; what is shown on them comes from the browser's layout map where there is one (Chromium), otherwise from what the keys type when pressed — one telling key gives the whole row (AZERTY, QWERTY, QWERTZ), and until then the language guesses (`engine/keys.ts`) |
| Setting | a French village, following the concept art; names stay role labels |

Still open: the protagonist's identity, what the opening ellipsis covers, and the truth about patient zero. The broadcast is newly written from the provisional one in `docs/LORE.md`. The protagonist speaks with a young male French voice because a voice had to be chosen; his lines say nothing about who he is.

## Layout

```
src/core/      simulation and rules: no DOM, deterministic, unit-tested
  data/        every tunable number: devices, infected, waves, locations, the one-handed desk
  night.ts     the night simulation
  yard.ts      building, repairing, the placement rule
  game.ts      campaign transitions: day (refuge ⇄ outing ⇄ road) → night → morning
  encounters.ts  disputed lots and roadblocks: who appears, every way out, what each costs
  orchard.ts   the morning after night 2: every beat, key and timing of the scene, and what it costs afterwards
  shed.ts      the morning after night 4: the baker on his chain, the gauge, every answer and what each ending gives and costs
  radio.ts     the morning after night 6: who calls, the band and the drift, what is heard of each line, every answer and what it leads to on day 7 and night 7
  chapters.ts  which played chapter a morning is waiting for, and what played ones still do to later mornings
  finale.ts    how a run ends: which scene, the measured shape of the song and the chart laid on it, what a strum is worth, the record
  endings.ts   every ending of the game, by chapter, and how to read what a browser kept of them
src/render/    isometric renderer and the infected's gaits (world.ts), over:
  projection.ts    grid ⇄ screen, pure arithmetic
  terrainfield.ts  how the terrains share the ground, in grid space, without a canvas
  ground.ts        the ground of each side of the house, painted once
  scenery.ts       where every tree of the wood stands
  shadows.ts       contact patches and thrown shadows
  lighting.ts      the hour of the day, the night and its lamps, mist, cloud shadow, the CCTV look
  noise.ts         deterministic noise: the same ground on every run and every camera
               (the played cut-scenes animate their painted plates with scenes/atmosphere.ts: mist, leaves, breath, sparks, arms reaching into the frame)
src/scenes/    title and opening (desk.ts: the desk and what can be poked on it), day, map, interiors, encounters (encounter.ts, washers.ts), night desk (hand.ts: the one hand on the trap bar), morning, the orchard (orchard.ts), the shed (shed.ts), the radio (radio.ts), the last scene (finale.ts), the end screen (end.ts)
src/engine/    app shell, assets, audio (recordings over a synthesised fallback), voice lines, variant decks, translations, what is kept between runs (progress.ts: endings seen, records), what is printed on the keys (keys.ts), what the game is opened on (device.ts)
tests/         rule tests and the automatic operator used for balancing
tools/         art and audio pipelines, development aids
docs/          concept, lore and art direction
```

Tuning never requires touching combat logic: change `src/core/data/*`, then run `pnpm balance` to replay all seven nights against reference layouts. `pnpm balance --radio` plays night 7 with nobody at the back door, with someone holding it, and with someone holding it until he turns. `pnpm balance --arm` plays two arms against one, night by night, with an operator that watches one camera at a time through the same desk as the player; each run gets the yard its own daylight pays for, from a day-by-day model of searching and building (`yardBy` in `tests/operator.ts`, which says what it leaves out). Encounter numbers (odds, tolls, prices, daylight, how well each survivor throws) are in `src/core/data/rivals.ts`.

`node tools/home-shots.mjs <dir> [url]` photographs the home phase on a running dev server: the yard by day from both sides, up close, at the edge of the world and at four hours of the day, then the night desk on each camera. `node tools/home-perf.mjs [url]` prints what that costs: the one-off painting of the ground, and the frame pace and scene work by day and at the night desk (`PS_GPU=1` to rasterise on the GPU).

`node tools/encounter-shots.mjs <dir> [url]` opens a running dev server on each kind of encounter, plays through the ways out and saves a screenshot of every step (`PS_LANG=en` for the English texts).

Every tour drives the installed Chrome by default; `PS_BROWSER=firefox` or `PS_BROWSER=webkit` (the nearest thing to Safari) runs it in Playwright's own build of those, once `npx playwright-core install firefox webkit` has fetched them. `node tools/credits-shots.mjs <dir> [url]` opens the credits and saves a screenshot at each moment of their script (`PS_SEEN=1` as someone who has finished a run, `PS_REAL=1` at their own pace). `node tools/boot-shots.mjs <dir> [url]` shows what a visitor meets first: the content warning, the title behind it, "you need a keyboard" on a phone, and the trap keys relabelled when the keyboard gives its layout away. `node tools/egg-shots.mjs <dir> [url]` shows the things that are of no use: the test card, the screensaver and its corner, the horn and the well.

`node tools/orchard-shots.mjs <dir> [spared,maimed,throat,bled,turned,night] [url]` plays the orchard down each branch the same way, `node tools/shed-shots.mjs <dir> [freed,current,finished,emptied,bitten,onearm,chief] [url]` the shed, `node tools/radio-shots.mjs <dir> [ham,silence,baker,dealer,camper,grudge,van,hangup,onearm,night,finale,end] [url]` the radio (every kind of caller, the answers, one arm, the last day, the held door turning on night 7, the camper in the shed when the mower comes out, the end screen's line), and `node tools/finale-shots.mjs <dir> [desk,rampage,onearm,dawn,fates,title] [url]` ends runs on purpose (a lost night, a seventh night that cannot be lost) and plays what follows, chart, records, end screens and the title's count included. `node tools/arm-shots.mjs <dir> [url]` plays the screens of a one-armed run — the day, a drive and a search, the way home, the van, the morning, the evening, a night with the hand crossing between the rows — and saves a screenshot of each. `node tools/beat.mjs <track>` measures a track's tempo and first beat; with `--bars` it then describes the track bar by bar (beat one, loudness, attacks, brightness, how far a single line stands out and how far it wanders, drum fills, sections, the final chord and the silence after it). Its output is what `FINALE` and `SONG` in `src/core/finale.ts` record.

## Art

`art/concepts/` holds the creator's seventeen concept images, untouched. Several are used directly as full-screen plates (surveillance room, morning after, the garage, the village, the car boot, the return before night).

Everything else was generated with the codex image tool, using those concepts as style and character references, then keyed and cut into runtime assets:

```bash
pnpm art:gen       # art/raw/<id>.png, one codex call per entry of tools/art-manifest.mjs
pnpm art:process   # public/assets/ + manifest.json (chroma key, cut, resize)
```

Every infected and every neighbour has an animation sheet per view: three poses of a walk cycle and one action pose (attack, wind-up, speech), generated with the character's own turnaround as reference and cut so that all poses share one scale and one centre line. The renderer plays them at each kind's cadence (a limp, a sprint, a gallop), and falls back to the single turnaround sprite wherever a pose is missing.

The title desk is a retouch of a first pass (`edit:` entries): the painted smoke, the mug and the joint were taken out because the game draws its own, and the sticky note was moved off the glass and signed.

Every picture the protagonist is in has a one-armed twin made the same way (`<plate>_one_arm`: the control room, the morning, the garage, the town, the boot, the return, the village, the van, the swarmed mower, and the rider on it). `heroArt` in `src/scenes/common.ts` picks the twin once the arm is gone, through `drawPlate(…, { oneArmed })`; a missing twin falls back on the original.

`tools/art-manifest.mjs` is the single list of every image, its prompt and its references. The game tolerates missing art and draws placeholders, so one sprite can be regenerated without touching code. Generated images are derivatives of the concepts, not recovered originals; the old `Thendeo/PutridSwarm` ArtWorks folder is still unrecovered.

## Sound

Effects, ambient beds, music and voices are generated with ElevenLabs and shipped as MP3 in `public/assets/audio/`:

```bash
pnpm audio:gen       # art/audio/raw/<id>.mp3, one request per entry of tools/audio-manifest.mjs
pnpm audio:process   # public/assets/audio/ + manifest.json (trim, effect chain, levelling; needs ffmpeg)
```

`tools/audio-manifest.mjs` is the single list of every sound: its prompt or spoken text, its voice, its mix level. `audio:gen` needs `ELEVENLABS_API_KEY` in the environment or in a git-ignored `.env`; every request is billable, so existing files are only regenerated with `--force` (`--only id,id` and `--dry-run` are available). The account allows two requests at a time.

- **Voices** are French: the news anchor, the protagonist's asides, what is left of the neighbours' catchphrases, the baker in the shed, between his old words and the virus, and whoever is on the CB — La Brocanteuse, Le Campeur, the man on the hill, the broadcast still looping and the baker's round — each through a narrow, squashed `radio` chain; the static under them is the scene's own, as loud as the dial is far from the voice, and the whistle near a carrier is synthesised. Every line has a subtitle, which carries the English translation and shows with the sound off.
- **Music** is streamed per phase: title, day, night, a sinister musette waltz while a neighbour is on the lot, morning, ending; a drone and a chase cue for the orchard, an accordion waltz that keeps faltering for the shed, and the hard rock of the last scene.
- **Nothing repeats, nothing stops dead.** Sounds heard often have several recordings (five engine starts, a pick-up sound per resource, ten lines for leaving in the break and ten for coming back…), dealt like a shuffled deck so none comes twice in a row. Whatever the generator cut off while it was still sounding is faded out at processing time; beds, voices and music are always faded, never stopped; looping music restarts under its own tail; arriving somewhere switches the engine off.
- The original WebAudio synthesis is still underneath: a missing or still-loading recording falls back to a synthesised effect, and to silence for music and voices. Options has separate switches for sound and music, and a volume (also on the speaker of the title desk).

## Documents

- [Game concept](docs/CONCEPT.md), [lore bible](docs/LORE.md), [art and audio direction](docs/ART_DIRECTION.md)
- [Making outings interesting](docs/RENCONTRES_EN_VOITURE.md) (in French): the proposal the encounters were built from, with what is in and what is not
- [Original handoff](docs/HANDOFF.md) and [source register](docs/sources/CONVERSATION.md)
- [Concept art index](art/concepts/README.md)
