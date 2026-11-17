// The single list of every generated sound: effects, looping beds, music and spoken lines.
// tools/gen-audio.mjs sends each entry to ElevenLabs once and keeps the raw result in art/audio/raw;
// tools/process-audio.mjs trims, levels and encodes it into public/assets/audio.
//
// `gain` is the runtime mix level (1 = as mastered). `fx` selects a processing chain in process-audio.

export const MODELS = {
  voice: 'eleven_v4',
  sfx: 'eleven_text_to_sound_v3',
  music: 'music_v2_5',
};

/** Account voices, by role. French professional voices; subtitles carry the translation. */
export const VOICES = {
  anchor: { id: 'm5U7XCsc8v988k2RJAqN', name: 'Manon' },
  hero: { id: 'DbbNuBL7lf62XwY7arQb', name: 'Hugo' },
  mayor: { id: 'QMNPncWXVcTVhJ9rDEQO', name: 'Stephyra' },
  mail: { id: 'uFA9UGUhpwqGjVhz3lA2', name: 'Christine' },
  chief: { id: '5l4ttmr4SKNgi0HnOelT', name: 'Paul K' },
  mechanic: { id: 'RVSvUPdGobWOTgnlXLRP', name: 'Rudy' },
};

const sfx = (id, seconds, text, extra = {}) => ({ id, kind: 'sfx', seconds, text, influence: 0.45, gain: 1, ...extra });
const loop = (id, seconds, text, extra = {}) => ({ id, kind: 'loop', seconds, text, influence: 0.4, loop: true, gain: 1, ...extra });
const music = (id, seconds, text, extra = {}) => ({ id, kind: 'music', seconds, text, gain: 1, ...extra });
const voice = (id, role, text, extra = {}) => ({ id, kind: 'voice', role, text, stability: 0.45, similarity: 0.8, gain: 1, ...extra });

