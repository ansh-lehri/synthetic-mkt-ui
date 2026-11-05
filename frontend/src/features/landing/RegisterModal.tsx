import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import { postEarlyAccess } from '../../api/landing'
import type { EarlyAccessRequest } from '../../api/landing'
import { Button } from '../../components'
import { track } from '../../lib/analytics'

interface Props {
  source: 'hero' | 'footer' | 'nav' | 'free_limit_wall'
  open: boolean
  onClose: () => void
  wallMessage?: string
}

type Phase = 'form' | 'success'

const fieldClass = 'w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none'

export default function RegisterModal({ source, open, onClose, wallMessage }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  const [email, setEmail] = useState('')
  const [experience, setExperience] = useState<'' | 'new' | 'some' | 'active'>('')
  const [market, setMarket] = useState<'' | 'india' | 'us'>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('form')

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open) {
      el.showModal()
      emailRef.current?.focus()
      track('register_modal_opened', { source, page: window.location.pathname })
    } else {
      el.close()
    }
  }, [open, source])

  useEffect(() => {
    if (open) {
      setEmail('')
      setExperience('')
      setMarket('')
      setError(null)
      setLoading(false)
      setPhase('form')
    }
  }, [open])

  function handleClose() {
    dialogRef.current?.close()
    onClose()
  }

  function emailValid(v: string) {
    return v.trim().length > 0 && v.includes('@')
  }

  const canSubmit = emailValid(email) && experience !== ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || loading) return
    setLoading(true)
    setError(null)
    try {
      const req: EarlyAccessRequest = {
        email: email.trim(),
        experience: experience as 'new' | 'some' | 'active',
        market: market === '' ? null : market,
        source,
      }
      await postEarlyAccess(req)
      track('register_form_succeeded', { experience: req.experience, market: req.market, source })
      setPhase('success')
    } catch (err: unknown) {
      const reason = err instanceof ApiError ? err.reason : undefined
      let errorKind: string
      if (reason === 'invalid_email') {
        setError('Enter a valid email.')
        errorKind = 'invalid_email'
      } else if (reason === 'missing_experience') {
        setError('Please select your experience level.')
        errorKind = 'missing_experience'
      } else {
        setError('Something went wrong. Try again.')
        errorKind = 'network'
      }
      track('register_form_failed', { reason: errorKind, source })
    } finally {
      setLoading(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 !m-auto h-fit w-[calc(100%-2rem)] max-w-md rounded-xl border border-line bg-panel p-0 text-ink shadow-card backdrop:bg-[var(--scrim)]"
      onClose={onClose}
      aria-label="Register as early tester"
    >
      <div className="relative p-6">
        <button
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-raised hover:text-ink"
          onClick={handleClose}
          aria-label="Close"
        >
          ✕
        </button>

        {phase === 'success' ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-soft text-2xl text-accent" aria-hidden="true">✓</div>
            <h3 className="text-lg font-semibold">You're on the list</h3>
            <p className="text-sm text-muted">We'll be in touch.</p>
            <Button variant="primary" onClick={handleClose}>Close</Button>
          </div>
        ) : (
          <>
            {wallMessage && (
              <div className="mb-4 rounded-lg border border-line bg-soft px-4 py-3 text-sm font-medium text-accent">
                {wallMessage}
              </div>
            )}
            <h3 className="pr-8 text-lg font-semibold">Register as early tester</h3>
            <p className="mb-5 mt-1 text-sm text-muted">Free during early access. No real money, ever.</p>

            <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
              <div className="flex flex-col gap-1">
                <label htmlFor="rm-email" className="text-sm font-medium">Email</label>
                <input
                  id="rm-email"
                  ref={emailRef}
                  type="email"
                  className={fieldClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
                {error && error.toLowerCase().includes('email') && (
                  <span className="text-xs text-loss">{error}</span>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="rm-exp" className="text-sm font-medium">Experience</label>
                <select
                  id="rm-exp"
                  className={fieldClass}
                  value={experience}
                  onChange={(e) => setExperience(e.target.value as '' | 'new' | 'some' | 'active')}
                  required
                >
                  <option value="" disabled>How much market experience do you have?</option>
                  <option value="new">New to markets</option>
                  <option value="some">Traded a bit</option>
                  <option value="active">Active trader</option>
                </select>
                {error && error.toLowerCase().includes('experience') && (
                  <span className="text-xs text-loss">{error}</span>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="rm-mkt" className="text-sm font-medium">
                  Market <span className="font-normal text-muted">(optional)</span>
                </label>
                <select
                  id="rm-mkt"
                  className={fieldClass}
                  value={market}
                  onChange={(e) => setMarket(e.target.value as '' | 'india' | 'us')}
                >
                  <option value="">Which market? (optional)</option>
                  <option value="india">India</option>
                  <option value="us">US</option>
                </select>
              </div>

              {error && !error.toLowerCase().includes('email') && !error.toLowerCase().includes('experience') && (
                <div className="rounded-lg border border-line bg-raised px-3 py-2 text-sm text-loss">{error}</div>
              )}

              <Button type="submit" variant="primary" fullWidth disabled={!canSubmit} loading={loading}>
                Register
              </Button>
            </form>
          </>
        )}
      </div>
    </dialog>
  )
}
