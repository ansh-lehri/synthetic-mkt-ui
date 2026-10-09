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

- **Mobile-friendly web, responsive, laptop-first.** Not a native app.
- **Dark + light mode.** Two palettes: **Night** (dark) and **Lab** (light). Both are in
  `frontend/src/tokens/`. **Use tokens only — never a raw hex value in a component.**
- **Colour semantics:** Buy = green, Sell = red, Exit = red. Primary buttons are coloured,
  not black/white.
- **Numbers are colour-blind-safe:** pair colour with ▲/▼ and +/− signs, never colour alone.
- **Serious, trustworthy tone.** Not game-like. No dot-matrix numerals, no amber/brown
  casino look beyond the single accent token.
- **Say "Simulation" once, not "synthetic" everywhere.** A persistent `[Simulation]` tag in
  the top bar; plain labels ("Trading balance", "Bank balance") elsewhere; the full
  "this is a simulation, no real money" disclaimer on signup and in the footer.
- When building or reshaping a screen, read the matching board on the design canvas (the
  visual source of truth) and port it — don't invent layout. Use the `frontend-design`
  skill for aesthetic judgement.

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
| `contract/generated/` | Committed codegen output (Go structs + TS types) |
| `mock/` | Go mock server (HTTP + WS), serves the contract |
| `frontend/src/tokens/` | Night + Lab design tokens |
| `frontend/src/lib/ticks.ts` | The tick formatter — all numeric display goes through it |
| `frontend/src/api/` | Generated TS types + the base-URL-swappable client |
| `frontend/src/features/` | One folder per screen |
| `docs/` | The broker + market-data design docs (contract sources) |
| `UI-API-Coverage-Tracker.md` | Living map of UI function → API → status |
| `DEVELOPMENT-PLAN.md` | The phased plan |

## Still-open product decisions (don't block; flag if you hit them)

- `exchange_id` handshake: leaning **account-only** (UI sends `account_id`; backend binds).
- Practice condition enum strings: `normal_day, calm_range, trending_day, whipsaw,
  unstable_day, thin_liquidity` (confirm).
- Auth + account-creation + refill-mechanic: no contract yet — mock ad-hoc, keep isolated.
