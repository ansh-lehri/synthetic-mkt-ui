# Phase 3 — Frontend Identity + Session Plumbing: Stage Plan

**Parent doc:** `BACKEND-INTEGRATION-PLAN.md` §5, Phase 3.
**Depends on:** `PHASE-2-MOCK-REWRITE-PLAN.md` fully landed on `main` (the combined
contract+mock PR from Phase 1/2's sequencing). The mock is now a correct target to
develop the frontend against.
**Status:** draft for review. Nothing in this plan has been implemented yet.
**Scope:** the identity/session *plumbing* only — the new Signup screen, the
account-bootstrap module, and the session module. Per-screen UI adaptation (Home,
Terminal, Record, Practice consuming this plumbing) is Phase 4, not this phase.

---

## 0. What's being replaced, precisely

Today, `frontend/src/lib/account.ts` reads a static `VITE_ACCOUNT_ID` env var
(Phase 2 decision, `CLAUDE.md`) — there is no signup, no identity call, no
`account_id` resolution at runtime. `useSessionFlow.ts` (Phase 3c) drives a single
`GET /v1/session` + `POST /session/*` model with one status/phase shape. Both are
being replaced: identity becomes a real runtime flow (email → `account_id`,
persisted so returning visits skip it), and session becomes the two-kind
canonical/on-demand model with two separate status vocabularies. This phase builds
both replacements as isolated, independently-tested modules — Phase 4 is where
screens are rewired to call them instead of the old ones.

---

## 3.1 — API client base layer confirmation

**Goal:** before writing new modules, confirm `frontend/src/api/config.ts`'s
base-URL-swap mechanism (`VITE_API_BASE`/`VITE_WS_BASE`) still holds under the new
contract — this is the one existing piece of plumbing this whole integration project
is restoring the truth of, so it's worth a dedicated, small first stage rather than
assuming it unchanged.

**Deliverable:** no code change expected; a short confirmation note (append to this
file's stage-summary table "done" column) that `api/config.ts` needs no changes, or a
small fix if the new contract's generated TS client expects a different base-path
convention than before.

**Test:** manually point `VITE_API_BASE` at the Phase-2 mock, then at
`http://localhost:5173` (the Vite proxy to the real backend, already configured in
`vite.config.ts`), and confirm a trivial unauthenticated call (`GET /v1/markets`)
succeeds against both with zero code difference.

---

## 3.2 — Identity / account-bootstrap module

**Goal:** replace `lib/account.ts`'s static env-var read with a real runtime flow.

**Deliverable:** `frontend/src/lib/identity.ts` — pure functions plus a thin
persistence wrapper:
- `getStoredAccountId(): string | null` / `storeAccountId(id)` — `localStorage`,
  same pattern as `lib/selectedMarket.ts` (Phase 4a).
- `openAccount(email): Promise<{account_id}>` — calls `POST /v1/account/open`
  (idempotent per Stage 2.1 of the mock plan — calling it twice for the same email
  is safe and expected, not an error path to guard against).
- Resolution order on app load: stored `account_id` first; if absent, the app is in
  "needs signup" state (Stage 3.3 renders the Signup screen); after a successful
  `openAccount`, store the result and never show Signup again on this device.

**Tests:** `identity.test.ts` (vitest, `node` env, pure-logic only per the project's
existing component-test convention) — resolution-order logic as a pure function
taking `(stored, hasSubmittedSignup)` → `'signup' | 'ready'`, so the branching is
unit-tested without needing a DOM.

---

## 3.3 — Signup screen (new)

**Goal:** the minimal screen specified: email field + submit button, nothing else,
shown only when no stored `account_id` exists.

**Deliverable:** `frontend/src/features/signup/SignupPage.tsx`. Per the explicit
instruction: just an email input and a submit button. The existing
"this is a simulation, no real money" disclaimer (`CLAUDE.md` design rules — "the
full disclaimer on signup and in the footer") still applies here since `CLAUDE.md`
names signup specifically as one of the two places it must appear; this is a design
rule already locked, not a scope addition by this plan.

**Wiring:** submit → `identity.openAccount(email)` → on success, store the
`account_id` and route to Home. No "account opening in background on Home" spinner at
this stage — that sequencing (open-account failure being non-blocking, retried
opportunistically on session-join) is Phase 4's Home-screen concern, since it's about
how Home *reacts* to identity state, not the Signup screen itself.

**Tests:** component is simple enough that a `/kit`-style manual browser check
(per the project's "components verified in browser, not jsdom" convention) is the
acceptance bar — same as every other screen so far. No new testing infra introduced.

---

## 3.4 — Session module (replaces the mock-shaped core of `useSessionFlow`)

**Goal:** canonical/on-demand mapping, replacing the single-session-shape calls in
`useSessionFlow.ts`.

**Deliverable:** `frontend/src/lib/sessionActions.ts` (new; `useSessionFlow.ts`
Phase 4 will consume this instead of calling the old single-shape endpoints
directly):
- `joinLive(user)` → `POST /session/canonical`.
- `startPractice(user, duration)` → `POST /session/ondemand?market=&duration=`
  (no `condition` sent — confirmed dropped per `BACKEND-INTEGRATION-PLAN.md` §4; the
  frontend's existing condition picker state stays local-only, read by Phase 4's
  Practice screen for display purposes only).
- `exitSession(sessionId)` → `POST /session/exit?session=`, with the documented
  on-demand-404-is-success handling baked in here (`isExitSuccess(status)` pure
  helper, unit-tested) so every caller gets this right once, not re-implemented per
  screen.

**Tests:** `sessionActions.test.ts` — `isExitSuccess` for `{200, 404}` → true,
anything else → false; request-shape assembly for both join/start calls (pure
builder functions, no network) asserted against the exact query-string/body shape
from `BACKEND-INTEGRATION-PLAN.md` §3.

---

## 3.5 — Session recovery + status polling

**Goal:** `POST /session/current` on load/refresh (no client-persisted
`session_id` needed, per the plan), and `GET /session/status?session=` polling while
`warming_up`.

**Deliverable:** `frontend/src/lib/sessionRecovery.ts`:
- `resolveCurrentSession(user)` → `POST /session/current`, mapping its
  `starting/active/stopping/ended/failed` vocabulary to an internal
  `CurrentSessionState` type.
- `pollStatus(sessionId)` → `GET /session/status`, mapping its separate
  `warming_up/ready/failed/ended` vocabulary to an internal `OnDemandStatus` type —
  **kept as a distinct type from `CurrentSessionState`**, matching the contract's
  (Phase 1 Stage 1.3) deliberate two-enum split. This is the single thing this stage
  must not get wrong, mirroring the same warning in the mock-rewrite plan.
- Used by Stage 3.2's `account.ts`-replacement Home-load sequencing
  (`BACKEND-INTEGRATION-PLAN.md` §3: resolve session state via `current` first, then
  call `balance` or `cash` accordingly) — this stage is what makes that sequencing
  possible; Phase 4 wires it into the actual Home screen.

**Tests:** `sessionRecovery.test.ts` — vocabulary-mapping functions as pure
unit tests (every enum value maps to something, no silent `undefined` fallthrough);
a test asserting the two mapped types are structurally distinct (e.g. a type-level
or runtime discriminant check) so a future refactor can't quietly merge them.

---

## 3.6 — Phase source adaptation (WS-only)

**Goal:** confirm/adjust `lib/session.ts` and `lib/marketClock.ts`
(Phase 3c/4a — "the UI runs the market clock itself", phase still comes from the
backend as a fallback) for the finding that **no session endpoint carries market
trading phase at all** on the real backend — phase is WS `snapshot.data.phase`
only, with a different 4-value vocabulary (`open`/`auction`/`closed`/`unknown`)
than the mock's old `preopen`/`open`/`closing`/`closed`.

**Deliverable:** `lib/session.ts`'s phase-mapping function updated to the new
4-value vocabulary (matching Phase 2 Stage 2.7's mock output, which now matches the
real backend); the existing "UI clock is primary, backend phase is fallback" design
(Phase 4a follow-up) is **not re-architected** — it already tolerates the backend
phase source changing shape, which is exactly why that design was chosen originally.
This stage confirms that tolerance holds, not a rewrite of the clock logic itself.

**Tests:** existing `lib/session.test.ts`/`liveCard.test.ts` phase-mapping cases
updated to the new vocabulary; a regression test confirming `closing` (no longer a
server-sent phase) is now purely derived from the clock's "last N minutes before
`closes_at`" rule, never read off the wire.

---

## 3.7 — Pure-logic test sweep

**Goal:** close out the phase with the same discipline as every prior phase in this
project — every new module above is pure-logic-tested per the project's existing
`node`-environment vitest convention (no DOM needed since nothing here renders).

**Acceptance:** `cd frontend && npm test` green, covering `identity.ts`,
`sessionActions.ts`, `sessionRecovery.ts`, and the updated `session.ts` mapping —
each new/changed pure function from 3.2–3.6 has at least one test.

---

## 3.8 — Manual browser verification against the Phase-2 mock

**Goal:** prove the plumbing works end-to-end before Phase 4 builds screens on top
of it — per `CLAUDE.md`'s standing rule to self-verify against a running mock before
calling anything done.

**Steps:** a throwaway harness page (or temporarily wiring Signup + a bare "join/
start/exit" button set into `App.tsx`'s smoke-harness slot, consistent with how
`App.tsx` was used in Phase 0) exercises: fresh browser (no stored `account_id`) →
Signup → `account_id` stored → `session/current` resolves "none" → join canonical →
`balance` succeeds → exit → `cash` succeeds again. Reload the page mid-session and
confirm recovery (`session/current`) finds the live session without re-signup.

**Acceptance:** the sequence above completes with no console errors against
`make mock` (Phase 2's rewritten mock). This is the gate before Phase 4 starts.

---

## Stage summary

| Stage | Output | Depends on |
|---|---|---|
| 3.1 | Base-URL confirmation | Phase 2 mock on `main` |
| 3.2 | `lib/identity.ts` | 3.1 |
| 3.3 | Signup screen | 3.2 |
| 3.4 | `lib/sessionActions.ts` | 3.1 |
| 3.5 | `lib/sessionRecovery.ts` | 3.4 |
| 3.6 | Phase-source vocabulary update | 3.5 |
| 3.7 | Test sweep | 3.2–3.6 |
| 3.8 | Manual verification harness | 3.7 |

## What Phase 3 explicitly does not do

- No Home/Terminal/Record/Practice screen rewiring (Phase 4) — Signup is the only
  new screen; everything else here is a module, not a page.
- No removal of the old `useSessionFlow.ts`/`lib/account.ts` code — Phase 4 retires
  them screen-by-screen as each is rewired, so both old and new modules coexist
  briefly by design, not by oversight.
- No multi-country handling (still parked).
