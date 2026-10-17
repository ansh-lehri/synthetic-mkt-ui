# Phase 1 — Contract Rewrite: Stage Plan

**Parent doc:** `BACKEND-INTEGRATION-PLAN.md` §5, Phase 1.
**Status:** draft for review. Nothing in this plan has been implemented yet.
**Scope of Phase 1 only:** `contract/openapi.yaml` + `contract/ws-schemas.md` rewritten
to the real backend's actual shapes, and the generated Go/TS types regenerated from
them. No mock code and no frontend code changes — those are Phase 2 and Phase 3/4.

---

## 0. A sequencing problem Phase 1 must account for

`contract/generated/go` is consumed by `mock/` (via a `replace` directive) and
`contract/generated/ts` is consumed by `frontend/src/api/`. The instant the generated
types change shape, both `mock/` and `frontend/` stop compiling against them — and they
stay broken until Phase 2 (mock rewrite) lands.

That conflicts with the standing rule "keep `main` always-runnable." Resolution for
Phase 1:

- Stages 1.1–1.6 (schema authoring) happen on a long-lived branch
  (`contract-rewrite`), not against `main` directly.
- Stage 1.7 (codegen regeneration) runs on that same branch, so the branch is
  temporarily non-compiling for `mock/`/`frontend/` — that's expected and contained,
  because it never touches `main`.
- **`contract-rewrite` merges to `main` only together with Phase 2's mock rewrite**,
  as sequential commits on one PR (contract commit, then mock-fix commit) — not as two
  separate PRs with a broken `main` in between. This is a deliberate, documented
  exception to "one slice = one PR" for this phase pair only; Phase 1's stages below are
  still reviewed and tested independently inside that branch before the combined PR
  opens.
- The frontend side of the breakage is handled in Phase 3 as already scoped — the
  branch doesn't need the frontend to compile until then, so `frontend/` staying broken
  on `contract-rewrite` until Phase 3 lands is acceptable and already accounted for by
  the existing phase order.

Everything below (1.1–1.8) happens inside `contract-rewrite`.

---

## 1.1 — Inventory and diff (no file changes to the contract yet)

**Goal:** one artifact that lists, per endpoint, mock-contract shape vs. real-backend
shape side by side, so every later stage is "apply row N of this table," not
re-research.

**Deliverable:** `contract/REWRITE-DIFF.md` — a table per axis (identity/account,
session/market catalog, account reads, orders/transfer, market data), each row://
endpoint, current contract shape, real backend shape (from
`market-simulator/docs/api-contract/*.md`, re-verified against source where this
session already read it — e.g. `balance.go`), and a one-line note on what has to
change (rename, add field, drop field, split into two endpoints, etc).

**Source of truth to pull from:** the five `market-simulator/docs/api-contract/*.md`
files, plus the already-verified Go source reads from this session (`broker/reads/balance.go`,
`broker/funnel/shard_handlers.go`) where docs and code could disagree.

**Acceptance:** every row in `BACKEND-INTEGRATION-PLAN.md` §3's endpoint table has a
corresponding diff row here. No ambiguity left as prose — each row names the exact
field adds/removes/renames.

**Not a PR on its own** — this file ships inside the same `contract-rewrite` branch,
reviewed as the first commit, so later stages can be reviewed against it.

---

## 1.2 — Identity / account schemas

**Goal:** rewrite the account-open and cash schemas; drop nothing that's still real.

**Changes to `contract/openapi.yaml`:**
- `POST /v1/account/open` — request `{user: {email, user_id}}`, response
  `{account_id}`. Replaces whatever placeholder account-identity shape (if any)
  existed before — today's contract has no auth concept at all, so this is new, not a
  rename.
- `GET /v1/account/cash` — new. Response `{trading_cash, bank_cash}`, 404 documented
  for unknown account.
- `GET /v1/account/balance` — fields corrected to match the real response exactly
  (`available, reserved, settled, bank`) and the 409 (`"no live session for account"`)
  documented as *always* true without a session — this was verified against
  `balance.go` this session, not assumed from docs.

