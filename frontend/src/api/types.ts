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
export type SessionPhase = Schemas['LiveSessionInfo']['phase']

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
