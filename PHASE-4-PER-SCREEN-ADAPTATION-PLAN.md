# Phase 4 — Per-Screen Adaptation: Stage Plan

**Parent doc:** `BACKEND-INTEGRATION-PLAN.md` §5, Phase 4.
**Depends on:** `PHASE-3-FRONTEND-IDENTITY-SESSION-PLAN.md` fully landed — the
identity/session modules exist and are verified against the Phase-2 mock; this phase
rewires each existing screen to call them instead of the old mock-shaped code.
**Status:** draft for review. Nothing in this plan has been implemented yet.
**Scope:** Home, Terminal, Record, Practice — one screen per stage, each its own PR,
per the project's standing "one screen / one slice = one PR" rule (`CLAUDE.md`). This
phase is where that rule resumes applying normally, since Phases 1–3 were
necessarily combined/sequenced differently.

---

## 0. Staging order and why

Home is first because it owns the identity bootstrap (Signup → account_id) and the
balance/cash sequencing that every other screen either depends on or must not
re-implement. Terminal is second because its session bar + phase logic is the
biggest single piece of surface area touched. Practice is third because it is a
thin screen whose only real change is "stop sending `condition`" plus consuming the
new session module. Record is last because it is the least coupled to session
state — only its account-identity source changes, nothing about its data shape.

---

## 4.1 — Home screen

**Goal:** wire Signup/identity bootstrap, correct balance/cash sequencing, and the
live-card/practice-card session actions onto the Phase 3 modules.

