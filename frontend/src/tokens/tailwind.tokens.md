# Tailwind token wiring

Map the CSS variables in `tokens.css` into Tailwind so classes like `bg-panel`, `text-ink`,
`text-gain`, `bg-btnBg` resolve to the theme variables. Token names are the real app
board's (`docs/design/App.dc.html`), so the board ports 1:1. The live file is
`frontend/tailwind.config.js`; this is its documented shape:

```js
// tailwind.config.js
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:        "var(--bg)",
        panel:     "var(--panel)",
        raised:    "var(--raised)",
        line:      "var(--line)",
        ink:       "var(--ink)",
        muted:     "var(--muted)",
        accent:    "var(--accent)",
        onAccent:  "var(--onAccent)",
        soft:      "var(--soft)",
        btnBg:     "var(--btnBg)",
        btnFg:     "var(--btnFg)",
        gain:      "var(--gain)",
        loss:      "var(--loss)",
        gainBg:    "var(--gainBg)",
        lossBg:    "var(--lossBg)",
        buy:       "var(--buy)",
        onBuy:     "var(--onBuy)",
        sell:      "var(--sell)",
        onSell:    "var(--onSell)",
        warnBg:    "var(--warnBg)",
        warnLine:  "var(--warnLine)",
        ma:        "var(--ma)",
        focus:     "var(--focus)",
      },
      boxShadow: { card: "var(--shadow)" },
      borderRadius: { sm: "8px", md: "12px", lg: "14px", xl: "18px", pill: "999px" },
      fontFamily: {
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
```

## Which token for what

| Use | Token classes |
|---|---|
| Page ground / cards / inputs & raised chips / dividers | `bg-bg` / `bg-panel` / `bg-raised` / `border-line` |
| Text | `text-ink` (primary), `text-muted` (secondary) |
| Highlight, active, links, selected borders | `text-accent`, `border-accent`, `bg-soft` (accent tint) |
| Solid primary button | `bg-btnBg text-btnFg` |
| Up / down *numbers* and status | `text-gain` / `text-loss`, tints `bg-gainBg` / `bg-lossBg` |
| Buy / Sell / Exit *actions* | `bg-buy text-onBuy` / `bg-sell text-onSell`; Exit is outlined `border-loss text-loss` |
| Halt / warning | `bg-warnBg border-warnLine` |
| Secondary chart line | `ma` |
| Focus ring | `focus` (set globally in `index.css`) |
| Modal backdrop, popover shadow | `var(--scrim)`, `shadow-card` |

## Rules

- Import `tokens.css` once at the app root (`main.tsx`).
- Theme = `data-theme="night" | "lab"` on `<html>` (always set explicitly; see `lib/theme.ts`).
  Any element may pin a theme for its subtree, e.g. `<div data-theme="lab">`.
- Because colours are `var(--token)`, every colour class flips with the theme automatically.
  **Never** write a raw hex (`bg-[#0D1117]`) or `rgb()` in a component — it bypasses theming.
- **Font: IBM Plex Sans only.** For numbers use the `tnum` utility
  (`font-feature-settings: 'tnum'`, defined in `index.css`) — no Mono, no Condensed.
