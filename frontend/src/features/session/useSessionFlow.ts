import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { ApiError, observationKey, type PracticeCondition, type PracticeLength } from '../../api'
import type { BannerTone } from '../../components'
import { exitSession as exitSessionCall, isExitSuccess, isMarketNotLive, isSessionConflict, joinLive as joinLiveCall, startPractice } from '../../lib/sessionActions'
import { resolveCurrentSession, type CurrentSessionState } from '../../lib/sessionRecovery'
import { isNoAnswer, type SessionMode } from '../../lib/session'

export type EnterTarget = { kind: 'live' } | { kind: 'practice'; condition: PracticeCondition; length: PracticeLength }

/** Replaces the old mock-era ActiveSession. closesAt/opensAt are only known for practice
 * (on-demand's session_ends_at / warmup_ends_at) — canonical/live sessions carry no such
 * timers to the frontend; read the market's own session.closes_at/opens_at separately if needed. */
export interface ActiveInfo {
  mode: SessionMode
  market: string
  sessionId: string
  closesAt?: string
  /** RFC3339Nano: when the on-demand warmup ended = when practice trading started. Practice only. */
  opensAt?: string
  /** Practice only: the scenario the user picked (e.g. "busy"). Not in the server response —
   * persisted to sessionStorage keyed by sessionId so it survives a page reload. */
  condition?: string
}

export interface SessionNotice {
  tone: BannerTone
  title: string
  body?: string
  /** Set when practice was refused for a low trading balance (the Home strip keys off it). */
  code?: 'low_balance'
}

export interface SwitchPrompt {
  target: EnterTarget
  from: ActiveInfo
}

function toActiveInfo(s: CurrentSessionState): ActiveInfo | null {
  if (s.kind === 'none') return null
  if (s.status === 'ended' || s.status === 'failed') return null
  const condition = s.mode === 'ondemand'
    ? (sessionStorage.getItem(`session:condition:${s.sessionId}`) ?? undefined)
    : undefined
  return { mode: s.mode === 'canonical' ? 'live' : 'practice', market: s.market, sessionId: s.sessionId, closesAt: s.sessionEndsAt, opensAt: s.warmupEndsAt, condition }
}

/**
 * Join / start / exit, under the one-session rule — rebuilt on the real canonical/on-demand
 * endpoints (lib/sessionActions.ts, lib/sessionRecovery.ts) in place of the old mock-shaped
 * GET /v1/session model. Public shape kept close to the original so EnterSession/SwitchConfirm/
 * SessionBar need minimal changes (BACKEND-INTEGRATION-PLAN.md Phase 4).
 *  - Entering while already in a session (we know it, or the server says 409) never silently
 *    fails and never silently switches: it asks first ("leave X to join Y?"), then exits, then enters.
 *  - A request that gets no answer (504 / dropped) is never blindly retried: we re-read
 *    `POST /session/current` and say what is true.
 *  - Leaving then failing to enter says exactly that.
 */
