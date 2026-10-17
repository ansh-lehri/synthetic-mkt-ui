# Backend Integration Plan — Synthetic Market Simulator

**Status:** Phase 1 (contract rewrite) and Phase 2 (mock rewrite) both landed on
branch `contract-rewrite` — see `PHASE-1-CONTRACT-REWRITE-PLAN.md` /
`PHASE-2-MOCK-REWRITE-PLAN.md` for the stage-by-stage record,
`contract/REWRITE-DIFF.md` for the exact before/after. `mock/` builds and
`go test ./...` passes against the new contract — the branch is ready to combine
into a PR per §0's sequencing (contract + mock together, so `main` is never left
non-compiling). Phases 3–5 not started.
**Scope:** how the frontend (and its mock) move from the invented mock contract
to the real backend's actual contract, without having to re-wire endpoints
more than once.

---

## 1. Decision already locked

**Option B.** The frontend's types and `api/` layer are rewritten to match the
real backend's actual wire shapes directly. The mock is rewritten in lockstep
to serve those same real shapes. There is no translation/adapter layer
between "UI shape" and "real shape" — there is only one shape, and both the
mock and the real backend speak it.

This is the only way to satisfy the requirement below.

---

## 2. How mock and real backend coexist in one codebase (the core ask)

**Principle: one contract, two interchangeable servers, swapped by one env
var — nothing else ever changes.**

```
contract/openapi.yaml + ws-schemas.md   <- rewritten to match the REAL backend's
                                            actual shapes (not invented ones)
          │
          ├─► contract/generated/go  ──► mock/   (Go mock, faithfully implements
          │                                        the same contract)
          │
          └─► contract/generated/ts  ──► frontend/src/api/  (consumes the contract;
                                                               never touches a base URL
                                                               directly — see api/config.ts)
```

- The **contract is rewritten once**, now describing reality instead of an
  invention. This is the only place "what does an endpoint look like" is
  decided.
- The **mock is rewritten to be a faithful stand-in for the real backend** —
  same paths, same request/response shapes, same status codes, same error
  envelopes, same session model (`account_id`/`user_id`/`session_id`,
  canonical vs on-demand). Not an approximation; a drop-in.
- The **frontend is written once, against the contract** — never against
  "the mock" or "the real backend" specifically. It cannot tell the
  difference, by construction.
- **Switching backend is `VITE_API_BASE`/`VITE_WS_BASE` only** (already the
  project's existing rule — this plan restores it to actually being true,
  since today the mock and the real backend disagree on shape, which is
  exactly why this plan exists).
- **Gaps the real backend doesn't fill yet** (instrument `name`/`lot_size`/
  `price_decimals`, practice scenario list) are modelled in the contract as
  **optional fields with a documented client-side default**. When the real
  backend starts returning them, nothing in the contract or the frontend
  needs to change shape — the default simply stops being used. This is the
  mechanism that prevents "changing endpoints again and again."
- The existing project rule stays in force and is the enforcement mechanism:
  *any new data a screen needs is added to the contract and the mock in the
  same change* (already in `CLAUDE.md`). This plan doesn't introduce a new
  process — it points the existing one at the right target.

---

## 3. Endpoint mapping — UI function → real endpoint

Every endpoint the frontend will call, what screen/function uses it, and any
known gap. This is the thing both the contract rewrite and the mock rewrite
get built against.

### Identity / account

| UI function | Endpoint | Notes |
|---|---|---|
| Signup / login (new screen) | `POST /v1/account/open` | `{user:{email,user_id}}` → `{account_id}`. Idempotent — the same call for both a first-time signup and a returning login, always. Called at signup and opportunistically later if `account_id` is still unknown. |
| Home-load balance, in a live session | `GET /v1/account/balance` | Used once we know (via `/session/current`, §Session table) that the account currently has a live session. `{available, reserved, settled, bank}`. |
| Home-load balance, no session yet | `GET /v1/account/cash` | Used when `/session/current` says there's no active session. `{trading_cash, bank_cash}`. 404 on unknown account. |

**Home-load sequencing, precisely:**
1. Resolve `account_id` (cached, or a fresh `POST /v1/account/open` if not cached yet).
2. Resolve session state via `POST /session/current` — this is already required for session recovery on load (§Session table), so it's not an extra round trip.
3. **Session active** → `GET /v1/account/balance`; show `available` as the trading balance, `bank` as the bank balance.
4. **No session** → `GET /v1/account/cash` directly; show `trading_cash`/`bank_cash`. No `balance` call is made in this case at all — it would just be a guaranteed `409` for a brand-new signup, so we don't fire it blind.
5. Both the session resolve and the chosen balance call run alongside the rest of Home's load (markets, instruments) — none of them block each other.

### Session / market catalog