**Acceptance test for this stage:** `npx @redocly/cli lint contract/openapi.yaml` (or
equivalent OpenAPI validator — see Stage 1.7 for the exact tool) passes with zero
errors on the edited paths. No codegen run yet — that's deliberately deferred to 1.7 so
each schema stage can be reviewed as a readable diff of the YAML, not a diff that also
includes regenerated binary-ish Go/TS output every time.

---

## 1.3 — Session / market catalog schemas

**Goal:** rewrite `markets`, `instruments`, and all six session endpoints
(`canonical`, `ondemand`, `current`, `status`, `exit`, and the WS phase note) to the
real shapes.

**Changes:**
- `GET /v1/markets` — `tag`/`active`/`session.{opens_at,closes_at,duration,wall_clock}`
  replacing the mock's invented `name`/`phase` fields.
- `GET /v1/instruments?market=` — `{id, tick_size}` only on the wire; `name`,
  `lot_size`, `price_decimals` added back as **optional** schema fields with a
  `description` noting they're client-defaulted today (see §4 of the parent plan) —
  this is the concrete mechanism promised there, written down as an actual OpenAPI
  `nullable`/optional field, not just a sentence in a planning doc.
- `POST /session/canonical`, `POST /session/ondemand?market=&duration=`,
  `POST /session/current`, `GET /session/status?session=`, `POST /session/exit?session=`
  — request/response schemas and status enums exactly as documented in
  `conductor.md`, including the two separate status vocabularies
  (`starting/active/stopping/ended/failed` vs `warming_up/ready/failed/ended`) kept as
  two distinct enums, never unified into one.
- Explicit note in the schema description for `ondemand`: no `condition` field exists;
  do not add one speculatively.

**Acceptance:** validator passes; a manual read-through confirms the two status enums
are literally different named schemas (`SessionCurrentStatus` /
`SessionStatusPollStatus` or similar), so nothing downstream can typo-collapse them.

---

## 1.4 — Account reads (positions, orders, observation, trades, pnl, costs)

**Goal:** confirm/rewrite the response bodies for everything gated on a live session,
plus the always-200 durable reads.

**Changes:** per-field correction against `broker-reads.md` for `positions`, `orders`,
`observation` (bundle of balance+positions+orders+recent_trades — confirm the real
backend's `observation` is really a bundle and not something this plan assumed; if the
real backend has no single bundled endpoint, this is where that gap gets caught and
`BACKEND-INTEGRATION-PLAN.md` §3/§4 gets a correction, not frontend code written
against a wrong assumption), `trades`, `pnl`, `costs`, `costs/summary`.

**Acceptance:** validator passes; any divergence found from what
`BACKEND-INTEGRATION-PLAN.md` currently says gets logged as an edit to that file in
the same commit (not silently absorbed) — the parent plan must stay accurate as the
rewrite proceeds.

---

## 1.5 — Orders / transfer schemas

