import { ConfirmDialog } from '../../components'
import { switchCopy } from '../../lib/session'
import type { useSessionFlow } from './useSessionFlow'

/** The one-session rule's confirm: "Leave X to join/start Y?" — shown while the flow holds a
 * switch prompt. No specific close time is shown here (canonical sessions carry no end timer
 * to the frontend at all; see useSessionFlow.ts's ActiveInfo) — switchCopy's generic wording
 * covers that case already. */
export function SwitchConfirm({ session }: { session: ReturnType<typeof useSessionFlow> }) {
  const p = session.prompt
  if (!p) return null
  return (
    <ConfirmDialog
      open
      tone="danger"
      {...switchCopy(p.from.mode, p.target.kind, undefined)}
      cancelLabel="Stay"
      onCancel={session.cancelSwitch}
      onConfirm={() => void session.confirmSwitch()}
    />
  )
}
