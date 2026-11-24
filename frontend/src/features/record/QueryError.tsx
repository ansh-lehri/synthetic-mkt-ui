import { Banner, Button } from '../../components'
import { httpErrorMessage } from '../../lib/errors'

/** A failed read: a friendly message, plus a retry. The rest of the screen stays usable. */
export function QueryError({ title, error, onRetry }: { title: string; error: unknown; onRetry: () => void }) {
  return (
    <Banner
      tone="error"
      title={title}
      action={
        <Button variant="ghost" onClick={onRetry}>
          Retry
        </Button>
      }
    >
      {httpErrorMessage(error)}
    </Banner>
  )
}
