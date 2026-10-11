import { Button, Card } from '../../components'

/**
 * The practice card. The condition / length picker is Phase 4b; until then "Start practice" starts
 * a Normal day for 90 minutes, through the same entry point (and the same one-session rule).
 */
export function PracticeCard({
  marketName, inPractice, note, busy, onStart, onReturn,
}: {
  marketName: string
  inPractice: boolean
  note?: string
  busy: boolean
  onStart: () => void
  onReturn: () => void
}) {
  return (
    <Card as="section" aria-labelledby="pr-h" className="space-y-4 border-dashed !border-muted">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
          <span aria-hidden="true" className="text-muted">◇</span>Practice
        </span>
        <h2 id="pr-h" className="text-xl font-semibold">Practice session</h2>
        <span className="text-sm text-muted">{marketName}</span>
      </div>
      <p className="max-w-xl text-muted">Trade against agents whenever you like, for 60 to 105 minutes. Nothing from practice is recorded.</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {inPractice ? (
          <Button variant="ghost" onClick={onReturn}>Return to session</Button>
        ) : (
          <Button variant="ghost" loading={busy} onClick={onStart}>Start practice</Button>
        )}
        <span className="text-sm text-muted">{inPractice ? 'Practice is in progress.' : note}</span>
      </div>
    </Card>
  )
}
