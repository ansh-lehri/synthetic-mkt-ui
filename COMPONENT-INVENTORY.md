# Component inventory — shared kit (Phase 1)

> The repeated pieces every screen reuses. Build these once in `frontend/src/components/`
> so screens compose them instead of reinventing. Each uses tokens only (no raw hex).
> Port exact look from the design-canvas boards; this list fixes the API surface.

## Primitives

- **Button** — variants: `primary` (signal), `buy` (green), `sell` (red), `exit` (red),
  `ghost`, `disabled`. Coloured, never black/white primaries. Min height 44px (touch).
  A `capability`-aware disabled state (for Market orders) with a reason tooltip.
- **Card** — surface panel with `--line` border, `--r-lg` radius. The base container.
- **Chip** — small pill; selected/unselected states (market picker, condition picker).
- **Num** — the numeric display primitive. Takes a bare int + formatting context, renders
  via the tick formatter in `font-mono`. Pairs colour with ▲/▼ and +/− (colour-blind-safe).
  Variants: price, signed-money, percent. **This is the only thing that shows a number.**
- **Field** — labelled input (qty, limit price, email). Mono for numeric inputs.
- **Spinner / Skeleton** — the honest loading states (balance-loading, session-starting).
  No fake progress steps.
- **Banner / Panel** — inline status (halt = warn, practice = "not recorded", error).

## Composites

- **TopBar** — app name + persistent **`[Simulation]`** tag + global **market dropdown**
  + theme toggle (Night/Lab) + account menu. Present on every in-app screen.
- **SessionBar** — live vs practice treatment, market, clock, `phase` state
  (preopen/open/closing/closed), Exit (red) with the one-session confirm. Terminal + strips.
- **OrderTicket** — Buy/Sell, Market(disabled, flagged)/Limit, qty ±, limit price,
  est. cost, buying power, place CTA. Handles `202`→poll, surfaces slippage/partial/reject.
- **DepthLadder** — bid/ask ladder from the WS snapshot depth; `has_*`-gated; mono.
- **TabStrip** — Positions / Open orders / Trades / Session P&L (the Terminal bottom).
- **EmptyState** — for "no trades yet", "flat", degraded strips.
- **ConfirmDialog** — leave-session / switch-session confirmations.

## Theming + a11y rules (apply to all)

- Colour always paired with a shape/sign cue (▲▼, +/−, solid/dashed), never colour alone.
- Every interactive element has a visible focus ring (`--focus`).
- Touch targets ≥ 44px. Works at phone width with a 16px side gutter, no horizontal scroll.
- All numeric cells use `font-mono` (tabular) so columns align.

## What is NOT a shared component (screen-local)

Chart (KLineCharts wrapper — Terminal only), the landing page sections, the Record
tables. These live in their `features/` folder.