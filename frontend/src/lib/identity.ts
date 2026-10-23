// Identity / account bootstrap: POST /v1/account/open. Replaces the old lib/account.ts's
// static VITE_ACCOUNT_ID read (Phase 2-era, no-auth placeholder) with the real signup/login
// handshake. user_id is the email the user signs up/logs in with (confirmed decision —
// it can change later, but email is the identity key for now).
//
// Resolution rule (BACKEND-INTEGRATION-PLAN.md Phase 3): no stored account_id -> show
// Signup. After a successful open, the account_id is stored and Signup is never shown
// again on this device/browser.
import { useQuery } from '@tanstack/react-query'
import { apiGet, apiPost } from '../api/client'
import type { AccountOpenResponse, Cash } from '../api/types'

const STORAGE_KEY = 'identity.accountId'
// The real backend's EnsureAccount is keyed on the exact user_id string you give it — the
// account_id it returns is an opaque handle, not a second valid user_id. /session/canonical
// and /session/ondemand expect the ORIGINAL user_id (email) back, not the account_id, or
// they resolve to a different, invisible account. Both must be kept, each used in its own
// lane: email for session calls, account_id for every balance/order/position/trade read.
const EMAIL_STORAGE_KEY = 'identity.email'

/** The account_id from a previous successful signup/login, or null on a fresh browser. */
export function getStoredAccountId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null // storage unavailable (private mode, quota) — treat as "nothing stored"
  }
}

export function storeAccountId(accountId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, accountId)
  } catch {
    // storage unavailable: identity just won't persist across reloads this session
  }
}

/** The email (the real backend's user_id) from a previous successful signup/login. */
export function getStoredEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_STORAGE_KEY)
  } catch {
    return null
  }
}

export function storeEmail(email: string): void {
  try {
    localStorage.setItem(EMAIL_STORAGE_KEY, email)
  } catch {
    // storage unavailable: identity just won't persist across reloads this session
  }
}

/**
 * POST /v1/account/open. Idempotent on the real backend — the same user_id always
 * returns the same account_id, so calling this more than once (e.g. opportunistically
 * on a later session-join if the first signup's open failed) is always safe.
 */
export function openAccount(email: string): Promise<AccountOpenResponse> {
  return apiPost<AccountOpenResponse>('/v1/account/open', { user: { email, user_id: email } })
}

/**
 * GET /v1/account/cash — the real backend's pre-session money view (BACKEND-INTEGRATION-PLAN.md
 * §3). Use this when there is no live session; use GET /v1/account/balance once there is one.
 * NOT live-updated during a session, so callers must stop reading it the moment a session starts.
 */
export function getCash(accountId: string): Promise<Cash> {
  return apiGet<Cash>('/v1/account/cash', { account_id: accountId })
}

export function useCash(accountId: string, enabled: boolean) {
  return useQuery({ queryKey: ['cash', accountId], queryFn: () => getCash(accountId), enabled })
}

/** Clears the stored identity and sends the user back to Signup — the one place logout lives. */
export function logout(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(EMAIL_STORAGE_KEY)
  } catch {
    // storage unavailable — nothing to clear
  }
  window.location.assign('/signup')
}

export type IdentityScreen = 'signup' | 'ready'

/** Pure resolution: no stored account_id -> Signup; otherwise go straight to the app. */
export function resolveIdentityScreen(storedAccountId: string | null): IdentityScreen {
  return storedAccountId ? 'ready' : 'signup'
}

/**
 * Every screen that needs an account_id calls this first. No stored account yet ->
 * redirect to Signup and return null (the caller should render nothing in that case,
 * same pattern as the old lib/account.ts's single-purpose getAccountId()).
 */
export function requireAccountId(): string | null {
  const id = getStoredAccountId()
  if (!id) window.location.assign('/signup')
  return id
}

/**
 * Every screen that starts/joins/resolves a session (not just reads account data) also
 * needs the original email — session calls take user_id, not account_id (see the note by
 * EMAIL_STORAGE_KEY above). No stored email -> redirect to Signup and return null, same
 * pattern as requireAccountId.
 */
export function requireEmail(): string | null {
  const email = getStoredEmail()
  if (!email) window.location.assign('/signup')
  return email
}
