// Night/Lab theme state. The theme is the `data-theme` attribute on <html>; tokens.css
// does the rest. An explicit attribute is ALWAYS set (never removed) so the user's
// choice can't be overridden by tokens.css's prefers-color-scheme fallback.
// The same bootstrap runs inline in index.html to avoid a flash on first paint.

export type Theme = 'night' | 'lab'

const STORAGE_KEY = 'theme'

export function isTheme(v: unknown): v is Theme {
  return v === 'night' || v === 'lab'
}

/** Saved choice, else the OS preference, else Night (the default). */
export function readInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isTheme(saved)) return saved
  } catch {
    // storage unavailable (private mode etc.) — fall through
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'lab'
  }
  return 'night'
}

export function currentTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme')
  return isTheme(attr) ? attr : 'night'
}

/** Set the theme on <html> and persist it. */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // non-fatal: the theme still applies for this page load
  }
}
