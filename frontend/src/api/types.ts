// Friendly aliases over the generated OpenAPI types (contract/generated/ts/api.d.ts).
// Add an alias here when a screen needs one; never hand-write a shape that the contract owns.
import type { components } from '@contract/api'

type Schemas = components['schemas']

export type Market = Schemas['Market']
export type MarketsResponse = Schemas['MarketsResponse']
export type Instrument = Schemas['Instrument']
export type InstrumentsResponse = Schemas['InstrumentsResponse']

// ---- account axis (durable reads used by the Record screen)
export type Trade = Schemas['Trade']
export type TradesPage = Schemas['TradesPage']
export type PnlSummary = Schemas['PnlSummary']
export type CostLine = Schemas['CostLine']
export type CostsTrade = Schemas['CostsTrade']
export type CostsPage = Schemas['CostsPage']
export type CostsSummary = Schemas['CostsSummary']
/** `country` query param on /costs*: case-sensitive, IN is implemented, US is a 501. */
export type Country = 'IN' | 'US'

// ---- market-data axis
export type Bar = Schemas['Bar']
export type CandleResponse = Schemas['CandleResponse']
/** No session HTTP endpoint carries phase — it's WS-only (see @contract/ws's Phase). */
export type SessionPhase = 'unknown' | 'open' | 'auction' | 'closed'

// ---- account axis (live reads + orders, used by the Terminal)
export type Observation = Schemas['Observation']
export type Balance = Schemas['Balance']
export type Position = Schemas['Position']
export type OpenOrder = Schemas['OpenOrder']
export type PlaceOrderRequest = Schemas['PlaceOrderRequest']
export type CancelOrderRequest = Schemas['CancelOrderRequest']
export type ModifyOrderRequest = Schemas['ModifyOrderRequest']
export type ModifyResponse = Schemas['ModifyResponse']
export type OrderIdResponse = Schemas['OrderIdResponse']

// ---- identity (POST /v1/account/open, GET /v1/account/cash)
export type Identity = Schemas['Identity']
export type AccountOpenRequest = Schemas['AccountOpenRequest']
export type AccountOpenResponse = Schemas['AccountOpenResponse']
export type Cash = Schemas['Cash']

// ---- session axis: two kinds (canonical/on-demand), two status vocabularies — see
// BACKEND-INTEGRATION-PLAN.md §3. `OnDemandRequest.condition` is on the wire now (sent
// ahead of backend support) but is a documented no-op until the backend reads it — see
// PracticeCondition below and lib/sessionActions.ts.
export type JoinCanonicalRequest = Schemas['JoinCanonicalRequest']
export type JoinCanonicalResponse = Schemas['JoinCanonicalResponse']
export type OnDemandRequest = Schemas['OnDemandRequest']
export type OnDemandWarmingUpBody = Schemas['OnDemandWarmingUpBody']
export type OnDemandInsufficientFundsBody = Schemas['OnDemandInsufficientFundsBody']
export type OnDemandFailedBody = Schemas['OnDemandFailedBody']
export type SessionStatusBody = Schemas['SessionStatusBody']
export type SessionCurrentRequest = Schemas['SessionCurrentRequest']
export type SessionCurrentResponse = Schemas['SessionCurrentResponse']
export type SessionExitResponse = Schemas['SessionExitResponse']

/** The Practice setup screen's market-scenario picker. On the wire (OnDemandRequest.condition)
 * as a documented no-op ahead of backend support — see BACKEND-INTEGRATION-PLAN.md §4/§6. */
export type PracticeCondition = Schemas['PracticeCondition']
/** Frontend-only — /session/ondemand takes a plain `duration` minutes query param, not this enum. */
export type PracticeLength = 60 | 75 | 90 | 105

export type TransferRequest = Schemas['TransferRequest']
export type TransferResponse = Schemas['TransferResponse']
export type TransferDirection = TransferRequest['direction']
