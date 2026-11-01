import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { ApiError, cancelOrder, modifyOrder, observationKey, type ModifyOrderRequest, type OpenOrder } from '../../api'
import type { BannerTone } from '../../components'
import { httpErrorMessage } from '../../lib/errors'
import { isUnknownOutcome, reasonText } from '../../lib/orderFlow'

export interface Notice {
  tone: BannerTone
  title: string
  body?: string
}

/**
 * Cancel and modify on resting orders. A cancel `202` is "accepted" (the order then shows
 * `cancel_in_flight` until the poll sees it leave); a modify can leave you with NO order
 * (`partial`) and its `warning` is shown verbatim. A 504 never triggers a retry: we re-read.
 */
export function useOrderActions(accountId: string) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [notice, setNotice] = useState<Notice>()

  const refetch = useCallback(() => void qc.invalidateQueries({ queryKey: observationKey(accountId) }), [qc, accountId])
  const mark = (id: string, on: boolean) =>
    setBusy((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })

  const cancel = useCallback(
    async (orderId: string) => {
      mark(orderId, true)
      try {
        await cancelOrder(accountId, orderId)
        setNotice(undefined) // accepted: the row now shows "Cancelling…" from the poll
      } catch (err) {
        if (isUnknownOutcome(err)) {
          setNotice({ tone: 'warn', title: 'No answer to the cancel', body: 'We do not know whether it went through. The list below is refreshed — check it before cancelling again.' })
        } else if (err instanceof ApiError) {
          setNotice({ tone: 'error', title: 'Could not cancel', body: reasonText(err.reason) })
        } else {
          setNotice({ tone: 'error', title: 'Could not cancel', body: httpErrorMessage(err) })
        }
      } finally {
        mark(orderId, false)
        refetch()
      }
    },
    [accountId, refetch],
  )

  const cancelAll = useCallback(
    async (orders: OpenOrder[]) => {
      await Promise.all(orders.filter((o) => !o.cancel_in_flight).map((o) => cancel(o.order_id)))
    },
    [cancel],
  )

  const modify = useCallback(
    async (req: Omit<ModifyOrderRequest, 'account_id'>) => {
      mark(req.order_id, true)
      try {
        const res = await modifyOrder(accountId, req)
        if (res.modify_status === 'ok') {
          setNotice({ tone: 'success', title: 'Order replaced', body: `The new order${res.replace?.order_id ? ` (${res.replace.order_id})` : ''} is with the exchange.` })
        } else if (res.modify_status === 'partial') {
          setNotice({ tone: 'warn', title: 'The old order is gone — the replacement was refused', body: res.warning ?? 'You may now have no working order.' })
        } else {
          setNotice({ tone: 'error', title: 'Nothing was changed', body: `The original order could not be cancelled (${(res.cancel.reason ?? 'unknown').replace(/_/g, ' ')}), so no replacement was placed.` })
        }
      } catch (err) {
        if (isUnknownOutcome(err)) {
          setNotice({ tone: 'warn', title: 'No answer to the modify', body: 'The original order may be cancelled, replaced, or untouched. The list is refreshed — check it before trying again.' })
        } else {
          setNotice({ tone: 'error', title: 'Could not modify', body: httpErrorMessage(err) })
        }
      } finally {
        mark(req.order_id, false)
        refetch()
      }
    },
    [accountId, refetch],
  )

  return { busy, notice, dismiss: () => setNotice(undefined), cancel, cancelAll, modify }
}
