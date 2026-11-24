# Landing Phase 4 — The Wall + Hardening

> Wire the consume gate at the actual Practice start. Over-limit opens the register modal
> (the "wall") instead of blocking the screen. Double-click safety and race protection.
> Verify all 13 acceptance criteria from the spec.

---

## What ships at the end of this phase

- `POST /api/guest/consume` is called exactly when a guest clicks "Start practice" —
  not before, not after.
- `409` from consume → `RegisterModal` opens with `source='free_limit_wall'` and a "You've
  used your free sessions" message above the form.
- Double-clicks never push `used` above `FREE_SESSION_LIMIT`.
- All 13 acceptance criteria in `docs/design/landingpage/BlindSide.md` verified.

---

## Stage 4a — Consume gate at Practice start

`frontend/src/features/home/HomePage.tsx`

The existing "Start practice" button calls `useSessionFlow.enter({kind:'practice',...})`.
For guests, insert the consume step before calling that:

```
Click "Start practice"
  → if not guest: existing flow (unchanged)
  → if guest:
      1. Disable the button (prevent double-click)
      2. POST /api/guest/consume
      3a. 200 + allowed=true  → existing Practice start flow
      3b. 200 + allowed=false → show wall (shouldn't happen — spec says 409 for over-limit,
                                  but guard it anyway)
      3c. 409 (allowed=false) → show wall (RegisterModal with source='free_limit_wall')
      3d. Network error / 5xx → show inline error "Something went wrong. Try again." —
                                  re-enable the button; do NOT retry automatically
```

**Implementation**

Add local state to the home screen's Practice card handling:

```ts
const [consumeBusy, setConsumeBusy] = useState(false)
const [wallOpen, setWallOpen] = useState(false)

const handleStartPractice = async (condition: PracticeCondition, length: PracticeLength) => {
  if (!isGuest || !guestId) {
    // non-guest: straight to the existing flow
    void session.enter({ kind: 'practice', condition, length })
    return
  }
  setConsumeBusy(true)
  try {
    const result = await postGuestConsume(guestId)
    if (!result.allowed) {
      // update quota cache so the UI immediately reflects "used up"
      queryClient.setQueryData(['guest-quota', guestId], {
        guest_id: guestId, used: result.used, limit: result.limit, can_start: false,
      })
      setWallOpen(true)
      return
    }
    // allowed: update quota cache and proceed
    queryClient.setQueryData(['guest-quota', guestId], {
      guest_id: guestId, used: result.used, limit: result.limit,
      can_start: result.used < result.limit,
    })
    void session.enter({ kind: 'practice', condition, length })
  } catch {
    // network / 5xx: show inline error, re-enable
    // set an error banner; setConsumeBusy(false) handled in finally
  } finally {
    setConsumeBusy(false)
  }
}
```

Pass `consumeBusy` as the `loading` / `disabled` prop to the "Start practice" button so a
second click while the first consume is in-flight does nothing.

**Spent-but-failed case** (spec accepted behaviour):
If `consume` returns 200 (allowed=true) but the subsequent `session.enter` fails, the
session count is spent. This is acceptable for the demo. Add a code comment noting this
accepted behaviour. Do NOT add a rollback call.

---

## Stage 4b — Over-limit wall (RegisterModal variant)

`frontend/src/features/landing/RegisterModal.tsx` — add `wallMessage` prop support.

The `wallMessage` prop was declared in Phase 2 as a future-use prop but left unused.
Now wire it:

```tsx
{wallMessage && (
  <div className="modal-wall-msg">
    <span>🚫</span> {/* or a lock icon */}
    <p>{wallMessage}</p>
  </div>
)}
```

When `source='free_limit_wall'`, `wallMessage` is set to:
"You've used all your free sessions. Register to get full access and we'll notify you
when we open."

**In `HomePage.tsx`:**

```tsx
<RegisterModal
  open={wallOpen}
  source="free_limit_wall"
  wallMessage="You've used all your free sessions. Register to get full access and we'll notify you when we open."
  onClose={() => setWallOpen(false)}
/>
```

