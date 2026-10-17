# Phase 2 — Mock Rewrite: Stage Plan

**Parent doc:** `BACKEND-INTEGRATION-PLAN.md` §5, Phase 2.
**Depends on:** `PHASE-1-CONTRACT-REWRITE-PLAN.md` — this phase starts from the
`contract-rewrite` branch's finished, regenerated types (Stage 1.7), on the same
branch, and is the commit set that makes `mock/` compile and pass again (per Phase
1's §0 sequencing note — the combined PR closes with Phase 2, not Phase 1 alone).
**Status:** draft for review. Nothing in this plan has been implemented yet.
**Scope:** `mock/` rewritten to serve the new contract faithfully. No frontend
changes — that is Phase 3/4.

---

## 0. What changes structurally, and why it's staged this way

The mock's current mutable state is deliberately tiny: `internal/store.Sessions`
(`account_id -> ActiveSession`, one map) and `internal/broker`'s per-account
`ledger`/`practiceLedger` maps, both keyed by `account_id` alone (`store.go`,
`broker.go`, `ledger.go` — all read in full earlier this session). The real backend's
model adds a layer underneath that: `user_id -> account_id` (via `account/open`,
idempotent) and `account_id -> session_id/participant_id` with **two session kinds
with different status vocabularies** (canonical vs on-demand), not the mock's single
`ActiveSession`. Staging follows the dependency order of that model: identity first,
then session, then everything that currently gates on "is this account in a
session" (which must now gate on "does this account have an active
canonical-or-ondemand session" instead), then market data.

---

## 2.1 — Identity layer (`internal/identity`, new package)

**Goal:** model `user_id -> account_id`, mirroring the real backend's
`POST /v1/account/open` being idempotent and auth-free.

**Deliverable:** `mock/internal/identity/identity.go` — a `sync.RWMutex`-guarded map,
same shape discipline as `store.Sessions` (`store.go` is the template: small,
concurrency-safe, no goroutines). `Open(userID, email) (accountID string)` creates on
first call, returns the same `account_id` on every subsequent call for that
`user_id` — idempotency is the thing under test here, not account creation per se.

**Route:** `POST /v1/account/open` and `GET /v1/account/cash` (cash needs no
session — reads straight off the live ledger via the existing `Accounts.Available`
pattern in `broker.go`, extended to also expose bank cash).

**Tests:** `mock/internal/identity/identity_test.go` — same `user_id` twice returns
the same `account_id`; different `user_id`s never collide; concurrent `Open` calls for
the same new `user_id` (goroutines + a `sync.WaitGroup`) all return the identical
`account_id` (catches a race if the lock is wrong). `mock/go test ./...` decodes the
HTTP response into the generated `AccountOpenResponse` struct with unknown fields
rejected, same discipline as every other endpoint today.

---

## 2.2 — Session store rewrite (`internal/store`)

**Goal:** replace the single `ActiveSession` model with the real two-kind model.

**Changes to `store.go`:** `Sessions` now stores enough to answer both
`POST /session/current` (status vocabulary: `starting/active/stopping/ended/failed`)
and `GET /session/status?session=` (status vocabulary: `warming_up/ready/failed/ended`)
*as two separately-named fields on the stored record*, not one shared status — this
mirrors Stage 1.3's deliberate two-enum split in the contract, and is the single most
important thing this stage must not collapse. Canonical sessions join a shared,
always-on market record (no per-session warm-up); on-demand sessions get their own
`session_id`/`participant_id` and a warm-up delay before `ready`.

**One-session gate stays** (`StartIfFree` semantics unchanged in spirit): an account
with a live session of either kind refuses a second join/start — this existing
behaviour already matches the real backend's `ErrAlreadyInSession`, confirmed during
this session's live recon, so it is preserved, not redesigned.

**New on-demand failure modelling:** this session's live recon found the real
on-demand path can return `503 agent orchestrator unavailable` and, in one observed
case, leave a stuck `Failed` record that blocks retries until something elsewhere
unblocks it (root cause not established — see `BACKEND-INTEGRATION-PLAN.md`'s "Errors
and fixes" history, which explicitly says not to assume a root cause). The mock does
**not** attempt to reproduce the stuck-zombie bug — only the clean, documented
behaviours (`warming_up` → `ready`, and a `503` failure that *does* clear via
`/session/exit` once `Failed`, which is strictly better than the one anomaly observed
live, and no worse for frontend-development purposes since Phase 3/4 only need the
documented state machine to build against).

**Tests:** `store_test.go` — canonical join/exit; on-demand start → poll `status`
through `warming_up` → `ready`; one-session gate refusal for both kinds; exit clears
the gate; a `current` call after a session ends reports `ended` (not simply "no
session", matching the real distinction between "never had one" and "had one, it
ended").

---

## 2.3 — Markets / instruments catalog rewrite (`internal/catalog`)

**Goal:** serve `GET /v1/markets` and `GET /v1/instruments?market=` in the real shape.

**Changes:** `catalog.go`'s static data gets the new fields
(`tag`/`active`/`session.{opens_at,closes_at,duration,wall_clock}` for markets) and
drops the mock-invented `name`/`phase` fields from the wire response. For
instruments, the wire response is `{id, tick_size}` only — but the mock **keeps**
`name`/`lot_size`/`price_decimals` as internal catalog data (ledger math and display
still need them) while the HTTP handler stops serializing them, so the mock's own
behaviour (lot-size validation in `ledger.rest`, tick-grid checks) is unaffected; only
the wire contract changes. This matters because it means Stage 2.3 does not touch
`ledger.go`'s validation logic at all — it is a serialization-layer change only.

**Tests:** `catalog_test.go` decode check — the JSON response for instruments has
exactly `{id, tick_size}` and nothing else, so a regression that accidentally starts
emitting `name` again (which would silently diverge from the real backend) fails
loudly.

---

## 2.4 — Session action endpoints (`internal/session`, rewritten)

**Goal:** `POST /session/canonical`, `POST /session/ondemand?market=&duration=`,
`POST /session/current`, `GET /session/status?session=`, `POST /session/exit?session=`.

**Changes:** route handlers rewritten against `store.go`'s new two-kind model
(Stage 2.2). `ondemand`'s `insufficient_funds` rejection reuses
`Accounts.Available` (already exposed by `broker.go` for the practice-ledger
seeding path — Stage 2.5 touches this same seam, see the note there). `exit`'s
real-backend quirk — an already-reaped on-demand session's exit returns `404`,
which the frontend plan treats as success — is modelled by the mock returning the
same `404` in that case (not a `200`), so the frontend's "treat 404 as success" logic
(Phase 3) is exercised against the mock honestly, not papered over.

**Tests:** `session_test.go` — full join/exit cycle for canonical; full
start/poll/exit cycle for on-demand including the warm-up delay (inject a fake clock,
same pattern as `ledger.go`'s `Config.Now`); `exit` on an already-ended on-demand
session returns `404`; `current` resolves purely from `user_id` with no client-held
`session_id` (confirms the "no need to persist session_id client-side" claim in
`BACKEND-INTEGRATION-PLAN.md` §3 is actually true of the mock, not just the real
backend).

---

## 2.5 — Account reads re-gated on the new session model (`internal/broker`)

**Goal:** `balance`, `positions`, `orders`, `observation` keep their existing
ledger/practice-ledger logic (`ledger.go`, `broker.go` — unchanged internals) but the
409 gate (`liveAccount` in `broker.go`) switches from `sessions.Active(acct)` (old
single-session boolean) to the new store's "has a live session of either kind" check.

**Also in this stage:** `GET /v1/account/cash` (routed in Stage 2.1, but its
*values* come from here) returns the live ledger's `available`/`bank` under the real
field names `trading_cash`/`bank_cash` — confirming cash and balance read the same
underlying numbers through two different field-name views, which is what the real
backend's split implies and what Phase 3's Home-load sequencing logic
(`BACKEND-INTEGRATION-PLAN.md` §3) depends on being true.

**Tests:** existing `broker_test.go` 409 cases re-asserted against both session kinds
(canonical active → reads succeed; on-demand `warming_up` → reads still 409 until
`ready`, matching the real backend's distinction between "session exists" and
"session is actually live" — confirm this against `conductor.md` before asserting it
as a test; if the real backend allows reads during `warming_up`, the test encodes
that instead). `cash` vs `balance` numeric agreement is asserted directly (same
`available`, different field name).

---

## 2.6 — Orders / transfer handlers

**Goal:** confirm `place`/`cancel`/`modify`/`transfer` in `broker.go` need no logic
changes beyond the session-gate switch from Stage 2.5 — their 422 reason enum and
202-not-done semantics were already verified against the real backend during this
session's live recon (circuit-band rejects aside, which are an exchange-side concern
the mock does not model — see §4 of the parent plan, "deferred, not blocking").

**Tests:** existing `ledger_test.go`/`broker_test.go` order-flow tests re-run
unchanged (rest → partial → fill, cancel, modify-partial-warning) — this stage's
acceptance is that **no test here needed to change**, which is the proof the
session-model rewrite was isolated correctly to Stages 2.1/2.2/2.5 and didn't leak
into order mechanics.

---

## 2.7 — Market data (candles + WS) rewrite (`internal/market`, `internal/marketdata`)

**Goal:** phase vocabulary becomes `open`/`auction`/`closed`/`unknown` (real) instead
of `preopen`/`open`/`closing`/`closed` (mock-invented); WS connection becomes
session-scoped (`GET /v1/ws?session=`) instead of anonymous.

**Changes:** `market.go`'s clock emits the new 4-value phase enum (dropping
`closing` as a distinct phase — the real backend has no such state, confirmed in
`BACKEND-INTEGRATION-PLAN.md`'s research; "closing soon" becomes purely a frontend
countdown-derived label in Phase 4, not a server phase). `marketdata.go`'s `/ws`
handler requires a valid `session_id` from Stage 2.4's store before accepting
`subscribe` frames; an unknown/expired session gets a close frame or rejection ack
(exact shape pinned to `ws-schemas.md` as rewritten in Phase 1 Stage 1.6 — this stage
implements that spec, it does not re-decide it).

**Tests:** `market_test.go`'s existing "a pushed bar equals the same bar from
`/v1/candles`" invariant re-asserted under the new phase enum; new test that
subscribing with no session (or a dead one) is rejected per the pinned WS schema;
candle bucket/paging logic (`bars.go`) is otherwise untouched — confirm via existing
tests passing unchanged, same isolation argument as Stage 2.6.

---

## 2.8 — Full-contract decode test sweep

**Goal:** the project's existing discipline — "`go test ./...` decodes every response
into the generated structs with unknown fields rejected" — re-run as a dedicated
closing stage, not just incidentally per earlier stage.

**Deliverable:** confirm every route registered in `main.go` has at least one test
hitting it and decoding the response with a strict (unknown-fields-rejected)
decoder, cross-checked against the Stage 1.1 diff table (`contract/REWRITE-DIFF.md`)
so nothing on that table was missed.

**Acceptance:** `cd mock && go test ./...` green; a manual `grep` of `main.go`'s
route registrations against `REWRITE-DIFF.md`'s row list shows 1:1 coverage.

---

## 2.9 — Local manual verification + doc sync

**Goal:** the mock actually runs end-to-end once this phase is done, and the docs
that describe its behaviour are updated so Phase 3/4 start from accurate ground
truth.

**Steps:**
1. `make mock` starts clean, no errors.
2. Manual smoke pass with `curl`: `account/open` → `cash` → `session/canonical` →
   `balance` → `orders` (place/cancel) → `session/exit` → `cash` again — the exact
   sequence Phase 3's frontend will drive, run once by hand before any frontend code
   depends on it.
3. `CLAUDE.md`'s "Phase 1b/3a/3b/3c decisions" bullets describing the *old* mock
   behaviour (single-session boolean, invented phase vocabulary, anonymous WS) get a
   short superseding note pointing at this plan — not deleted, since they still
   describe history accurately, but a future reader must not take them as current.
4. `BACKEND-INTEGRATION-PLAN.md` §4/§5 gets corrected if any Stage 2.1–2.7 finding
   contradicted something written there.

**Acceptance:** the manual sequence in step 2 succeeds against the rewritten mock
with no frontend code written yet — proving the mock is now a standalone,
independently-correct artifact per this plan's "faithful stand-in" goal, before
Phase 3 ever touches it.

---

## Stage summary

| Stage | Output | Depends on |
|---|---|---|
| 2.1 | `internal/identity` + `account/open`, `cash` | Phase 1 Stage 1.7 types |
| 2.2 | `store.go` two-kind session model | 2.1 |
| 2.3 | Catalog wire-shape fix | Phase 1 Stage 1.7 types |
| 2.4 | Session action endpoints | 2.2 |
| 2.5 | Account reads re-gated | 2.2, 2.1 (cash values) |
| 2.6 | Orders/transfer (gate switch only) | 2.5 |
| 2.7 | Market data phase + session-scoped WS | 2.4 |
| 2.8 | Full decode-test sweep | 2.1–2.7 |
| 2.9 | Manual verification + doc sync | 2.8 |

## What Phase 2 explicitly does not do

- No frontend code (Phase 3/4).
- No attempt to reproduce the live backend's unexplained on-demand zombie-session
  bug (Stage 2.2 note) — the mock models documented behaviour only.
- No change to order-matching/fill mechanics beyond the session-gate switch (Stage
  2.6) — fill timing/partial-fill simulation is untouched.
- No multi-country modelling (still parked per the parent plan).
