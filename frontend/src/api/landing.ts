export interface EarlyAccessRequest {
  email: string
  experience: 'new' | 'some' | 'active'
  market: 'india' | 'us' | null
  source: string
}

export async function postEarlyAccess(req: EarlyAccessRequest): Promise<void> {
  const base = import.meta.env.VITE_API_BASE ?? ''
  const res = await fetch(`${base}/api/early-access/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (res.status === 201) return
  const body = await res.json().catch(() => ({}))
  throw Object.assign(new Error(body.error ?? 'unknown'), { status: res.status })
}

// ---- Guest free-session quota ----

export interface GuestQuota {
  used: number
  limit: number
  remaining: number
}

/** GET /api/guest/quota — returns the current free-session quota for a guest ID. */
export async function getGuestQuota(guestId: string): Promise<GuestQuota> {
  const base = import.meta.env.VITE_API_BASE ?? ''
  const res = await fetch(`${base}/api/guest/quota?guest_id=${encodeURIComponent(guestId)}`)
  if (res.status === 200) return res.json() as Promise<GuestQuota>
  const body = await res.json().catch(() => ({}))
  throw Object.assign(new Error((body as { error?: string }).error ?? 'unknown'), { status: res.status })
}

/**
 * POST /api/guest/consume — atomically increments the used count for a guest
 * identity and returns the updated quota. Throws with `status: 409` when the
 * free-session limit has been reached.
 */
export async function postGuestConsume(guestId: string): Promise<GuestQuota> {
  const base = import.meta.env.VITE_API_BASE ?? ''
  const res = await fetch(`${base}/api/guest/consume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guest_id: guestId }),
  })
  if (res.status === 200) return res.json() as Promise<GuestQuota>
  const body = await res.json().catch(() => ({}))
  throw Object.assign(new Error((body as { error?: string }).error ?? 'unknown'), { status: res.status })
}
