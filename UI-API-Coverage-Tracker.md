# UI ↔ API Coverage Tracker — Synthetic Market Simulator

**Purpose:** the living map of every UI function, the data/API behind it, whether a contract exists, and the order to build in. Update as contracts land.

**Last updated:** 2026-10-09 (Phase 0 scaffold landed — see §8)

---

## 0. Contracts in hand

| Contract | Surface | Transport | Status |
|---|---|---|---|
| `BROKER_HTTP_API.md` | Orders, money, account reads, trade/P&L/tax history | HTTP (request/response + polling) | **Locked, shipping** |
| `BROKER_MARKETDATA_*` (5 docs) | Candle history, live price/quote/depth | HTTP `GET /candles` + WebSocket `GET /ws` | **Design-complete** (wire contract fully specified) |
| Session/Reference (this doc, §4) | Markets, instruments, session state + actions | HTTP | **Provisional-locked** — ~90% stable, shapes may still shift |

Three axes total:
- **Account/order axis** — `account_id`-keyed, moves money (broker HTTP).
- **Market-data axis** — public, instrument-keyed, no account (candles + WS).
- **Session/reference axis** — markets, instruments, join/exit (provisional).

---

## 1. Master table — UI function → data need → status

| # | Screen | UI function | API / data | Contract | Status |
|---|--------|-------------|-----------|----------|--------|
| 1 | Landing | Early-access signup | Waitlist store | None — static for demo | ⬜ |
| 2 | Auth | Sign in / identity | Auth; issue `account_id` | None (broker is no-auth) | ⬜ |
| 3 | Home | Open accounts on first visit | Account-creation endpoint | None | ⬜ |
| 4 | Home | Market dropdown | `GET /v1/markets` | Session/ref §4 | 🟢 prov |
| 5 | Home | Trading + bank balance | `GET /account/observation` | Broker | ✅ |
| 6 | Home | Live session card — schedule, countdown, state | `GET /v1/markets` (live_session) | Session/ref §4 | 🟢 prov |
| 7 | Home | Join live / start practice + one-session gate | `GET /v1/session`, `POST /session/*` | Session/ref §4 | 🟢 prov |
| 8 | Home | Low-balance refill timer | Refill mechanic | None | ⬜ |
| 9 | Home | Transfer money (bank ↔ trading) | `POST /account/transfer` | Broker | ✅ |
| 10 | Practice setup | Condition + length → start | `POST /session/practice/start` | Session/ref §4 | 🟢 prov |
| 11 | Terminal | Instrument list / watchlist | `GET /v1/instruments` | Session/ref §4 | 🟢 prov |
| 12 | Terminal | Price chart (timeframes) | `GET /candles` + WS `candle` | Market-data | ✅ |
| 13 | Terminal | Order book / depth | WS `snapshot` (depth) | Market-data | ✅ |
| 14 | Terminal | Live price / tape | WS `snapshot` (last_price, change_pct) | Market-data | ✅ |
| 15 | Terminal | Tick/price formatting | `GET /v1/instruments` (tick_size, decimals) | Session/ref §4 | 🟢 prov |
| 16 | Terminal | Place order (limit) | `POST /v1/orders` | Broker | ✅ |
| 17 | Terminal | Place order (market) | `POST /v1/orders` | Broker — blocked till Phase 7 | 🟡 |
| 18 | Terminal | Cancel order | `POST /orders/cancel` | Broker | ✅ |
| 19 | Terminal | Modify order | `POST /orders/modify` | Broker | ✅ |
| 20 | Terminal | Positions tab | `GET /observation` → positions | Broker | ✅ |
| 21 | Terminal | Position live P&L / LTP column | `GET /observation` (marks) | Broker — blank till Phase 7 | 🟡 |
| 22 | Terminal | Open orders tab | `GET /observation` → orders | Broker | ✅ |
| 23 | Terminal | Trades (this session) tab | `GET /observation` → recent_trades | Broker | ✅ |
| 24 | Terminal | Session P&L / balance strip | `GET /observation` → balance | Broker | ✅ |
| 25 | Terminal | Session bar — clock, market state, exit | WS `snapshot.phase` + `GET /v1/session` + `POST /session/exit` | Market-data + Session/ref | 🟢 prov |
| 26 | Record | Closed trades (paginated) | `GET /account/trades` | Broker | ✅ |
| 27 | Record | P&L summary | `GET /account/pnl` | Broker | ✅ |
| 28 | Record | Tax / cost per trade + summary | `GET /account/costs`, `/costs/summary` | Broker — IN only | 🟡 |

