# Game concept

## Identity

**Established:** a house-defense survival game with a day/night cycle, zombies, infected animals and a neighborhood explored by old car. The player prepares trap placement like a tower defense and manually activates some traps during rapid night attacks through exterior cameras.

**Established visual constraint:** 2D isometric is the preferred direction; top-down 2D remains viable. Real 3D is unlikely, not an approved production direction.

## Player loop

| Phase | Established activity | Exploratory detail |
| --- | --- | --- |
| Day | Drive the old car around the neighborhood and surroundings to find resources | Search garages, houses or a convenience store; choose what to bring home |
| Preparation | Build traps and protect the house before the night | Repair barricades, place cameras and channel enemies with fencing |
| Night | Observe exterior cameras and manually trigger some defenses during intense waves | Multiple threatened sectors, readiness feedback and limited power |
| Morning | Not explicitly defined as a system | Inspect damage, repair broken traps, see traces of the previous wave |

**Exploratory central tradeoff:** search one more building or return early enough to prepare. Do not treat real-time daylight, forced return, driving hazards, fuel or trunk capacity as settled rules.

## Design pillars

1. **Preparation has consequences.** Daytime decisions must materially alter the next defense.
2. **Night demands intervention.** The player should make consequential timing decisions during waves, beyond watching automatic damage.
3. **Familiarity becomes threat.** Neighbors, jobs and habits establish recognizable boss identities.
4. **Domestic improvisation.** The house, old car and scavenged equipment carry the identity of the game.
5. **Fast but readable.** Camera operation and enemy telegraphs must support the intended intensity.

These pillars synthesize the conversation; they are not a final mechanics specification.

## Resources and defenses

Resource examples suggested in the chat: a battery for a floodlight, springs for a trap, and wire fencing to funnel waves. The old car transports finds and could become as recognizable as the refuge. A particular make, model, cargo capacity or upgrade tree is not established; a station wagon was an assistant suggestion.

Exploratory defense inventory:

| Device | Source scope | Proposed gameplay role to validate |
| --- | --- | --- |
| Net | Included in requested trap artwork set | Briefly immobilize a group for a timed follow-up |
| Barrier / barricade | House protection and requested trap art | Delay or redirect enemies; show damage clearly |
| Horn | Included in requested trap artwork set | Draw attention toward a prepared lane |
| Floodlight | Resource example | Reveal a threatened area |
| Wire fence | Resource example | Shape routes |

The net and horn effects above are handoff proposals, not facts visible in the missing images. For artwork, show resting, armed, triggered and broken states. Actual rearming, breakage probabilities, cooldowns, ammunition and power costs remain open.

## Threat roster

Human zombies and infected animals are established. The following specifics originated as assistant suggestions; the creator requested the corresponding artwork exploration.

| Threat | Exploratory behavior | Readability requirement — proposed |
| --- | --- | --- |
| Dog | Flanks defenses | A distinct low, quick silhouette and understandable route |
| Boar | Smashes obstacles | A clear charge tell and visible impact |
| Deer | Clears obstacles | A readable jump, landing and explicit obstacle limits |
| Mower neighbor | Straight charges, opens barricades | Mower silhouette and audible engine before contact |
| Mechanic | Equipment used as a battering ram | Recognizable tool and wind-up |
| Mail carrier | Fast, exploits breaches | Route and entry point readable at camera scale |
| Police chief | Protects and directs a zombie group | Leader distinguishable from the group |
| Mayor | Summons reinforcements through a megaphone | Arrival and reinforcement signal visible in a crowd |

The creator establishes an escalation toward more important figures such as the mayor and police chief, with sheriff as an alternative if the setting is American. Exact boss order, abilities and number of waves are open.

## Scope cautions

Camera restriction can create tension, but excessive blind time can turn failure into guesswork. Test switching speed, threat signaling and trap targeting together. Do not add permanent camera failure or complicated power management until the basic loop is enjoyable.

Isometric art can hide enemy feet and placement cells. Validate occlusion and targeting before commissioning a full sprite set. A final projection decision should follow a small interaction test.

The concept does not yet establish procedural generation, a roguelite structure, skill trees, crafting recipes, an open world, multiplayer, a cure quest or a definitive ending.
