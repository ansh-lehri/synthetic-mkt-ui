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