# Art and audio direction

## Status

The shared conversation describes generated artworks, but the inspected page displays “Loading image…” and disabled download buttons. Its observable asset inventory contains site assets, not the generated concept images. No original image has been inspected, exported or included here.

This document is a recoverable creative brief. The descriptions reflect the text of the conversation, not visual analysis. Do not use them to claim precise character appearance, palette, car model or house layout.

## Direction

**Established:** 2D, preferably isometric, potentially top-down. Domestic zombie horror with cocasse elements, an old car, a defended house and recognizable neighbors before/after infection.

**Exploratory:** drawn 2D treatment, a warm house contrasted with a threatening forest, scavenged screens, improvised cables and equipment. A limited electrical supply is an atmosphere suggestion, not a confirmed mechanic.

**Proposed production constraints:** prioritize silhouettes, trap state changes and readable ground contact at gameplay scale. Keep camera sectors consistent with the daytime layout. Add atmosphere without obscuring enemy tells. Make humor readable in props and motions without making bosses harmless.

## Complete artwork inventory from the chat

| ID | Subject / batch | Text-supported content | Status |
| --- | --- | --- | --- |
| ART-01 | Initial five explorations | Day/night defense; later images integrate 2D isometric views, camera surveillance and car outings | Five images reported; exact per-image composition unavailable |
| ART-02 | Two before/after character sheets | Mower neighbor, mechanic, mail carrier, police chief and mayor | Two sheets reported; exact distribution across sheets unavailable |
| ART-03 | Car in town and resource gathering | Old car, neighborhood exploration and collected resources | Two image responses; text does not describe their exact composition |
| ART-04 | Opening storyboard | Computer menu, news/patient zero, joint and smoke, time jump to adventure | Two image responses; assistant describes a four-beat board |
| ART-05 | Surveillance room | Original desk becomes a control station with salvaged monitors and cables | Part of final six-image batch |
| ART-06 | Trap sheet | Net, barrier and horn; resting, armed, triggered, broken | Part of final six-image batch |
| ART-07 | Infected animal bestiary | Dog, boar and deer; distinct silhouettes and behaviors | Part of final six-image batch |
| ART-08 | Searchable interior | Neighbor's garage; convenience store was an alternate briefing example | Garage reported in final batch |
| ART-09 | Boss in an actual wave | Mayor and entourage through cameras amid traps | Part of final six-image batch |
| ART-10 | Morning aftermath | Broken barricades, jammed traps, tracks, repairs and an impeccably mown strip | Part of final six-image batch |

There are 17 image-only responses in the visible transcript: 5 + 2 + 2 + 2 + 6. This counts responses, not verified distinct image files or production-ready assets.

## Next art deliverables — proposed

The previous assistant prioritized the surveillance station, trap states and morning aftermath. For game production, pair those scenes with a small readable gameplay mockup before expanding illustration volume.

1. Same two-sector house layout in daylight, during an attack and the morning after. Show placement areas and routes consistently.
2. Control station and camera interface: sector selection, threatened sector, selected trap and activation feedback.
3. One trap sheet at gameplay size, with all four visual states and an unambiguous activation zone.
4. One neighbor alive/infected, with matching props, silhouette and a telegraphed attack sequence.
5. Old car exterior plus resource-loading scene. Leave make, model and inventory UI provisional.

Use placeholders until the isometric/top-down decision is resolved. Final dimensions, animation directions, sprite sheets, tile scale and engine import settings depend on that choice.

## Audio hooks

From the chat: a muffled newscaster fading into the old car's struggling engine; a mower recognized in the dark; the police chief's attempt to maintain order; the mayor's megaphone.

Proposed additions: distinct trap-ready/activation/failure sounds, a clear sector-threat alert and quieter morning ambience. Critical state changes need visible equivalents; audio alone should not carry required information.

## Asset recovery convention — proposed

When originals are recovered, store them under `assets/concepts/` with descriptive names such as `opening-storyboard-01.png`. Keep source message ID, source URL, recovery date and any later edits in an adjacent manifest. Separate concept illustrations from runtime sprites. Do not add empty files or site favicons as stand-ins for missing art.
