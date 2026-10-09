# Development Plan — Synthetic Market Simulator (UI Phase)

**Audience:** you (driving) + Claude Code Cloud (building) + Claude Code Desktop (reviewing).
**Scope:** the frontend + a mock backend, built contract-first, swappable to the real Go backend by config.
**Last updated:** 2026-10-09

---

## 0. The shape of the whole thing (read this first)

You are building **three things that must always agree**:

1. **The contract** — one OpenAPI spec (+ hand-written WebSocket schemas) describing every endpoint's exact shape.
2. **The mock backend** (Go) — serves data that obeys the contract, so screens feel real with no real backend.
3. **The frontend** (React/TS) — consumes the contract; swaps mock → real Go backend by changing one base URL.

The contract is the **single source of truth**. From it we generate Go structs (for the mock) and TypeScript types (for the frontend), so the two can never drift apart even though they're different languages. When the real backend is ready, it implements the same contract and the frontend doesn't change.

**Why this matters for you specifically:** every Claude Code Cloud task starts "cold" with no memory of previous sessions. The contract + the two standing docs in the repo (`CLAUDE.md`, the tracker) are what give each cold task its context. Get those right and the cold starts stay consistent. That's why Phase 0 below is foundational, not optional.

---

## 1. Tech stack (decided)

| Layer | Choice | Why |
|---|---|---|
| Framework | **React + Vite + TypeScript** | SPA; Vite is simplest for an app-first build. (Landing page handled separately; see §7.) |
| Styling | **Tailwind CSS** | Night/Lab palettes become theme tokens; dark/light falls out. |
| Charts | **KLineCharts** | Purpose-built financial charts (candles, depth, indicators). Imperative — lives in a `useRef`/`useEffect` wrapper. |
| Server state (HTTP) | **TanStack Query** | Caching, polling, loading/error states — maps onto `/observation` poll loop. |
| Live state (WS) | **Zustand** | Holds order book / price / session state pushed over WebSocket. |
| Contract | **OpenAPI** → generates **Go structs + TS types**; WS schemas hand-written & shared | One source, no cross-language drift. |
| Mock backend | **Go** | Matches real backend's language; shares structs with real backend later. |
| Monorepo | one repo: `/contract`, `/mock`, `/frontend` | Everything visible to Claude Code at once. |

---

## 2. Repo layout (monorepo)

```
market-sim/
├── CLAUDE.md                  # standing brief — Claude Code reads every session
├── DEVELOPMENT-PLAN.md        # this file
├── UI-API-Coverage-Tracker.md # the living coverage map
├── contract/
│   ├── openapi.yaml           # all REST endpoints (broker, market-data history, session/ref)
│   ├── ws-schemas.md          # WebSocket message shapes (connected/subscribe/ack/candle/snapshot)
│   └── generated/             # codegen output (Go structs, TS types) — committed
├── mock/                      # Go mock server (HTTP + WS); serves the contract
│   ├── cmd/mockserver/
│   └── internal/{broker,marketdata,session}/
├── frontend/
│   ├── src/
│   │   ├── api/               # generated TS types + the client (base-URL swappable)
│   │   ├── tokens/            # design tokens (Night/Lab)
│   │   ├── components/        # shared kit
│   │   ├── features/          # one folder per screen
│   │   └── lib/               # ws client, poll hooks, tick formatter
│   └── ...
└── docs/
    └── (the broker + market-data design docs, for reference)
```

---

## 3. How work flows between you, Cloud, and Desktop

Your instinct, formalized:

```
┌─ Claude Code CLOUD ─────────────┐     ┌─ YOU (local) ──────────────┐     ┌─ Claude Code DESKTOP ──────┐
│ Runs a scoped task (one screen, │     │ Pull the branch            │     │ Open the PR with full      │
│ the mock, the data layer).      │ ──▶ │ Run frontend + mock        │ ──▶ │ repo context.              │
│ Pushes a branch, opens a PR.    │     │ locally, click through,    │     │ Review, fix on the spot,   │
│                                 │     │ test against the mock.     │     │ push back to the branch.   │
└─────────────────────────────────┘     └────────────────────────────┘     └────────────────────────────┘
                 ▲                                                                        │
                 └──────────── next Cloud task picks up the updated main ─────────────────┘
```