| UI function | Endpoint | Notes |
|---|---|---|
| Market dropdown (TopBar), live card (Home) | `GET /v1/markets` | Shape differs from mock: `tag`/`active`/`session.{opens_at,closes_at,duration,wall_clock}`. No `name`, no `phase`. |
| Instrument list / tick size | `GET /v1/instruments?market=` | Only `{id, tick_size}` today. `name`/`lot_size`/`price_decimals` default client-side (see §4). |
| "Join live session" | `POST /session/canonical` | `{user, market}` → `{session_id, participant_id, status}`. Always canonical. |
| "Start practice" | `POST /session/ondemand?market=&duration=` | `{user}` → `warming_up` / `insufficient_funds` / `503 failed`. Always on-demand. No `condition` field exists on the wire — scenario picker stays frontend-only until backend ships it. |
| Session recovery (on load/refresh) | `POST /session/current` | `{user:{user_id}}` → resolves current session purely from identity. No need to persist `session_id` client-side. |
| Session status poll (while warming up / in Terminal) | `GET /session/status?session=` | Different status vocabulary than `/session/current` — not interchangeable, don't conflate. |
| Exit session | `POST /session/exit?session=` | Mode-branched server-side. On-demand's already-reaped case returns `404` — treat as success, not error. |
| Live market phase (Terminal) | **WS `snapshot.data.phase` only** | **No session endpoint carries market trading phase.** `open`/`auction`/`closed`/`unknown` — different vocabulary from the mock's `preopen`/`open`/`closing`/`closed`. The UI's own market clock (already built, `lib/liveCard.ts`) becomes the primary phase source, not a fallback. |

### Account reads (all require a live session except `cash`)

| UI function | Endpoint |
|---|---|
| Balance strip | `GET /v1/account/balance` |
| Positions tab | `GET /v1/account/positions` |
| Open orders tab | `GET /v1/account/orders` |
| Terminal dashboard poll | `GET /v1/account/observation` |
| Record — trade history | `GET /v1/account/trades` |
| Record — P&L summary | `GET /v1/account/pnl` |
| Record — tax/cost breakdown | `GET /v1/account/costs?country=` |
| Record — tax/cost summary | `GET /v1/account/costs/summary?country=` |

### Orders / transfer

| UI function | Endpoint |
|---|---|
| Place order | `POST /v1/orders` |
| Cancel order | `POST /v1/orders/cancel` |
| Modify order | `POST /v1/orders/modify` |
| Bank ↔ trading transfer | `POST /v1/account/transfer` |

### Market data

| UI function | Endpoint |
|---|---|
| Chart history | `GET /v1/candles` |
| Live price/depth/candle push | `GET /v1/ws?session=` (needs a `session_id` from a join call first — different from the mock's anonymous socket) |

---

## 4. Known contract gaps and how each is handled

| Gap | Handling |
|---|---|
| `GET /v1/instruments` missing `name`/`lot_size`/`price_decimals` | Modelled as optional in the contract; client-side default map keyed by instrument id until backend adds them. Confirmed as a genuine backend gap backend will close. |
| Practice "condition" (scenario) has no backend field | Kept in frontend UI/state only; not sent on `/session/ondemand`. Backend is building scenario-list endpoints separately — revisit when those ship. |
| Four timestamp formats on the wire | Reduces to two parsing paths in practice: (a) RFC3339 / RFC3339Nano — both parse fine with native `Date`, no custom code; (b) naive-local + a paired `timezone` field — already handled by `lib/naive.ts`. Work is tagging which field is which per endpoint, not writing new parsers. |
| CORS — real backend sends no headers | Temporary Vite dev-proxy (`vite.config.ts`, already added) forwards `/v1` and `/session` to `localhost:8080` so the browser sees same-origin. Flagged separately as a backend/infra fix needed before any non-proxied deployment. |
| Multi-country routing (one backend deployment per country) | **Parked, not designed.** Explicitly out of scope for this plan per your call — revisit later as its own piece of work. |
| Fills / trade creation / live position marks / market-buy pricing / live WS price data | **Deferred — not integrated yet.** Confirmed via live testing that these depend on counterparty agent liquidity that isn't available on the current backend instance. Everything else (session lifecycle, all reads, order placement/cancel/modify mechanics, transfer, candle history shape) is confirmed working and is NOT blocked by this. |

---

## 4a. Phase 1 findings — confirmations and corrections

Everything in §3/§4 above was re-verified against the real backend's source-derived
docs (`market-simulator/docs/api-contract/*.md`) during the Phase 1 contract rewrite
and found accurate, with these additional nuances now also captured in
`contract/openapi.yaml`/`ws-schemas.md` (not previously written down anywhere in this
plan):

- **`fok` is accepted on the wire but not honored.** The exchange matcher has no FOK
  branch — a `tif:"fok"` order behaves exactly like `ioc` (partial fills allowed, no
  all-or-nothing guarantee). Don't build any UI/logic that depends on FOK semantics.
- **`/session/canonical` and `/session/ondemand` use the `{error}` envelope for their
  409s, not the `{reason}` envelope orders use.** Different error-shape convention
  on the same HTTP status across these two axes — the frontend's session-action
  module (Phase 3) must not assume one envelope shape for every 409 on the API.
- **`GET /v1/account/cash` is NOT live-updated during a session.** It's a pre-session
  durable snapshot; once a session exists, read `balance`, not `cash` — this was
  already the locked Home-load sequencing design, now additionally confirmed by the
  real backend's own doc: calling `cash` mid-session returns stale data, not an error,
  so a sequencing bug here would fail silently rather than loudly.
- **`mark_available` is conditionally true**, not permanently false as the original
  mock-era assumption had it — true once the instrument's exchange instance is wired
  and it has printed at least one trade. Phase 4's Terminal/Positions-tab work should
  re-check whether the live-mark column can ship earlier than originally assumed,
  depending on whether the real backend's test instance ever gets trade activity.
- **Market-buy pricing is also conditionally live** (same wiring+quote-freshness
  gate as marks) — `no_market_price` is a real, reachable rejection, not dead code,
  but it is no longer an unconditional reject either. Still default the order ticket
  to limit per the existing capability-gate design; re-evaluate the market-order
  capability flag in Phase 4 only if the test instance demonstrates working market
  orders.

## 4b. Phase 2 findings — mock simplifications made explicit

The mock rewrite (`mock/internal/{identity,store,session,broker,marketdata,catalog}`)
is a faithful stand-in for the contract's shapes and status codes, but a few
deliberate simplifications were made rather than fully reproducing every real-backend
nuance — flagged here so they're not mistaken for bugs later:

- **`account_id` IS `user_id`, verbatim**, in the mock (`internal/identity`). Still
  genuinely idempotent (satisfies the one thing the contract requires), just a single
  id space instead of two. If a real second id space is ever needed for mock-only
  testing, this is the one place to change.
- **Canonical sessions never auto-expire** in the mock; only on-demand sessions reap
  (lazily, on access, once past `session_ends_at`) — matches the real backend's
  model (canonical markets are always-on, on-demand instances are ephemeral).
- **`/session/exit` 404s on an unknown session_id for BOTH modes** in the mock. The
  real backend's canonical branch has a rarer idempotent-200 case (a broker/registry
  desync race) that the mock's single-map session store has no way to reproduce —
  documented in `PHASE-2-MOCK-REWRITE-PLAN.md` Stage 2.4 and in `session.go`'s `exit`
  handler comment, not silently dropped.