export function useSessionFlow(userId: string, market: string | undefined, opts: { onEntered?: (s: ActiveInfo) => void } = {}) {
  const qc = useQueryClient()
  const [active, setActiveState] = useState<ActiveInfo | null>(null)
  const [known, setKnown] = useState(false)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [busy, setBusy] = useState<'enter' | 'exit' | null>(null)
  const [notice, setNotice] = useState<SessionNotice>()
  const [prompt, setPrompt] = useState<SwitchPrompt | null>(null)

  const setActive = useCallback(
    (a: ActiveInfo | null) => {
      setActiveState(a)
      if (!a) qc.removeQueries({ queryKey: observationKey(userId) })
      else void qc.invalidateQueries({ queryKey: observationKey(userId) })
    },
    [qc, userId],
  )

  const load = useCallback(async () => {
    try {
      const s = await resolveCurrentSession(userId)
      setActive(toActiveInfo(s))
      setKnown(true)
      setLoadError(null)
    } catch (err) {
      setLoadError(err)
    }
  }, [userId, setActive])

  // Resolve once per userId — callers that need a fresh load call refetch().
  useEffect(() => {
    void load()
  }, [load])

  /** Re-read the session and publish it; undefined if even that failed. */
  const reread = useCallback(async (): Promise<ActiveInfo | null | undefined> => {
    try {
      const s = await resolveCurrentSession(userId)
      const info = toActiveInfo(s)
      setActive(info)
      return info
    } catch {
      return undefined
    }
  }, [userId, setActive])

  const failure = useCallback(
    async (what: string, err: unknown) => {
      if (isNoAnswer(err)) {
        const now = await reread()
        const where = now === undefined ? 'We could not check either.' : now ? `You are in a ${now.mode} session.` : 'You are not in a session.'
        setNotice({ tone: 'warn', title: `No answer to ${what}`, body: `${where} Nothing was retried — check, then try again if you need to.` })
      } else {
        setNotice({ tone: 'error', title: `Could not ${what}`, body: err instanceof Error ? err.message : 'Something went wrong.' })
      }
    },
    [reread],
  )

  const call = useCallback(
    async (t: EnterTarget): Promise<{ info: ActiveInfo; lowBalance?: boolean }> => {
      if (!market) throw new Error('No market')
      if (t.kind === 'live') {
        const r = await joinLiveCall(userId, market)
        return { info: { mode: 'live', market, sessionId: r.session_id } }
      }
      const outcome = await startPractice(userId, market, t.length, t.condition)
      if (outcome.kind === 'insufficient_funds') {
        return { info: { mode: 'practice', market, sessionId: '' }, lowBalance: true }
      }
      const sessionId = outcome.body.session_id
      sessionStorage.setItem(`session:condition:${sessionId}`, t.condition)
      return { info: { mode: 'practice', market, sessionId, closesAt: outcome.body.session_ends_at, opensAt: outcome.body.warmup_ends_at, condition: t.condition } }
    },
    [userId, market],
  )

  const enter = useCallback(
    async (target: EnterTarget) => {
      if (active) {
        setPrompt({ target, from: active }) // already in one: ask before leaving it
        return
      }
      setBusy('enter')
      setNotice(undefined)
      try {
        const { info, lowBalance } = await call(target)
        if (lowBalance) {
          setNotice({
            tone: 'warn',
            code: 'low_balance',
            title: 'Your trading balance is below the minimum for practice',
            body: 'Practice is paused. Transfer from your bank balance to start it.',
          })
          return
        }
        setActive(info)
        opts.onEntered?.(info)
      } catch (err) {
        if (isMarketNotLive(err)) {
          // The canonical market spinup hasn't completed yet — this is a timing race,
          // not a session conflict. No reread needed; the user has no session to switch from.
          setNotice({ tone: 'warn', title: "Market isn't open yet", body: "The session window hasn't opened on the server yet — wait a moment and try again." })
        } else if (isSessionConflict(err)) {
          // Another tab/device has a session we did not know about. Find out which, then ask.
          const now = await reread()
          if (now) setPrompt({ target, from: now })
          else if (now === null) setNotice({ tone: 'warn', title: 'That session has already ended', body: 'Try again.' })
          else setNotice({ tone: 'error', title: 'Could not verify your session', body: 'The server did not respond. Refresh and try again.' })
        } else {
          await failure(target.kind === 'live' ? 'join the live session' : 'start practice', err)
        }
      } finally {
        setBusy(null)
      }
    },
    [active, call, failure, reread, setActive, opts],
  )

  const exit = useCallback(async (): Promise<boolean> => {
    if (!active) return true
    setBusy('exit')
    setNotice(undefined)
    try {
      await exitSessionCall(active.sessionId)
      setActive(null)
      return true
    } catch (err) {
      if (err instanceof ApiError && isExitSuccess(err.status)) {
        setActive(null)
        return true
      }
      await failure('exit the session', err)
      return false
    } finally {
      setBusy(null)
    }
  }, [active, failure, setActive])

  const confirmSwitch = useCallback(async () => {
    if (!prompt) return
    const { target, from } = prompt
    setPrompt(null)
    if (!(await exit())) return
    setBusy('enter')
    try {
      const { info, lowBalance } = await call(target)
      if (lowBalance) {
        setNotice({
          tone: 'warn',
          code: 'low_balance',
          title: 'Your trading balance is below the minimum for practice',
          body: 'Practice is paused. Transfer from your bank balance to start it.',
        })
        return
      }
      setActive(info)
      opts.onEntered?.(info)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      setNotice({
        tone: 'error',
        title: `You left the ${from.mode} session, but could not ${target.kind === 'live' ? 'join live' : 'start practice'}`,
        body: msg,
      })
    } finally {
      setBusy(null)
    }
  }, [prompt, exit, call, setActive, opts])

  return {
    active,
    known,
    loadError,
    refetch: () => void load(),
    busy,
    notice,
    dismiss: () => setNotice(undefined),
    prompt,
    cancelSwitch: () => setPrompt(null),
    enter,
    exit,
    confirmSwitch,
  }
}