**Changes to `frontend/src/features/home/`:**
- On load: `lib/identity.ts`'s resolution (Stage 3.2) decides Signup vs. Home. No
  stored `account_id` → render Signup (Stage 3.3) first; the rest of Home's load
  (markets, instruments) does not start until identity resolves, per the user's
  stated flow — but a *failed* `account/open` is non-blocking: the user still
  reaches Home, and the account-open retry happens opportunistically on the next
  session-join attempt (this exact non-blocking behaviour was explicitly specified
  earlier in this project's planning and must not be re-litigated into "block until
  it succeeds").
- Balance/cash sequencing exactly as locked in `BACKEND-INTEGRATION-PLAN.md` §3: resolve
  session state via `sessionRecovery.resolveCurrentSession` (Stage 3.5) first, then
  `GET /v1/account/balance` if active or `GET /v1/account/cash` if not — never both,
  never a blind guaranteed-409 call. This replaces the old 4a-era "balance/
  observation needs a session, show '—' otherwise" placeholder logic with the real
  two-endpoint flow.
- "Join live" / "Start practice" buttons call `lib/sessionActions.ts` (Stage 3.4)
  instead of the old `useSessionFlow.enter`. The one-session "Leave X to join Y?"
  confirm flow (`features/session/SwitchConfirm.tsx`, Phase 3c/4b) is preserved as-is
  — it already operates on session *state*, not on the old session *shape*, so it
  needs no logic change, only to call the new action functions.
- Low-balance strip (`below_minimum_balance` 422 reason, Phase 4a) — confirm this
  reason tag still applies on the real on-demand `/session/ondemand` rejection path
  (`insufficient_funds` per the real contract per Stage 2.4) and rename the frontend's
  handling if the tag differs; do not assume it carried over unchanged.

**Tests:** `lib/liveCard.ts`/`home`-local pure helpers already have unit tests
(Phase 4a) — extend them only where the balance/cash branching logic (now genuinely
branching, not falling back on 409) needs a new pure function to unit-test
(`chooseBalanceEndpoint(sessionState)` or similar). Manual browser verification:
fresh signup → Home loads → balance shows via `cash` → join live → balance now shows
via `balance` → exit → reload → recovery still shows correct state.

---

## 4.2 — Terminal screen

**Goal:** `SessionBar`, phase logic, and the enter/exit session flow consume the
Phase 3 session module; order ticket / observation polling are otherwise untouched
(they don't change shape under this integration — confirm via Stage 2.6's "no order
mechanics changed" finding).

**Changes to `frontend/src/features/terminal/`:**
- `useSessionFlow.ts` — the mock-shaped core (direct `GET /v1/session`/
  `POST /session/*` calls) is retired; it now calls `lib/sessionActions.ts` +
  `lib/sessionRecovery.ts` instead. Its public interface (what `EnterSession.tsx`
  and `SessionBar` consume) stays the same shape where possible, so those components
  need minimal changes — this stage is explicitly scoped to keep the
  component-facing interface stable and only replace what's underneath it.
- Phase source: per Stage 3.6, the Terminal's chart/session-bar phase comes from WS
  `snapshot.data.phase` only (new 4-value vocabulary), with the UI clock as primary
  display and backend phase as fallback — this is a continuation of the existing
  Phase 3c/4a design, not a new one, so `SessionBar`'s glyph/word mapping
  (○ Pre-open ● Open ◆ Closing ■ Closed) needs its *source* enum updated but not its
  visual design.
- WS connection becomes session-scoped (`GET /v1/ws?session=`) per Phase 2 Stage
  2.7 — `lib/ws.ts`'s `MarketSocket` needs the session_id threaded into its connect
  call; the existing reconnect/rehydrate/epoch-bump logic (Phase 3a) is otherwise
  unchanged, since it operates on "resubscribe everything on `connected`", which
  still holds regardless of how the socket authenticated.

**Tests:** existing Terminal pure-logic tests (`orderFlow.ts`, `session.ts`,
`capabilities.ts`) re-run — acceptance is that order-flow/capability tests need no
changes (proving the order half is genuinely untouched), while session/phase tests
get updated to the new vocabulary (continuation of Stage 3.6's test updates, applied
here at the component-wiring level). Manual verification: join live → chart ticks →
place a limit order → observation poll shows working → exit → session bar reflects
"not in a session" → re-enter.

---

## 4.3 — Practice screen

**Goal:** stop sending `condition` on the wire; consume the new session module for
Start.

**Changes to `frontend/src/features/practice/PracticePage.tsx`:**
- Condition/length radio cards stay exactly as designed (Phase 4b) — they remain
  frontend-only state. Start now calls `lib/sessionActions.startPractice(user,
  duration)` (Stage 3.4) with no `condition` field sent, confirming the dropped-field
  decision from `BACKEND-INTEGRATION-PLAN.md` §4 is actually implemented, not just
  documented.
- The "Starting your practice session…" full-page spinner (Phase 4b, no Cancel)
  continues to represent the on-demand `warming_up` → `ready` transition (Stage 2.2/
  3.5), which is a slower, real warm-up now rather than the mock's old instant
  practice-ledger creation — confirm the spinner's copy ("India, Whipsaw, 75 min")
  still reads correctly when the wait is a few real seconds of warm-up rather than
  instantaneous.
- Below-minimum-balance handling: confirm against Stage 4.1's finding on the real
  rejection tag (`insufficient_funds` vs. the mock's old `below_minimum_balance`) and
  update the reason-text mapping if it changed.

**Tests:** `lib/session.ts`'s `PRACTICE_CONDITIONS` and length-validation pure logic
unchanged (still frontend-only); manual verification: Start practice → warm-up
spinner → routes to Terminal in practice mode → exit ends for good (no rejoin
offered), matching the existing Phase 4b copy.

---

## 4.4 — Record screen

**Goal:** the smallest-touch screen — only its account-identity source changes.

**Changes to `frontend/src/features/record/` and `frontend/src/lib/account.ts`:**
- `lib/account.ts`'s `VITE_ACCOUNT_ID` env-var read is retired in favour of
  `lib/identity.ts`'s resolved `account_id` (Stage 3.2) — this is the one change.
  `/trades`, `/pnl`, `/costs`, `/costs/summary` are durable reads needing no session
  (confirmed unchanged in Phase 2 Stage 2.5/2.8), so nothing about pagination, date
  filtering, or the cost-label mapping (`labels.ts`) changes.
- Confirm `country=US` → `501` and non-`IN`/`US` → `400` behaviour is unchanged on
  the real backend (Phase 2 Stage 2.5 should have confirmed this already; this stage
  is where the frontend's existing honest-501-handling, Phase 2 design, gets a final
  check against the real backend/mock rather than assumed carried over).

**Tests:** existing Record tests (date-range/`range.ts`, paging) need no logic
changes — acceptance for this stage is explicitly "no test changes needed beyond the
account-id source," proving the isolation claim. Manual verification: Record screen
loads trade history for the signed-up account's `account_id`, not a hardcoded demo
account.

---

## 4.5 — Cross-screen regression pass

**Goal:** after four independent screen PRs land, one pass confirming they still
agree with each other (shared state: identity, selected market, theme) now that
they've each been touched separately.

**Steps:** full click-through — fresh browser → Signup → Home (balance correct) →
Join live → Terminal (session bar, chart, order ticket all correct) → exit → Start
practice from Home → Terminal (practice mode) → exit → Record (trade history for the
same account across both the live attempt and practice, correctly separated per the
existing "practice is not recorded" rule). Theme toggle and market-dropdown
selection (Phase 4a `lib/selectedMarket.ts`) checked at each step for persistence
across the now-real identity flow (previously these were tested with a static
account; confirm they still persist correctly keyed on `localStorage`, not on
`account_id`, so switching accounts — if that ever happens on the same device —
doesn't leak another account's theme/market choice; flag if the current
`localStorage` keys would need namespacing per account, as an open item rather than
silently fixing scope not asked for).

**Acceptance:** full click-through with no console errors, against `make mock`
(Phase 2's rewritten mock). This stage is the gate before Phase 5.

---

## Stage summary

| Stage | Output | PR boundary |
|---|---|---|
| 4.1 | Home: identity bootstrap + balance/cash sequencing | One PR |
| 4.2 | Terminal: session module + WS session-scoping | One PR |
| 4.3 | Practice: drop `condition`, consume session module | One PR |
| 4.4 | Record: account-id source swap only | One PR |
| 4.5 | Cross-screen regression pass | No code — a verification checkpoint |

## What Phase 4 explicitly does not do

- No contract or mock changes (those are done, Phases 1/2).
- No redesign of any screen's layout/visuals — every change here is data-plumbing,
  per the existing "faithful port of the board" design rule.
- No multi-country handling (still parked).
- Does not resolve the `localStorage` per-account-namespacing question raised in
  Stage 4.5 — flagged as an open item, not fixed inline.
