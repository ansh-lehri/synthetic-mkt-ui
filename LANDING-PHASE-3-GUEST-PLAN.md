# Landing Phase 3 — Guest Session Flow

> "Try a session free" actually works. A visitor mints a guest identity, gets taken to the
> app's home screen, and can start N Practice sessions with no signup. The count is tracked
> server-side. The app home adapts for guest users (no Live, quota shown). Consume is
> gated at Practice start, not at the landing CTA click.

---

## What ships at the end of this phase

- Two new backend endpoints (`GET /api/guest/quota`, `POST /api/guest/consume`) in both
  `market-simulator` and `mock/`.
- `guest_free_sessions` Postgres table.
- `lib/guestIdentity.ts` — mint/persist guest_<uuid>, derive credentials, detect guests.
- Landing CTA "Try a session free": mints guest identity → calls `/v1/account/open` →
  stores credentials → navigates to `/app`.
- App home screen (`/app`): detects guest, shows quota, disables Live.

---

## Guest identity design

A guest is just a user with a special email. The existing identity system (`lib/identity.ts`)
stores `identity.accountId` and `identity.email`. A guest's credentials are:

```
guest_id  = "guest_" + crypto.randomUUID()   // e.g. guest_4f3a1...
email     = guest_id + "@guest.invalid"       // guest_4f3a1...@guest.invalid
user_id   = guest_id                          // what /v1/account/open receives
```

`.invalid` is an IANA reserved domain — never a real inbox. The real backend's
`EnsureAccount` already accepts `.*@.*` so no backend change is needed for account
creation.

After the landing CTA flow, the guest has a real `account_id` stored in localStorage
alongside their `identity.email`. Every existing app screen that reads `requireAccountId()`
and `requireEmail()` works transparently — they just see a guest email.

**Guest detection**: `isGuestEmail(email: string): boolean` = `email.endsWith('@guest.invalid')`.

**localStorage key for the guest raw ID**: `blindside_guest_id` (separate from
`identity.accountId` — the guest ID is needed to call the quota/consume endpoints; the
account_id is the broker's opaque handle and won't work there).

---

## Stage 3a — Backend: market-simulator

### Migration

`market-simulator/migrations/0006_create_guest_free_sessions.sql`

```sql
CREATE TABLE guest_free_sessions (
  guest_id    TEXT         PRIMARY KEY,   -- 'guest_<uuid>'
  used        INT          NOT NULL DEFAULT 0,
  first_seen  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_used   TIMESTAMPTZ
);
```

### Handler: `conductor/http_guest.go`

**`GET /api/guest/quota?guest_id=<id>`**

- Validates `guest_id` non-empty and starts with `guest_` prefix.
- Reads from `guest_free_sessions` (or treats as `{used:0}` if no row yet).
- Response: `200 {"guest_id":"...","used":1,"limit":3,"can_start":true}`

**`POST /api/guest/consume`**

Body: `{"guest_id": "guest_..."}`

Atomic SQL (one statement, no separate read):
```sql
INSERT INTO guest_free_sessions (guest_id, used, last_used)
VALUES ($1, 1, now())
ON CONFLICT (guest_id) DO UPDATE
  SET used      = guest_free_sessions.used + 1,
      last_used = now()
  WHERE guest_free_sessions.used < $2
RETURNING used;
```

- `$2` = `FREE_SESSION_LIMIT` (config constant = 3).
- If the `INSERT/UPDATE` returns a row → allowed. Respond `200 {"allowed":true,"used":<n>,"limit":3}`.
- If no row returned (used was already at limit, WHERE clause fails) → Respond `409 {"allowed":false,"used":<limit>,"limit":3}`.
- Invalid `guest_id` (empty / missing prefix) → `400 {"error":"invalid_guest_id"}`.

Config constant `FREE_SESSION_LIMIT = 3` lives in `conductor/config.go` (or a new
`conductor/http_guest.go` constant — doesn't leave a server boundary so it's fine either way;
choose `config.go` for consistency with the other tunables).

Register both routes in `conductor/http_endpoints.go`.

---

## Stage 3b — Backend: mock server

`mock/internal/guest/guest.go` — in-memory per-guest counter.

