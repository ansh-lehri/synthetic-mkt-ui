# Contract Rewrite — Diff Table (Stage 1.1)

Mock-contract shape (what `contract/openapi.yaml` said before this rewrite) vs. the
real backend's actual shape (from `market-simulator/docs/api-contract/*.md`, itself
derived from source). One row per endpoint. "Action" is what Stage 1.2–1.6 did about
it.

## Identity / account

| Endpoint | Old mock shape | Real shape | Action |
|---|---|---|---|
| `POST /v1/account/open` | did not exist | `{user:{email?,user_id}}` → `200 {account_id}`; idempotent | **New.** Added. |
| `GET /v1/account/cash` | did not exist | `{account_id}` → `200 {trading_cash,bank_cash}`; `404` if unknown account (the one `broker/reads` endpoint that 404s) | **New.** Added. |
| `GET /v1/account/balance` | `{available,reserved,settled,bank}`, 409 without session | identical fields; 409 `{"error":"no live session for account"}` without session — confirmed via source | Kept, description corrected to cite the exact 409 message. |

## Session / market catalog

| Endpoint | Old mock shape | Real shape | Action |
|---|---|---|---|
| `GET /v1/markets` | `{markets:[{code,name,timezone,live_session:{phase,opens_at,closes_at}}]}` | `{markets:[{tag,active,session:{opens_at,closes_at,duration,wall_clock}}]}` (RFC3339 UTC opens/closes) — no `name`, no `phase` | **Rewritten.** `name`/`phase` dropped; `tag`/`active`/`session.*` added. |
| `GET /v1/instruments?market=` | `{market,instruments:[{instrument,name,tick_size,lot_size,price_decimals}]}` | `{market,instruments:[{id,tick_size}]}` only | **Rewritten.** `name`/`lot_size`/`price_decimals` dropped from the wire, kept as optional client-defaulted fields per §4 of `BACKEND-INTEGRATION-PLAN.md`. Field also renamed `instrument`→`id`. |
| `POST /v1/session/live/join` | `{account_id,market}` → `{type,market,phase,...}` | **Replaced by** `POST /session/canonical`: `{user:{email?,user_id},market}` → `200 {session_id,participant_id,status:"active"}`; 409 `ErrMarketNotLive`/`ErrLiveElsewhere`/`ErrSessionAlreadyLive` | **Rewritten + renamed.** Path, request and response shape all change. |
| `POST /v1/session/practice/start` | `{account_id,market,condition,length_minutes}` → `ActiveSession` | **Replaced by** `POST /session/ondemand?market=&duration=`: body `{user}` only, no `condition`; `200 warming_up` / `200 insufficient_funds` / `503 failed` | **Rewritten + renamed.** `condition` dropped from the wire entirely (frontend-only state going forward). Query-param-based `market`/`duration`, not body fields. |
| `GET /v1/session` | `{active: ActiveSession\|null}` | **Replaced by two different doors**: `POST /session/current` (resolve by identity, no session_id needed) and `GET /session/status?session=` (resolve by session id) — two different status vocabularies, not one | **Rewritten + split.** One mock endpoint becomes two real ones with different purposes and different enums. |
| `POST /v1/session/exit` | `{account_id}` → `{ok}` | `POST /session/exit?session=` (query param, not body) → `{status:"ended"}`; on-demand's already-reaped case is `404`, not `200` | **Rewritten.** Carrier moves from body to query string; the 404-is-success-for-on-demand nuance is new and documented. |
| WS phase | `ActiveSession.phase` (session endpoint) | **No session endpoint carries phase at all.** Only WS `snapshot.data.phase`, vocabulary `unknown/open/auction/closed` (not `preopen/open/closing/closed`) | **Removed from session schemas entirely.** Noted as WS-only. |

## Account reads (session-gated)

