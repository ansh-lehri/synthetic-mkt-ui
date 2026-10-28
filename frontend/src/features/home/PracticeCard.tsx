import { Button, Card } from '../../components'

/** The practice card. "Start practice" opens the setup screen (`/practice`): conditions, length, start. */
export function PracticeCard({
  marketName, inPractice, onStart, onReturn, guestRemaining,
}: {
  marketName: string
  inPractice: boolean
  onStart: () => void
  onReturn: () => void
  /** When set, the user is a guest and this is how many free sessions remain. */
  guestRemaining?: number
}) {
  const guestOut = guestRemaining !== undefined && guestRemaining <= 0

  return (
    <Card as="section" aria-labelledby="pr-h" bodyClassName="space-y-4 !p-5" className="border-dashed !border-muted">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
          <span aria-hidden="true" className="text-muted">◇</span>Practice
        </span>
        <h2 id="pr-h" className="text-xl font-semibold">Practice session</h2>
        <span className="text-sm text-muted">{marketName}</span>
      </div>
      <p className="max-w-xl text-muted">Trade against agents whenever you like, for 60 to 105 minutes. Nothing from practice is recorded.</p>
      {guestRemaining !== undefined && (
        <p className="text-sm text-muted">
          {guestOut
            ? 'Free sessions used up. Register for full access.'
            : `${guestRemaining} free session${guestRemaining === 1 ? '' : 's'} remaining.`}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {inPractice ? (
          <Button variant="ghost" onClick={onReturn}>Return to session</Button>
        ) : guestOut ? (
          <Button variant="ghost" disabled>Start practice</Button>
        ) : (
          <Button variant="ghost" onClick={onStart}>Start practice</Button>
        )}
        <span className="text-sm text-muted">{inPractice ? 'Practice is in progress.' : ''}</span>
      </div>
    </Card>
  )
}
