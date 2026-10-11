import { ConfirmDialog } from '../../components'
import { closeLabel, switchCopy } from '../../lib/session'
import type { useSessionFlow } from './useSessionFlow'

/** The one-session rule's confirm: "Leave X to join/start Y?" — shown while the flow holds a switch prompt. */
export function SwitchConfirm({ session }: { session: ReturnType<typeof useSessionFlow> }) {
  const p = session.prompt
  if (!p) return null
  return (
    <ConfirmDialog
      open
      tone="danger"
      {...switchCopy(p.from.type, p.target.kind, closeLabel(p.from.closes_at))}
      cancelLabel="Stay"
      onCancel={session.cancelSwitch}
      onConfirm={() => void session.confirmSwitch()}
    />
  )
}
