import { useEffect, useRef, useState } from 'react'
import { postEarlyAccess } from '../../api/landing'
import type { EarlyAccessRequest } from '../../api/landing'
import './landing.css'

interface Props {
  source: 'hero' | 'footer' | 'nav' | 'free_limit_wall'
  open: boolean
  onClose: () => void
  wallMessage?: string
}

type Phase = 'form' | 'success'

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
    } else {
      el.close()
    }
  }, [open])

  // Reset form state when opened
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
      setPhase('success')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown'
      if (msg === 'invalid_email') {
        setError('Enter a valid email.')
      } else if (msg === 'missing_experience') {
        setError('Please select your experience level.')
      } else {
        setError('Something went wrong. Try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="l-modal"
      onClose={onClose}
      aria-label="Register as early tester"
    >
      <div className="l-modal-inner">
        <button className="l-modal-x" onClick={handleClose} aria-label="Close">✕</button>

        {phase === 'success' ? (
          <div className="l-modal-ok">
            <div className="l-modal-ok-icon" aria-hidden="true">✓</div>
            <h3>You're on the list</h3>
            <p>We'll be in touch.</p>
            <button className="l-btn l-btn-primary l-modal-close-btn" onClick={handleClose}>
              Close
            </button>
          </div>
        ) : (
          <>
            {wallMessage && (
              <div className="l-modal-wall">{wallMessage}</div>
            )}
            <h3 className="l-modal-title">Register as early tester</h3>
            <p className="l-modal-sub">Free during early access. No real money, ever.</p>

            <form className="l-modal-form" onSubmit={handleSubmit} noValidate>
              <div className="l-field">
                <label htmlFor="rm-email" className="l-label">Email</label>
                <input
                  id="rm-email"
                  ref={emailRef}
                  type="email"
                  className="l-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
                {error && error.toLowerCase().includes('email') && (
                  <span className="l-field-err">{error}</span>
                )}
              </div>

              <div className="l-field">
                <label htmlFor="rm-exp" className="l-label">Experience</label>
                <select
                  id="rm-exp"
                  className="l-select"
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
                  <span className="l-field-err">{error}</span>
                )}
              </div>

              <div className="l-field">
                <label htmlFor="rm-mkt" className="l-label">Market <span className="l-label-opt">(optional)</span></label>
                <select
                  id="rm-mkt"
                  className="l-select"
                  value={market}
                  onChange={(e) => setMarket(e.target.value as '' | 'india' | 'us')}
                >
                  <option value="">Which market? (optional)</option>
                  <option value="india">India</option>
                  <option value="us">US</option>
                </select>
              </div>

              {error && !error.toLowerCase().includes('email') && !error.toLowerCase().includes('experience') && (
                <div className="l-modal-err">{error}</div>
              )}

              <button
                type="submit"
                className="l-btn l-btn-primary l-modal-submit"
                disabled={!canSubmit || loading}
              >
                {loading ? 'Submitting…' : 'Register'}
              </button>
            </form>
          </>
        )}
      </div>
    </dialog>
  )
}
