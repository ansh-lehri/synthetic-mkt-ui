/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** REST base URL: broker + session + candle history. No trailing slash needed. */
  readonly VITE_API_BASE: string
  /** WebSocket URL for live market data (the full /ws endpoint). */
  readonly VITE_WS_BASE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
