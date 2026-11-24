# Landing Phase 1 — Page + Route Restructure

> Faithful port of the `docs/design/landingpage/BlindSide.html` prototype into the React
> frontend, plus the routing surgery that makes `/` the public landing and `/app` the
> authenticated app home. No new API calls, no guest flow yet — the CTAs are present but
> not yet wired to anything. The page has value the moment it's live.

---

## What ships at the end of this phase

- The BlindSide landing page at `/` — all 7 sections, matching the prototype visually on
  desktop and down to 360 px.
- An animated order-book tape panel in the hero (decorative, random data).
- BlindSide favicon and nav logo.
- Existing app unchanged functionally — just the route for `HomePage` shifts from `/` to
  `/app`. All in-app "Home" links updated accordingly.
- CTAs ("Try a session free", "Register as early tester") render correctly but are
  `href="#"` placeholders (wired in later phases).

---

## Background: what moves where

| Path | Before | After |
|------|--------|-------|
| `/` | `HomePage` (authenticated) | `LandingPage` (public) |
| `/app` | — (unused) | `HomePage` (authenticated) |
| `/signup` | `SignupPage` | unchanged |
| Everything else | unchanged | unchanged |

The landing is the new public front door. Existing logged-in users who bookmarked `/` will
hit the landing; they click into the app manually (or a future "Go to app" link in the nav
detects stored identity — Phase 3 concern).

---

## Stage 1a — Route restructure

**Files changed**

| File | Change |
|------|--------|
| `frontend/src/Routes.tsx` | Add `case '/app'` → `<HomePage />`. Change default/`'/'` → `<LandingPage />`. Add lazy import for `LandingPage`. |
| `frontend/src/features/signup/SignupPage.tsx` | Line 29: `go('/')` → `go('/app')` |
| `frontend/src/features/terminal/TerminalPage.tsx` | Line 154 "Home" nav item: `assign('/')` → `assign('/app')` |
| `frontend/src/features/record/RecordPage.tsx` | Line 61 "Home" nav item: `assign('/')` → `assign('/app')` |
| `frontend/src/features/practice/PracticePage.tsx` | Line 141: `href="/"` → `href="/app"` |

**Rules**

- `LandingPage` is NOT wrapped in `<Suspense>` for the default route — it is the entry
  point, it must not flash a loading shell.
- `identity.ts` redirects (`requireAccountId`, `requireEmail`, `logout`) already target
  `/signup`, not `/` — no change needed there.
- `HomePage` at `/app` keeps `requireAccountId()` / `requireEmail()` guards exactly as
  today. Any visitor without a stored account_id who navigates to `/app` will be
  redirected to `/signup`.

---

## Stage 1b — Fonts + favicon

**`frontend/index.html`** — update the Google Fonts import to add Archivo + IBM Plex Mono:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">
```

**`frontend/public/favicon.svg`** — replace with the BlindSide icon SVG (blue tile + white B,
exact markup from `design.md` Brand assets). This is the app-icon / favicon.

**`frontend/index.html`** `<title>` — change from whatever it currently is to `BlindSide`.

No other static assets needed for Phase 1 (the mark SVGs are inlined into the page
component directly).

---

## Stage 1c — Landing page component

### File layout

```
frontend/src/features/landing/
  LandingPage.tsx   — full page component
  landing.css       — all landing CSS (namespaced under .landing)
  Tape.tsx          — animated order-book panel (dark surface)
```

### CSS approach

The landing has a completely separate visual identity from the app (different palette,
Archivo font, no Tailwind tokens). All styles live in `landing.css`, imported at the top
of `LandingPage.tsx`. Every selector is scoped under the `.landing` root class that wraps
the whole page. The page sets `color-scheme: light` and does NOT follow the viewer's OS
theme — it is always light.

**CSS variables defined inside `.landing`:**

```css
.landing {
  /* light page surface */
  --bg: #f6f7f9;    --panel: #ffffff;   --panel2: #eef0f3;
  --line: #e2e6ec;  --fg: #12161c;      --muted: #596070;
  --dim: #8b92a0;   --accent: #3350dd;  --accent-ink: #ffffff;
  --up: #0f9d63;    --down: #d6443c;
  /* dark market surfaces (tape + app preview) */
  --m-bg: #0a0d13;   --m-panel: #10151f;  --m-line: #1d2534;
  --m-fg: #e7ecf5;   --m-mut: #8894a8;    --m-dim: #5a647a;
  --m-acc: #5b7cfa;  --m-up: #45d19a;     --m-down: #ff6b6b;
  /* typography */
  --font-display: "Archivo", system-ui, sans-serif;
  --font-body:    "Archivo", system-ui, sans-serif;
  --font-mono:    "IBM Plex Mono", ui-monospace, monospace;
}
```

These names intentionally do NOT conflict with the app's `tokens.css` variable names
(`--bg` in the app is the app-scoped dark bg; here it is the landing's light bg — but
since `.landing` wraps the whole page component and these are not on `:root`, there is no
bleed).

### LandingPage sections (faithful port of BlindSide.html)

**Nav**
- BlindSide icon (24×24 SVG inline) + wordmark "BlindSide" in Archivo 800
- "● Simulation" pill (mono, small, accent-bordered)
- "How it works" anchor link (scrolls to `#how`)
- "Register as early tester" ghost button (Phase 2: opens modal; Phase 1: `href="#"`)

**Hero**
- Left column: eyebrow (mono, uppercase, accent) → h1 → subhead (`<b>run by agents</b>`)
  → CTA row (primary "Try a session free" + ghost "Register as early tester")
  → reassure line ("Free during early access. No real money, ever." in mono)
