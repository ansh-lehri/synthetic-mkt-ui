import { Banner, Button } from '../../components'

/** A failed read: the real message, plus a retry. The rest of the screen stays usable. */
export function QueryError({ title, error, onRetry }: { title: string; error: unknown; onRetry: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.'
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
      {message}
    </Banner>
  )
}
