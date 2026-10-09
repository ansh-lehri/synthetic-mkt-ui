// Base URLs come ONLY from env (see .env.example). Nothing else in the app may hardcode a
// host — swapping mock -> real backend is a config change.

function requireEnv(name: 'VITE_API_BASE' | 'VITE_WS_BASE'): string {
  const value = import.meta.env[name]
  if (!value) {
    throw new Error(`${name} is not set. Copy frontend/.env.example to frontend/.env.`)
  }
  return value
}

/** REST base (broker + session + candle history), without a trailing slash. */
export function apiBase(): string {
  return requireEnv('VITE_API_BASE').replace(/\/+$/, '')
}

/** Full WebSocket URL for live market data. */
export function wsBase(): string {
  return requireEnv('VITE_WS_BASE')
}
