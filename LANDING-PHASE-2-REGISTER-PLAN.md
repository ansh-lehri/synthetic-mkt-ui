# Landing Phase 2 — Register Form

> Capture early-tester leads. The "Register as early tester" buttons in the nav, hero, and
> footer open a modal form. Submission writes a row to `early_access_registrations`.
> The register flow is the most important early outcome — do this before the guest session
> flow (Phase 3).

---

## What ships at the end of this phase

- `POST /api/early-access/register` endpoint running in both `market-simulator` (real
  backend) and the `mock/` server.
- `early_access_registrations` Postgres table (migration).
- A modal `RegisterModal` component wired to all three "Register as early tester" buttons
  on the landing page, each tagged with its source location.
- Form: email + experience (required) + market (optional). Success replaces the form with
  a confirmation. Duplicate email = silent success. Error = inline banner.

---

## Stage 2a — Backend: market-simulator

### Migration

`market-simulator/migrations/0005_create_early_access_registrations.sql`

```sql
CREATE TABLE early_access_registrations (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT        NOT NULL,
  experience  TEXT        NOT NULL,   -- 'new' | 'some' | 'active'
  market      TEXT,                    -- 'india' | 'us' | NULL
  source      TEXT,                    -- 'hero' | 'free_limit_wall' | 'footer' | 'nav'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email)
);
```

### Handler: `conductor/http_early_access.go`

Request body:
```json
{ "email": "a@b.com", "experience": "new|some|active", "market": "india|us|null", "source": "hero|free_limit_wall|footer|nav" }
```

Validation (server-side):
- `email`: non-empty, contains `@` — 400 `{"error":"invalid_email"}` if not
- `experience`: one of `new/some/active` — 400 `{"error":"missing_experience"}` if empty
  or unrecognised
