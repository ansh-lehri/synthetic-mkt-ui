// Session/reference axis (PROVISIONAL contract): which session the account is in, and the
// join / start / exit actions. One account is in at most ONE session at a time; a second
// join or start is `409 {reason:"already_in_session"}` until the account exits.
import { useQuery } from '@tanstack/react-query'
import { apiGet, apiPost } from './client'
import type { ActiveSession, ExitSessionResponse, PracticeCondition, PracticeLength, SessionState } from './types'

/** The bar's clock and phase come from this poll, so it ticks at the observation cadence. */
export const SESSION_POLL_MS = 1000

export const sessionKey = (accountId: string) => ['session', accountId] as const

export function getSession(accountId: string) {
  return apiGet<SessionState>('/v1/session', { account_id: accountId })
}

/** `GET /v1/session`: `data.active` is the session, or `null` when the account is in none. */
export function useSession(accountId: string) {
  return useQuery({ queryKey: sessionKey(accountId), queryFn: () => getSession(accountId), refetchInterval: SESSION_POLL_MS })
}

export function joinLive(accountId: string, market: string) {
  return apiPost<ActiveSession>('/v1/session/live/join', { account_id: accountId, market })
}

export function startPractice(accountId: string, market: string, condition: PracticeCondition, lengthMinutes: PracticeLength) {
  return apiPost<ActiveSession>('/v1/session/practice/start', {
    account_id: accountId, market, condition, length_minutes: lengthMinutes,
  })
}

/** Idempotent: exiting with no session is still ok. */
export function exitSession(accountId: string) {
  return apiPost<ExitSessionResponse>('/v1/session/exit', { account_id: accountId })
}
