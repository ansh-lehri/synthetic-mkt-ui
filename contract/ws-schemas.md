# WebSocket Wire Schemas — Market-Data Live Surface

> The live counterpart to `GET /v1/candles`. OpenAPI can't describe WS frames, so this
> file is the source of truth for the socket. The mock and the frontend both implement
> exactly these shapes. Companion TS types live in `contract/generated/ws.ts` (hand-authored
> from this file, committed).
>
> **Rewritten in Phase 1 of `BACKEND-INTEGRATION-PLAN.md`** to match the real backend's
> actual WS surface (`broker/marketdata` + `conductor`'s dispatcher). The two changes
> from the previous, invented-mock version of this file: the socket is now
> **session-scoped**, not anonymous, and the phase vocabulary is
> `unknown/open/auction/closed`, not `preopen/open/closing/closed`. See
> `contract/REWRITE-DIFF.md` for the full before/after.

## Endpoint & transport

- **`GET /v1/ws?session=<sid>`** — one WebSocket per connection, scoped to a session.
  `session` is **required**: a `session_id` from a prior `POST /session/canonical` or
  `POST /session/ondemand` call. Missing/empty → `401` before any upgrade; a
  session that's unknown, not `Active`, or whose market is gone/not `Live` → `404`
  before any upgrade. Neither of these is a WS-level error frame — they are plain
  HTTP responses that fail the upgrade itself.
- JSON **text** frames, one message each. Every frame carries a `type` discriminator.
- The socket is bound to **one market** by the backend (via the session); the client
  never sends `market` or any exchange id.
- One socket carries the whole watchlist + the open chart (many subscriptions).
- Ping/pong is transport-level (WebSocket control frames), not part of this JSON contract.
  Server pings every 30s (default); no Pong within the read-timeout window (60s default)
  disconnects the client. A slow client whose outbound buffer fills repeatedly (32
  consecutive dropped enqueues, default) is also disconnected — reconnect and
  re-fetch history via `GET /v1/candles`; there is no server-side backfill.

## Value conventions (same as the HTTP side)

- Every price / qty is a **bare `int64`** — `open/high/low/close`, `last_price`, every
  bid/ask price and qty. No unit field. Tick→display is the client's job (tick formatter).
- Timestamps are **naive-local ISO-8601** in the market tz named by the `connected` frame
  (`"2026-10-09T09:15:00"`). No epoch, no offset.
- `change_pct` is the **only float** on the wire: `(last_price − session_open) / session_open × 100`,
  computed as `0` both when the day is genuinely flat and when the opening base hasn't
  been seeded yet — `has_last` tells you if there's been a trade, but nothing on the
  wire distinguishes "flat" from "no baseline yet" for `change_pct` specifically.
- **`has_*` flags are load-bearing.** `0` is a valid price, so `has_bid:false` ≠ a bid of 0.
  Never render an optional numeric without checking its `has_*` flag first.

---

## 1. Server → client, on connect (immediately, before anything else)

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
| `instrument` | yes | opaque instrument id; one sub = one instrument. Must already be known to this session's market (has appeared at least once on the tape) — a client subscribing immediately after the market comes up, before the first tick, can see a legitimate instrument nacked `"unknown instrument"`; retry is the expected client behaviour, there is no way to distinguish this from a genuinely-wrong id in the ack alone. |
| `timeframe` | candle only | one of `1m` / `5m` / `30m` / `60m`; ignored (not read) if sent on a snapshot sub |

## 3. Client → server — unsubscribe

Same `subs` shape, `"type": "unsubscribe"`. Switching instrument/timeframe =
unsubscribe old + subscribe new (there is no setLevel). Unlike subscribe, unsubscribe
is **never acked** — invalid or not-currently-subscribed items are silent no-ops.

## 4. Server → client — ack (per-sub status, subscribe only)

```json
{ "type": "ack",
  "results": [
    { "stream": "candle",   "instrument": "ACME", "timeframe": "5m", "status": "ok" },
    { "stream": "snapshot", "instrument": "ACME", "status": "ok" },
    { "stream": "snapshot", "instrument": "ZZZZ", "status": "error", "error": "unknown instrument" }
  ] }
```

Error reasons (exhaustive): `"bad stream"`, `"instrument required"`, `"unknown instrument"`,
`"bad timeframe"` (off the 1m/5m/30m/60m allowlist). A subscribe batch can **partly
fail** — each item validates independently; valid items are installed regardless of
others failing. The ack for a batch is always enqueued **before** any seed snapshot
packets from that same batch, so a client never sees a seed before its ack.

An accepted **snapshot** sub is immediately followed by its seed snapshot push (unless
the instrument has no retained state yet — practically unreachable, snapshots are
retained forever once known). An accepted **candle** sub is bare — no historical bars
are sent on subscribe; history comes only from `GET /v1/candles`.

## 5. Server → client — candle push (Model A: finalized bars only)

```json
{ "type": "candle", "instrument": "ACME", "timeframe": "5m",
  "bar": { "start": "2026-10-09T09:15:00", "end": "2026-10-09T09:20:00",
           "open": 10050, "high": 10120, "low": 10030, "close": 10090, "volume": 4200 } }
```

A bar is pushed **only when its bucket closes** (1m every minute; 5m/30m/60m on bucket
close, or on session close for a still-forming final bucket). **Live intra-bar
movement does NOT come from here** — it comes from the snapshot's `last_price`. The UI
extends the rightmost bar's tip / draws a live price line from it; this package
provides no "forming bar" wire shape at all. `bar` carries no sequence number, so a
client that was disconnected and misses bars must infer the gap purely from
`start` timestamps compared to its last-seen bar when it resumes.

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

- `phase` ∈ `"unknown"` / `"open"` / `"auction"` / `"closed"` — **this vocabulary is
  different from an earlier mock-era draft of this file**, which used
  `preopen`/`open`/`closing`/`closed`. This is the **session state** for the
  Terminal's session bar; there is no separate session frame — a session transition
  re-emits snapshots carrying the new `phase`. No session HTTP endpoint carries this
  phase at all; it is WS-only.
- `depth.bids` / `depth.asks` carry a top-N ladder, best-first; the exact depth is
  whatever the exchange's own depth snapshot carries (not a fixed constant on this
  side).