- `market`: optional; if present must be `india` or `us`; unknown value is silently
  treated as null (don't 400 on a future market the client sends)
- `source`: store as-is; unknown values accepted

SQL (upsert — idempotent on duplicate email):
```sql
INSERT INTO early_access_registrations (email, experience, market, source)
VALUES ($1, $2, $3, $4)
ON CONFLICT (email) DO UPDATE
  SET experience = EXCLUDED.experience,
      market     = EXCLUDED.market,
      source     = EXCLUDED.source
RETURNING id;
```

Response:
- `201 {"ok": true}` — always on valid input (insert or conflict)
- `400 {"error": "..."}` — validation failure

Route: `POST /api/early-access/register` — registered in `conductor/http_endpoints.go`.

Note: `/api/` prefix (not `/v1/`) — this is landing-infrastructure, not the simulator
contract. Register it on the same mux but after the `/v1/` routes.

### Logging

Log at INFO on success (email-hash, experience, source — never log the raw email to
a structured log that might be aggregated). Use `slog` as everywhere else.

---

## Stage 2b — Backend: mock server

`mock/internal/earlyaccess/earlyaccess.go` — in-memory implementation.

```go
type Store struct {
  mu   sync.Mutex
  rows map[string]Row  // keyed by email
}

type Row struct {
  Email      string
  Experience string
  Market     string
  Source     string
}
```

- Same validation as the real backend (test both error paths).
- `Register(email, experience, market, source)` — upsert on the map under the lock.
- Returns `(bool, error)` — `true` always for valid input (idempotent).

Handler wired in `mock/cmd/mockserver/main.go`:

```
POST /api/early-access/register  →  earlyaccess.Store.HandleRegister
```

### Mock tests

`mock/cmd/mockserver/earlyaccess_test.go`:
- Valid submission → 201 `{"ok":true}`
- Duplicate email → still 201 (no error)
- Missing experience → 400 `{"error":"missing_experience"}`
- Invalid email (no @) → 400 `{"error":"invalid_email"}`
- All responses decoded into the generated structs with unknown fields rejected (same
  pattern as the existing mock tests)

---

## Stage 2c — Frontend: RegisterModal

`frontend/src/features/landing/RegisterModal.tsx`

### Props

```ts
interface Props {
  source: 'hero' | 'footer' | 'nav' | 'free_limit_wall'
  /** undefined = closed; any value = open */
  open: boolean
  onClose: () => void
  /** Optional override heading for the free_limit_wall variant */
  wallMessage?: string
}
```

### Structure

- Native `<dialog>` element (same as the app's `ConfirmDialog` — uses the `backdrop:` API
  for the scrim overlay).
- Opened via `dialog.showModal()` on mount when `open=true`; closed via `dialog.close()`.
- Focus starts on the email field (not Cancel) — this is a form, not a confirm.
- Esc key closes (native dialog behaviour).

### Form fields

1. **Email** — `type="email"`, required. Inline error: "Enter a valid email."
2. **Experience** — `<select>`, required. Options:
   - "" → "How much market experience do you have?" (disabled placeholder)
   - "new" → "New to markets"
   - "some" → "Traded a bit"
   - "active" → "Active trader"
3. **Market** — `<select>`, optional. Options:
   - "" → "Which market? (optional)"
   - "india" → "India"
   - "us" → "US"

### Behaviour

1. Submit disabled until email non-empty + contains `@` + experience selected.
2. Loading state on Submit button while POST is in-flight.
3. `POST /api/early-access/register` with `{email, experience, market, source}`.
   - `market` sent as `null` if the select is empty.
4. **201** → replace the entire form area with a confirmation message:
   `"You're on the list — we'll be in touch."` + a close button.
5. **Duplicate email** → server returns 201 → same confirmation (user never sees an error
   for a duplicate).
6. **400** → inline error banner above the submit button; keep entered values.
7. **Network error / 5xx** → inline error "Something went wrong. Try again." Keep values.
8. **`wallMessage` prop** → when set (Phase 4, `source='free_limit_wall'`), render a
   message above the form: "You've used your free sessions." (styled differently from the
   form heading). Phase 2: this prop exists but is never set — only the base form appears.

### Styling

- The modal sits inside the `.landing` CSS world (it is a child of `LandingPage`)
- Uses the landing's `--fg`, `--accent`, `--panel`, `--line` variables
- Not the app's Tailwind tokens — plain CSS classes from `landing.css`
- Modal max-width: 480px, centred
- Responsive: full-width with 20px margin on mobile

---

## Stage 2d — Wire CTAs

`frontend/src/features/landing/LandingPage.tsx`

Add state:

```ts
const [registerSource, setRegisterSource] =
  useState<'hero' | 'footer' | 'nav' | null>(null)
```

Replace all "Register as early tester" `href="#"` placeholders with:

```tsx
<button onClick={() => setRegisterSource('hero')}>Register as early tester</button>
// same for nav → 'nav', footer → 'footer'
```

Render modal:

```tsx
<RegisterModal
  source={registerSource ?? 'hero'}
  open={registerSource !== null}
  onClose={() => setRegisterSource(null)}
/>
```

### API client

`frontend/src/api/landing.ts` (new file — separate from the simulator contract API):

```ts
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
```

This uses `VITE_API_BASE` (same env var as the app) but does NOT go through the generated
OpenAPI client — these are landing-infrastructure endpoints, not part of the simulator
contract.

---

## Acceptance criteria

- [ ] "Register as early tester" in the nav, hero, and footer all open the modal.
- [ ] Modal closes on Esc and on the close button.
- [ ] Submit is disabled until email + experience are filled.
- [ ] Successful submission shows the confirmation message ("You're on the list").
- [ ] Submitting the same email twice shows the confirmation, not an error.
- [ ] Missing experience shows the inline error.
- [ ] Invalid email (no @) shows the inline error.
- [ ] Each button passes the correct `source` (verified in the mock server's in-memory
  store or real DB).
- [ ] Mock tests pass: `cd mock && go test ./... -race`.
- [ ] `npm test` still green.

---

## Files created / changed summary

| File | Type |
|------|------|
| `market-simulator/migrations/0005_create_early_access_registrations.sql` | new |
| `market-simulator/conductor/http_early_access.go` | new |
| `market-simulator/conductor/http_endpoints.go` | modified (register route) |
| `mock/internal/earlyaccess/earlyaccess.go` | new |
| `mock/cmd/mockserver/main.go` | modified (register route) |
| `mock/cmd/mockserver/earlyaccess_test.go` | new |
| `frontend/src/api/landing.ts` | new |
| `frontend/src/features/landing/RegisterModal.tsx` | new |
| `frontend/src/features/landing/landing.css` | modified (modal styles) |
| `frontend/src/features/landing/LandingPage.tsx` | modified (wire CTAs + state) |
