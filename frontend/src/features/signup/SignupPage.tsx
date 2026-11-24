import { useState, type FormEvent } from 'react'
import { Banner, Button, Card, Field } from '../../components'
import { httpErrorMessage } from '../../lib/errors'
import { openAccount, storeAccountId, storeEmail } from '../../lib/identity'

const go = (path: string) => window.location.assign(path)

/**
 * Signup/login — deliberately minimal: email + submit, nothing else. POST
 * /v1/account/open is idempotent (same email -> same account_id every time), so this
 * screen serves both a first-time signup and a returning login identically. Shown only
 * when no account_id is stored yet (see lib/identity.ts); never shown again after.
 */
export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    setError(undefined)
    try {
      const trimmed = email.trim()
      const { account_id } = await openAccount(trimmed)
      storeAccountId(account_id)
      storeEmail(trimmed)
      go('/app')
    } catch (err) {
      setError(httpErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <Card className="w-full max-w-sm" bodyClassName="space-y-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-accent">[Simulation]</p>
          <h1 className="mt-1 text-lg font-semibold text-ink">Sign in to continue</h1>
        </div>
        {error && (
          <Banner tone="error" title="Could not sign you in">
            {error}
          </Banner>
        )}
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
          <Button type="submit" variant="primary" fullWidth loading={busy}>
            Continue
          </Button>
        </form>
        <p className="text-xs text-muted">
          This is a simulation. No real money, trades or market data are involved — everything here is synthetic.
        </p>
      </Card>
    </div>
  )
}
