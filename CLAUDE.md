# CLAUDE.md — Synthetic Market Simulator (UI phase)

> Standing brief. Read this first, every session. It is the rules and the index;
> the values and shapes it points to live in the files named below.

## What this project is

A **synthetic stock-market "flight simulator"** — a web app where people practise
trading against a fully synthetic market (invented instruments, no real securities).
This repo is the **UI phase**: a React frontend plus a Go mock backend, built
contract-first so the real Go backend drops in later by changing one base URL.

This is a serious, professional build (headed for a YC application). Treat it that way.

## The three axes (how the backend is shaped)

Every endpoint belongs to one of three axes. Know which one you're touching:

1. **Account/order axis** — `account_id`-keyed, moves money. The broker HTTP API
   (orders, transfers, balances, positions, trade/P&L/tax history). HTTP, request/response.
2. **Market-data axis** — public, instrument-keyed, no account. Candle history over
   HTTP + live price/quote/depth over **WebSocket**.
3. **Session/reference axis** — markets, instruments, join/exit. HTTP. (Provisional —
   ~90% stable, may shift ~10%.)

## The contract is the single source of truth

- It lives in `contract/openapi.yaml` (REST) + `contract/ws-schemas.md` (WebSocket).
- Generated types live in `contract/generated/` (Go for the mock, TS for the frontend) — **committed**.
- **Rule:** any new data a screen needs is added to the contract **and** the mock in the
  **same change**. Never invent a field in a component that isn't in the contract.
- When a contract shape changes, update `UI-API-Coverage-Tracker.md` in the same PR.
- The source design docs for these contracts are in `docs/` — read them when you need detail
  the contract doesn't carry.

## The two-transport rule (the Terminal specifically)

The Terminal runs **two transports at once**. Do not collapse them:

- **Market data → WebSocket (push).** Chart candles, live price, quote, depth.
  Held in **Zustand**.
- **Account/order state → HTTP polling (pull).** Positions, open orders, trades,
  balance, session P&L — all from `GET /v1/account/observation` on a poll loop via
  **TanStack Query**. There is **no** order stream; fills are seen by polling.

## Settled facts the contracts force (do not re-litigate)

- **Money and prices are bare `int64`.** No currency field anywhere. Format with the
  **tick formatter** (`frontend/src/lib/ticks.ts`) using `tick_size` / `price_decimals`
  from `GET /v1/instruments`. Never hardcode a currency symbol. The display unit is a
  plain **"units"** label (single global amount, not per-country).
- **`202` is not "done".** Placing/cancelling an order returns `202 Accepted` with just an
  `order_id`. The real outcome (filled/partial/rejected) arrives later — poll `observation`
  and `trades`.
- **`504` ≠ nothing happened.** Reconcile with a read before retrying any POST. Never blind-retry.
- **Market orders are gated (Phase 7).** They reject with `no_market_price` on the real
  backend today. Default the order ticket to **limit**; keep Market **disabled behind a
  capability flag** (`capabilities.marketOrders`), and still handle the reject cleanly.
- **Position live-mark is gated (Phase 7).** `mark_available:false`, so `ltp` and
  `gross_unrealized` are `0`. Ship the positions tab **without** the live-P&L/LTP column;
  `qty` and `weighted_avg_entry` are real. Re-add the column when the flag flips.
- **Model A candles.** The candle WS stream pushes a bar only when its bucket **closes**.
  Live intra-bar movement comes from `snapshot.last_price` — extend the rightmost bar's
  tip / draw a live price line from it. Chart history loads via `GET /v1/candles`; live
  resumes over WS; on reconnect, re-fetch history then resume (no WS backfill).
- **`has_*` flags are load-bearing.** `0` is a valid price. `has_bid:false` ≠ a bid of 0.
  Gate every optional numeric on its `has_*` flag before showing it.
- **Timestamps are naive-local ISO + a `timezone` field** (e.g. `"2026-10-09T09:15:00"`,
  `"Asia/Kolkata"`). No epoch, no offset. The client never touches UTC.
- **`modify` can leave the user with no order** (`modify_status:"partial"`). Surface the
  `warning` string verbatim.
- **Tax/costs are IN-only.** `country=US` returns `501`. Handle it honestly.
- **`trades_degraded:true`** on observation → the live half is still correct; grey out the
  recent-trades strip, don't error the whole screen.

## Design rules

- **The design source of truth is the real app board `App.dc.html`** (design canvas
  artifact `E5YS6D3J2urjrieYwiqCQS`) — one board holding every screen with working
  navigation, state and the real palette. Screens are a **faithful port** of it: same
  layout, same flow, same colours — made real with the live data / mock. Do not invent
  layout or redesign. (The `Foundation.dc.html` board is a superseded amber exploration —
  ignore it.)
- **The palette is BLUE, not amber.** Night (dark): ground `#0D1117`, accent `#5AA2FF`,
  primary button `#2F6FEB`. Lab (light): ground `#F3F5F8`, accent `#1D5FD1`. All values
  live in `frontend/src/tokens/tokens.css`, transcribed from `App.dc.html`.
  **Use tokens only — never a raw hex in a component.**
