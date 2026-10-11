import { useEffect, useId, useRef, useState } from 'react'
import { ApiError, transferMoney, type TransferDirection, type TransferResponse } from '../../api'
import { Banner, Button, Field } from '../../components'
import { isNoAnswer } from '../../lib/session'
import { MONEY_DECIMALS, formatMoney } from '../../lib/ticks'
import { DIRECTIONS, checkTransfer, type KnownBalances } from '../../lib/transfer'

type Phase =
  | { kind: 'form' }
  | { kind: 'sending'; amount: number }
  | { kind: 'failed'; message: string }
  /** No answer: we do not know whether it happened, so there is no "Try again". */
  | { kind: 'unknown' }

/**
 * Move money between the bank and the trading balance. A 422 (not enough) is a plain failure you
 * can correct and retry. A 504 / dropped connection is UNKNOWN: the transfer may have happened, so
 * we never offer a blind retry — we refresh the balances and tell the user to check them.
 */
export function TransferDialog({
  open, accountId, known, onClose, onDone, onUnknown,
}: {
  open: boolean
  accountId: string
  known: KnownBalances
  onClose: () => void
  /** The transfer went through: the new balances. */
  onDone: (res: TransferResponse, direction: TransferDirection, amount: number) => void
  /** No answer — refresh whatever balance read exists. */
  onUnknown: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    if (open && !dlg.open) dlg.showModal()
    if (!open && dlg.open) dlg.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className="fixed inset-0 !m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-lg border border-line bg-panel p-0 text-ink shadow-card"
    >
      {open && <TransferForm titleId={titleId} accountId={accountId} known={known} onClose={onClose} onDone={onDone} onUnknown={onUnknown} />}
    </dialog>
  )
}

function TransferForm({
  titleId, accountId, known, onClose, onDone, onUnknown,
}: {
  titleId: string
  accountId: string
  known: KnownBalances
  onClose: () => void
  onDone: (res: TransferResponse, direction: TransferDirection, amount: number) => void
  onUnknown: () => void
}) {
  const [direction, setDirection] = useState<TransferDirection>('to_trading')
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'form' })
  const check = checkTransfer(text, direction, known)
  const source = direction === 'to_bank' ? known.trading : known.bank
  const sourceName = direction === 'to_bank' ? 'trading' : 'bank'

  const send = async () => {
    if (check.amount === null) return
    const amount = check.amount
    setPhase({ kind: 'sending', amount })
    try {
      const res = await transferMoney(accountId, direction, amount)
      onDone(res, direction, amount)
    } catch (err) {
      if (isNoAnswer(err)) {
        setPhase({ kind: 'unknown' })
        onUnknown()
      } else {
        setPhase({ kind: 'failed', message: err instanceof ApiError || err instanceof Error ? err.message : 'Something went wrong.' })
      }
    }
  }

  if (phase.kind === 'sending') {
    return (
      <div className="p-5" role="status">
        <h2 id={titleId} className="text-base font-semibold">Transferring {formatMoney(phase.amount)}</h2>
        <p className="mt-2 flex items-center gap-3 text-sm text-muted"><span aria-hidden="true" className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent motion-reduce:animate-none" />Waiting for confirmation…</p>
      </div>
    )
  }
  if (phase.kind === 'unknown') {
    return (
      <div>
        <div className="space-y-3 p-5">
          <h2 id={titleId} className="text-base font-semibold">Transfer</h2>
          <Banner tone="warn" title="No confirmation came back">
            We do not know whether the transfer went through. Check your balances before trying again — it is not retried for you.
          </Banner>
        </div>
        <div className="flex justify-end border-t border-line p-4"><Button variant="primary" onClick={onClose}>Close</Button></div>
      </div>
    )
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
    >
      <div className="space-y-4 p-5">
        <h2 id={titleId} className="text-base font-semibold">Transfer</h2>
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-muted">Direction</legend>
          <div className="grid grid-cols-2 gap-1 rounded-md border border-line bg-raised p-1">
            {DIRECTIONS.map((d) => (
              <label key={d.value} className="relative block">
                <input type="radio" name="transfer-direction" value={d.value} checked={direction === d.value} onChange={() => setDirection(d.value)} className="peer sr-only" />
                <span className={`flex min-h-[44px] cursor-pointer items-center justify-center rounded-sm px-3 text-sm font-semibold peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus ${direction === d.value ? 'border border-line bg-panel text-ink' : 'text-muted hover:text-ink'}`}>
                  {direction === d.value && <span aria-hidden="true" className="mr-1">✓</span>}
                  {d.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field
          label="Amount (units)"
          numeric
          placeholder={(0).toFixed(MONEY_DECIMALS)}
          value={text}
          error={check.error}
          hint={source !== undefined ? `Available in ${sourceName}: ${formatMoney(source)}` : `Your ${sourceName} balance is checked when you submit.`}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          autoFocus
        />
        {phase.kind === 'failed' && (
          <Banner tone="error" title="Transfer failed.">{phase.message}</Banner>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-line p-4">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={check.amount === null}>{phase.kind === 'failed' ? 'Try again' : 'Submit'}</Button>
      </div>
    </form>
  )
}
