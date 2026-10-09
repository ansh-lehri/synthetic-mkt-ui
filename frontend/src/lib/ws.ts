// Market-data WebSocket client — Phase 3. Stub only in Phase 0.
//
// When built it will: open wsBase() (src/api/config.ts), parse frames as ServerMessage
// (contract/generated/ts/ws.ts), feed Zustand, and on reconnect re-fetch candle history
// via GET /v1/candles then resume (the server does no WS backfill).
export {}