- **Token names match the app board** (`accent`, `btnBg`, `buy`, `sell`, `gain`, `loss`,
  `ma`, `warnBg`…), so `App.dc.html` ports 1:1. See `tokens/tailwind.tokens.md`.
- **Dark + light mode.** Night is default; `data-theme="lab"` on `<html>` switches to light;
  OS preference falls back before any toggle.
- **Colour semantics:** Buy uses `--buy` (green), Sell and Exit use `--sell` (red);
  up/down *numbers* use `--gain`/`--loss`. Primary action buttons are coloured, not black/white.
- **Font: IBM Plex Sans only**, tabular numerals (`font-feature-settings:'tnum'`) on numeric
  text. No Condensed, no Mono, no dot-matrix.
- **Numbers are colour-blind-safe:** pair colour with ▲/▼ and +/− signs, never colour alone.
- **Serious, trustworthy tone.** Not game-like. No dot-matrix numerals, no casino styling.
- **Mobile-friendly web, responsive, laptop-first.** Not a native app.
- **Say "Simulation" once, not "synthetic" everywhere.** A persistent `[Simulation]` tag in
  the top bar; plain labels ("Trading balance", "Bank balance") elsewhere; the full
  "this is a simulation, no real money" disclaimer on signup and in the footer.
- Use the `frontend-design` skill for aesthetic judgement where the port leaves a gap.

## Workflow rules

- **One screen / one slice = one PR.** Never "build the whole app" in a task.
- **Run the mock and self-verify** the screen actually works end-to-end before opening the PR,
  not just that it compiles.
- **Cloud is stateless between tasks.** Anything decided ("we chose X") goes into this file or
  the tracker — not only the PR description — or the next cold task won't know.
- Keep `main` always-runnable. Merge only after a local test + a Desktop review.

## Where things are

| Path | What |
|---|---|
| `contract/openapi.yaml` | REST contract (broker + candle history + session/ref) — source of truth |
| `contract/ws-schemas.md` | WebSocket message shapes (connected/subscribe/ack/candle/snapshot) |
| `contract/generated/` | Committed codegen output: `go/types.gen.go` + `ts/api.d.ts` (generated), `go/ws.go` + `ts/ws.ts` (hand-authored from `ws-schemas.md`) |
| `mock/` | Go mock server (HTTP + WS), serves the contract |
| `frontend/src/tokens/` | Night + Lab design tokens (blue; from App.dc.html) |
| `docs/design/App.dc.html` | The real app board — every screen; the visual source of truth |
| `frontend/src/lib/ticks.ts` | The tick formatter — all numeric display goes through it |
| `frontend/src/lib/theme.ts` | Night/Lab theme state (`data-theme` on `<html>`, persisted) |
| `frontend/.env.example` | `VITE_API_BASE` / `VITE_WS_BASE` — the only place base URLs live |
| `Makefile` | `make generate` (regen Go+TS from the contract), `make check` (fail on drift), `make mock`, `make frontend` |
| `frontend/src/api/` | Generated TS types + the base-URL-swappable client |
| `frontend/src/features/` | One folder per screen |
| `docs/` | The broker + market-data design docs (contract sources) |
| `UI-API-Coverage-Tracker.md` | Living map of UI function → API → status |
| `DEVELOPMENT-PLAN.md` | The phased plan |

## Phase 0 decisions (made by the scaffold task — flag if wrong, don't silently redo)

Run the project: `make mock` (Go mock on :8080) + `make frontend` (Vite). Tests:
`cd frontend && npm test`, `cd mock && go test ./...`. After any `contract/openapi.yaml`
change run `make generate` and commit the result; `make check` fails if it drifts.

- **Tick formatter semantics (CONFIRM with the backend owner).** REPO-SETUP §6 said price =
  "value scaled by `tick_size`". The contract's own examples (all prices are multiples of 5;
  `tick_size` = "smallest price increment") say `tick_size` is a *grid*, not a multiplier. So:
  display = `raw / 10^price_decimals` (10050 → `100.50`); `tick_size` drives
  `isTickAligned` / `snapToTick` / `stepPrice` for the order ticket. If the real backend means
  otherwise, the fix is confined to `ticks.ts` + its tests.
- **Money decimals.** No field carries them, so money/P&L divides by `MONEY_DECIMALS = 2`
  (raw minor units), en-IN grouping, plain "units" label. One constant in `ticks.ts`.
- **Minus sign** is U+2212 (`−`), plus is `+`; zero carries no sign and is `flat`.
  Percent direction follows the *rounded* value (never "▲ 0.00%").
- **Theme.** `data-theme` is always set explicitly (`night`|`lab`) — never removed — because
  `tokens.css` falls back to the OS preference when the attribute is absent, which would
  override a user who toggled to Night. First visit: saved choice → OS preference → Night.
  An inline script in `index.html` applies it before first paint (keep in sync with `theme.ts`).