- A watchlist cell reads `last_price` + `change_pct` and ignores the rest.
- **Whole-picture re-emit (Model A)**: every field change (trade, quote change, depth
  change, or a phase change) re-publishes the *entire* snapshot for that instrument,
  never a diff. A dropped snapshot is harmless — the next one supersedes it.

---

## Client behaviours the frontend MUST implement

1. **Chart = history + live.** On open: `GET /v1/candles` for past bars, then subscribe
   `candle` for live closes. Keep the two stitched.
2. **Live price between bars** comes from `snapshot.data.last_price` (Model A), not the
   candle stream. Do not wait for a bar close to move the price.
3. **Reconnect = rehydrate, not backfill.** On a dropped socket, reconnect (with a new
   `session=` if the old one is gone), re-fetch history via `GET /v1/candles`, then
   resume live. The server does no WS backfill, and `candle` carries no sequence
   number to detect exactly what was missed.
4. **Snapshot is latest-wins.** A dropped snapshot is harmless; the next one supersedes.
5. **Gate on `has_*`.** Never show a bid/ask/last that its `has_*` flag says is absent.
6. **The socket needs a session.** Unlike the old mock-era contract, the client must
   hold a valid `session_id` (from joining/starting a session) before it can open
   `/v1/ws` at all — this is a precondition the Terminal's session-join flow must
   satisfy before `lib/ws.ts` attempts to connect.

## Mock obligations (so the real server is a drop-in)

The Go mock's `/v1/ws` must: require `?session=` and reject with 401/404 exactly as
above when absent/invalid (looking the session up in the same store used by
`session/canonical`/`session/ondemand`); send `connected` on a successful upgrade;
accept batched `subscribe`/`unsubscribe`; reply `ack` per-sub (subscribe only, never
for unsubscribe); seed a snapshot immediately on an accepted snapshot sub; push
`candle` frames only on bucket close; push `snapshot` frames on simulated change with a
moving `last_price` between bar closes (Model A); carry `phase` using the
`unknown`/`open`/`auction`/`closed` vocabulary and drive it through
open → auction → closed over a session clock (there is no `preopen` value on the real
wire; the mock's pre-market period reports `"unknown"` until there's something more
specific to report, matching the real backend's own default/zero value for this enum).