```go
type Store struct {
  mu    sync.Mutex
  rows  map[string]int  // guest_id -> used count
  limit int
}

func NewStore(limit int) *Store { ... }

// Quota reads (or creates) the count for a guest.
func (s *Store) Quota(guestID string) (used, limit int, canStart bool)

// Consume atomically increments if under limit. Returns (allowed bool, used int).
func (s *Store) Consume(guestID string) (allowed bool, used int)
```

The `Consume` method must hold the lock for the full check-and-increment — no TOCTOU.

Wire in `mock/cmd/mockserver/main.go`:
```
GET  /api/guest/quota    → guest.Store.HandleQuota
POST /api/guest/consume  → guest.Store.HandleConsume
```

### Mock tests

`mock/cmd/mockserver/guest_test.go`:
- First consume → 200, used=1
- Consume twice → 200, used=2
- Consume at limit → 409, allowed=false
- Rapid parallel consumes (N goroutines, each consume once, assert used never exceeds N)
- Quota with no prior row → 200, used=0, can_start=true
- Quota after consume → used reflects current count

---

## Stage 3c — Frontend: `lib/guestIdentity.ts`

```ts
const GUEST_LS_KEY = 'blindside_guest_id'
const GUEST_EMAIL_DOMAIN = 'guest.invalid'

/** Mint or load a persistent guest ID for this device. */
export function mintOrLoadGuestId(): string {
  try {
    const stored = localStorage.getItem(GUEST_LS_KEY)
    if (stored) return stored
    const fresh = 'guest_' + crypto.randomUUID()
    localStorage.setItem(GUEST_LS_KEY, fresh)
    return fresh
  } catch {
    // Storage blocked (private mode) — in-memory id for this page session only.
    return 'guest_' + crypto.randomUUID()
  }
}

/** Get stored guest ID without minting. Returns null if none. */
export function getStoredGuestId(): string | null {
  try { return localStorage.getItem(GUEST_LS_KEY) } catch { return null }
}

export function guestEmail(guestId: string): string {
  return `${guestId}@${GUEST_EMAIL_DOMAIN}`
}

export function isGuestEmail(email: string): boolean {
  return email.endsWith(`@${GUEST_EMAIL_DOMAIN}`)
}
```

---

## Stage 3d — Frontend: `api/landing.ts` additions

Add to the existing `landing.ts`:

