import { useId, useState } from 'react'
import { Banner, Button, Card } from '../../components'
import { DEFAULT_CONDITION, DEFAULT_LENGTH, PRACTICE_CONDITIONS, PRACTICE_LENGTHS } from '../../lib/session'
import type { PracticeCondition, PracticeLength } from '../../api'
import type { EnterTarget, SessionNotice } from '../session/useSessionFlow'
import RegisterModal from '../landing/RegisterModal'

/**
 * "You are not in a session" — and the two ways in: join the live session, or start a practice
 * one (a minimal scenario + length picker). Shown whenever `GET /v1/session` says `active: null`.
 */
export function EnterSession({
  marketName,
  busy,
  notice,
  onDismiss,
  onEnter,
  guestRemaining,
}: {
  marketName: string | undefined
  busy: boolean
  notice?: SessionNotice
  onDismiss: () => void
  onEnter: (t: EnterTarget) => void
  /** Defined only for guest users. undefined = still loading. 0 = no sessions left. */
  guestRemaining?: number
}) {
  const [condition, setCondition] = useState<PracticeCondition>(DEFAULT_CONDITION)
  const [length, setLength] = useState<PracticeLength>(DEFAULT_LENGTH)
  const [registerOpen, setRegisterOpen] = useState(false)
  const cId = useId()
  const lId = useId()
  const sel = 'min-h-[44px] w-full rounded-md border border-line bg-raised px-3 text-sm text-ink'
  const outOfTrials = guestRemaining !== undefined && guestRemaining <= 0
  return (
    <>
      <Card as="section" aria-label="Enter a session" title="You are not in a session">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Live prices, orders and your account all need a session — the real backend has no
            market-data feed without one. Join the live {marketName ?? 'market'} session to trade with your balance, or start a practice session on a scenario.
          </p>
          {notice && <Banner tone={notice.tone} title={notice.title} onDismiss={onDismiss}>{notice.body}</Banner>}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col justify-between gap-3 rounded-md border border-line p-4 opacity-60">
              <div>
                <h3 className="font-semibold">Live session <span className="ml-1 rounded-pill border border-line px-2 py-0.5 text-xs font-normal text-muted">Coming soon</span></h3>
                <p className="mt-1 text-sm text-muted">Trade the market&apos;s real session. Results go to your Record. Open positions close automatically at the close.</p>
              </div>
              <Button variant="primary" disabled>Join live session</Button>
            </div>
            <div className="flex flex-col gap-3 rounded-md border border-dashed border-muted p-4">
              <div>
                <h3 className="font-semibold">Practice</h3>
                <p className="mt-1 text-sm text-muted">
                  {outOfTrials
                    ? 'You have used all your free sessions.'
                    : 'A scenario of your choice. Nothing from it is recorded.'}
                </p>
                {!outOfTrials && guestRemaining !== undefined && (
                  <p className="mt-1 text-xs text-muted">{guestRemaining} free session{guestRemaining === 1 ? '' : 's'} remaining.</p>
                )}
              </div>
              {!outOfTrials && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={cId} className="mb-1 block text-xs font-medium text-muted">Scenario</label>
                    <select id={cId} className={sel} value={condition} onChange={(e) => setCondition(e.target.value as PracticeCondition)}>
                      {PRACTICE_CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={lId} className="mb-1 block text-xs font-medium text-muted">Length</label>
                    <select id={lId} className={sel} value={length} onChange={(e) => setLength(Number(e.target.value) as PracticeLength)}>
                      {PRACTICE_LENGTHS.map((n) => <option key={n} value={n}>{n} min</option>)}
                    </select>
                  </div>
                </div>
              )}
              {outOfTrials ? (
                <Button variant="primary" onClick={() => setRegisterOpen(true)}>Register for full access →</Button>
              ) : (
                <Button variant="ghost" disabled={!marketName} loading={busy} onClick={() => onEnter({ kind: 'practice', condition, length })}>Start practice</Button>
              )}
            </div>
          </div>
        </div>
      </Card>
      <RegisterModal
        source="free_limit_wall"
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        wallMessage="You've used all your free sessions. Register for full access — it's free."
      />
    </>
  )
}
