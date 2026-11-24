BlindSide Landing — Implementation Spec
28 Oct 2026 · @ansh lehri
Scope
Build three things:
1. The BlindSide landing page — the marketing page (hybrid look: light page, dark market panels).
2. "Try a session free" — an anonymous guest can start a few Practice sessions with no signup, capped by a server-side limit.
3. "Register for early test users" — a form that captures early-tester signups into the database.
Out of scope (don't build): the simulator engine itself (already exists — we reuse its session-start flow); real login / Google OAuth (comes later); email verification; any anti-abuse beyond the simple guest counter.
Fitting it into the repo
This spec describes behaviour and contracts, not framework code — implement each piece inside the existing repo using whatever stack that part already uses (the landing in the frontend; the new endpoints in the existing backend). The three new backend endpoints and two tables are the only genuinely new infrastructure; everything else reuses what's there.
What's reused, not rebuilt:
• Session start — the guest flow calls the existing start-a-Practice-session path exactly as the app does today, just with guest credentials. Account-open already keys on the user id, and the email field already accepts .*@.*, so no change to the simulator or its auth is needed.
• Postgres — the two new tables live in the existing database.
Two decisions to confirm before/while building (also in Open items):
• Where the new endpoints live — the existing backend service, or a thin new one. Either is fine; they only touch Postgres.
• N — the free-session limit (placeholder: 3).
Landing page
Visual source of truth: the approved sample (hybrid landing). Rebuild it in the frontend — don't redesign. Hybrid look: light page, dark market panels (the live tape, the app preview). The page sets its own look and does not follow the viewer's OS theme.
Sections, top to bottom: hero (why headline + what subhead + live tape + CTAs), problem (+ founder vignette), the reveal ("this isn't paper trading"), see it (demo video + Live/Practice app preview), how it works (4 steps), newcomer doorway, final CTA, footer (analytical/educational, not investment advice).
• Logo + favicon: use the BlindSide icon SVGs in the Brand assets section below (blindside-icon.svg for the favicon and nav/app tile; blindside-mark.svg / blindside-mark-white.svg for light/dark). Wordmark is Archivo 800 set in live type, not an image.
• Two CTAs: primary "Try a session free" → guest flow (next section); secondary "Register as early tester" → the registration form.
• Demo video: a placeholder slot in the "See it" section; drop the recorded clip in when ready.
• Responsive to ~360px, no horizontal scroll, keyboard-focusable controls, respects reduced-motion (the tape animation is decorative).
Brand assets
The logo is SVG — paste these in directly. Palette: #3350DD primary blue, #5B7CFA lit blue (dark backgrounds), #12161C ink, #FFFFFF white.
App icon / favicon — blue tile + white B. Use for the favicon (export 32×32 and 16×16 PNG and an .ico from it) and the nav / app tile:
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect x="6" y="6" width="88" height="88" rx="22" fill="#3350DD"/>
  <g transform="translate(50 50) scale(0.82) translate(-50 -50)">
    <g fill="none" stroke="#FFFFFF" stroke-width="13" stroke-linecap="round" stroke-linejoin="round">
      <path d="M37 22 V78"/>
      <path d="M37 22 H49 A14 14 0 0 1 49 50 H37"/>
      <path d="M37 50 H51 A14.5 14.5 0 0 1 51 78 H37"/>
    </g>
    <line x1="37" y1="7" x2="37" y2="93" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round"/>
  </g>
</svg>
Mark — the blue B on transparent, for light backgrounds. For dark, use the same markup with both strokes set to #FFFFFF (or #5B7CFA):
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <g fill="none" stroke="#3350DD" stroke-width="13" stroke-linecap="round" stroke-linejoin="round">
    <path d="M37 22 V78"/>
    <path d="M37 22 H49 A14 14 0 0 1 49 50 H37"/>
    <path d="M37 50 H51 A14.5 14.5 0 0 1 51 78 H37"/>
  </g>
  <line x1="37" y1="7" x2="37" y2="93" stroke="#3350DD" stroke-width="3.2" stroke-linecap="round"/>
</svg>
Wordmark — not an image; set in live type. Archivo 800, tracking −0.035em, one colour (no Blind/Side split): ink #12161C on light backgrounds, white #FFFFFF on dark. In the nav, pair the icon badge with the wordmark.
Try a session free — guest flow
Goal: a visitor plays a Practice session with no signup, capped at N lifetime sessions per guest, counted server-side. The screens are never gated — only starting a session is. A guest always reaches the app home screen (the first screen after entering — the "not in a session" / Live·Practice chooser); if their free sessions are used up they still see the whole screen, they just can't start a new one.
Guest identity (frontend):
1. On first landing load, read localStorage['blindside_guest_id']. If absent, mint guest_<uuid> (crypto.randomUUID()) and store it. Wrap all localStorage access in try/catch (private mode / blocked storage) — if it throws, mint an in-memory id for the session.
2. Derive guest credentials: email = "<guest_id>@guest.invalid", user_id = <guest_id>. (.invalid is reserved, never a real inbox; satisfies the existing .*@.* email check.)
3. Optional: on load, GET /api/guest/quota?guest_id=... to show "X free sessions left" near the CTA.
On the app home screen (always rendered — never hidden or replaced):
1. The home screen renders for every visitor, whatever their trial state. Never gate the screen itself.
2. On load it calls GET /api/guest/quota and reflects the result in place: trials left → "Start practice" enabled (optionally "X free left"); expired → "Start practice" disabled with an inline "You've used your free sessions — register for early access" + the register CTA, right there on the same screen.
3. On "Start practice" click (only when enabled): POST /api/guest/consume. 200 → start the Practice session (existing flow, guest creds). 409 (race / edge) → stay on the home screen and flip the control to the expired state above — do not divert to a separate wall.
4. Live is never offered to guests regardless of quota (needs a real account — post-OAuth).
Rules & edge cases:
• Guests get Practice only — never offer Live (Live needs a real account; that's post-OAuth).
• localStorage cleared / incognito / another browser → new guest id → fresh count. This bypass is accepted for the demo; do not add fingerprinting.
• If consume succeeds but the session-start then fails, the count is still spent — acceptable for now. (Optional later: a rollback endpoint.)
• consume must be atomic server-side (see Data model) so double-clicks / races can't exceed N.
Register for early test users
A simple form — the real conversion on the page today. Not a login, not an account.
Fields:
• Email — required. type=email; basic non-empty + contains-@ validation.
• Experience — required. Dropdown: New to markets / Traded a bit / Active trader (values new / some / active).
• Market — optional. Dropdown: India / US (values india / us), with an empty default.
Behaviour:
1. Client-side: disable Submit until email + experience are valid; show inline errors; show a loading state on submit.
2. Submit → POST /api/early-access/register with { email, experience, market, source }. source tags the entry point (hero, free_limit_wall, footer) for later analysis.
3. Success (201): replace the form with a confirmation ("You're on the list — we'll be in touch.").
4. Duplicate email: treat as success (idempotent — don't error the user).
5. Error: inline message, keep the entered values.
The form appears in two places: the standalone secondary CTA, and the free-limit wall (with source set accordingly).
API contracts
Three new endpoints. All JSON.
1. Guest quota (display only)
GET /api/guest/quota?guest_id=<guest_id>
200 -> { "guest_id": "guest_ab12...", "used": 1, "limit": 3, "can_start": true }
2. Guest consume (atomic gate — call before starting)
POST /api/guest/consume
body: { "guest_id": "guest_ab12..." }
200 -> { "allowed": true,  "used": 2, "limit": 3 }   // incremented, proceed to start
409 -> { "allowed": false, "used": 3, "limit": 3 }   // over limit -> show register wall
Consume is the gate: it atomically increments and tells you whether this start is allowed. The frontend starts the Practice session only on 200.
3. Early-access register
POST /api/early-access/register
body: { "email": "a@b.com", "experience": "new|some|active", "market": "india|us|null", "source": "hero|free_limit_wall|footer" }
201 -> { "ok": true }
400 -> { "error": "invalid_email" | "missing_experience" }
Duplicate email = upsert, still return 201 (idempotent).
Data model (Postgres)
Two new tables in the existing database.
CREATE TABLE early_access_registrations (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  experience  TEXT NOT NULL,              -- 'new' | 'some' | 'active'
  market      TEXT,                       -- 'india' | 'us' | NULL
  source      TEXT,                       -- entry point: 'hero' | 'free_limit_wall' | 'footer'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email)
);

CREATE TABLE guest_free_sessions (
  guest_id    TEXT PRIMARY KEY,           -- 'guest_<uuid>'
  used        INT  NOT NULL DEFAULT 0,
  first_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used   TIMESTAMPTZ
);
Atomic consume — one statement does the check-and-increment; if it returns no row, the guest is at the limit (respond 409). $1 = guest_id, $2 = limit N:
INSERT INTO guest_free_sessions (guest_id, used, last_used)
VALUES ($1, 1, now())
ON CONFLICT (guest_id) DO UPDATE
  SET used = guest_free_sessions.used + 1, last_used = now()
  WHERE guest_free_sessions.used < $2
RETURNING used;
Register = INSERT ... ON CONFLICT (email) DO UPDATE SET experience = EXCLUDED.experience, market = EXCLUDED.market (idempotent upsert).
Config & constants
• FREE_SESSION_LIMIT (N) = 3 — placeholder, confirm. Server-side only; never trust a client value.
• GUEST_ID_PREFIX = guest_
• GUEST_EMAIL_DOMAIN = guest.invalid
• GUEST_LS_KEY (localStorage) = blindside_guest_id
• Free sessions are Practice mode; let the guest pick the scenario (the existing picker) — only the count is gated, not the choice.
• Experience enum: new / some / active. Market enum: india / us.
Acceptance criteria
[ ] Landing page matches the sample on desktop and at ~360px; no horizontal scroll; the BlindSide favicon and nav logo show.
[ ] First visit mints and persists a blindside_guest_id; a reload reuses the same id.
[ ] "Try a session free" starts a Practice session for a fresh guest and increments used by exactly 1.
[ ] After N sessions, "Try a session free" returns 409 and the register wall appears instead of a session.
[ ] Rapid double-clicks never push used above N (atomic consume holds).
[ ] Guests are never offered a Live session.
[ ] Clearing localStorage yields a fresh guest with a reset count (documented, accepted).
[ ] Registration writes a row to early_access_registrations with email, experience, market, source.
[ ] Submitting the same email twice does not error the user and does not create a duplicate row.
[ ] Register form blocks submit until email + experience are valid.
[ ] No secret/limit logic is enforced only on the client.
Build order
Each stage ships value on its own.
1. Landing page — rebuild the sample in the frontend, wire the logo + favicon, both CTA buttons present (not yet functional). The page has value the moment it's live.
2. Register flow — early_access_registrations table + POST /api/early-access/register + the form. Now you're capturing leads — the most important early outcome.
3. Guest free sessions — guest_free_sessions table + GET /quota and POST /consume + guest-id minting + wire "Try a session free" to consume → existing Practice start.
4. The wall — wire a 409 from consume to open the register form with source = free_limit_wall.
Do 1–2 first even if 3–4 slip; a live page that captures early testers is the priority.
Open items
• N — free-session limit (placeholder 3).
• Where the new endpoints live — existing backend vs a thin new service.
• The 90%-lose stat — a global figure + citation for the page. We aim global, so don't anchor it to India/SEBI — “most active retail traders lose money” holds across markets; pick a defensible source.
• Domain + trademark — settle before the page is public.
• Later (not now): Google OAuth for real login; migrating a guest's history into their real account on signup; analytics events on the CTAs; a consume-rollback endpoint if a spent-but-failed start becomes a real annoyance.