- **Tailwind v3** (not v4): `tailwind.tokens.md` is a v3 `tailwind.config.js`. `npm audit`
  flags transitive build-time deps of Tailwind 3 (braces/postcss-selector-parser); they never
  ship to the browser. Revisit when migrating to v4.
- **TypeScript is pinned to 5.9** (the Vite template ships 6.0) because `openapi-typescript`
  7.x peers on `typescript@^5`.
- **Contract refactor (no wire change).** Inline bodies were hoisted into named schemas so the
  mock and frontend share types: `MarketsResponse`, `InstrumentsResponse`, `PositionsResponse`,
  `OrdersResponse`, `JoinLiveRequest`, `StartPracticeRequest`, `ExitSessionRequest`,
  `ExitSessionResponse`, `PracticeCondition` (enum, reused by `ActiveSession.condition`).
  Never overwrite `contract/openapi.yaml` from an older copy — edit it in place, then run
  `make check` (it fails if the contract, generated files and mock disagree). A wholesale
  overwrite once dropped these schemas and would have broken the mock on the next regenerate.
- **Go layout.** `contract/generated/go` is its own module; `mock/go.mod` uses a `replace`
  directive to it. Mock-only HTTP helpers live in `mock/internal/httpx`. Codegen tools are
  pinned in the Makefile (`oapi-codegen v2.5.1`); `openapi-typescript` is a frontend devDependency.
- **Mock behaviour:** see "Phase 1b decisions" below (supersedes the Phase 0 placeholder rules).
- **`docs/` is missing from the repo.** REPO-SETUP lists it, but the folder was never added;
  the contract files are enough for Phase 0. Drop the broker + market-data design docs in
  `docs/` when available.
- **`App.tsx` is a smoke harness, not a screen.** It is replaced by the real TopBar/router in Phase 1.

## Phase 1a decisions (component kit)

All shared components live in `frontend/src/components/` (barrel: `index.ts`). `/kit` renders
every one in Night and Lab side by side with static props (no API calls). Verified in a real
browser at 1600px and 375px (no console errors, no horizontal scroll, all targets >= 44px).

- **`/kit` routing** is a pathname check in `main.tsx` (no router dependency yet). Replace it
  when the real router lands.
- **Per-subtree themes.** `tokens.css` theme selectors are no longer `:root`-only
  (`[data-theme="lab"]`, `:root, [data-theme="night"]`), so any element can pin a theme. This is
  how `/kit` shows both at once (`color-scheme` is set inside the same theme blocks).
- **Blue token names everywhere.** Components use only the board's names (`bg-bg`, `panel`,
  `raised`, `line`, `ink`, `muted`, `accent`, `soft`, `btnBg`/`btnFg`, `gain`/`loss`,
  `gainBg`/`lossBg`, `buy`/`onBuy`, `sell`/`onSell`, `warnBg`/`warnLine`, `ma`, `focus`) plus
  `shadow-card` and `var(--scrim)`. Old amber-era names (`surface`, `signal`, `*-soft`, `*-ink`,
  `warn`, `neutral`) must not come back. Up/down *numbers and status* use `gain`/`loss`;
  Buy/Sell *action buttons* use `buy`/`sell`; Exit is outlined `loss` (as on the board);
  the primary button is `btnBg`/`btnFg`; selected chips are `soft` fill + `accent` border.
- **Numerals:** IBM Plex Sans only. Use the `tnum` utility (`font-feature-settings:'tnum'`,
  in `index.css`) on numeric text. No `font-mono` / Condensed anywhere.
- **`Num` is the only thing that shows a number.** Kinds: `price`, `price-change`, `money`,
  `signed-money`, `percent`, `qty`. `available={false}` renders "—" (use it for every `has_*` /
  `mark_available` gate). Signed kinds always show ▲/▼/• plus +/−, and a screen-reader word.
- **Capability-gated controls stay focusable.** `Button capability={{enabled,reason}}` uses
  `aria-disabled` (not `disabled`) so keyboard users can reach the reason tooltip. The
  Market order-type radio is natively disabled with the reason printed beneath it.
- **Exit is outlined red; Sell is filled red.** Both are red, but Exit must not read as a
  second Sell. The Session bar's Exit always goes through `ConfirmDialog`.
- **`ConfirmDialog`** uses the native `<dialog>` (focus trap, Esc). Its auto margins are
  `!important` because an ancestor `space-y-*` rule otherwise overrides them and the dialog
  sticks to the top. Focus starts on Cancel.
- **`OrderTicket`** defaults to Limit, emits an `OrderDraft` (maps onto `PlaceOrderRequest`
  minus `account_id`) and never claims success: feedback `accepted` says "accepted is not
  filled". Validation (lot size, tick grid, no silent rounding) is pure and unit-tested in
  `lib/orderTicket.ts`. Est. cost = qty x limit price in raw units. An estimate above buying
  power warns but does not block; the exchange is the authority.
