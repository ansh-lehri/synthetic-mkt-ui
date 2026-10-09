// Friendly aliases over the generated OpenAPI types (contract/generated/ts/api.d.ts).
// Add an alias here when a screen needs one; never hand-write a shape that the contract owns.
import type { components } from '@contract/api'

type Schemas = components['schemas']

export type Market = Schemas['Market']
export type MarketsResponse = Schemas['MarketsResponse']
export type Instrument = Schemas['Instrument']
export type InstrumentsResponse = Schemas['InstrumentsResponse']
