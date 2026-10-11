import type { Observation } from '../../api'
import { Button, Num } from '../../components'
import type { Side } from '../../lib/orderTicket'

/** The strip under the tabs: balance at a glance, plus the board's Buy / Sell buttons. (P&L and open counts live in the session bar.) */
export function AccountStrip({
  obs,
  disabled,
  onTrade,
}: {
  obs: Observation | undefined
  disabled: boolean
  onTrade: (side: Side) => void
}) {
  const item = (label: string, value: React.ReactNode) => (
    <div className="flex min-w-0 flex-col">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  )
  return (
    <div role="region" aria-label="Account summary" className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-lg border border-line bg-panel px-4 py-3">
      {item('Trading balance', <Num kind="money" value={obs?.balance.available ?? 0} available={!!obs} />)}
      {item('Reserved for orders', <Num kind="money" value={obs?.balance.reserved ?? 0} available={!!obs} />)}
      <div className="ml-auto flex gap-2">
        <Button variant="buy" disabled={disabled} onClick={() => onTrade('buy')}>Buy</Button>
        <Button variant="sell" disabled={disabled} onClick={() => onTrade('sell')}>Sell</Button>
      </div>
    </div>
  )
}
