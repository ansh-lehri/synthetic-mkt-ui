// Session actions: join / start / exit against the real canonical/on-demand endpoints.
// Replaces the mock-shaped single-session-shape calls in api/session.ts — screens are
// rewired onto this module in Phase 4 (BACKEND-INTEGRATION-PLAN.md), not here; this
// module is additive and independently tested.
import { apiPost, ApiError } from '../api/client'
import type {
  JoinCanonicalRequest,
  JoinCanonicalResponse,
  OnDemandInsufficientFundsBody,
  OnDemandRequest,
  OnDemandWarmingUpBody,
  PracticeCondition,
  SessionExitResponse,
} from '../api/types'

/** POST /session/canonical: join the always-on live market for `market`. A reconnect
 * (same account, same market, already active) returns the SAME session back — this is
 * the real backend's own idempotency, nothing to special-case client-side. */
export function joinLive(userId: string, market: string): Promise<JoinCanonicalResponse> {
  const body: JoinCanonicalRequest = { user: { user_id: userId }, market }
  return apiPost<JoinCanonicalResponse>('/session/canonical', body)
}

/** Pure builder (unit-tested): the exact query string /session/ondemand needs. */
export function ondemandPath(market: string, durationMinutes: number): string {
  return `/session/ondemand?market=${encodeURIComponent(market)}&duration=${durationMinutes}`
}

export type OnDemandOutcome =
  | { kind: 'warming_up'; body: OnDemandWarmingUpBody }
  | { kind: 'insufficient_funds'; body: OnDemandInsufficientFundsBody }

/**
 * POST /session/ondemand?market=&duration=. `condition` rides along as a documented no-op
 * ahead of backend support (BACKEND-INTEGRATION-PLAN.md §4/§6, contract/openapi.yaml's
 * PracticeCondition) — neither the mock nor the real backend reads it today; this is
 * forward wiring only, so turning it on later is a backend-only change. The money-floor
 * gate is a 200 with a DIFFERENT body shape, never a 409 — so this resolves to a
 * discriminated outcome instead of throwing on a gate rejection.
 */
export async function startPractice(userId: string, market: string, durationMinutes: number, condition?: PracticeCondition): Promise<OnDemandOutcome> {
  const body: OnDemandRequest = { user: { user_id: userId }, ...(condition ? { condition } : {}) }
  const res = await apiPost<OnDemandWarmingUpBody | OnDemandInsufficientFundsBody>(ondemandPath(market, durationMinutes), body)
  return res.status === 'insufficient_funds' ? { kind: 'insufficient_funds', body: res } : { kind: 'warming_up', body: res }
}

/** POST /session/exit?session=. */
export function exitSession(sessionId: string): Promise<SessionExitResponse> {
  return apiPost<SessionExitResponse>(`/session/exit?session=${encodeURIComponent(sessionId)}`, undefined)
}

/**
 * True for a 200 ("ended") or a 404 ("already reaped" — the real backend's documented,
 * deliberate on-demand asymmetry: a session the automatic reaper already closed answers
 * 404, not an idempotent 200). Every caller of exitSession must check outcomes through
 * this, not a bare `status === 200`.
 */
export function isExitSuccess(status: number): boolean {
  return status === 200 || status === 404
}

/**
 * A 409 that means the user already holds a session (ErrLiveElsewhere / ErrSessionAlreadyLive).
 * The real conductor emits reason:"session_conflict" for these cases. Falls back to a bare-409
 * match when reason is absent (older server builds / on-demand path).
 */
export function isSessionConflict(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 409) return false
  return !err.reason || err.reason === 'session_conflict'
}

/**
 * A 409 with reason:"market_not_live" — the canonical market spinup hasn't completed yet
 * even though the clock says it should be open. Not a session conflict; the user has no
 * session to switch from. Correct response: show a retry notice, not a switch prompt.
 */
export function isMarketNotLive(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && err.reason === 'market_not_live'
}