| Endpoint | Old mock shape | Real shape | Action |
|---|---|---|---|
| `GET /v1/account/positions` | same fields | identical fields confirmed (`instrument,qty,reserved_qty,weighted_avg_entry,mark_available,ltp,gross_unrealized`); `mark_available` is conditionally true now (per-instance wiring + first trade), not permanently false | Kept, description corrected — `mark_available` is not an unconditional `false`. |
| `GET /v1/account/orders` | same fields + `status` enum `{working,partially_filled}` | real `status` enum has 6 values: `unknown,working,partially_filled,filled,cancelled,rejected` (only working/partially_filled ever appear live, but the enum itself is 6-valued); `side` enum includes `unknown` as a defensive 3rd value | **Enum widened** to match the real `OrderStatus`/`side` types exactly. |
| `GET /v1/account/observation` | bundle: balance+positions+orders+recent_trades+trades_degraded | identical bundle shape confirmed in `broker-reads.md` §4 | Kept as-is — the "is observation really a bundle" question Phase 1 §1.4 flagged is resolved: yes, confirmed real. |
| `GET /v1/account/trades` | `{trades,next_before}`, default limit 50 | identical shape; limit default 50, no visible upper bound (silently clamps to 500 server-side) | Kept, description corrected: no client-visible clamp error, just silent capping. |
| `GET /v1/account/pnl` | `{trade_count,gross_pnl,total_costs,net_pnl,win_count,loss_count}` | identical | Kept as-is. |
| `GET /v1/account/costs` | `{trades,next_before}` | identical, confirmed key is `trades` not `per_trade` | Kept as-is. |
| `GET /v1/account/costs/summary` | `{trade_count,lines,total}` | identical | Kept as-is. |

## Orders / transfer

| Endpoint | Old mock shape | Real shape | Action |
|---|---|---|---|
| `POST /v1/orders` | `{account_id,instrument,side,type,tif,qty,limit_price}` → `202 {order_id}` | identical request shape; identical 422 reason set (`unknown_instrument,bad_qty,bad_side,bad_price,bad_type,insufficient_funds,no_market_price`); `no_market_price` is now conditionally reachable (market-buy pricing works once wired+traded), not an unconditional reject | Kept, description corrected re: market-buy conditionality. |
| `POST /v1/orders/cancel` | `{account_id,order_id}` → `202 {order_id}` | identical | Kept as-is. |
| `POST /v1/orders/modify` | `{account_id,order_id,instrument,side,is_market,new_qty,new_price}` → `ModifyResponse` | identical shape, identical warning string verbatim: `"original order is being cancelled; replacement was rejected — you may be left with no order"` | Kept, warning string corrected to the exact real text (the mock's old text was paraphrased, not verbatim). |
| `POST /v1/account/transfer` | `{account_id,direction,amount,unit}` → `{available,bank}` | identical | Kept as-is. 409 never emitted (confirmed by a real backend test) — mock already matched this. |

## Market data

| Endpoint | Old mock shape | Real shape | Action |
|---|---|---|---|
| `GET /v1/candles` | `{market,instrument,timeframe,timezone,from,to,candles,next_cursor}` | identical shape; `next_cursor` is a naive-local string in a *different, non-standard* format from `broker/reads`'s RFC3339 `before` cursor — a cross-cutting inconsistency, not a bug to fix in the contract | Kept, description notes the cursor-format inconsistency explicitly so client code doesn't assume one cursor format everywhere. |
| `GET /v1/ws` | anonymous, no session needed | `GET /v1/ws?session=<sid>` — **requires a session id** from a join call first; 401 if absent, 404 if session unknown/not-Active/market-not-Live | **Rewritten.** Session-scoped, not anonymous. |
| WS `snapshot.data.phase` | enum `preopen/open/closing/closed` | enum `unknown/open/auction/closed` | **Rewritten** in `ws-schemas.md`. |
| WS `connected`/`subscribe`/`unsubscribe`/`ack`/`candle` frames | — | shapes confirmed byte-identical to the mock's existing design | Kept as-is in `ws-schemas.md`. |

## Dropped from the contract entirely

- `PracticeCondition` schema and `condition` field — no wire representation on the real
  backend; kept as frontend-only state (`BACKEND-INTEGRATION-PLAN.md` §4).
- `ActiveSession`/`SessionState` schemas — replaced by the canonical/on-demand/current/
  status/exit schemas above; no single unified "session state" shape exists on the real
  wire.
