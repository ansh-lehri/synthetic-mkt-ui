/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** REST base URL: broker + session + candle history. No trailing slash needed. */
  readonly VITE_API_BASE: string
  /** WebSocket URL for live market data (the full /ws endpoint). */
  readonly VITE_WS_BASE: string
  /** Optional: the account_id to act as until real auth exists (see lib/account.ts). */
  readonly VITE_ACCOUNT_ID?: string
  /** PostHog project API key. When absent, all analytics calls are silent no-ops. */
  readonly VITE_POSTHOG_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
