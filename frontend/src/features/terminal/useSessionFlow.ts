import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import {
  ApiError, exitSession, getSession, joinLive, observationKey, sessionKey, startPractice, useSession,
  type ActiveSession, type PracticeCondition, type PracticeLength, type SessionState,
} from '../../api'
import type { BannerTone } from '../../components'
import { isAlreadyInSession, isNoAnswer, type SessionMode } from '../../lib/session'

export type EnterTarget = { kind: 'live' } | { kind: 'practice'; condition: PracticeCondition; length: PracticeLength }

export interface SessionNotice {
  tone: BannerTone
  title: string
  body?: string
}

export interface SwitchPrompt {
  target: EnterTarget
  from: ActiveSession
}

const modeOf = (t: EnterTarget): SessionMode => t.kind

/**
 * Join / start / exit, under the one-session rule.
 *  - Entering while already in a session (we know it, or the server says `409 already_in_session`)
 *    never silently fails and never silently switches: it asks first ("leave X to join Y?"), and
 *    only then exits and enters.
 *  - A request that gets no answer (504 / dropped) is never blindly retried: we re-read
 *    `GET /v1/session` and say what is true.
 *  - Leaving then failing to enter says exactly that ("you left X, but could not enter Y").
 */
export function useSessionFlow(accountId: string, market: string | undefined) {
  const qc = useQueryClient()
  const q = useSession(accountId)
  const active = q.data?.active ?? null
  const [busy, setBusy] = useState<'enter' | 'exit' | null>(null)
  const [notice, setNotice] = useState<SessionNotice>()
  const [prompt, setPrompt] = useState<SwitchPrompt | null>(null)

  const setActive = useCallback(
    (a: ActiveSession | null) => {
      qc.setQueryData<SessionState>(sessionKey(accountId), { active: a })
      if (!a) qc.removeQueries({ queryKey: observationKey(accountId) })
      else void qc.invalidateQueries({ queryKey: observationKey(accountId) })
    },
    [qc, accountId],
  )

  /** Re-read the session and publish it; null if even that failed. */
  const reread = useCallback(async (): Promise<ActiveSession | null | undefined> => {
    try {
      const s = await getSession(accountId)
      setActive(s.active ?? null)
      return s.active ?? null
    } catch {
      return undefined
    }
  }, [accountId, setActive])

  const call = useCallback(
    (t: EnterTarget) => {
      if (!market) throw new Error('No market')
      return t.kind === 'live' ? joinLive(accountId, market) : startPractice(accountId, market, t.condition, t.length)
    },
    [accountId, market],
  )

  const failure = useCallback(
    async (what: string, err: unknown) => {
      if (isNoAnswer(err)) {
        const now = await reread()
        const where = now === undefined ? 'We could not check either.' : now ? `You are in a ${now.type} session.` : 'You are not in a session.'
        setNotice({ tone: 'warn', title: `No answer to ${what}`, body: `${where} Nothing was retried — check, then try again if you need to.` })
      } else {
        setNotice({ tone: 'error', title: `Could not ${what}`, body: err instanceof Error ? err.message : 'Something went wrong.' })
      }
    },
    [reread],
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
        setActive(await call(target))
      } catch (err) {
        if (isAlreadyInSession(err)) {
          // Another tab/device has a session we did not know about. Find out which, then ask.
          const now = await reread()
          if (now) setPrompt({ target, from: now })
          else setNotice({ tone: 'warn', title: 'You were in a session, but it has ended', body: 'Try again.' })
        } else {
          await failure(target.kind === 'live' ? 'join the live session' : 'start practice', err)
        }
      } finally {
        setBusy(null)
      }
    },
    [active, call, failure, reread, setActive],
  )

  const exit = useCallback(async (): Promise<boolean> => {
    setBusy('exit')
    setNotice(undefined)
    try {
      await exitSession(accountId)
      setActive(null)
      return true
    } catch (err) {
      await failure('exit the session', err)
      return false
    } finally {
      setBusy(null)
    }
  }, [accountId, failure, setActive])

  const confirmSwitch = useCallback(async () => {
    if (!prompt) return
    const { target, from } = prompt
    setPrompt(null)
    if (!(await exit())) return
    setBusy('enter')
    try {
      setActive(await call(target))
    } catch (err) {
      const msg = err instanceof ApiError || err instanceof Error ? err.message : 'Something went wrong.'
      setNotice({
        tone: 'error',
        title: `You left the ${from.type} session, but could not ${modeOf(target) === 'live' ? 'join live' : 'start practice'}`,
        body: msg,
      })
    } finally {
      setBusy(null)
    }
  }, [prompt, exit, call, setActive])

  return {
    active,
    /** First answer from GET /v1/session has arrived. */
    known: q.data !== undefined,
    loadError: q.error && q.data === undefined ? q.error : null,
    refetch: () => void q.refetch(),
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