export const AUDIO = [
  // ───────────── Traps ─────────────
  sfx('spikes', 0.9, 'Sharpened wooden stakes springing up out of the ground: a metal spring twang, then a hard wooden clack. Close, dry, no reverb.'),
  sfx('log', 1.8, 'A heavy tree trunk hung on ropes swings down: rope creak, a deep whoosh, then one massive dull thud. Close, dry.'),
  sfx('net', 1.4, 'A weighted rope net is released and drops onto a group: fast rope whoosh, then a soft heavy flop. Dry, close.'),
  sfx('barrier', 1.1, 'A striped metal road barrier swings upright and locks: squeaking hinge, then a loud steel clank and ratchet click. Dry.'),
  sfx('horn', 1.9, 'One long honk from the horn of a small old French car from the 1970s, nasal and slightly out of tune. Outdoors, no other sound.', { gain: 0.8 }),
  sfx('floodlight', 1.2, 'A large stadium floodlight is switched on: a heavy breaker clunk, then a rising electric hum. Dry.'),
  sfx('ready', 0.6, 'A small mechanical latch resetting: a spring being cocked and a crisp click. Very short, dry, quiet.', { gain: 0.6 }),
  sfx('interrupt', 0.7, 'A sudden wooden crack and a short startled animal grunt, cut off abruptly. Dry.'),
  sfx('broken', 1.2, 'A wooden contraption breaking apart: planks snapping, a spring pinging loose, debris dropping in grass. Dry.'),

  // ───────────── Infected ─────────────
  sfx('hit', 0.8, 'A wooden club hitting a sack of wet meat: one loud dull thump with a short grunt. Close, dry, punchy.', { gain: 0.7 }),
  sfx('kill', 1.3, 'A zombie lets out a short hoarse dying groan and collapses into grass with a soft thud. Dry, close.', { gain: 0.8 }),
  sfx('hit_2', 0.8, 'A heavy wooden plank smacking into a body: one sharp dull whack and a wet thud. Close, dry, punchy.', { gain: 0.7 }),
  sfx('hit_3', 0.8, 'A blunt impact on flesh and bone: one deep meaty thump with a faint crack. Close, dry, punchy.', { gain: 0.7 }),
  sfx('kill_2', 1.3, 'A zombie gives one wet gurgling rattle and drops to its knees, then flat into grass. Dry, close.', { gain: 0.8 }),
  sfx('kill_3', 1.2, 'A zombie cut short mid-snarl: a choked grunt, then a limp body falling over into dead leaves. Dry, close.', { gain: 0.8 }),
  sfx('groan_1', 2.2, 'A single slow hoarse zombie moan, male, tired and hungry, heard from a distance outdoors at night.', { gain: 0.5 }),
  sfx('groan_2', 2.0, 'A single raspy zombie groan, female, breathy and rattling, heard from a distance outdoors at night.', { gain: 0.5 }),
  sfx('groan_3', 2.4, 'Several zombies moaning together in a low uneven chorus, shuffling feet in grass, distant, night.', { gain: 0.5 }),
  sfx('groan_4', 2.2, 'A single low zombie growl that rises into a hungry wheeze, male, heard from a distance outdoors at night.', { gain: 0.5 }),
  sfx('groan_5', 2.0, 'A dragging zombie: one long tired exhale with a wet click in the throat, shuffling steps in gravel, distant, night.', { gain: 0.5 }),
  sfx('door', 0.8, 'Two heavy fists pounding on a barricaded wooden door, boards rattling. Close, dry.', { gain: 0.9 }),
  sfx('door_2', 0.8, 'Three flat-handed slaps and one heavy shoulder barge against a barricaded wooden door, hinges rattling. Close, dry.', { gain: 0.9 }),
  sfx('door_3', 0.9, 'One slow heavy body thudding against a boarded wooden door, then fingernails scraping down the planks. Close, dry.', { gain: 0.9 }),
  sfx('breach', 1.9, 'A boarded-up wooden door is smashed in: planks splintering, nails tearing, a heavy crash. Close.'),
  sfx('inside', 1.6, 'Inside a house: a window shatters, furniture is knocked over, a muffled snarl. Short and alarming.'),

  // ───────────── Neighbours ─────────────
  sfx('boss', 2.8, 'A low ominous horror sting: a deep sub boom followed by dissonant low brass swelling and stopping. Cinematic, no melody.', { gain: 0.9 }),
  sfx('mower', 3.2, 'A petrol lawn mower engine being revved up hard, sputtering and climbing in pitch, blades rattling. Outdoors, close.', { gain: 0.85 }),
  sfx('ram', 1.6, 'A heavy chain hoist being winched tight: ratcheting steel chain, groaning metal, tension building. Dry.'),
  sfx('whistle', 1.2, 'A traffic police whistle: two sharp authoritative blasts. Outdoors, dry.', { gain: 0.7 }),
  sfx('megaphone', 1.0, 'A cheap megaphone is switched on: a click, a burst of feedback squeal, crackle. No voice.', { gain: 0.7 }),

  // ───────────── Desk and day ─────────────
  sfx('camera', 0.5, 'Switching channel on an old CCTV monitor: a very short burst of static and a relay click.', { gain: 0.6 }),
  sfx('alert', 0.7, 'A security console warning: two short urgent electronic beeps, old hardware. Dry.', { gain: 0.6 }),
  sfx('build', 1.1, 'Three quick hammer blows driving a nail into a wooden plank. Outdoors, dry.', { gain: 0.8 }),
  sfx('build_2', 1.0, 'Two hammer blows on a nail, then a plank knocked into place with the side of the hammer. Outdoors, dry.', { gain: 0.8 }),
  sfx('build_3', 1.2, 'Four fast light hammer taps finishing a nail into soft wood. Outdoors, dry.', { gain: 0.8 }),
  sfx('rummage', 1.6, 'Rummaging through a metal toolbox and wooden drawers: clatter, sliding, small parts shifting. Dry.', { gain: 0.8 }),
  sfx('rummage_2', 1.5, 'Pulling open a stiff wooden drawer and stirring through loose cutlery, tins and odds and ends. Dry, close.', { gain: 0.8 }),
  sfx('rummage_3', 1.6, 'Rummaging through cardboard boxes on a shelf: flaps opened, paper and packaging pushed aside, a tin knocked over. Dry.', { gain: 0.8 }),
  sfx('rummage_4', 1.5, 'Opening a creaky metal locker and shoving heavy tools aside on a steel shelf. Dry, close.', { gain: 0.8 }),
  sfx('loot', 0.8, 'Picking up a handful of metal parts and dropping them in a canvas bag: bright satisfying clinks. Short.', { gain: 0.7 }),
  sfx('loot_2', 0.8, 'A few small objects scooped off a table into a canvas bag: soft clatter and a rustle of cloth. Short, dry.', { gain: 0.7 }),
  sfx('loot_3', 0.7, 'One useful find dropped into a bag already half full: a single muffled clunk and a short jingle. Short, dry.', { gain: 0.7 }),
  // What was found is heard: one pair of recordings per resource.
  sfx('loot_wood_1', 0.9, 'Two short wooden planks picked up and stacked against each other: dry woody clacks. Short, close.', { gain: 0.75 }),
  sfx('loot_wood_2', 0.9, 'An armful of wooden boards dropped onto a pile: a tumbling woody clatter. Short, dry.', { gain: 0.75 }),
  sfx('loot_scrap_1', 0.9, 'A sheet of scrap metal and a few steel offcuts picked up: scraping, a rattling clank. Short, dry.', { gain: 0.7 }),
  sfx('loot_scrap_2', 0.8, 'Heavy bits of scrap iron tossed into a metal bucket: two solid clangs. Short, dry.', { gain: 0.7 }),
  sfx('loot_springs_1', 0.8, 'A handful of steel coil springs picked up, twanging and jingling against each other. Short, dry, bright.', { gain: 0.7 }),
  sfx('loot_springs_2', 0.8, 'One big metal spring pulled free and released: a short comic boing and a rattle. Dry.', { gain: 0.65 }),
  sfx('loot_wire_1', 0.9, 'A coil of thin steel wire lifted off a hook: springy metallic rustle and a soft zing. Short, dry.', { gain: 0.75 }),
  sfx('loot_wire_2', 0.9, 'Unspooling a length of wire from a reel and snipping it with cutters: whirr, then a sharp snip. Short, dry.', { gain: 0.75 }),
  sfx('loot_battery_1', 0.9, 'A heavy car battery lifted by its handle and set down on a wooden bench: a strained creak and a dense thud. Short, dry.', { gain: 0.8 }),
  sfx('loot_battery_2', 0.9, 'Battery clamps unclipped with two metallic snaps, then a heavy block dragged across concrete. Short, dry.', { gain: 0.8 }),
  // Starting the break never sounds quite the same twice. `tail` is the fade-out, in seconds.
  sfx('engine', 3.6, 'An old diesel station wagon struggling to start: the starter cranks three laboured times, then the engine catches and settles into a rough idle.', { tail: 0.9 }),
  sfx('engine_2', 3.2, 'An old diesel car starting on the first turn of the key: one short starter whirr, the engine catches at once, a brief rev, then a steady rattling idle.', { tail: 0.9 }),
  sfx('engine_3', 4.4, 'An old diesel car reluctant to start: the starter cranks and fails, a pause, it cranks again for longer, the engine coughs into life with a rattle and holds a rough idle.', { tail: 0.9 }),
  sfx('engine_4', 3.8, 'An old diesel station wagon: the starter cranks twice, the engine fires, the driver revs it twice impatiently, then it drops back to a clattering idle.', { tail: 0.9 }),
  sfx('engine_5', 3.6, 'An old diesel car on a cold start: slow groaning starter, the engine stumbles, nearly stalls, then picks up into an uneven idle with a rattling exhaust.', { tail: 0.9 }),
  // Arriving: the engine is switched off instead of being cut.
  sfx('engine_stop_1', 3.0, 'An old diesel car rolling to a stop on gravel: tyres crunching, the handbrake ratchets, the engine is switched off and shudders to silence.', { gain: 0.85 }),
  sfx('engine_stop_2', 2.8, 'An old diesel car pulling up: brakes squeak, the engine idles for a moment, then is switched off with a clatter and a last tick of cooling metal.', { gain: 0.85 }),
  sfx('engine_stop_3', 2.6, 'An old diesel engine idling roughly, then turned off: it runs on for one cough, dies, and the keys jingle out of the ignition.', { gain: 0.85 }),
  sfx('car_door', 0.9, 'An old car door closing with a hollow metallic thunk, then keys jingling. Dry.', { gain: 0.8 }),
  sfx('car_door_2', 0.9, 'An old car door creaking open on a dry hinge and slamming shut with a tinny bang. Dry.', { gain: 0.8 }),
  sfx('car_door_3', 1.0, 'The tailgate of an old station wagon slammed shut twice because the latch did not catch the first time. Dry.', { gain: 0.8 }),
  // The desk on the title screen answers when it is poked.
  sfx('crt_off', 1.2, 'An old CRT computer monitor being switched off: a plastic power button clunk, a high electronic whine dropping away, a faint static crackle.', { gain: 0.8 }),
  sfx('crt_on', 1.8, 'An old CRT computer monitor being switched on: a power button clunk, a degaussing thump and buzz, a rising high-pitched whine, static settling.', { gain: 0.8 }),
  sfx('sip', 1.6, 'A man takes one careful slurping sip from a hot enamel mug of coffee, then a small satisfied sigh. Very close microphone.', { gain: 0.8 }),
  sfx('bulb', 0.6, 'An old incandescent light bulb flickering: two tiny electrical ticks and a faint buzz. Very quiet, dry.', { gain: 0.5 }),
  sfx('knob', 0.5, 'One click of a small plastic volume knob on an old computer speaker. Very short, dry, quiet.', { gain: 0.7 }),
  sfx('news', 2.6, 'A regional TV news channel breaking-news jingle: short urgent synth brass and timpani sting, 1990s broadcast sound.', { gain: 0.8 }),
  sfx('exhale', 3.2, 'A man takes one long slow drag on a hand-rolled cigarette, paper crackling, then exhales slowly. Very close microphone.'),
  sfx('dawn', 4.5, 'Dawn in a French village: a rooster crows once, a distant church bell rings twice, first birds waking. Calm, relieved.', { gain: 0.9 }),
  sfx('lost', 3.2, 'A dark defeat sting: a deep impact, then a low drone sinking in pitch into silence. Horror, no melody.'),

  // ───────────── Beds (seamless loops) ─────────────
  loop('amb_room', 18, 'Room tone of a small quiet study at night: the electric hum of an old CRT monitor, a faint computer fan. Steady, no music, no voices.', { gain: 0.5 }),
  loop('amb_day', 22, 'Daytime ambience of a deserted French countryside village: birdsong, a light breeze in leaves, one distant dog. Too quiet. No music, no voices.', { gain: 0.5 }),
  loop('amb_night', 22, 'Night ambience at the edge of a forest: crickets, slow wind in the trees, an occasional distant owl. Uneasy. No music, no voices.', { gain: 0.55 }),
  loop('amb_car', 14, 'Interior of an old diesel station wagon driving on a rough country road: steady engine drone, dashboard rattles, tyres on gravel. No music.', { gain: 0.6 }),

  // ───────────── Music (instrumental) ─────────────
  music('mus_title', 50, 'Title theme for a darkly comic survival game set in a French village. A worn-tape, lo-fi mood: slightly detuned upright piano playing a slow melancholy motif, a soft accordion drone underneath, faint vinyl crackle. Sparse, uneasy but warm, 68 bpm, minor key. Instrumental, loops cleanly.', { gain: 0.5 }),
  music('mus_day', 75, 'Daytime scavenging in an abandoned French village. Fingerpicked nylon guitar, soft upright bass, brushed snare, a hint of musette accordion. Wary but hopeful, unhurried, 84 bpm, minor key with warm turns. Leaves space, no big climax. Instrumental, loops cleanly.', { gain: 0.42 }),
  music('mus_night', 85, 'Night siege watched through security cameras. Minimal 1980s horror synth: a low pulsing analog bass ostinato, a ticking clock-like percussion, cold sustained strings far away, occasional detuned bell. Steady dread, 96 bpm, no melody on top, no drums fill. Instrumental, loops cleanly.', { gain: 0.42 }),
  music('mus_boss', 65, 'A sinister musette waltz for a monstrous neighbour. Accordion playing a minor-key French waltz that is slightly too fast and distorted, pounding low piano, stomping drums, tense tremolo strings. Darkly comic and threatening, 132 bpm in three-four time. Instrumental, loops cleanly.', { gain: 0.45 }),
  music('mus_morning', 22, 'The morning after a hard night. Solo accordion and nylon guitar play a slow, tired, relieved phrase that resolves gently. Warm, small, 70 bpm. Instrumental.', { gain: 0.5 }),
  music('mus_won', 28, 'A quiet bittersweet ending at sunrise. Upright piano and accordion play a gentle major-key resolution of a melancholy theme, soft strings entering, ending on a held chord. Instrumental.', { gain: 0.55 }),

  // ───────────── The broadcast ─────────────
  voice(
    'vo_broadcast',
    'anchor',
    'Bonsoir. Nous interrompons nos programmes. Des agressions d’une violence inhabituelle sont signalées ce soir dans plusieurs communes de la vallée. Les autorités évoquent un premier cas, un « patient zéro », sans confirmer l’origine de la contamination. Il est demandé à chacun de rester chez soi, portes et volets fermés. Et de n’ouvrir à personne. Même à un voisin.',
    { fx: 'tv', stability: 0.6, gain: 0.95 },
  ),

  // ───────────── The protagonist, to nobody in particular ─────────────
  voice('vo_later', 'hero', '[sighs] Bon. La maison tient. Le break démarre encore. C’est déjà ça.'),
  voice('vo_egg_off', 'hero', 'Voilà. Plus de mauvaises nouvelles.'),
  voice('vo_egg_on', 'hero', '[sighs] Bon. On y retourne.'),
  voice('vo_egg_smoke_1', 'hero', '[coughs] C’est médicinal.'),
  voice('vo_egg_smoke_2', 'hero', '[slow, amused] Les couleurs sont bizarres, ce soir.'),
  voice('vo_egg_smoke_3', 'hero', '[slow] Il est fort, celui du voisin.'),
  voice('vo_coffee_1', 'hero', '[flat, calm] Tout va bien.'),
  voice('vo_coffee_2', 'hero', 'Mais d’abord, un café.'),
  voice('vo_coffee_3', 'hero', '[grumbling] On ne me parle pas avant mon café.'),
  voice('vo_coffee_4', 'hero', '[satisfied sigh] Garder son calme. Boire son café.'),
  voice('vo_day1', 'hero', 'Douze heures de jour. Fouiller, clouer, et rentrer avant la nuit.'),
  voice('vo_car', 'hero', 'Allez, ma vieille. Encore un tour.'),
  voice('vo_car_2', 'hero', '[pleading] Démarre. S’il te plaît, démarre.'),
  voice('vo_car_3', 'hero', 'Un plein, quatre pneus, zéro voisin. Ça ira.'),
  voice('vo_car_4', 'hero', 'On fait vite. La nuit n’attend pas.'),
  voice('vo_car_5', 'hero', 'Voyons ce que le village a laissé traîner.'),
  voice('vo_car_6', 'hero', '[quietly] Personne dans la rue. Tant mieux.'),
  voice('vo_car_7', 'hero', 'Ceinture. Même maintenant. Surtout maintenant.'),
  voice('vo_car_8', 'hero', 'Des planches, de la ferraille. Je ne demande pas la lune.'),
  voice('vo_car_9', 'hero', 'Si je croise quelqu’un, je ne m’arrête pas.'),
  voice('vo_car_10', 'hero', 'Un aller, un retour. Pas de détour.'),
  voice('vo_home', 'hero', 'Rentré. Maintenant, on cloue.'),
  voice('vo_home_2', 'hero', 'La maison est toujours debout. Bon début.'),
  voice('vo_home_3', 'hero', '[exhales] Entier. Le break aussi.'),
  voice('vo_home_4', 'hero', 'Pas un chat sur la route. Pas un vivant, en tout cas.'),
  voice('vo_home_5', 'hero', 'On vide le coffre, et on s’y met.'),
  voice('vo_home_6', 'hero', 'Le portail a tenu sans moi. Brave portail.'),
  voice('vo_home_7', 'hero', 'Bon. Qu’est-ce qu’on peut clouer avec tout ça ?'),
  voice('vo_home_8', 'hero', 'Le soleil descend. Pas le temps de traîner.'),
  voice('vo_home_9', 'hero', '[weary] Chez soi. Enfin, ce qu’il en reste.'),
  voice('vo_home_10', 'hero', 'Encore un trajet sans croiser personne. Ça me va.'),
  voice('vo_nightfall', 'hero', '[quietly] Quatre écrans. Une seule paire d’yeux.'),
  voice('vo_nightfall_2', 'hero', '[quietly] Les volets sont fermés. Les écrans sont allumés.'),
  voice('vo_nightfall_3', 'hero', '[quietly] Allez. Encore une nuit à regarder la télé.'),
  voice('vo_nightfall_4', 'hero', '[quietly] Ils sortent avec le noir. Comme les moustiques.'),
  voice('vo_night1', 'hero', 'Les pieux et le filet partent tout seuls. Le reste, c’est moi qui appuie.'),
  voice('vo_fire', 'hero', '[tense] Maintenant !'),
  voice('vo_switch', 'hero', '[tense] Ça bouge sur une autre caméra.'),
  voice('vo_good_1', 'hero', '[satisfied] En plein dedans.'),
  voice('vo_good_2', 'hero', 'Ça, c’est fait.'),
  voice('vo_good_3', 'hero', '[short laugh] Joli.'),
  voice('vo_breach', 'hero', '[alarmed] La porte a lâché !'),
  voice('vo_inside', 'hero', '[panicked] Ils sont dedans !'),
  voice('vo_battery', 'hero', '[frustrated] Plus de batterie.'),
  voice('vo_trap_broken', 'hero', 'Ils m’ont cassé un piège.'),
  voice('vo_boss_mower', 'hero', '[incredulous] C’est… le voisin ? Il tond. À cette heure-ci.'),
  voice('vo_boss_mechanic', 'hero', 'Le dépanneur. Avec son palan. Et sa facture.'),
  voice('vo_boss_mail', 'hero', 'La factrice. Elle finit sa tournée.'),
  voice('vo_boss_chief', 'hero', 'Le chef. Il fait encore la circulation.'),
  voice('vo_boss_mayor', 'hero', '[weary] Madame le maire. Toujours en campagne.'),
  voice('vo_dawn', 'hero', '[exhales] Le jour. On a tenu.'),
  voice('vo_dawn_2', 'hero', '[exhales] Le coq. Je n’ai jamais autant aimé ce coq.'),
  voice('vo_dawn_3', 'hero', '[relieved] Il fait jour. Ils s’en vont.'),
  voice('vo_dawn_4', 'hero', '[tired] Une de plus. Café.'),
  voice('vo_lost', 'hero', '[quietly] C’est fini. La maison est à eux.'),
  voice('vo_won', 'hero', 'Sept nuits. Plus personne ne frappe à la porte.'),

  // ───────────── What is left of the neighbours ─────────────
  voice('bark_mayor_1', 'mayor', '[hoarse, rasping, through a megaphone] Mes chers… concitoyens ! Votez… pour… la stabilité !', { fx: 'megaphone', stability: 0.3 }),
  voice('bark_mayor_2', 'mayor', '[hoarse, rasping, through a megaphone] Ensemble… pour un village… propre !', { fx: 'megaphone', stability: 0.3 }),
  voice('bark_chief', 'chief', '[growling, hoarse] Circulez ! Y a rien… à voir !', { fx: 'far', stability: 0.3 }),
  voice('bark_mail', 'mail', '[rasping, breathless] Recommandé ! Signature… obligatoire !', { fx: 'far', stability: 0.3 }),
  voice('bark_mechanic', 'mechanic', '[growling, slow] Je vous mets ça… sur la facture.', { fx: 'far', stability: 0.3 }),
];
