// Session recovery: POST /session/current (resolve-by-identity, no client-persisted
// session_id needed) and GET /session/status (resolve-by-session-id, polled while
// warming up). The two carry DIFFERENT status vocabularies for the SAME underlying
// states — kept as two distinct types here on purpose, mirroring the deliberate split
// in contract/openapi.yaml, so a future refactor can't quietly merge them.
import { apiGet, apiPost, ApiError } from '../api/client'
import type { SessionCurrentRequest, SessionCurrentResponse, SessionStatusBody } from '../api/types'

export type CurrentSessionState =
  | { kind: 'none' }
  | {
      kind: 'found'
      sessionId: string
      mode: SessionCurrentResponse['mode']
      market: string
      status: SessionCurrentResponse['status']
      /** RFC3339Nano instant. Populated only when mode=="ondemand" — canonical sessions
       * never carry an end timer to the frontend at this door. */
      sessionEndsAt?: string
      /** RFC3339Nano instant when the on-demand warmup period ends (= session open for trading).
       * Populated only when mode=="ondemand". */
      warmupEndsAt?: string
    }

/** POST /session/current. A 404 ("no session for user") maps to `{kind:'none'}`, not an error. */
export async function resolveCurrentSession(userId: string): Promise<CurrentSessionState> {
  const body: SessionCurrentRequest = { user: { user_id: userId } }
  try {
    const res = await apiPost<SessionCurrentResponse>('/session/current', body)
    return {
      kind: 'found',
      sessionId: res.session_id,
      mode: res.mode,
      market: res.market,
      status: res.status,
      sessionEndsAt: res.session_ends_at ?? undefined,
      warmupEndsAt: res.warmup_ends_at ?? undefined,
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return { kind: 'none' }
    throw err
  }
}

export type OnDemandStatus = { kind: 'not_found' } | { kind: 'status'; label: SessionStatusBody['status']; reason?: string }

/** GET /session/status?session=. A 404 ("unknown session") maps to `{kind:'not_found'}`. */
export async function pollStatus(sessionId: string): Promise<OnDemandStatus> {
  try {
    const res = await apiGet<SessionStatusBody>('/session/status', { session: sessionId })
    return { kind: 'status', label: res.status, reason: res.reason ?? undefined }
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return { kind: 'not_found' }
    throw err
  }
}

/**
 * Home-load sequencing (BACKEND-INTEGRATION-PLAN.md §3, locked): once session state is
 * known via resolveCurrentSession, call `balance` only if a session is active or `cash`
 * only if not — never both, never a blind guaranteed-409 call.
 */
export function chooseBalanceEndpoint(session: CurrentSessionState): 'balance' | 'cash' {
  return session.kind === 'found' ? 'balance' : 'cash'
}
