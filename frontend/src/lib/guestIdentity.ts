// Guest identity: a browser-local "guest_<uuid>" that uniquely identifies an
// anonymous visitor. Used to track free-session consumption without requiring
// account creation. The email form "guest_<uuid>@guest.invalid" is handed to
// /v1/account/open so the same guest account is recovered on return visits.

const GUEST_ID_KEY = 'guest.guestId'

/**
 * Returns the stored guest ID if one exists, or mints a new one and stores it.
 * Callers should use this before any guest session flow.
 */
export function mintOrLoadGuestId(): string {
  try {
    const stored = localStorage.getItem(GUEST_ID_KEY)
    if (stored && stored.startsWith('guest_')) return stored
    const id = `guest_${crypto.randomUUID()}`
    localStorage.setItem(GUEST_ID_KEY, id)
    return id
  } catch {
    // localStorage unavailable (private mode, quota error): mint an ephemeral ID.
    return `guest_${crypto.randomUUID()}`
  }
}

/** Returns the stored guest ID, or null when no guest session has been started. */
export function getStoredGuestId(): string | null {
  try {
    const v = localStorage.getItem(GUEST_ID_KEY)
    return v && v.startsWith('guest_') ? v : null
  } catch {
    return null
  }
}

/** Converts a guest ID to the email form used by /v1/account/open. */
export function guestEmail(guestId: string): string {
  return `${guestId}@guest.invalid`
}

/** Returns true when an email looks like a guest-minted address. */
export function isGuestEmail(email: string): boolean {
  return email.endsWith('@guest.invalid')
}