- **Component tests:** the vitest env is `node` (no DOM), so only pure logic is unit-tested;
  components are verified in the browser via `/kit`. Add jsdom + Testing Library if/when needed.

## Phase 1b decisions (mock skeleton)

`make mock` serves every contract endpoint (all 19 REST routes + `/ws`) with valid,
correctly-shaped data. No market realism. `go test ./...` in `mock/` decodes every response
into the generated structs with unknown fields rejected, so the mock can't drift from the contract.

- **Only mutable state: which session an account is in** (`internal/store`). Everything else
  is static placeholder data (`internal/catalog` = reference data, shared by all routes).
- **Reference data:** one market, `IN` (Asia/Kolkata, 09:15–15:30), two invented instruments:
  `ACME` (tick 5, lot 1, 2 decimals, ref 10090) and `BETA` (tick 5, lot 10, 2 decimals, ref 4995).
- **Session gate.** `GET /v1/session` is `{active:null}` until the account joins/starts.
  A second join/start is `409 {reason:"already_in_session"}` until `POST /v1/session/exit`
  (idempotent). Practice has no min-balance check yet.
- **No session -> 409.** Live reads (`/balance /positions /orders /observation`) answer
  `409 {"error":…}` (error envelope); order POSTs answer `409 {"reason":"no_session"}`
  (reason envelope); a modify answers `409` with a `ModifyResponse` (`rejected`).
  Durable reads (`/trades /pnl /costs* /candles`) are 200 incl. empty and never need a session.
- **Order checks run in contract order:** 400 malformed (error envelope) -> 409 no session ->
  422 business reject (reason envelope: `unknown_instrument, bad_side, bad_qty, no_market_price,
  bad_type, bad_price, insufficient_funds`). Market orders always reject `no_market_price`
  (matches the real backend today). A valid limit order is `202 {order_id:"<acct>:<seq>"}`,
  but nothing is simulated: it never shows up in `/account/orders` or fills. (Superseded by
  "Phase 3b decisions": orders are now simulated by an in-memory ledger.)
- **Positions:** `mark_available:false`, `ltp:0`, `gross_unrealized:0`. `costs*` with
  `country=US` -> `501`; a non-`IN`/`US` country -> `400`.
- **`/v1/candles`:** deterministic series on the tick grid (not a market model), real cursor
  paging (`limit` default 100, clamped to 500; `next_cursor` null on the last page), 400 for
  bad market/instrument/timeframe/time/cursor, `[]` when from == to.
- **`/ws`** (acks as below; STATIC seeds and no pushes were Phase 1b — now superseded by "Phase 3a decisions"): sends `connected`; `subscribe`/`unsubscribe` get one `ack` with a result per sub
  (`unknown instrument`, `bad timeframe`, `bad stream`); each accepted *snapshot* subscribe is
  followed by a STATIC seed snapshot (open phase, one-tick spread, 5 levels per side). No
  candle pushes and no moving price yet (Model A realism comes later). Junk or unknown frames
  are ignored (the contract has no error frame).

## Phase 2 decisions (Record screen)

`/record` (pathname switch in `src/Routes.tsx`) is the first real-data screen: closed trades,
P&L summary, tax/cost breakdown. Code in `frontend/src/features/record/`; reads in
`frontend/src/api/account.ts` (TanStack Query). Verified in a real browser against the mock.

- **Board vs contract.** The board's Record is a flat list of fills with a date filter. The
  contract serves closed round trips (`/trades`: long/short, entry/exit, gross/costs/net, pct),
  keyset-paged, with no date params. So the table is one row per closed trade
  (Date, Time, Symbol, Side, Qty, Entry, Exit, Net P&L, Return); the layout, tabs, filter card,
  summary line and empty/pending cards follow the board. There is no "Tax to pay" line (not in
  the contract) — Gross P&L, each cost line, Total costs and Net result instead.
- **Date range = cursor + client bound.** `To` becomes the starting `before` cursor (start of
  the next market day); `From` is a client-side lower bound: older rows are dropped and
  "Load older trades" disappears once the walk crosses it. "Days" are the MARKET's calendar days
  (IANA tz from `/v1/markets`, DST-safe — `range.ts`). Broker-axis times are RFC3339 instants,
  so the client converts them for display in the market tz (the "never touch UTC" rule is
  about the naive-local market/session timestamps).
- **Aggregates are all-time, lists follow the dates.** `/pnl` and `/costs/summary` take no
  range, so the P&L card and tax summary are labelled "All time"; only the trades and per-trade
  costs lists follow the From/To filter. Don't present a range-filtered total from partial pages.
- **Paging:** page size 20 (`PAGE_SIZE`), "Load older trades" until `next_before` is `null`.
  The Tax tab fetches `/costs` and `/trades` in step (same cursor) so cost rows (which carry
  only a `trade_id`) can show date + symbol.
