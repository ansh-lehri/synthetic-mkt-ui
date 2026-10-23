// GET /v1/markets no longer carries a `timezone` field (only a human `wall_clock` string,
// e.g. "09:15–15:30 IST") — a confirmed real-backend shape change (Phase 1 of
// BACKEND-INTEGRATION-PLAN.md). These are the IANA zones the real backend's own
// market-data allowlist uses (broker/marketdata's timezone.go: IN -> Asia/Kolkata,
// US -> America/New_York), kept here as the one client-side lookup until/unless the
// contract adds the field back.
const MARKET_TIMEZONES: Record<string, string> = {
  IN: 'Asia/Kolkata',
  US: 'America/New_York',
}

export function marketTimezone(tag: string): string {
  return MARKET_TIMEZONES[tag] ?? 'UTC'
}

// Market no longer carries a `name` field either (only `tag`) — same gap, same client-side
// default pattern as instruments' missing name/lot_size/price_decimals (contract/openapi.yaml).
const MARKET_NAMES: Record<string, string> = {
  IN: 'India',
  US: 'United States',
}

export function marketName(tag: string): string {
  return MARKET_NAMES[tag] ?? tag
}