**Legend:** ✅ real contract, build now · 🟢 prov = provisional-locked (build now, shape may shift ~10%) · 🟡 contract real but one path/field gated · ⬜ no contract, mock with invented shape

**Tally:** 14 ✅ · 8 🟢 · 3 🟡 · 4 ⬜ (one — #15 — is the formatting field, folded into instruments)

---

## 2. What's buildable now vs still invented

**Fully contract-backed (real or provisional) — the whole Terminal + Record + most of Home:**
- Every visual market-data function (chart, depth, live price) — market-data docs.
- Every account/order function (place-limit, cancel, modify, positions, orders, trades, balance, P&L, tax) — broker.
- Markets, instruments, session state/actions — session/ref (provisional).

**Still invented-shape (ad-hoc mock, no contract):**
- Landing waitlist (#1)
- Auth / identity (#2)
- Account-open on first visit (#3)
- Refill mechanic (#8)

So the **Terminal is now buildable end-to-end** — nothing on it is invented except nothing: chart/depth/price (market-data), orders/positions/P&L (broker), instruments + session bar (session/ref provisional). The invented-shape work is confined to onboarding edges.

---

## 3. Gaps the contracts force on the UI (settled facts)

1. **Money / prices are bare `int64`.** No currency field anywhere. UI divides by `tick_size` / applies `price_decimals` (from `/v1/instruments`) and its own label.
2. **Two transports in the Terminal.** Market data is **push (WebSocket)**; account/order state is **pull (HTTP polling `/observation`)**. The data layer must run both at once — chart/depth/price off WS, positions/orders/P&L off a poll loop.
3. **Orders are async — `202` ≠ done.** No order stream. See fills by polling `/observation` and `/trades`.
4. **Market orders blocked till Phase 7** (`no_market_price`). Default ticket to **limit**; keep Market disabled behind a capability flag; still handle the reject cleanly.
5. **Position marks blank till Phase 7** (`mark_available:false`). Ship positions without the live-P&L / LTP column; qty + avg entry are real.
6. **Model A candles.** Candle stream emits only on **bucket close**; live intra-bar movement comes from `snapshot.last_price` (UI extends the rightmost bar's tip). Mock must mimic this or the chart won't behave like production.
7. **Naive-local timestamps + timezone field.** No epoch, no offset. Client never touches UTC.
8. **`has_*` flags are load-bearing** — `0` is a valid price; `has_bid:false ≠ bid of 0`.
9. **`modify` can leave you with no order** (`partial`) — surface the warning verbatim.
10. **`504` ≠ nothing happened** — reconcile with a read before retrying a POST.
11. **Tax is IN-only** (`US → 501`).
12. **Candle history vs live are separate** — chart loads past bars via `GET /candles`, then resumes live over WS (no WS backfill; on reconnect, re-fetch history then resume).

---

## 4. Session / reference surface — PROVISIONAL-LOCKED

Not yet a backend doc, but shapes are fixed enough to build and mock against. ~90% stable; may shift. House conventions: integer ticks, bare numbers, no unit field, naive-local ISO + timezone, snake_case enums, durable-read status family (200 / 400 / 503; no 404/409/504 on reads).

### Catalog (read-only, public, cacheable)

**`GET /v1/markets`** — top-bar dropdown + Home live-session card
```json
{ "markets": [
  { "code": "IN", "name": "India", "timezone": "Asia/Kolkata",
    "live_session": { "phase": "open",
                      "opens_at": "2026-10-09T20:00:00",
                      "closes_at": "2026-10-09T21:30:00" } }
]}
```

**`GET /v1/instruments?market=IN`** — watchlist + the tick/price formatting contract
```json
{ "market": "IN", "instruments": [
  { "instrument": "ACME", "name": "Acme Industries",
    "tick_size": 5, "lot_size": 1, "price_decimals": 2 }
]}
```

**`GET /v1/session?account_id=…`** — "what am I in right now?" (one-session gate + return-to-session strip)
```json
{ "active": { "type": "live", "market": "IN", "exchange_id": "…",
              "phase": "open", "closes_at": "2026-10-09T21:30:00" } }
```
or `{ "active": null }`.

### Session actions (stateful — enforce one-session rule server-side)

- `POST /v1/session/live/join` — `{account_id, market}` → session binding
- `POST /v1/session/practice/start` — `{account_id, market, condition, length_minutes}`
- `POST /v1/session/exit` — `{account_id}`

### Two product decisions still open on this surface (don't block catalog build)

1. **`exchange_id` handshake** — does the UI ever see/pass `exchange_id`, or is it `account_id`-only like the broker (backend resolves)? The broker's account-only pattern suggests the UI stays dumb. **Leaning: UI sends `account_id` only; backend binds.**
2. **Condition enum vocabulary** — the practice conditions (normal_day, calm_range, trending_day, whipsaw, unstable_day, thin_liquidity) need stable snake_case strings. Product list to confirm.

---

## 5. Mock server spec — wire-identical, swap by base URL

The mock must be **byte-identical to these contracts** so the real Go servers drop in via config change only. Two mock surfaces:

**Market-data mock (HTTP + WS)**
- `GET /candles`: exact query params + `CandleResponse` envelope; integer ticks; naive-local ISO; 200/400/503; cursor paging with trailing-partial-bucket rule.
- `GET /ws`: `connected` on open → `subscribe`/`unsubscribe` → per-sub `ack` → `candle` (finalized only) + `snapshot` (phase, last_price, change_pct, quote, depth) pushes. Snapshot seeds on subscribe; candle does not. **Model A behaviour** (price moves via snapshot between bar closes).

**Broker mock (HTTP)**
- All 12 endpoints with exact bodies, the two error envelopes (`error` vs `reason`), `202`-accepted semantics, `/observation` snapshot. Mock can make market-orders + marks *work* (no Phase-7 gate) — but UI should still treat them as gated so it matches production until Phase 7.

**Session/ref mock (HTTP)**
- The §4 shapes above. Hardcode 2 IN instruments.

Build the mock to these signatures exactly → swapping to the real backend is a base-URL change, nothing else.

---

## 6. Priority order to build

**P0 — foundation + an easy real-data win**
1. Design tokens + component kit (buttons, cards, number-▲▼, session bar, tick-formatter).
2. **Record screen** — trades/pnl/costs all real and shipping. First screen on a real backend.

**P1 — the Terminal (the core; two transports)**
3. Terminal data layer: WS client (market-data) + `/observation` poll loop (broker), against wire-identical mocks.
4. Terminal UI: chart (KLineCharts off WS + `/candles`), depth, instrument list, order ticket (limit; market disabled), positions/orders/trades/P&L tabs, session bar.

**P2 — Home + Practice (balance/transfer real, sessions provisional-mock)**
5. Home — markets dropdown, live-session card, balance, transfer, join/practice gate.
6. Practice setup — condition/length → start.

**P3 — onboarding edges (invented-shape mocks)**
7. Landing (static, waitlist stub).
8. Auth + account-open flow.

---

## 7. Still open (tracked, not blocking)

- `exchange_id` handshake (§4.1) — leaning account-only.
- Condition enum vocabulary (§4.2).
- Auth / account-creation contract.
- Refill mechanic contract.
- Phase 7 (backend): lights up market orders (#17) + position marks (#21) at once — no UI rework, just flip the capability flag.

---

## 8. Build status (Phase 0 scaffold)

**Contract shape change (no wire change):** inline request/response bodies were hoisted into
named schemas in `contract/openapi.yaml` so the Go mock and TS client share one type each:
`MarketsResponse`, `InstrumentsResponse`, `PositionsResponse`, `OrdersResponse`,
`JoinLiveRequest`, `StartPracticeRequest`, `ExitSessionRequest`, `ExitSessionResponse`,
`PracticeCondition`. Regenerate with `make generate`.

| Piece | Status |
|---|---|
| Codegen (`make generate` → Go + TS; WS types hand-authored in `generated/{go,ts}`) | ✅ done, no-diff verified |
| Mock skeleton — all 19 REST routes + `/ws` (connected, subscribe/unsubscribe acks, seed snapshot), session gate + "no session" 409s, both error envelopes, contract-checked tests | ✅ Phase 1b (placeholder data, no realism) |
| Mock realism (stateful orders/balances/fills, moving prices, WS candle pushes + live snapshots, session clock/phases) | ⬜ later phases |
| Tick formatter (`frontend/src/lib/ticks.ts`) + tests | ✅ |
| Tokens wired to Tailwind + Night/Lab toggle | ✅ |
| Record screen (`/record`): trades (paged, `next_before` walk), P&L summary, IN cost/tax breakdown, US 501 | ✅ Phase 2 — against mock history |
| Row 4 (market dropdown) smoke — `GET /v1/markets` rendered from the mock | ✅ smoke only, not the real TopBar |

---

*Contracts: BROKER_HTTP_API.md · BROKER_MARKETDATA_{DESIGN, IMPLEMENTATION_DESIGN, IMPL_COMPONENT_BODIES, IMPL_WIRING, WS_W_PROTOCOL}.md · Session/reference (provisional, §4)*