- **Country = market code** (`IN`/`US`). `US` -> `501` is shown honestly ("only implemented for
  India for now"); a 501 is never retried. Costs queries are lazy (Tax tab only).
- **`exit_reason`** is a free string: `manual` shows nothing, anything containing "auto" shows
  the board's `auto` tag, other values show as written. Cost-line names are labelled via
  `labels.ts` (unknown names still render, humanised).
- **Account id.** No auth contract: `lib/account.ts` reads `VITE_ACCOUNT_ID` (default
  `demo-account`). It is the only place that does; replace it when sign-in exists.
- **Visually-hidden text inside a scroll container needs `position: relative`.** `sr-only` is
  absolutely positioned and escapes `overflow-x: auto`, which made the whole page scroll
  sideways on phones. Scroll wrappers around tables are `relative overflow-x-auto`.
- **Mock history (contract-consistent).** `/trades`, `/pnl`, `/costs`, `/costs/summary` and
  `observation.recent_trades` all derive from one deterministic 27-trade history (3 a day over
  ~9 days, newest first, unique exit times) with real keyset paging. It includes wins, losses,
  an auto-square-off fee trade and one true breakeven (net 0, no cost lines). Mock tests assert
  pages, per-trade costs, the cost summary and the P&L summary all agree. Still no simulation.
- Added `SegmentedToggle` (the board's `.seg` pill switch) to the kit.

## Phase 3a decisions (Terminal, market-data half)

`/terminal` (lazy-loaded in `src/Routes.tsx`): instrument list with live last/change, inline
depth, and a KLineCharts price chart. Code in `frontend/src/features/terminal/`; socket in
`lib/ws.ts`, state in `lib/marketStore.ts` (Zustand). Not here yet: order ticket, positions/
orders/trades/P&L tabs (3b) and the session bar's states (3c).

- **Transport.** One ref-counted WebSocket (`MarketSocket`): subscriptions are batched after the
  `connected` frame, shared between components, and the socket closes ~1s after the last
  release (so React remounts don't churn it). It reconnects with backoff (0.5s -> 5s).
  **Reconnect = rehydrate**: every `connected` frame re-subscribes everything wanted and bumps
  `epoch`; the chart's history query key includes `epoch`, so a reconnect re-fetches
  `/v1/candles` (the server does no WS backfill). Frames are parsed defensively; stale sockets
  are ignored.
- **Model A in the chart.** History = `GET /v1/candles` (finalized bars only), paged by
  `next_cursor`. A `candle` frame replaces the tip with the real bar (`mergeFinal`: newer
  appends, same bucket replaces, older is ignored). Between closes the rightmost bar's tip is
  built from `snapshot.last_price` (`advanceLive`): its bucket starts at the last finalized
  bar's `end` (or today's open from `/v1/markets` when nothing has closed), opens at the
  previous close, and tracks high/low/close. Today's open is refreshed whenever the phase changes.
- **Timestamps on the chart.** The chart needs a number, so a naive-local timestamp becomes a
  wall-clock *ordinal* (`lib/naive.ts`: fields read as if UTC) and the chart is set to
  timezone `UTC`, which prints the original wall-clock. It is never compared to the real clock.
- **Prices in the chart stay raw int64** (precision 0). Every price label — axis, crosshair,
  last-price mark — goes through the tick formatter via the library's `thousandsSeparator`
  hook; the library's own OHLC tooltip is off (the board has its own legend line). Colours are
  read from the design tokens at runtime (`chartTheme.ts`) and re-read when the theme flips.
- **Timeframes are the contract's** `1m/5m/30m/60m` (the board's 15m/1h/1D don't exist in the
  contract). History lookback: 1m 1 session, 5m 3, 30m 10, 60m 20.
- **Drawing tools** (cursor, trend line, horizontal line, rectangle, undo/redo, clear) use the
  library's overlays (rectangle is a registered custom overlay). Drawings are dropped when the
  instrument or timeframe changes, as on the board.
- **Market tab columns.** Board columns High/Low/Volume/Held are not in the contract (snapshot
  carries last, change_pct, quote, depth) so they are omitted; Held returns with positions in 3b.
  `change_pct` is shown as a percent only (no absolute change).
- **has_* gating everywhere.** Last/change need `has_last`; the depth panel needs `has_bid` /
  `has_ask`; spread needs both. With no book (pre-open, closed) it says so and shows "—".
- **Mock market (`mock/internal/market`).** A pure function of (instrument, simulated time), so
  REST history, bars pushed over `/ws` and snapshots can never disagree (tested: a pushed bar
  equals the same bar from `/v1/candles`).
  - *Session clock:* one market day (09:00 preopen, 09:15 open, 15:15 closing, 15:30 closed)
    plays in 6.5 real minutes (`MOCK_SPEED`, default 60 simulated seconds per real second),
    holds `closed` for `MOCK_CLOSED_HOLD` (default 30s), then the next day starts. A restart
    resets the clock. `/v1/markets` and live sessions report the clock's phase and day.
  - *Prices:* a trend + swing + jitter on the tick grid, stepped every 30 simulated seconds
    (0.5 real seconds at default speed = the snapshot cadence).
  - *Book:* 10 levels a side, contiguous ticks, quantities (multiples of the lot) re-rolled
    every step so the ladder moves; spread 1-2 ticks. No bid/ask/depth in preopen or closed
    (`has_*` false) but a last price (previous close / final price).
  - *Candles:* buckets align to the open; the last of a day is truncated at the close (60m:
    ... 14:15-15:15, 15:15-15:30). History returns only bars whose bucket has closed. Over `/ws` a
    `candle` frame is pushed exactly when a bucket closes; snapshots are pushed each step when
    they changed.
- **Full-width Terminal (deliberate deviation from the board).** The board caps every page at
  `max-width:1240px`; the Terminal does not: shell, tabs and content span the viewport with
  16/24/32px gutters (`px-4 sm:px-6 lg:px-8`). At `lg`+ the chart sits beside a live order-book
  column (21rem, 24rem at `2xl`; the 3b order ticket is NOT in it — it is the board's drawer, see
  "Phase 3b decisions") and grows with the
  viewport height; below `lg` the book stacks under the chart. Record still uses the board's
  1240px cap.
- **Chart UI is a PLACEHOLDER.** The chart header, left drawing-tools toolbar and layout in
  `ChartTab.tsx` / `PriceChart.tsx` are ported from the board only so the data path works. The
  owner has a different chart design in mind and it **will change quite a lot**. KLineCharts stays
  the library. Don't polish or extend the current chart UI (tools, header controls, layout);
  the data layer underneath (WS/history/Model A merge, tick-formatter hooks, token theming) is the
  part to keep.
- **Gotchas found:** `pkill -f` patterns match the shell that contains them (use a separate
  call); a KLineCharts overlay needs a hover before the click (programmatic clicks without a
  prior mouse move do nothing); Vite's HMR socket also sends `{"type":"connected"}`.

## Phase 3b decisions (Terminal, account/order half)

Tabs Orders / Positions / Trades / P&L, the account strip and the order window on `/terminal`.
Account state is ONE poll of `GET /v1/account/observation` (`api/orders.ts`, `useObservation`,
every `OBSERVATION_POLL_MS` = 1s, TanStack Query) — never `/balance` + `/positions` + `/orders`
separately. Market data stays on the WebSocket. Verified in a real browser against the mock.

- **Order window = the board's right-hand drawer**, not a card in the chart's order-book column
  (the board is the source of truth). Native `<dialog>`, opened by the strip's Buy / Sell buttons
  or the Market tab row's Buy / Sell; reuses the kit `OrderTicket` (new props `initialSide`,
  `blocked`; `TicketFeedback.title`). It stays open after placing so the order can be watched.