```ts
export interface GuestQuotaResponse {
  guest_id: string
  used: number
  limit: number
  can_start: boolean
}

export async function getGuestQuota(guestId: string): Promise<GuestQuotaResponse> {
  const base = import.meta.env.VITE_API_BASE ?? ''
  const res = await fetch(`${base}/api/guest/quota?guest_id=${encodeURIComponent(guestId)}`)
  if (!res.ok) throw new Error(`quota ${res.status}`)
  return res.json() as Promise<GuestQuotaResponse>
}

export interface GuestConsumeResponse {
  allowed: boolean
  used: number
  limit: number
}

export async function postGuestConsume(guestId: string): Promise<GuestConsumeResponse> {
  const base = import.meta.env.VITE_API_BASE ?? ''
  const res = await fetch(`${base}/api/guest/consume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guest_id: guestId }),
  })
  const body = await res.json() as GuestConsumeResponse
  return body  // caller checks body.allowed; 409 still has a parseable body
}
```

---

## Stage 3e — Landing CTA: "Try a session free"

`LandingPage.tsx` — wire the primary CTA button.

**Flow when clicked:**

1. Mint/load guest ID (`mintOrLoadGuestId()`).
2. Derive email = `guestEmail(guestId)`.
3. Call `POST /v1/account/open` with `{ user: { email, user_id: guestId } }`.
   - Reuse `openAccount(email)` from `lib/identity.ts` — it already constructs the right body.
4. Store `account_id` → `storeAccountId(account_id)`.
5. Store email → `storeEmail(email)`.
6. Navigate to `/app`.

**While in-flight** (between click and `/app` redirect):
- Button shows a loading state ("Starting…") and is disabled.
- If step 3 fails (network error / 5xx): show an inline error near the button — "Something
  went wrong. Try again." — and re-enable the button.

**Optional quota display near the CTA:**

On landing load, if `getStoredGuestId()` returns a non-null value (returning visitor):
- Call `GET /api/guest/quota` quietly (no loading state shown; fire-and-forget).
- If `can_start: true` and `used > 0`: show "(`N` free left)" in small mono text next to
  the CTA.
- If `can_start: false`: change the primary CTA label to "Register for early access" and
  skip the account-open flow — open `RegisterModal` with `source='free_limit_wall'`
  instead.
- If the quota call fails: no change to the CTA (degrade gracefully, let them try and
  hit the consume gate in Phase 4).

Note: consume is NOT called here — it is called at Practice start on the `/app` home
screen (Phase 4). The quota display is purely informational. A visitor with a fresh
device has no stored guest ID and sees no quota indicator at all.

---

## Stage 3f — App home guest treatment

`frontend/src/features/home/HomePage.tsx`

**Detect guest**

```ts
import { isGuestEmail } from '../../lib/guestIdentity'
const email = getStoredEmail()
const isGuest = email ? isGuestEmail(email) : false
const guestId = isGuest ? getStoredGuestId() : null
```

**Quota hook** (only fires when `isGuest && guestId`)

```ts
const guestQuotaQ = useQuery({
  queryKey: ['guest-quota', guestId],
  queryFn: () => getGuestQuota(guestId!),
  enabled: !!guestId,
  refetchInterval: false,   // one-shot on mount; re-fetched after consume (Phase 4)
  staleTime: 30_000,
})
const quota = guestId ? guestQuotaQ.data : undefined
```

**Live session card — disable for guests**

Regardless of quota, guests NEVER see Live enabled. On the "Join live session" card:
- Button disabled: `aria-disabled` with reason tooltip "Guests can only start Practice
  sessions. Register for full access."
- Or: hide the Live card entirely and show a single-column Practice card — whichever
  matches the board design. If the board shows the card, keep it visible but disabled.

**Practice card — quota-aware state**

| `can_start` | `used` | State shown |
|---|---|---|
| `true`, `used === 0` | fresh guest | Normal — "Start practice" enabled |
| `true`, `used > 0` | returning guest, sessions left | "Start practice" enabled + "(`limit - used` sessions left)" note |
| `false` | at limit | "Start practice" disabled + "You've used your free sessions" + "Register for early access" inline CTA |
| quota load error | — | Normal — degrade gracefully (consume will gate in Phase 4) |

**Phase 3 note**: In this phase, clicking "Start practice" does NOT yet call `consume` —
that is Phase 4. Phase 3 only wires the display and the identity. The Practice flow
proceeds as today (the existing `useSessionFlow.enter({kind:'practice',...})` path).

---

## Acceptance criteria

- [ ] First visit to the landing with no stored guest ID: no quota indicator shown near the
  CTA; clicking CTA mints a `blindside_guest_id` in localStorage.
- [ ] CTA click calls `/v1/account/open` with `guest_<uuid>@guest.invalid` and stores the
  returned `account_id` and email.
- [ ] After CTA click, browser navigates to `/app`.
- [ ] `/app` home screen shows the guest Live card disabled with a reason.
- [ ] Returning guest (stored guest ID): landing shows "X sessions left" if `can_start=true`
  and `used > 0`.
- [ ] Returning guest at limit: CTA changes to register form.
- [ ] Backend: `GET /api/guest/quota` and `POST /api/guest/consume` respond correctly.
- [ ] Atomic consume: parallel requests from the same guest_id never push `used` above
  `FREE_SESSION_LIMIT` (verified by mock parallel test).
- [ ] Mock tests pass: `cd mock && go test ./... -race`.
- [ ] `npm test` still green.

---

## Files created / changed summary

| File | Type |
|------|------|
| `market-simulator/migrations/0006_create_guest_free_sessions.sql` | new |
| `market-simulator/conductor/http_guest.go` | new |
| `market-simulator/conductor/http_endpoints.go` | modified |
| `mock/internal/guest/guest.go` | new |
| `mock/cmd/mockserver/main.go` | modified |
| `mock/cmd/mockserver/guest_test.go` | new |
| `frontend/src/lib/guestIdentity.ts` | new |
| `frontend/src/api/landing.ts` | modified (add quota/consume) |
| `frontend/src/features/landing/LandingPage.tsx` | modified (wire CTA + optional quota display) |
| `frontend/src/features/home/HomePage.tsx` | modified (guest detection, Live gate, quota display) |
