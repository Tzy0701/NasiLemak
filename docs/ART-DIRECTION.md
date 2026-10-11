# Nasi Lemak heritage artwork

The approved design combines Concept A's warm painted illustrations and cream card faces with Concept D's banana leaves, dark wood, rattan, antique gold and frangipani. The physical game's recognizable structure is retained: ingredient pictograms in four corners; English/Malay action ribbons and effect footers; one/two wrapped rice parcels; a separate gold scoring back.

## Production layers

`public/art/heritage-v1/` contains the production PNG assets and `manifest.json` with the prompts used by the built-in image generator. Desktop and portrait table backgrounds contain no baked UI. Food, characters, tools and avatars use transparent sprite atlases; no raster crops are required. Labels, counts, selection, rules and controls remain live HTML. The original rules engine is unchanged.

Ingredients: Coconut Rice, Egg, Peanuts, Sambal Bilis and Cucumber; Rendang is the optional wildcard. There is no extra standalone anchovy card. Rendang artwork shows chicken. Thief is a human and Si Oyen is the orange cat. Crow remains separate from the nine action cards.

Hidden scoring cards use the same gold back, regardless of their value. Only scoring faces whose value is included in the player's view show one or two parcels. Custom Mak Cik requirements and game goals use the current room configuration.

## Avatars

There are 24 selectable characters, numbered 1–24 in the UI. All share gold circular rims and leafy backgrounds. Faces vary by direction, pose, expression, age, hairstyle and clothing. The Chinese atlas adds four men and four women. Existing portraits include additional Chinese characters. The remaining portraits represent varied Malaysian characters and a chef robot.

Indices 0–7 use `avatars.png`, 8–15 use `avatars-chinese.png`, and 16–23 use `avatars-extra.png`; each atlas is four columns by two rows. Keep this order stable because rooms and devices persist indices. Old rooms without an avatar keep the deterministic fallback. Bots default to the chef robot. Settings allow avatar changes in the lobby and during play. Server validation accepts only integer indices 0–23.

## Review and verification

Run `npm run build`, `npm run test:unit`, `npm run test:integration` and `npm run test:e2e`. Integration tests use an isolated local Worker with fast timers; they do not deploy. Browser tests cover six phones, custom rules, a complete three-player game, refresh and rematch. Avatar integration coverage checks creation/join, broadcast, reconnect, midgame selection, rematch and invalid indices.

The artwork is an original illustrated interpretation guided by the approved references. Physical card names and rules retain their attribution in the existing project documentation.