- **The mock never reproduces the live backend's observed on-demand "stuck zombie"
  failure** (§"Errors and fixes" history above) — it only models the documented,
  clean `warming_up → ready` and `insufficient_funds` paths. This was an explicit,
  deliberate scope decision (Stage 2.2), not an oversight.
- **`mark_available` stays permanently `false`** in the mock's positions (unchanged
  from before this rewrite) even though the real backend's is now conditionally
  `true`. Flagged as a Phase 4+ open item if live position marks become worth
  testing against the mock specifically — not blocking.

## 5. Phased implementation order

Each phase is scoped to be reviewable on its own, following the project's
existing "one slice = one PR" rule.

1. **Contract rewrite.** `contract/openapi.yaml` + `ws-schemas.md` rewritten
   to the real shapes from §3, with the §4 gaps modelled as optional fields.
   Regenerate Go + TS types (`make generate`). No mock or frontend code
   changes yet — this phase is the contract only.
2. **Mock rewrite.** `mock/` rewritten against the new contract: conductor-
   style identity/session routes (`account/open`, `cash`, `session/canonical`,
   `session/ondemand`, `session/status`, `session/current`, `session/exit`),
   corrected `markets`/`instruments` shapes, and the broker reads/order/
   transfer/candles surfaces re-shaped to match real response bodies exactly.
   `go test ./...` decodes every response into the generated structs, same
   discipline as today.
3. **Frontend identity + session plumbing.** New minimal Signup screen (email
   only), the identity/account-bootstrap module replacing `lib/account.ts`,
   and the session module replacing the mock-shaped half of `useSessionFlow`
   (canonical/on-demand mapping, recovery via `/session/current`, the
   phase/status split in §3).
4. **Per-screen adaptation.** Home, Terminal, Record, Practice updated to the
   new types and session flow. Terminal's `SessionBar`/phase logic updated
   for the WS-only phase source.
5. **Verification pass.** Run both the rewritten mock and the real backend
   side by side; confirm every screen behaves identically against both,
   since that equivalence is the whole point of this plan.

---

## 6. Open items requiring a decision before or during the phases above

- Exact client-side default values for `lot_size`/`price_decimals`/`name`
  per instrument (needs a value, not just "default something").
- Whether the mock needs its own on-demand-style "agent liquidity" simulation
  improved so fills/trades/live marks can be dev-tested locally even while
  the real backend's liquidity is unavailable (worth deciding once the mock
  rewrite starts, not before).
- Multi-country routing — parked per §4, to be scoped as its own effort later.