**Rules that make this work:**
- **One task = one screen or one slice = one PR.** Never "build the whole app." Cloud does best with a bounded, well-specified task.
- **Every Cloud task is given:** the relevant canvas design board (visual spec), the contract section it touches, and a pointer to `CLAUDE.md`. That's its context.
- **The mock lives in the repo**, so Cloud can run the whole thing end-to-end to self-verify (screen actually works, not just compiles).
- **Merge to main only after your local test + a Desktop review.** Main stays always-runnable.
- **Because Cloud is stateless between tasks,** anything learned ("we decided X") goes into `CLAUDE.md` or the tracker, not just the PR description — otherwise the next cold task won't know.

**First-time-Cloud note:** start with one small, low-risk task (the tokens, or the Record screen) to learn the Cloud→GitHub→local→Desktop loop before pointing it at the Terminal. Don't learn the workflow and the hardest screen at the same time.

---

## 4. The build order (phased)

Each phase is a short series of Cloud tasks. Nothing in a later phase blocks an earlier one.

### Phase 0 — Foundation (do this first, mostly by/with Desktop)
The groundwork every other task depends on. Worth doing carefully.
- `CLAUDE.md` — the standing brief (see §6).
- `contract/openapi.yaml` + `ws-schemas.md` — transcribe the broker, market-data, and session/ref contracts into one spec. Set up codegen (Go + TS).
- Monorepo scaffold: Vite + React + TS + Tailwind; Go module for the mock; the folder layout above.
- **Design tokens** — extract Night + Lab palettes, type scale, spacing, status colours from the canvas Foundation boards into `tokens/` + Tailwind config. (Real task: the canvas uses inline hex, so this is an extraction pass, ~an afternoon.)
- **Tick formatter** — the one util that turns bare `int64` ticks into display strings using `tick_size`/`price_decimals`. Everything numeric depends on it.

### Phase 1 — Component kit + the mock skeleton
- **Shared components:** button (Buy-green/Sell-red/Exit-red, coloured primaries), card, number-with-▲▼ (colour-blind-safe), session bar, top bar with market dropdown + `[Simulation]` tag, loading/empty/error states.
- **Mock skeleton:** Go server that boots, serves the OpenAPI endpoints with static-but-valid data, and stands up the `/ws` endpoint. No realism yet — just correct shapes and status codes.

### Phase 2 — Record screen (first real-data screen, easy win)
- Trades (paginated), P&L summary, tax/cost breakdown — all backed by **real, shipping** broker endpoints.
- Build against the mock first, then point at the real broker to prove the swap works. This is your proof that contract-first actually pays off.

### Phase 3 — The Terminal (the core; biggest effort)
Build in slices, each its own PR:
1. **Data layer** — the two-transport engine: a WS client (market-data) into Zustand, and a `/observation` poll loop (broker) via TanStack Query. This is the spine; build and test it before the UI.
2. **Mock realism** — teach the Go mock to behave like a market: a moving order book, Model-A candles (bars close on bucket; price moves via snapshot between), fills that slip, partial fills. This is what makes the Terminal feel real; worth real effort.
3. **Chart** — KLineCharts off `GET /candles` (history) + WS `candle` stream (live), with the Model-A live-tip behaviour.
4. **Depth + instrument list + live price** — off the WS snapshot stream + `GET /v1/instruments`.
5. **Order ticket** — limit orders (market disabled behind a capability flag); handle async `202` → poll for fill; surface slippage/partial/reject.
6. **Tabs** — positions (no live-mark column yet), open orders, trades, session P&L — off `/observation`.
7. **Session bar** — clock + market state (from WS `snapshot.phase`) + exit (with the one-session confirmation).

