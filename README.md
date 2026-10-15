# Nasi Lemak Online

A private multiplayer adaptation of Nasi Lemak: The Game and The Rendang Expansion, with a Chinese/English illustrated tabletop, 24 avatars and a portable Node.js room server.

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

Open `http://localhost:5173` (Vite frontend; Node backend at port 8790).

```sh
npm run build
npm start
```

This serves the production frontend and room API together at `http://localhost:8790`. No Cloudflare account, DO or D1 is required.

## Free hosting

See [完全免费部署与迁移](docs/FREE-HOSTING.md). Root `render.yaml` selects a **Render Free** Node service, serving frontend and backend together. The static frontend can alternatively use Cloudflare Pages with `VITE_API_URL` pointing to the Node service and the frontend origin allowed on the server.

Free does not mean permanent storage or unlimited resources: Render may sleep after 15 idle minutes and its files are lost on sleep, restart or redeploy. Rooms and table records can disappear. The software's 30-minute reconnect window applies only while the server and its files survive. For strict zero cost, check the account's payment and usage settings as described in the deployment guide. Do not add paid resources.

## Verification

```sh
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm run simulate
```

Unit tests cover complete rules, private views, manual Thief and fuzzed full games. Integration tests start a real Node server and separate WebSocket players, including reconnect, saved choice handles, rematches and reaction limits. Playwright tests use the built application on desktop and phone widths. Local/browser results are not proof of deployment or two physical devices across networks.

## Architecture and configuration

- `src/game`: platform-independent rules, bots and seat-scoped `projectGame()` privacy boundary.
- `src/server/rooms/GameRoom.ts`: room lifecycle, authentication, private broadcasts, social validation and game timers.
- `src/server/node`: HTTP/WebSocket host, one serial queue and one timer per room, atomic file replacement.
- `src/client`: React tabletop, translated UI, artwork, device preferences and resilient network client.
- `src/shared`: shared protocol and preset reaction catalog.
- `public/art/heritage-v1`: original cards/backgrounds, 24 avatars and generated sticker atlas.

`PORT`, `HOST`, `ROOM_STORE_PATH` and `ALLOWED_ORIGINS` configure the server. `VITE_API_URL` configures a separate backend at frontend build time. Empty values use same-origin requests. `FAST_TIMERS=1` is only for tests; never enable it in production.

Local room files default to `.room-data` and must stay private. Setting `ROOM_STORE_PATH=:memory:` disables file storage. Files preserve process restart state only when the hosting platform preserves that directory. This single-process implementation must not be scaled to independent replicas without shared room routing/state.

When every human disconnects, turns, bots, trades and choice timers pause. A returning player resumes the same seat and remaining timers while the room exists. If another human is still online, ordinary AFK and host-transfer handling continue. Background actions never extend the last human activity time. Explicitly leaving as the last human closes the room.

Rules and interpretation notes: [docs/RULES.md](docs/RULES.md). This repository is a fan adaptation for private play.
