# Bilingual table and game feedback

The heritage artwork remains the visual foundation. The interface has complete
English and Simplified Chinese dictionaries, including rules, cards, actions,
logs, settings, errors and results. Malay card subtitles retain the names used
by the original game. First use follows the browser language; explicit choices
are saved per device. Language changes do not change a room or another player.

Players sit clockwise around the central piles. The local hand stays pinned at
the bottom, and the board scrolls independently on short screens. Public seats
show hand counts, wrapped-card counts, Fly status and Crow stash counts. They
never expose private scores. Tapping a seat, owned parcel or pile opens a live
inspector. Blocked parcels show both their original value and their zero scoring
contribution; the Fly marker no longer covers the number. Crow ingredients are
public and shown near the top of the inspector.

Transient effects follow new authoritative public log entries: draw flights,
action-card spotlights, ingredient gathering and leaf wrapping, Crow movement,
trades and reshuffling. Own scoring values may appear in a make effect; other
players' values remain face down. Effects cannot intercept input, cannot delay
server actions, and do not replay the log on reload. Both the in-game reduced
animation setting and the OS preference suppress motion. Results handle single
and shared winners with portraits, valid packs, revealed cards and one-shot
confetti.

The animation reference was Konami's [Yu-Gi-Oh! Master Duel](https://www.konami.com/yugioh/masterduel/us/en/).
This project uses its own warm leaf, paper and gold presentation and artwork.

Validation:

- `npm run typecheck` and `npm run build`
- `npm run test:unit` checks dictionary coverage, interpolation, effect privacy
  and the existing rule suite.
- `npx playwright test` covers complete local multiplayer play, six phones,
  bilingual room use, inspector privacy, effect lifecycle, reduced motion and
  both languages across 9 layout configurations.
- The broad layout fixtures are simulated room snapshots. Real room and game
  tests use the local Worker and WebSocket transport. These checks do not imply
  that the public Cloudflare deployment has been tested.