### Phase 4 — Home + Practice (balance/transfer real, sessions provisional-mock)
- **Home** — markets dropdown, live-session card + countdown, balances (real), transfer (real), join/practice gate + one-session strip (session/ref mock).
- **Practice setup** — condition + length → start (session/ref mock).

### Phase 5 — Onboarding edges (invented-shape mocks)
- **Landing** — static page, waitlist stubbed.
- **Auth + account-open** — mocked until an auth contract exists.

---

## 5. The mock backend — what it must do

The mock's job: make the frontend feel real AND be a byte-identical stand-in for the real Go backend, so swapping is a base-URL change.

**Three surfaces (match the real axes):**
- **Broker HTTP** — all 12 endpoints, exact bodies, the two error envelopes (`error` vs `reason`), `202`-accepted semantics, `/observation` snapshot.
- **Market-data** — `GET /candles` (history, cursor paging) + `GET /ws` (connected → subscribe → ack → candle/snapshot pushes, Model A).
- **Session/reference** — `/v1/markets`, `/v1/instruments`, `/v1/session`, `/session/*` actions. Hardcode the 2 IN instruments.

**Realism the mock should fake (so the UI behaves like production):**
- A believable order book that moves; market orders that walk the book and slip; partial fills.
- Model-A candles: finalized bars on bucket close + live price ticking via snapshot between bars.
- A session clock + phase transitions (pre-open → open → closed).

**Deliberate production-parity choices:**
- The mock *can* make market orders and position marks work (no Phase-7 gate) — but the **frontend treats them as gated** (capability flag off) so the UI matches real production until Phase 7 ships. Don't let the mock's generosity hide a gap.

---

## 6. CLAUDE.md — the standing brief (what goes in it)

This file is read by Claude Code on every session. It's what keeps cold-start Cloud tasks consistent. Contents:
- **Project one-liner** + the three-axes model.
- **Where the contract lives** and that it's the source of truth; "any new data a screen needs is added to the contract + mock in the same change."
- **The two-transport rule** (WS for market data, polling for account state).
- **Design rules:** mobile-first, responsive, Night/Lab tokens only (no raw hex), Buy-green / Sell-red / Exit-red, coloured primaries, no game-like styling, colour-blind-safe numbers, the `[Simulation]` tag not the word "synthetic" everywhere.
- **The gated facts:** market orders + position marks are Phase-7-gated; keep them behind a capability flag.
- **Money/price = bare int64**, format via the tick formatter, never hardcode currency.
- **Workflow rule:** one screen per PR; run the mock to self-verify; update the tracker when a contract shape changes.
- **Pointers** to the design canvas boards and the design docs in `/docs`.

---

## 7. Open decisions (don't block the start)

- **Landing page:** the canvas already has a built landing page. Decide later whether to port it into the app or keep it as a separate static page. Doesn't block Phases 0–4.
- **`exchange_id` handshake** (session surface): leaning account-only (UI stays dumb, backend binds). Confirm when the session backend is designed.
- **Practice condition enum strings:** confirm the snake_case vocabulary.
- **Auth + refill contracts:** not yet designed; Phase 5 mocks them ad-hoc until they are.

---

## 8. First three concrete steps

1. **Scaffold the monorepo + `CLAUDE.md` + transcribe the contracts into OpenAPI** (Phase 0). Best done with Desktop, interactively, since it's the foundation.
2. **One throwaway Cloud task** to learn the loop — e.g. the design tokens extraction. Small, low-risk, teaches you Cloud → GitHub → local → Desktop.
3. **Record screen** (Phase 2) — first real screen, real data, proves the swap.

Then Terminal.

---

*Companion docs: UI-API-Coverage-Tracker.md (coverage map) · the broker + market-data design docs (contract sources).*