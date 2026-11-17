# Development and creative handoff

> **Status update, 2026-11-17.** This handoff was written when the repository held documents only. A playable game now exists: see [README](../README.md) for how to run it and for the decisions that were taken to build it. The sections below are kept as the original brief; where they say nothing is implemented, the README supersedes them. The creative intent, the acceptance criteria and the open narrative questions still apply.

## Current state

The destination was an empty Git repository: no commits, no remote, no application, no engine configuration and no assets. These documents capture the concepts available in the shared conversation. Nothing has been implemented or playtested. No commit or push is part of this handoff.

Read [CONCEPT](CONCEPT.md), [LORE](LORE.md) and [ART_DIRECTION](ART_DIRECTION.md) before implementation. The [source register](sources/CONVERSATION.md) separates creator statements from creative suggestions.

## Creative intent to preserve

- Daytime scavenging with an old car feeds the house's defenses for the next night.
- Placement and preparation matter, but night play also demands fast manual trap timing through exterior cameras.
- Human zombies and infected animals threaten the house.
- Neighbors are recognizable before and after infection; increasingly important local figures become bosses.
- The tone is threatening, domestic and cocasse: the absurdity comes from persistent habits, props, animation and sound.
- The opening begins inside the main character's computer menu: news of patient zero, joint and ashtray on the right, smoke filling the screen, then a time jump into the adventure.
- Use 2D. Isometric is preferred, with top-down still an explicit alternative.

## Recommended first playable slice — proposed

Prove one complete day-to-night-to-morning cycle before building a town or a boss campaign. The main risk is whether rapid camera switching and trap timing feel readable and satisfying. An attractive scavenging scene alone will not validate that experience.

1. One house with two approaches and two camera views. Keep both views spatially consistent with the preparation map.
2. One short daytime destination: a nearby garage reached with the old car. Use a simple travel interaction initially; a driving simulation is unnecessary to test the loop.
3. A small resource inventory, one barricade and one manually triggered trap. Let the player choose between repairing and building.
4. A night wave of ordinary infected, followed by a telegraphed mower-neighbor encounter if the basic wave works. Other bosses and animals remain later content.
5. A morning result showing damage, remaining resources and a return to preparation. Keep visible damage consistent with what happened during the night.

### Observable acceptance criteria

- Collected resources change what can be built; unavailable resources prevent spending below zero.
- Placement cannot overlap invalid space or silently seal every enemy route. The chosen blocking/pathfinding rule must be visible to the player.
- Switching cameras changes the view, not enemy simulation time. Both sectors continue running.
- A manual trigger has clear success/failure feedback. Repeated input cannot produce multiple effects or spend the same resource twice.
- Enemies interact with defenses consistently. Destroyed defenses cease blocking or affecting enemies according to their type.
- Surviving the configured wave reaches morning; the selected loss condition produces a clear loss state. Neither outcome leaves the phase stuck.
- A new cycle carries forward the actual inventory and damage. Restarting a run clears the previous run's state.
- A player can understand which sector is threatened and which trap can activate without reading debug information.

These are prototype validation criteria, not claims that the source chat specifies an economy, pathfinding model or failure rule.

## Implementation guidance — proposed, engine-neutral

Choose the engine before scaffolding. There is no existing stack to preserve. Prefer a single local game process with one authoritative simulation state; cameras are views over that state. No backend or distributed architecture is justified by this concept yet.

Keep phase progression explicit: `day exploration → preparation → night defense → morning assessment → next day`, with a separate loss outcome. The exact transition triggers and clock policy are open. Put resource costs and enemy/trap parameters in data so tuning does not require changing combat logic. Introduce only the abstractions needed by the first slice.

For development, expose the phase, wave index, resource balances, camera sector, trap state and enemy counts in an optional debug view. Test actual phase transitions, simultaneous enemy/defense interactions and repeated trigger input once code exists. Do not add a test framework solely for this documentation package.

## Decisions to resolve in order

| Decision | Why it matters | Suggested starting point, not a decision |
| --- | --- | --- |
| Engine and target platform | Input, packaging and asset workflow | Pick one desktop target first |
| Isometric or top-down | Occlusion, placement precision and art cost | Compare the same two-sector encounter in rough 2D layouts |
| Camera controls and information | Central source of night pressure | Two views, fast switching and clear sector alerts |
| Day clock and return policy | Defines the scavenging/preparation tradeoff | A small fixed preparation budget to test tension |
| Trap activation, rearm and costs | Defines meaningful timing | One explicit manual action with visible readiness |
| Loss and recovery | Defines stakes and run structure | A single clearly communicated house-breach rule |
| Campaign and infection timing | Determines when familiar neighbors return | Script one encounter; avoid a town simulation initially |
| Setting, names and outbreak truth | Governs coherent lore | Leave location neutral until old lore is recovered |

Also unresolved: free movement or combat at night, fuel and cargo systems, power simulation, saves, difficulty, run length, multiplayer, ending and progression model. Do not infer these from illustrations.

## Recovery and continuation

If the old project becomes available, import its docs and assets with provenance, compare lore conflicts explicitly, then ask the creator which version governs each conflict. A 404 does not establish whether the repository was deleted, renamed or private.

If the generated artworks become available, preserve originals, record their source message IDs and add previews against the art inventory. Do not recreate them and describe the replacements as recovered originals.

### Copyable continuation brief

> Read README.md, HANDOFF.md, docs/CONCEPT.md, docs/LORE.md and docs/ART_DIRECTION.md. This is a documentation-only project. Preserve the established day scavenging / house preparation / camera-operated night defense loop and the domestic horror with cocasse neighbor bosses. Treat assistant suggestions and the proposed lore as provisional. First resolve engine/platform and 2D projection, then implement the smallest complete cycle with placeholder art. Validate night readability and manual trap timing before expanding content. The original lore and artwork files remain unavailable; do not invent recovered canon. Do not commit or push to main.