- **Following one order** (`lib/orderFlow.ts`, pure, tested): `202` -> "accepted" -> the poll shows
  working -> partially filled -> filled. "Filled" is only claimed when the position moved the way
  the order would move it; an order that left the book with no such move is "No longer on the
  book" (cancelled or refused) — never guessed as a fill. A fresh read is taken before placing
  (exact starting position) and right after the `202` (so the first thing shown is "working").
- **504 / 5xx / no response = UNKNOWN** (`isUnknownOutcome`). `useOrderEntry` never resubmits:
  the ticket stays blocked until a read newer than the failure arrives, then says whether a
  matching new order is on the book ("the reply timed out, but it did reach the exchange") or not
  ("not confirmed — check Orders/Positions/Trades before placing it again"). Cancel/modify use the
  same rule (re-read, tell the user, no retry). `422` / `409` reasons are mapped in `reasonText`
  (`no_market_price` -> "Market orders are not available yet. Use a limit order.").
- **Market is gated** by `lib/capabilities.ts` (`marketOrders: false`) -> `marketOrdersCapability`
  (disabled radio, reason printed + tooltip). `positionMarks: false`: no Last / LTP / unrealised
  P&L column on Positions; the P&L tab shows Unrealised as "—" with the reason.
- **Cancel** is accepted (`202`), then the row shows "Cancelling…" (`cancel_in_flight`) until the
  poll sees it leave. **Modify** is cancel+replace: `ok` -> "Order replaced", `partial` -> the
  `warning` verbatim (you may have NO order), `409 rejected` -> nothing changed. "Cancel all" is N
  cancels. There is no "Exit position" button (it needs a price; market orders are gated).
- **Board vs contract (Orders/Trades/P&L).** `OpenOrder` has no timestamp and no completed-orders
  list, so the Orders tab has no Time column and no "Completed orders" table. `recent_trades` are
  closed round trips (Long/Short, entry/exit, net), not fills, and the contract has no session
  start, so "Trades" is "Latest closed trades" and the strip/P&L realised figure is "latest N
  trades" (up to 20), not a true session total. A buy that only opens a position creates no trade.