- Right column: `<Tape />` component (dark panel, decorative, `aria-hidden`)
- Grid: 1.05fr / 0.95fr, collapses to single column below 860 px

**Problem section**
- Eyebrow: "The problem"
- h2: "The market only lets you learn live — with your money already in it."
- Lead text (large, muted)
- Vignette: blue left-border blockquote + "— Why this exists" attribution (mono, small)
- Stat line with `<sup>1</sup>` and footnote placeholder text

**Reveal section** ("This isn't paper trading")
- Eyebrow
- 2-column grid: "Paper trading · backtesting" card (muted text, greyed tag) vs "Here"
  card (normal text, accent tag) — faithfully mirrors `.rev-card.them` / `.rev-card.us`
- Punch line: `h2` with `<em>A market does.</em>` styled in accent colour

**See it section**
- Eyebrow + h2 ("Two doors in. Pick your conditions, or take the real session.")
- App preview panel (dark surface, `.app` class): app bar (BlindSide + Simulation pill
  + India/Lab/SYNTH_DEF pills), tab strip (Market active), app-cards (Live session card +
  Practice card with scenario dropdown), instrument row. Static/non-interactive.
- Demo video overlay on top of the app preview: semi-transparent scrim + "▶ Watch the
  demo" pill button (static, no video in Phase 1)

**How it works section** (id="how")
- Eyebrow
- 4-step grid (4 columns → 2 → 1): numbered with CSS `counter`, card per step
- Flag text below

**Newcomer doorway section**
- 2-col flex: left = tag + h3 + body text; right = "Start a first session" ghost button
  (same as "Try a session free" flow — Phase 1: `href="#"`)

**Final CTA section**
- Centered h2 (repeated hero headline)
- CTA row (same buttons)
- Reassure line

**Footer**
- BlindSide logo + wordmark (same as nav)
- "Analytical and educational. Not investment advice."
- Contact + Privacy links (Phase 1: `href="#"`)

### Responsive behaviour (direct port of the prototype)

| Breakpoint | Behaviour |
|---|---|
| ≥ 860px | Hero is 2-column. |
| < 860px | Hero stacks vertically (tape below copy). |
| ≥ 820px | How-it-works is 4-column. |
| < 820px | 2-column. |
| < 480px | 1-column. |
| ≥ 760px | Reveal is 2-column. |
| < 760px | 1-column. |
| < 560px | Nav links hidden (only CTA button visible). |
| All | Max-width 1120 px, `padding: max(20px, safe-area-inset)`. |

---

## Stage 1d — Tape component

`features/landing/Tape.tsx` — the animated order-book panel in the hero.

**Behaviour** (port of the prototype's inline script):
- Seeded on mount: 7 rows — 3 ASK, 1 MID, 3 BID. Mid price fixed at 1420. ASK prices
  above (1426, 1424, 1422), BID prices below (1418, 1416, 1414). Quantities random 20–140.
- Bar widths proportional to max qty in the set.
- Re-seeded every 1 300 ms — quantities re-rolled, last price ± small delta, spread ± 1.
- `useEffect` with `setInterval`; cleanup on unmount. Respect
  `window.matchMedia('(prefers-reduced-motion: reduce)')` — skip the interval if true
  (render one static frame only).
- `aria-hidden="true"` on the root element — purely decorative.
- Footer shows: `last <b>1421</b>  spread <b>2</b>  agents <b>62</b>` (last/spread update
  each tick; agents is static placeholder).

**Layout** (from prototype):
- Top bar: green dot, "SYNTH_DEF · India", "CONTINUOUS" (right-aligned, accent)
- Rows: side label (BID/ASK/MID), quantity bar (CSS animation), price (right-aligned)
- Footer: last / spread / agents stats

---

## Acceptance criteria

- [ ] `/` renders the landing page (not `HomePage`) for any visitor regardless of stored
  identity.
- [ ] `/app` renders `HomePage` with the same guards as before (redirects to `/signup` if
  no stored `account_id`).
- [ ] Signup flow still works end-to-end: `/signup` → form → submit → redirect to `/app`.
- [ ] "Home" links in Terminal and Record point to `/app`.
- [ ] "← Home" link in Practice points to `/app`.
- [ ] Landing matches the prototype visually at 1440 px and at 360 px; no horizontal
  scroll at either width.
- [ ] BlindSide favicon shows in the browser tab.
- [ ] Tape animation runs at 1 300 ms; stops (single static frame) with
  `prefers-reduced-motion: reduce`.
- [ ] "Try a session free" and "Register as early tester" buttons render correctly (no
  console errors); clicking does not navigate (Phase 1: `href="#"` or `preventDefault`).
- [ ] No TypeScript errors, no PostCSS errors, `npm test` still green.

---

## Files created / changed summary

| File | Type |
|------|------|
| `frontend/src/Routes.tsx` | modified |
| `frontend/src/features/signup/SignupPage.tsx` | modified (1 line) |
| `frontend/src/features/terminal/TerminalPage.tsx` | modified (1 line) |
| `frontend/src/features/record/RecordPage.tsx` | modified (1 line) |
| `frontend/src/features/practice/PracticePage.tsx` | modified (1 line) |
| `frontend/index.html` | modified (fonts + title) |
| `frontend/public/favicon.svg` | replaced |
| `frontend/src/features/landing/LandingPage.tsx` | new |
| `frontend/src/features/landing/landing.css` | new |
| `frontend/src/features/landing/Tape.tsx` | new |
