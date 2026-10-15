# Nasi Lemak Online

A private multiplayer adaptation of Nasi Lemak: The Game and The Rendang Expansion, with a Chinese/English illustrated tabletop, 24 avatars and Cloudflare Workers + SQLite Durable Objects.

## Play and social features

- 2–7 seats, Classic Base / Rendang / custom rules, four bot styles and room links.
- Authoritative server rules; each player receives only their own hand and permitted private information.
- Thief: manually choose one anonymous face-down card from every other nonempty hand, one opponent at a time. Refresh keeps the same choices. Inactive selection automatically completes after 30 seconds while a human remains online.
- 12 illustrated stickers and 12 translated phrases, targeted to a player, local flying effects, mute control and a two-second server-enforced sending interval.
- Hand sorting by card type, quantity or name; saved per device.
- Side-by-side trade summary and exact missing-card counts when answering an offer.
- Per-room wins, games, accumulated packs and best streak across rematches; shared wins count for each winner, aborted games are excluded.
- QR invitations, checked return-to-room entry, public recent actions and visual replay.
- Chinese/English interface, card/parcel/Crow inspection, sound and reduced-motion controls.

## Run locally

Node.js 22+ and npm are required.

```sh
npm ci
npm run dev
```

Open `http://localhost:5173` (Vite frontend; local Cloudflare room backend at port 8790). Local development does not require signing into Cloudflare.

```sh
npm run build
npm start
```

This serves the built frontend and room API together in the local Workers runtime at `http://localhost:8790`.

## Free hosting

See [Cloudflare 免费部署](docs/FREE-HOSTING.md). The default is one Cloudflare Worker serving static assets and the room API, with one SQLite-backed Durable Object per room. No Render, D1 or separate database is required.

The Free plan still has daily request, duration and storage limits. Stay on Workers Free; do not enable paid resources. WebSocket hibernation and automatic heartbeat replies reduce idle work. Empty rooms pause and expire after 30 minutes instead of continuously firing timers. The original Worker name, `ROOMS` binding, `GameRoom` class and `v1` SQLite migration are preserved for compatibility with existing room storage.

## Verification

```sh
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:cloudflare
npm run test:e2e
npm run check:deploy
npm run simulate
```

Unit tests cover complete rules, private views, manual Thief, fuzzed full games and hibernation. Integration tests use real WebSocket players on either the optional Node test host or the local Workers/SQLite runtime. Playwright now uses the built application on the Cloudflare runtime at desktop and phone widths. Local/browser results are not proof of deployment or two physical devices across networks.

## Architecture and configuration

- `src/game`: platform-independent rules, bots and seat-scoped `projectGame()` privacy boundary.
- `src/server/rooms/GameRoom.ts`: room lifecycle, authentication, private broadcasts, social validation and game timers.
- `src/server/cloudflare`: Worker API, original Durable Object binding and hibernating WebSocket adapter.
- `src/server/node`: optional local test host, one serial queue and one timer per room, atomic file replacement.
- `src/client`: React tabletop, translated UI, artwork, device preferences and resilient network client.
- `src/shared`: shared protocol and preset reaction catalog.
- `public/art/heritage-v1`: original cards/backgrounds, 24 avatars and generated sticker atlas.

`wrangler.jsonc` targets the existing `nasi-lemak-online` Worker and account. Build with `npm run build`, check with `npm run check:deploy`, and publish with `npm run deploy` after authenticating to that account. Keep `VITE_API_URL` empty for this same-origin deployment. `FAST_TIMERS=1` is only for tests; never enable it in production.

The optional Node adapter remains for local regression testing (`npm run build:node`, then `node dist/server/index.mjs`); its private `.room-data` files are unrelated to Cloudflare's persistent storage. It is not required for deployment.

When every human disconnects, turns, bots, trades and choice timers pause. A returning player resumes the same seat and remaining timers while the room exists. If another human is still online, ordinary AFK and host-transfer handling continue. Background actions never extend the last human activity time. Explicitly leaving as the last human closes the room.

Rules and interpretation notes: [docs/RULES.md](docs/RULES.md). This repository is a fan adaptation for private play.
