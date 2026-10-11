# UI layout regression review — 2026-10-11

The heritage artwork remains in place. This review fixes card titles/subtitles
colliding with illustrations, grid overflow, long player names, desktop seats
covering the piles, and controls that become crowded on narrow screens.

## Changes

- Card faces use grid rows for text and artwork instead of fixed absolute text
  offsets. Artwork fits the space remaining between the labels.
- Card references, Supplier choices, avatars and trade counters adapt their
  column count to available width. Custom labels wrap and controls keep their size.
- Opponents and piles share a scrollable board above the pinned player area.
  Hand scrolling retains access to both ends; NEW/count badges have their own row.
- Lobby members, scoring previews, results and long modal headings wrap safely.
- Modal portals prevent nested previews being clipped. Keyboard focus stays in
  the top dialog; Escape closes one layer. Trade reply buttons stay in the footer.
- Reconnection status takes up its own row instead of covering the game header.

## Verification

`npm run build` passes; 79 rule/unit tests pass.

Nine Chromium layout scenarios pass, totaling 691 page/dialog measurements:

| Viewport (CSS pixels) | Conditions | Measurements |
| --- | --- | ---: |
| 320 × 568 | normal | 77 |
| 390 × 844 | normal | 77 |
| 640 × 720 | normal | 77 |
| 768 × 1024 | normal | 77 |
| 1024 × 768 | normal | 76 |
| 1440 × 900 | normal | 76 |
| 844 × 390 | landscape | 77 |
| 390 × 844 | external fonts blocked | 77 |
| 320 × 568 | root text size 20px (125%) | 77 |

Coverage includes home/help, all 17 card references and large previews, settings,
2/4/7-player tables, action cards, recipes, trade/counter offers, Officer choices,
crow passing, confirmations, guest/invalid custom lobbies, results, disconnected
players, reconnecting, ended rooms, join/full/missing/in-progress/error screens.
Checks measure text clipping, text/art collisions, artwork space, grid and page
overflow, visible board collisions, footer controls, hand reachability and nested
dialog keyboard behavior. Screenshots were also reviewed visually.

Layout coverage uses deterministic WebSocket snapshots to exercise the actual
React UI. It does not validate server rule execution. Three additional tests pass against
real local Worker/Durable Object rooms: six phones playing Rendang and rematching,
custom-rule synchronization, and a complete three-player Classic Base game with
trade rejection, refresh/rejoin, results and rematch.

The existing live-test helper was corrected to select an Officer target with the
largest hand, handle the legal empty-hand case, and avoid waiting for End turn
after an automatic turn change. No game rules or server logic changed.

## Reproduce

```powershell
npx playwright test tests/e2e/layout-audit.spec.ts
npx playwright test tests/e2e/mobile-six.spec.ts tests/e2e/multiplayer.spec.ts
npm run build
npm run test:unit
```

`LAYOUT_OUTPUT` selects the JSON/screenshot directory. `LAYOUT_BASELINE=1` records
measurements without enforcing zero issues for before/after diagnosis. Use
different Playwright `--output` directories for concurrent test processes.

Evidence is local Chromium browser validation. Deployment and physical-device
Safari/Firefox validation were not part of this run.
