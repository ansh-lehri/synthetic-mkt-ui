// Base URLs come ONLY from env (see .env.example). Nothing else in the app may hardcode a
// host — swapping mock -> real backend is a config change.

function requireEnv(name: 'VITE_API_BASE' | 'VITE_WS_BASE'): string {
  const value = import.meta.env[name]
  if (value === undefined) {
    throw new Error(`${name} is not set. Copy frontend/.env.example to frontend/.env.`)
  }
  return value
}

/**
 * REST base (broker + session + candle history), without a trailing slash.
 * May be "" (empty) deliberately — that means "relative paths, same origin
 * as the frontend", which is how dev-proxy mode (vite.config.ts) works around
 * the real backend sending no CORS headers.
 */
export function apiBase(): string {
  return requireEnv('VITE_API_BASE').replace(/\/+$/, '')
}

/**
 * WebSocket origin only (e.g. "ws://localhost:8080"), WITHOUT a trailing slash or path —
 * `lib/marketStore.ts` appends `/v1/ws?session=<id>` itself, since the real backend's socket
 * is session-scoped (a real-backend shape change: there is no anonymous market-data feed).
 */
export function wsBase(): string {
  return requireEnv('VITE_WS_BASE').replace(/\/+$/, '')
}
