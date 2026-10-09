// Colours resolve to the theme CSS variables in src/tokens/tokens.css, so every colour
// class flips with Night/Lab automatically. Never write a raw hex in a component.
// (Wiring per src/tokens/tailwind.tokens.md.)

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        line: "var(--line)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        signal: "var(--signal)",
        "signal-ink": "var(--signal-ink)",
        focus: "var(--focus)",
        buy: "var(--buy)",
        "buy-ink": "var(--buy-ink)",
        "buy-soft": "var(--buy-soft)",
        sell: "var(--sell)",
        "sell-ink": "var(--sell-ink)",
        "sell-soft": "var(--sell-soft)",
        warn: "var(--warn)",
        neutral: "var(--neutral)",
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