**Goal:** rewrite `PlaceOrderRequest`, `CancelOrderRequest`, `ModifyOrderRequest`,
`TransferRequest`/`TransferResponse` to the real `broker-order-transfer.md` shapes,
including the real 422 reason-tag enum and the real 202-only-not-done semantics
(already a documented house rule in `CLAUDE.md` — confirm it still holds on the real
backend, don't just assume).

**Acceptance:** validator passes; the 422 reason enum in the schema matches the
real backend's enum verbatim (no reasons invented, none dropped).

---

## 1.6 — Market data (candles HTTP + WS schemas)

**Goal:** rewrite `GET /v1/candles` and `contract/ws-schemas.md` to the real
`marketdata.md` shapes — including the real phase vocabulary (`open`/`auction`/
`closed`/`unknown`) replacing the mock's `preopen`/`open`/`closing`/`closed`, and the
real WS connection model (`GET /v1/ws?session=` requiring a `session_id` from a join
call first, vs. the mock's anonymous socket).

**Acceptance:** validator passes; `ws-schemas.md`'s message-shape examples are each
checked against a captured real frame (reuse the raw WS traffic already captured
during this session's recon, if saved; otherwise a short live capture against
`localhost:8080` to confirm the examples are byte-accurate, not transcribed from docs
only).

---

## 1.7 — Codegen regeneration

**Goal:** turn the finished YAML/MD into committed generated code.

**Steps:**
1. `make generate` (regenerates `contract/generated/go/types.gen.go` and
   `contract/generated/ts/api.d.ts`; `ws.go`/`ws.ts` are hand-authored from
   `ws-schemas.md` per existing convention — update them by hand to match 1.6's
   rewritten message shapes).
2. `make check` — must fail loudly if anything drifts; the point of this stage is that
   it then passes, proving contract ⇄ generated code agreement.
3. Commit the regenerated files. This is the point where `mock/` and `frontend/` go
   non-compiling on the branch (expected per §0).

**Acceptance:** `make check` is green. This is the hard gate for Phase 1 being "done" —
everything upstream of it (1.1–1.6) is readable-diff review; this is the mechanical
proof the contract is self-consistent.

---

## 1.8 — Documentation sync

**Goal:** every doc that describes the contract's current state gets updated in the
same branch, so Phase 2 starts from accurate docs, not stale ones.

**Changes:**
- `UI-API-Coverage-Tracker.md` — flip the "Status" column's 🟢 prov / ⬜ / 🟡 markers
  to reflect what's now a confirmed real shape vs. still-gapped (instrument metadata,
  practice conditions) vs. still-blocked (market orders, position marks — Phase 7 on
  the real backend too, confirm this is still true for the real backend and note it
  if not).
- `BACKEND-INTEGRATION-PLAN.md` §3/§4 — reconciled against whatever 1.1–1.6 actually
  found (not re-litigated, just corrected where recon turned up a difference from what
  was written before any of this).
- `CLAUDE.md` — the "Settled facts" section lists mock-specific numbers (seed
  balances, tick sizes, phase vocabulary) that are about to stop being true for the
  live backend; add a short note next to each one that's superseded, pointing at this
  plan, rather than deleting the mock-era facts (they're still correct for understanding
  the mock as it exists until Phase 2 rewrites it).

**Acceptance:** a reviewer reading only `UI-API-Coverage-Tracker.md` +
`BACKEND-INTEGRATION-PLAN.md` after this stage gets the current, accurate picture with
no need to cross-check this stage-plan doc or chat history.

---

## Stage summary / review checkpoints

| Stage | Output | Reviewable unit |
|---|---|---|
| 1.1 | `contract/REWRITE-DIFF.md` | Diff table, no schema changes yet |
| 1.2 | Identity/account schemas | YAML diff |
| 1.3 | Session/market catalog schemas | YAML diff |
| 1.4 | Account reads schemas | YAML diff |
| 1.5 | Orders/transfer schemas | YAML diff |
| 1.6 | Market data + WS schemas | YAML + MD diff |
| 1.7 | Codegen regen | `make check` green |
| 1.8 | Doc sync | Tracker + plan + CLAUDE.md updates |

Stages 1.1–1.6 can be reviewed incrementally as separate commits on `contract-rewrite`
(each is a pure schema diff, independently readable). 1.7 and 1.8 are the two commits
that close the branch out and prepare it to be combined with Phase 2's mock-rewrite
commits into the single PR described in §0.

## What Phase 1 explicitly does not do

- No mock code changes (Phase 2).
- No frontend code changes (Phase 3/4).
- No multi-country routing design (parked, per `BACKEND-INTEGRATION-PLAN.md` §4/§6).
- No decision on exact default values for `lot_size`/`price_decimals`/`name` — Stage
  1.3 only adds the *fields*, as optional with a documented placeholder; the actual
  default values are an open item (`BACKEND-INTEGRATION-PLAN.md` §6) to resolve before
  Stage 1.3 closes, since the field needs some default written into its schema
  description even if it's provisional.
