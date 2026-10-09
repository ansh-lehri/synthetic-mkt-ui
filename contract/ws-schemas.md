# WebSocket Wire Schemas — Market-Data Live Surface

> The live counterpart to `GET /v1/candles`. OpenAPI can't describe WS frames, so this
> file is the source of truth for the socket. The mock and the frontend both implement
> exactly these shapes. Companion TS types live in `contract/generated/ts/ws.ts` (hand-authored
> from this file, committed).

## Endpoint & transport

- **`GET /ws`** — one WebSocket per user. Anonymous (no account, no auth).
- JSON **text** frames, one message each. Every frame carries a `type` discriminator.
- The socket is bound to **one market** by the backend; the client never sends `market`
  or any exchange id.
- One socket carries the whole watchlist + the open chart (many subscriptions).
- Ping/pong is transport-level (WebSocket control frames), not part of this JSON contract.

## Value conventions (same as the HTTP side)

- Every price / qty is a **bare `int64`** — `open/high/low/close`, `last_price`, every
  bid/ask price and qty. No unit field. Tick→display is the client's job (tick formatter).
- Timestamps are **naive-local ISO-8601** in the market tz named by the `connected` frame
  (`"2026-10-09T09:15:00"`). No epoch, no offset.
- `change_pct` is the **only float** on the wire: `(last_price − session_open) / session_open × 100`.
- **`has_*` flags are load-bearing.** `0` is a valid price, so `has_bid:false` ≠ a bid of 0.
  Never render an optional numeric without checking its `has_*` flag first.

---

## 1. Server → client, on connect (immediately)

```json
{ "type": "connected", "market": "IN", "timezone": "Asia/Kolkata" }
```

Establishes the tz context for every naive-local timestamp that follows.

## 2. Client → server — subscribe (batched)

```json
{ "type": "subscribe",
  "subs": [
    { "stream": "candle",   "instrument": "ACME", "timeframe": "5m" },
    { "stream": "snapshot", "instrument": "ACME" },
    { "stream": "snapshot", "instrument": "BETA" }
  ] }
```

Per-sub args:

| arg | required | notes |
|---|---|---|
| `stream` | yes | `"candle"` or `"snapshot"` |
| `instrument` | yes | opaque instrument id; one sub = one instrument |
| `timeframe` | candle only | one of `1m` / `5m` / `30m` / `60m`; omitted for snapshot |

## 3. Client → server — unsubscribe

Same `subs` shape, `"type": "unsubscribe"`. Switching instrument/timeframe =
unsubscribe old + subscribe new (there is no setLevel).

## 4. Server → client — ack (per-sub status)

```json
{ "type": "ack",
  "results": [
    { "stream": "candle",   "instrument": "ACME", "timeframe": "5m", "status": "ok" },
    { "stream": "snapshot", "instrument": "ACME", "status": "ok" },
    { "stream": "snapshot", "instrument": "ZZZZ", "status": "error", "error": "unknown instrument" }
  ] }
```

Error reasons: `unknown instrument`, `bad timeframe` (off the 1m/5m/30m/60m allowlist),
`bad stream`. An accepted **snapshot** sub is immediately followed by its seed snapshot
push. An accepted **candle** sub is bare — history comes from `GET /v1/candles`.

## 5. Server → client — candle push (Model A: finalized bars only)

```json
{ "type": "candle", "instrument": "ACME", "timeframe": "5m",
  "bar": { "start": "2026-10-09T09:15:00", "end": "2026-10-09T09:20:00",
           "open": 10050, "high": 10120, "low": 10030, "close": 10090, "volume": 4200 } }
```

A bar is pushed **only when its bucket closes** (1m every minute; 5m/30m/60m on bucket
close). **Live intra-bar movement does NOT come from here** — it comes from the snapshot's
`last_price`. The UI extends the rightmost bar's tip / draws a live price line from it.

## 6. Server → client — snapshot push (whole picture re-emitted on any change)

```json
{ "type": "snapshot", "instrument": "ACME",
  "data": {
    "phase": "open",
    "last_price": 10090, "has_last": true,
    "change_pct": 1.37,
    "quote": { "best_bid": 10085, "bid_qty": 300, "has_bid": true,
               "best_ask": 10095, "ask_qty": 150, "has_ask": true },
    "depth": { "bids": [ { "price": 10085, "qty": 300 } ],
               "asks": [ { "price": 10095, "qty": 150 } ] } } }
```

- `phase` ∈ `preopen` / `open` / `closing` / `closed` — this is the **session state** for
  the Terminal's session bar. There is no separate session frame; a session transition
  re-emits snapshots carrying the new `phase`.
- `depth.bids` / `depth.asks` carry up to top-10 per side, best-first.
- A watchlist cell reads `last_price` + `change_pct` and ignores the rest.

---

## Client behaviours the frontend MUST implement

1. **Chart = history + live.** On open: `GET /v1/candles` for past bars, then subscribe
   `candle` for live closes. Keep the two stitched.
2. **Live price between bars** comes from `snapshot.last_price` (Model A), not the candle
   stream. Do not wait for a bar close to move the price.
3. **Reconnect = rehydrate, not backfill.** On a dropped socket, reconnect, re-fetch
   history via `GET /v1/candles`, then resume live. The server does no WS backfill.
4. **Snapshot is latest-wins.** A dropped snapshot is harmless; the next one supersedes.
5. **Gate on `has_*`.** Never show a bid/ask/last that its `has_*` flag says is absent.

## Mock obligations (so the real server is a drop-in)

The Go mock's `/ws` must: send `connected` on open; accept batched `subscribe`/`unsubscribe`;
reply `ack` per-sub; seed a snapshot immediately on an accepted snapshot sub; push `candle`
frames only on bucket close; push `snapshot` frames on simulated change with a moving
`last_price` between bar closes (Model A); carry `phase` and drive it through
preopen → open → closing → closed over a session clock.