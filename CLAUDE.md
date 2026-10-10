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
  but nothing is simulated: it never shows up in `/account/orders` or fills.
- **Positions:** `mark_available:false`, `ltp:0`, `gross_unrealized:0`. `costs*` with
  `country=US` -> `501`; a non-`IN`/`US` country -> `400`.
- **`/v1/candles`:** deterministic series on the tick grid (not a market model), real cursor
  paging (`limit` default 100, clamped to 500; `next_cursor` null on the last page), 400 for
  bad market/instrument/timeframe/time/cursor, `[]` when from == to.
- **`/ws`:** sends `connected`; `subscribe`/`unsubscribe` get one `ack` with a result per sub
  (`unknown instrument`, `bad timeframe`, `bad stream`); each accepted *snapshot* subscribe is
  followed by a STATIC seed snapshot (open phase, one-tick spread, 5 levels per side). No
  candle pushes and no moving price yet (Model A realism comes later). Junk or unknown frames
  are ignored (the contract has no error frame).

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
