// The account/order axis, live half (HTTP pull). `GET /v1/account/observation` is the ONE
// dashboard read — balance, positions, orders and recent trades come from it together, on a
// poll loop. There is no order stream: a fill is only ever seen by polling.
//
// The POSTs here never retry. A 202 means "accepted", not "done"; a 504 (or a dropped
// connection) means "unknown" — callers reconcile with a read before any retry.
import { useQuery } from '@tanstack/react-query'
import { ApiError, apiGet, apiPost } from './client'
import type { CancelOrderRequest, ModifyOrderRequest, ModifyResponse, Observation, OrderIdResponse, PlaceOrderRequest } from './types'

/** Poll cadence for the observation read. Short enough that working -> filled is visible. */
export const OBSERVATION_POLL_MS = 1000

export const observationKey = (accountId: string) => ['observation', accountId] as const

export function getObservation(accountId: string) {
  return apiGet<Observation>('/v1/account/observation', { account_id: accountId })
}

/**
 * Poll loop for the Terminal's account half. A 409 (no live session) is a definitive answer,
 * not a hiccup, so it is not retried; the loop keeps ticking so the screen recovers by itself
 * once a session exists. The previous good snapshot stays on screen across a failed poll.
 */
export function useObservation(accountId: string, enabled = true) {
  return useQuery({
    queryKey: observationKey(accountId),
    queryFn: () => getObservation(accountId),
    enabled,
    refetchInterval: (query) =>
      query.state.error instanceof ApiError && query.state.error.status === 409
        ? false
        : OBSERVATION_POLL_MS,
    retry: (failures, error) => !(error instanceof ApiError && error.status === 409) && failures < 1,
  })
}

/** POST /v1/orders — 202 {order_id}. Accepted, NOT executed. */
export function placeOrder(accountId: string, order: Omit<PlaceOrderRequest, 'account_id'>) {
  return apiPost<OrderIdResponse>('/v1/orders', { account_id: accountId, ...order })
}

/** POST /v1/orders/cancel — 202. The cancel is accepted locally, NOT "cancelled". */
export function cancelOrder(accountId: string, orderId: string) {
  const body: CancelOrderRequest = { account_id: accountId, order_id: orderId }
  return apiPost<OrderIdResponse>('/v1/orders/cancel', body)
}

/**
 * POST /v1/orders/modify — a composed cancel + replace. 200 is `ok` or `partial` (the old order
 * is gone but the replacement was refused: surface `warning` verbatim); a 409 carries a
 * `ModifyResponse` with `rejected` (the cancel failed, nothing was placed) and is returned here
 * rather than thrown, because it is a normal outcome of this call.
 */
export async function modifyOrder(accountId: string, req: Omit<ModifyOrderRequest, 'account_id'>): Promise<ModifyResponse> {
  try {
    return await apiPost<ModifyResponse>('/v1/orders/modify', { account_id: accountId, ...req })
  } catch (err) {
    if (err instanceof ApiError && err.status === 409 && isModifyResponse(err.body)) return err.body
    throw err
  }
}

function isModifyResponse(body: unknown): body is ModifyResponse {
  return typeof body === 'object' && body !== null && 'modify_status' in body
}
