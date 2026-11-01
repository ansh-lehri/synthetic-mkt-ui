import { Button, Card } from '../../components'
import type { LiveCardView } from '../../lib/liveCard'

/** The live-session card: hours, the countdown (or time), the phase pill and the join / return button. */
export function LiveCard({
  marketName, window: hours, view, onReturn,
}: {
  marketName: string
  /** "09:15 – 15:30 · Asia/Kolkata" */
  window: string
  view: LiveCardView
  onReturn: () => void
}) {
  return (
    <Card as="section" aria-labelledby="live-h" bodyClassName="!p-0">
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
            <span aria-hidden="true" className="text-gain">◆</span>Live
          </span>
          <h2 id="live-h" className="text-xl font-semibold">{marketName} session</h2>
          <span className="text-sm text-muted">{hours}</span>
          <span className="ml-auto inline-flex items-center gap-2 rounded-pill border border-line px-3 py-1 text-sm font-medium" data-testid="live-status">
            <span aria-hidden="true" className={view.dot === 'solid' ? 'text-gain' : 'text-muted'}>{view.dot === 'solid' ? '●' : '○'}</span>
            {view.status}
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted" data-testid="live-label">{view.label}</span>
            <span
              className="tnum text-5xl font-semibold leading-tight"
              data-testid="live-big"
              {...(view.counting ? { role: 'timer', 'aria-label': `${view.label} ${view.big}` } : {})}
            >
              {view.big}
            </span>
          </div>
          <p className="max-w-md flex-1 basis-64 text-muted">{view.info}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {view.button === 'return' ? (
            <Button variant="primary" onClick={onReturn}>Return to session</Button>
          ) : (
            <Button variant="primary" disabled>Join live session</Button>
          )}
          <span className="text-sm text-muted">Coming soon</span>
        </div>
      </div>
    </Card>
  )
}
