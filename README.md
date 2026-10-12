# Nasi Lemak Online

A private, non-commercial online multiplayer version of **Nasi Lemak: The
Game** and **The Rendang Expansion** (Faculty of Fun), for playing with
friends in the browser — phone or desktop, no accounts.

- **Classic Base Game** (2–5 players) and **Classic Rendang Expansion** (3–7
  players) with the official decks and rules (locked).
- **Custom House Rules** (2–7 players): deck counts, hand size, draws, moves,
  target packs, Crows, Mak Cik size, turn timer, plus simulation-tested presets.
- Private rooms with a 6-letter code and invite link (WhatsApp share), ready
  checks, host controls, bots to fill seats, rematch.
- Server-authoritative: one Cloudflare Durable Object per room validates every
  move, keeps hidden information on the server and pushes a personalised view
  to each player over WebSockets (Hibernation API, SQLite-backed storage).
- Refresh / reconnect safe: your seat is tied to a secret token stored in your
  browser; state is persisted after every action.
- Original heritage PNG artwork and 24 selectable avatars, a responsive
  clockwise table, English / 简体中文 UI with saved per-device language choices.
- Readable card values and live parcel/Crow inspectors, server-event card
  animations and a celebratory result screen. See [UI experience](docs/UI_EXPERIENCE.md).

Rules notes and the few interpretations we had to make: **[docs/RULES.md](docs/RULES.md)**.
House-rule balance research: **[docs/BALANCE.md](docs/BALANCE.md)**.

> Unofficial fan project. "Nasi Lemak: The Game" is by Faculty of Fun; please
> buy the physical game. All artwork in this repository was made for this project.

## Architecture

```
src/
  game/            Pure TypeScript rules engine (no DOM / Workers deps)
    cards/         Card catalogue
    rules/         Official configs + engine (all card effects, trading, Crows, scoring)
    custom/        Custom house-rule validation and presets
    bots/          Bots (Random / Collector / Aggressive / Trader)
    view.ts        Per-player projection = the hidden-information boundary
    sim.ts         Headless full-game simulation
  shared/          WebSocket/HTTP protocol types
  server/          Cloudflare Worker (JSON API) + rooms/GameRoom Durable Object
  client/          React app (pages, game table, i18n, network client)
  components/      Shared UI: cards, raster art, avatars, modal, icons
tests/
  unit/            Vitest: rules, views, custom rules, fuzzed bot games
  integration/     Vitest: real WebSocket clients against the real Worker + DO
  e2e/             Playwright: multiple browser sessions playing through the UI
scripts/simulate.ts  Balance simulations → docs/BALANCE-DATA.md
```

One Workers project serves everything: static assets (Vite build, SPA
fallback), `/api/*` routes, and the `GameRoom` Durable Object.

## Requirements

- Node.js 20+ (tested with Node 22) and npm
- A Cloudflare account (free plan works — SQLite-backed Durable Objects are available on Workers Free)

## Run locally

```bash
npm install
npm run dev           # http://localhost:5173 — Worker + Durable Objects run locally in workerd
```

Open the URL in two different browsers (or a normal + private window) to play
against yourself, or add bots in the lobby.

Optional: `cp .dev.vars.example .dev.vars` for local variable overrides.

## Tests

```bash
npm run typecheck          # TypeScript (app, worker, tests)
npm run test:unit          # rules engine, views, custom rules, 320 fuzzed full games
npm run test:integration   # starts the Worker locally (fast timers) and plays real games over WebSockets
npm run test:e2e           # Playwright: builds the production bundle, serves it with `vite preview` (workerd), drives several browsers
                           # (run `npx playwright install chromium` once if no Chromium is installed)
npm test                   # unit + integration
npm run simulate           # balance simulations (GAMES=1000 by default)
```

## Deploy to Cloudflare

```bash
npm install
npx wrangler login         # once, opens the browser
npm run deploy             # = vite build + wrangler deploy
```

That creates a Worker named `nasi-lemak-online` with:

- static assets from the Vite build (`dist/client`)
- the `ROOMS` Durable Object binding to class `GameRoom`
- migration `v1` (`new_sqlite_classes: ["GameRoom"]`) — SQLite storage
- WebSockets on `/api/rooms/<CODE>/ws`

Wrangler prints the URL (`https://nasi-lemak-online.<your-subdomain>.workers.dev`).
Share `https://…/r/<CODE>` links with friends.

**Non-interactive / CI deploy:** create an API token in the dashboard
(*My Profile → API Tokens → Create Token → "Edit Cloudflare Workers"* template),
then:

```bash
export CLOUDFLARE_API_TOKEN=…   # never commit this
export CLOUDFLARE_ACCOUNT_ID=…  # Dashboard → Workers & Pages → Account ID
npm run deploy
```

**Dashboard settings** (all optional):

- *Workers & Pages → nasi-lemak-online → Settings → Domains & Routes*: add a
  custom domain if you have one.
- *Settings → Variables*: `ALLOWED_ORIGINS` (comma-separated) only if you serve
  the frontend from a different origin than the Worker. Leave empty otherwise.
- No secrets are required. Do **not** set `FAST_TIMERS` in production (test only).

Updating later is just `npm run deploy` again; Durable Object state survives
deployments (rooms in progress are restored from storage, clients reconnect
automatically).

## Configuration reference

| File | Purpose |
| --- | --- |
| `wrangler.jsonc` | Production Worker config (assets, DO binding, SQLite migration, vars) |
| `tests/wrangler.test.jsonc` | Same Worker with `FAST_TIMERS=1` for tests |
| `.dev.vars.example` | Local variable template |
| `vite.config.ts` | React + Tailwind + Cloudflare Vite plugin (`WRANGLER_CONFIG` overrides the config file) |

## Security notes

- Seat tokens are 256-bit random values; only their SHA-256 hash is stored.
  Tokens are sent in the first WebSocket message, not in URLs.
- Room codes: 6 characters from a 31-letter alphabet (~887 million codes),
  plus per-IP rate limits on room creation/lookup and per-socket message rate
  limits inside each room.
- Every intent is validated by the engine on the server; requests carry ids
  (duplicates are not re-executed) and the turn number (stale intents rejected).
- Players only ever receive their own projection of the game.
