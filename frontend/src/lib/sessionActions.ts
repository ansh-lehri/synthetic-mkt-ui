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
 * POST /session/ondemand?market=&duration=. No `condition` field is sent — the scenario
 * picker is frontend-only state, never sent on this endpoint (BACKEND-INTEGRATION-PLAN.md
 * §4; the backend is building its own scenario-list endpoints separately). The money-floor
 * gate is a 200 with a DIFFERENT body shape, never a 409 — so this resolves to a
 * discriminated outcome instead of throwing on a gate rejection.
 */
export async function startPractice(userId: string, market: string, durationMinutes: number): Promise<OnDemandOutcome> {
  const body: OnDemandRequest = { user: { user_id: userId } }
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
 * A busy-account conflict on join/start. Unlike orders' {"reason":"no_session"} tag,
 * canonical/on-demand 409s use the plain {"error":"<message>"} envelope with no reason
 * tag (confirmed against the real backend's docs) — so this can only check the status,
 * not a reason string.
 */
export function isSessionConflict(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409
}