- **`trades_degraded: true`** -> the Trades tab is greyed with a banner and a "!" on the tab, the
  realised figures show "—"; balance/positions/orders stay live. A `409` on the poll = no live
  session -> ordering disabled (the way in is the 3c enter-session panel, see "Phase 3c decisions").
- **Mock ledger** (`mock/internal/broker/ledger.go`, in-memory per account, lazy time — no
  goroutines; `broker.Config` injects the clock and delays in tests). Seeded: 95,000.00 units
  available, 250,000.00 bank, ACME 10 @ 100.50. A limit order rests as `working` and reserves cash
  (buy) or units (sell); after 1s an order bigger than one lot is HALF filled (`partially_filled`),
  after 2.5s the rest fills and it leaves the book; every fill is at the limit price (it is not
  matched against the market). Position qty and weighted avg (rounded to nearest) and balance
  (`settled` = available + reserved) follow. Selling closes a long round trip -> a `Trade`
  (`s-0001`…, entry = avg, costs from the IN rules, `manual`) that shows in `recent_trades`,
  `/trades`, `/pnl` and `/costs*` (all agree). Cancel sets `cancel_in_flight` for 0.8s then
  releases the reserve; modify is cancel-now + replace (`partial` + warning when the replacement is
  refused). New 422s: qty not a lot multiple -> `bad_qty`, price off the tick grid -> `bad_price`,
  selling more than held (no shorting) -> `insufficient_funds` (the contract has no other tag).
  `not_cancellable` = a cancel is already in flight.
- **Gotchas found:** the `dialog` backdrop uses `backdrop:bg-[var(--scrim)]`; Playwright's
  `getByText('Filled')` also matches "Accepted is not filled" (match the `· Filled` title);
  `getByLabel('Limit price')` also matches the ± buttons' aria-labels (use the textbox role).

## Phase 3c decisions (Terminal, session bar + join/exit)

The session is real: `GET /v1/session` (`api/session.ts`, `useSession`, polled every
`SESSION_POLL_MS` = 1s) says `active: null | {type, market, phase, closes_at, now, condition}`;
everything account-side is enabled only inside one (`useObservation(account, !!active)`; leaving
removes the cached observation so a stale account never shows). Code: `features/terminal/`
`useSessionFlow.ts` (join / start / exit), `EnterSession.tsx`, kit `SessionBar`; pure helpers and
copy in `lib/session.ts` (tested).