The wall does NOT block the page — it is a modal over the normal home screen. The user
can close it with Esc or the close button. The "Start practice" button remains disabled
in the background (it will show "0 sessions left" state from the updated quota cache).

---

## Stage 4c — Edge cases and hardening

### Double-click / race
- The "Start practice" button is `disabled` / `aria-disabled` while `consumeBusy` is
  `true`. React re-renders synchronously before the async call returns so the button
  cannot fire twice.
- The mock test from Phase 3 already verifies server-side atomicity (N parallel consumes
  never exceed the limit). No additional client-side test needed for the race beyond
  the existing mock test.

### Returning over-limit guest on the landing
- Landing loads → `getStoredGuestId()` → `getGuestQuota()` → `can_start: false`.
- Primary CTA changes label to "Register for early access" and opens the modal directly
  (no account-open call). This was described in Phase 3 stage 3e — confirm it is wired.

### localStorage cleared mid-session
- New `blindside_guest_id` is minted on the next CTA click → fresh counter. The old
  account from the prior session's `identity.accountId` is also gone, so `/app` redirects
  to `/signup` anyway. Accepted bypass per spec.

### Incognito / storage blocked
- `mintOrLoadGuestId()` already falls back to an in-memory ID (Phase 3 3c).
- In-memory guest gets a real account (the call to `/v1/account/open` still works) and
  a server-side counter keyed on that in-memory ID.
- Closing the incognito tab and reopening: new guest ID, fresh count. Accepted per spec.

### "Try a session free" quota state on re-visit
- If a returning guest has `can_start: true` and `used > 0`, the landing shows the quota.
- After they start a session (consume fires in the app), the quota in TanStack Query cache
  is updated server-side; on next landing load the call reflects the new count.
- The landing quota call is best-effort (graceful on failure) — no retry.

---

## Stage 4d — Acceptance criteria verification

Work through all 13 items from `docs/design/landingpage/BlindSide.md`:

```
[ ] Landing page matches the sample on desktop and at ~360px; no horizontal scroll; the
    BlindSide favicon and nav logo show.

[ ] First visit mints and persists a blindside_guest_id; a reload reuses the same id.

[ ] "Try a session free" starts a Practice session for a fresh guest and increments
    used by exactly 1.

[ ] After N sessions, "Try a session free" returns 409 and the register wall appears
    instead of a session.

[ ] Rapid double-clicks never push used above N (atomic consume holds).

[ ] Guests are never offered a Live session.

[ ] Clearing localStorage yields a fresh guest with a reset count (documented, accepted).

[ ] Registration writes a row to early_access_registrations with email, experience,
    market, source.

[ ] Submitting the same email twice does not error the user and does not create a
    duplicate row.

[ ] Register form blocks submit until email + experience are valid.

[ ] No secret/limit logic is enforced only on the client.
    (FREE_SESSION_LIMIT lives only in the server; the client never hard-codes 3.)

[ ] All mock tests pass: cd mock && go test ./... -race

[ ] npm test still green; no TS or PostCSS errors
```

---

## Files changed summary

| File | Type |
|------|------|
| `frontend/src/features/home/HomePage.tsx` | modified (consume gate, wall open state) |
| `frontend/src/features/landing/RegisterModal.tsx` | modified (wallMessage rendering) |
| `frontend/src/features/landing/LandingPage.tsx` | modified (confirm over-limit CTA path from 3e) |

No new files in this phase — all behaviour is wired into existing components.

---

## Notes on build order

Stages within this phase are strictly sequential:

1. 4a must land before 4b (wall only opens from consume logic).
2. 4c is a review/verification pass — no new code beyond guard comments.
3. 4d is the manual acceptance-criteria walkthrough.

If 4a is complete and 4b/4c slip to a later fix, the guest flow still works — they just
see an error state instead of the register wall when the limit is hit. Ship 4a first.
