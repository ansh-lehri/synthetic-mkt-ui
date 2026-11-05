import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, getObservation, observationKey, placeOrder, type Observation } from '../../api'
import type { OrderDraft, TicketFeedback } from '../../components'
import { httpErrorMessage } from '../../lib/errors'
import {
  findNewOrder,
  followOrder,
  isUnknownOutcome,
  positionQty,
  reasonText,
  type OrderProgress,
  type OrderSignature,
  type PlacedOrder,
} from '../../lib/orderFlow'
import { track } from '../../lib/analytics'

interface Unconfirmed {
  /** When the unanswered POST gave up; a read newer than this settles it. */
  since: number
  before: ReadonlySet<string>
  sig: OrderSignature
  positionAtPlace: number
}

export interface OrderEntry {
  submitting: boolean
  feedback: TicketFeedback | undefined
  /** Progress of the order placed from the ticket, from the observation poll. */
  progress: OrderProgress | undefined
  placed: PlacedOrder | undefined
  submit: (draft: OrderDraft) => void
  reset: () => void
}

/**
 * Placing an order, honestly:
 *  - 202 means ACCEPTED. The order is then followed through the observation poll
 *    (working -> partial -> filled) — never reported as done by the POST itself.
 *  - 422 / 409 are definitive rejects with a reason.
 *  - 504 / 5xx / no response mean UNKNOWN. We never resubmit: the ticket stays blocked until a
 *    fresh observation read shows whether a matching order exists, and says what it found.
 */
export function useOrderEntry(accountId: string, obs: Observation | undefined, obsUpdatedAt: number): OrderEntry {
  const qc = useQueryClient()
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<TicketFeedback>()
  const [placed, setPlaced] = useState<PlacedOrder>()
  const [unconfirmed, setUnconfirmed] = useState<Unconfirmed>()
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const refetch = useCallback(() => void qc.invalidateQueries({ queryKey: observationKey(accountId) }), [qc, accountId])

  // An unanswered POST is settled by the first read that arrives after it (derived, not stored).
  const awaiting = !!unconfirmed && !(obs && obsUpdatedAt > unconfirmed.since)
  const found = unconfirmed && obs && !awaiting ? findNewOrder(unconfirmed.before, obs.orders, unconfirmed.sig) : null
  const settledPlaced: PlacedOrder | undefined =
    unconfirmed && found
      ? { orderId: found.order_id, instrument: found.instrument, side: unconfirmed.sig.side, qty: found.orig_qty, positionAtPlace: unconfirmed.positionAtPlace, seenFilled: found.filled_qty }
      : undefined
  const settledFeedback: TicketFeedback | undefined =
    unconfirmed && !awaiting
      ? found
        ? { kind: 'accepted', message: `The reply timed out, but the order did reach the exchange (${found.order_id}).` }
        : {
            kind: 'error',
            title: 'Not confirmed',
            message:
              'No matching order is on the book. It may still be processing, or it may already have filled — check Orders, Positions and Trades before placing it again.',
          }
      : undefined

  const submit = useCallback(
    (draft: OrderDraft) => {
      setSubmitting(true)
      setFeedback(undefined)
      setPlaced(undefined)
      setUnconfirmed(undefined)
      void (async () => {
        // A fresh read first, so "what was on the book before" and the starting position are exact.
        let base = qc.getQueryData<Observation>(observationKey(accountId))
        try {
          base = await getObservation(accountId)
          qc.setQueryData(observationKey(accountId), base)
        } catch {
          // fall back to the last poll; the reject handling below still applies
        }
        const before = new Set((base?.orders ?? []).map((o) => o.order_id))
        const positionAtPlace = positionQty(base?.positions ?? [], draft.instrument)
        const sig: OrderSignature = { instrument: draft.instrument, side: draft.side, qty: draft.qty, limit_price: draft.limit_price }
        try {
          const res = await placeOrder(accountId, draft)
          if (!alive.current) return
          // Read the book once before we start following the order, so the first thing shown is
          // where it really is (working) and not "missing" from a read that predates it.
          try {
            await qc.cancelQueries({ queryKey: observationKey(accountId) })
            qc.setQueryData(observationKey(accountId), await getObservation(accountId))
          } catch {
            // the next poll will catch up
          }
          if (!alive.current) return
          track('order_placed', { instrument: draft.instrument, side: draft.side, type: draft.type, qty: draft.qty })
          setPlaced({ orderId: res.order_id, instrument: draft.instrument, side: draft.side, qty: draft.qty, positionAtPlace, seenFilled: 0 })
          setFeedback({ kind: 'accepted', message: `Order ${res.order_id} is with the exchange.` })
        } catch (err) {
          if (!alive.current) return
          if (isUnknownOutcome(err)) {
            setUnconfirmed({ since: Date.now(), before, sig, positionAtPlace })
            setFeedback({
              kind: 'error',
              title: 'Not confirmed',
              message:
                'No confirmation came back, so we do not know whether the order was placed. Checking your orders now — please do not submit it again yet.',
            })
            refetch()
          } else if (err instanceof ApiError && (err.status === 422 || err.status === 409)) {
            setFeedback({ kind: 'rejected', message: reasonText(err.reason) })
          } else {
            setFeedback({ kind: 'error', message: httpErrorMessage(err) })
          }
        } finally {
          if (alive.current) setSubmitting(false)
        }
      })()
    },
    [accountId, qc, refetch],
  )

  const reset = useCallback(() => {
    setFeedback(undefined)
    setPlaced(undefined)
    setUnconfirmed(undefined)
  }, [])

  const current = placed ?? settledPlaced
  return {
    submitting: submitting || awaiting,
    feedback: settledFeedback ?? feedback,
    placed: current,
    progress: current && obs ? followOrder(current, obs) : undefined,
    submit,
    reset,
  }
}