- **The UI runs the market clock itself** (`lib/marketClock.ts`, owner's rule). The backend gives
  the market's timezone (`/v1/markets`) and open/close times (naive-local `closes_at`); the UI ticks
  every second from the browser's real time rendered in the market's IANA zone ("Market time"),
  and "Time left" = `closes_at − that` (two naive timestamps). There is NO `now` in the contract
  (an optional one was added and removed in 3c). This is display-only: it is never compared with
  chart bars or order data, and the PHASE still comes from the backend (`snapshot.phase`), never
  from this clock. It is the one place the client reads the real clock (rendered via Intl, not
  UTC maths). If the local clock is past the close while the backend says trading, "Time left" is
  hidden and "Closes HH:MM" shown. **Mock caveat:** the mock's live day is simulated (60x), so the
  live "time left" does not match its phase (it usually falls back to "Closes 15:30"); practice
  `closes_at` is real-time, so its countdown is right.
- **Session bar** (above the tabs, as on the board): Live (solid) / Practice (dashed, "not
  recorded") marker, market, phase (○ Pre-open ● Open ◆ Closing ■ Closed — glyph + word), market
  time, time left, "P&L · latest trades", open positions, a switch button, and Exit (outlined
  red, always visible). The tab row's old phase chip is gone; its connection dot now reads
  "Prices live" so it is not confused with the Live session.
- **Phase source.** Live: `snapshot.phase` over the WebSocket, falling back to the session then
  `/v1/markets`. Practice: the session's own phase (it has its own clock).
- **Closing / closed.** `closing` -> "Closing soon… closes in H:MM:SS" strip. `closed` -> "Market
  closed" strip, "Time left" 0:00:00, the strip's Buy/Sell and the Market tab's Buy/Sell are
  disabled, and an open order window shows the reason and disables its CTA (`orderBlockReason`).
  Pre-open still allows orders. The contract has no separate "halt" phase, so none is shown.
- **Not in a session** -> the enter panel (also on the account tabs): "Join live session" and
  "Start practice" (scenario + length, defaults `normal_day` / 90 min; the six contract
  conditions, lengths 60/75/90/105). Market data stays live underneath.
- **Exit** always confirms. Live: "open positions are closed automatically at the market close
  (HH:MM); you can rejoin until then". Practice: "ends for good, cannot rejoin, nothing recorded".
- **One-session rule.** Entering while in a session — known from the poll, or learned from a
  `409 already_in_session` (another tab/device) — never fails silently and never switches
  silently: it asks "Leave X to join/start Y?", then exits, then enters. If the exit works but
  the entry fails the notice says exactly that. The bar's switch button ("Start practice" / "Join
  live") goes through the same prompt.
- **No answer = unknown** (`isNoAnswer`: no response, 504, other 5xx except 503). A join/start/
  exit that gets none is never retried: the UI re-reads `GET /v1/session` and says what is
  true. 503 ("service unavailable") is a definite refusal and shown as an error.
- **Gotchas found:** Playwright intercepting `GET /v1/session` also intercepts the app's own
  re-read after a 409 (flip the stub off once the POST has been sent); a naive "same day" guard on
  time-left broke practice sessions that end after midnight (the two naive timestamps subtract
  fine across days).

## Phase 4a decisions (Home)

`/` is Home (`features/home/`; the Phase 0 smoke `App.tsx` is gone). The board's layout: the live
card + practice card on the left, Balances on the right, strips on top; 1240px cap like Record.
The top bar's Home / Terminal / Record account-menu items link the three screens (no router yet).

- **Selected market** = the top bar's dropdown, remembered in `localStorage` (`lib/selectedMarket.ts`;
  default the first listed market). Home reads it; switching changes ONLY the live card and the
  practice label. Balances are global. (The Terminal's socket is bound to one market by the backend,
  so it still takes the first listed market.)
- **Live card** (`lib/liveCard.ts`, pure, tested): hours, status pill and a countdown. **The UI decides
  open/closed itself** (owner's rule): `GET /v1/markets` `live_session` supplies only `opens_at` /
  `closes_at` (polled 5s) and the UI's own market clock (`useMarketClock`) supplies "now"; before the
  open -> "Opens in H:MM:SS" (Join disabled, "You can join from 09:15"), between -> "Open now / Closes
  in …" (Join enabled), after the close -> "Ended / Next session opens at 09:15" (Join disabled). The
  backend's `live_session.phase` is only a fallback until the clock is known. In the live session:
  "You're in this session" + Return to session. **Mock consequence:** the mock reports the real
  09:15-15:30 hours, so outside those hours (in the market's timezone) Home correctly shows "Ended" and
  Join is disabled; the Terminal's enter panel can still join (it is not gated on the clock). The
  Terminal's market state still follows `snapshot.phase` (the 3c spec), not the clock.
- **Join live** -> `useSessionFlow.enter` (moved to `features/session/`) -> on success route to
  `/terminal`. **Start practice** = the same entry with defaults (`normal_day`, 90 min) until the 4b
  setup screen. The one-session rule is the 3c flow: in a session -> "Leave X to join Y?" confirm ->
  exit -> enter; a `409 already_in_session` from another tab asks the same.
- **Balances need a session (CONTRACT GAP — raise with the backend owner).** `balance`/`observation`
  answer 409 outside a session, so Home can show Trading/Bank balance only while in one (from
  `observation`); outside one it shows "—" and says why. After a Transfer the response (`available`,
  `bank`) is shown, labelled "As of your last transfer". Proposal: let a balance read work without a
  session, or add a session-less balance field.
- **Transfer** (`TransferDialog`, `lib/transfer.ts`): to_trading / to_bank, amount in units parsed to
  raw (2 decimals, no rounding), source-balance check only when that balance is known. 422 = plain
  failure (error shown, "Try again"). **504 / no response = UNKNOWN**: no retry is offered; the
  dialog says to check balances and the observation is refreshed. Success updates the cached
  observation balance and shows a banner. Mock: transfers now move the account ledger (so
  observation follows) and work without a session.
- **Low balance.** There is no way to know the practice minimum client-side, so it is learned from
  the contract's `409` on practice start ("below minimum balance"; the contract gives no reason tag —
  the mock uses `below_minimum_balance`, minimum 1,000.00 units). Home shows a warning strip with a
  Transfer link and "Paused until your trading balance is above the minimum"; live is unaffected.
- **Not built (no contract):** the first-visit "Your accounts are open" strip (needs account
  creation) and the "Next top-up in N min" copy (needs a refill mechanic). Loading = skeleton cards;
  load failures = error banners with Retry.
- **Gotchas found:** Playwright can't `.check()` the kit's sr-only radios (click the label text);
  `getByLabel('Market')` matches only the top-bar select.

## Still-open product decisions (don't block; flag if you hit them)

- `exchange_id` handshake: leaning **account-only** (UI sends `account_id`; backend binds).
- Practice condition enum strings: `normal_day, calm_range, trending_day, whipsaw,
  unstable_day, thin_liquidity` (confirm).
- Auth + account-creation + refill-mechanic: no contract yet — mock ad-hoc, keep isolated.

## Git rules

- Do NOT add `Co-Authored-By: Claude` or `Generated with Claude Code` trailers to commits
  or PR descriptions.
- Commit under the repo's configured git user (the owner), not a bot identity.
- Use the branch name given in the task prompt. Never auto-generate a branch name.
- Before pushing any task: run the dev server / mock and confirm it starts clean (no
  console or PostCSS errors) — don't hand back work that doesn't run.
- Tailwind is pinned to v3. Do not upgrade it or switch the PostCSS config to v4.
