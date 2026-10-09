# Tailwind token wiring

Map the CSS variables in `tokens.css` into Tailwind so classes like `bg-surface`,
`text-ink`, `text-buy` resolve to the theme variables. In `tailwind.config.js`:

```js
// tailwind.config.js
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:            "var(--bg)",
        surface:       "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        line:          "var(--line)",
        ink:           "var(--ink)",
        muted:         "var(--muted)",
        signal:        "var(--signal)",
        "signal-ink":  "var(--signal-ink)",
        focus:         "var(--focus)",
        buy:           "var(--buy)",
        "buy-ink":     "var(--buy-ink)",
        "buy-soft":    "var(--buy-soft)",
        sell:          "var(--sell)",
        "sell-ink":    "var(--sell-ink)",
        "sell-soft":   "var(--sell-soft)",
        warn:          "var(--warn)",
        neutral:       "var(--neutral)",
      },
      borderRadius: { sm: "8px", md: "12px", lg: "16px", pill: "999px" },
      fontFamily: {
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        cond: ["IBM Plex Sans Condensed", "IBM Plex Sans", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
```

- Import `tokens.css` once at the app root (`main.tsx`).
- Theme switch = set/remove `data-theme="lab"` on `<html>`; persist in `localStorage`.
- Because colours are `var(--token)`, every Tailwind colour class flips with the theme
  automatically. **Never** write `bg-[#14120F]` — that bypasses theming.
- Fonts load from Google Fonts: IBM Plex Sans, Sans Condensed, Mono (tabular numerals
  for all prices/P&L — use `font-mono` on numeric cells).