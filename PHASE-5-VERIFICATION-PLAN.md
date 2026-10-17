# Phase 5 — Verification Pass: Stage Plan

**Parent doc:** `BACKEND-INTEGRATION-PLAN.md` §5, Phase 5.
**Depends on:** `PHASE-4-PER-SCREEN-ADAPTATION-PLAN.md` fully landed — every screen
now talks to the contract-shaped modules from Phase 3, and the mock (Phase 2) is a
faithful stand-in.
**Status:** draft for review. Nothing in this plan has been implemented yet.
**Scope:** confirm the whole point of this project — mock and real backend are
genuinely interchangeable by base URL alone — holds in practice, not just on paper.
No new features; this phase finds and files gaps, it does not necessarily fix them
all inline (see §5.5).

---

## 5.1 — Endpoint-by-endpoint parity sweep

**Goal:** for every row in `BACKEND-INTEGRATION-PLAN.md` §3's mapping table, run the
identical frontend action against the mock, then against the real backend
(`localhost:8080` via the Vite proxy), and diff the two observed responses'
*shapes* (not values — values will legitimately differ).

**Method:** reuse this session's earlier live-recon approach (direct `curl`/browser
network-tab capture against the real backend) but now driven by the actual frontend
code paths from Phase 4, not ad-hoc requests. A short checklist derived mechanically
from `BACKEND-INTEGRATION-PLAN.md` §3's rows, ticked off one by one.

**Known expected divergences (not failures):** anything already listed in §4 of the
parent plan as deferred — fills/trades/live marks/market-buy pricing/live WS price
data depend on counterparty liquidity the real backend's test instance doesn't have.
These rows are checked for *shape* agreement (does a `202` place-order response
decode the same way) but not for *behavioural* agreement (whether it actually fills)
— flag explicitly which rows were shape-only-verified for this reason, so Phase 5's
sign-off doesn't quietly claim more than it tested.

**Acceptance:** every row ticked, with a one-line note per row: "verified live" /
"shape-only (liquidity-gated)" / "gap found — filed as §5.5 item."

---

## 5.2 — Full screen walkthrough against the mock

**Goal:** the same click-through as Phase 4 Stage 4.5, re-run here as a formal gate
rather than an informal check, now including Record's practice-vs-live separation
and Terminal's full tab set (Orders/Positions/Trades/P&L), with the mock running in
its default real-time mode (Phase 4a's "mock runs in real time by default" decision)
so timing-sensitive behaviour (session clock, order fill delays) is exercised
realistically, not sped up.

**Acceptance:** no console errors, no visually broken state, at both 1600px and
375px (per the project's existing Phase 1a verification bar), in both Night and Lab
themes.

---

## 5.3 — Full screen walkthrough against the real backend

**Goal:** the same walkthrough, against `localhost:8080`, to the extent the current
test instance allows.

**Known limits going in (from this session's recon, carried over honestly rather
than re-discovered):** no counterparty liquidity, so orders rest but never fill —
Positions/Trades/P&L tabs will legitimately stay empty; this is expected, not a bug
to chase in this phase. The on-demand session's occasional `503`/stuck-session
behaviour (unexplained root cause, per `BACKEND-INTEGRATION-PLAN.md`'s "Errors and
fixes" history) may recur — if it does, Stage 5.3 records the raw observation
(request, response, timing) without asserting a cause, consistent with the standing
lesson from that history.

**Acceptance:** signup → account open → join live or start practice → session
reaches an active/ready state → balance/cash correct → order placed and visible as
`working` → cancel works → exit works → Record shows durable history (seeded, if the
real backend provides any, or empty-but-correctly-shaped if not). Any step that
cannot be verified due to the known liquidity gap is marked as such, not skipped
silently.

---

## 5.4 — Base-URL swap test

**Goal:** the literal claim this whole project is built around — confirm it, don't
just assume Phase 1–4 added up to it.

**Method:** with zero code changes, flip only `VITE_API_BASE`/`VITE_WS_BASE` (and the
Vite proxy target if still in use for CORS — see the open item this raises in
§5.5) between the mock and the real backend, restart the frontend dev server, and
re-run a short smoke path (signup → join → balance → place order → exit) against
both without touching any `.ts`/`.tsx` file in between.

**Acceptance:** the smoke path completes against both backends with no code edits
in between. This is the single pass/fail criterion for the entire integration
project's stated goal.

---

## 5.5 — Gap log and sign-off

**Goal:** one place that lists everything Stage 5.1–5.4 found that isn't a clean
pass, so nothing is lost after this phase closes.

**Deliverable:** a "Gap log" section appended to `BACKEND-INTEGRATION-PLAN.md` (not
a new file — this is explicitly a closing-out of that plan, so it belongs with it),
listing: anything from §5.1 marked "gap found," the CORS/Vite-proxy production
question (still open — `BACKEND-INTEGRATION-PLAN.md` §4 flagged it as a temporary
dev workaround needing a real fix before any non-proxied deployment, and this is
the phase where that either gets scheduled as follow-up work or explicitly
re-flagged as still outstanding), the `localStorage` per-account-namespacing
question raised in Phase 4 Stage 4.5, and the still-parked multi-country routing
design.

**Acceptance:** `BACKEND-INTEGRATION-PLAN.md` is updated with this gap log and
with every stage-plan doc (Phases 1–5) marked as landed in its own status line, so
the five phase docs plus the parent plan together are a complete, accurate record of
what this integration project did and what remains — the explicit goal stated for
this whole planning exercise.

---

## Stage summary

| Stage | Output |
|---|---|
| 5.1 | Endpoint-by-endpoint parity checklist |
| 5.2 | Mock walkthrough sign-off |
| 5.3 | Real-backend walkthrough sign-off (liquidity-limited) |
| 5.4 | Base-URL swap proof |
| 5.5 | Gap log appended to `BACKEND-INTEGRATION-PLAN.md`; all phase docs marked landed |

## What Phase 5 explicitly does not do

- Does not fix every gap it finds inline — Stage 5.5 is explicitly a log-and-flag
  step for anything beyond this phase's scope (CORS/production, multi-country,
  liquidity-dependent behaviour).
- Does not attempt to add agent/liquidity simulation to the mock or chase the real
  backend's liquidity gap — both are out of scope per the parent plan's §4/§6.
