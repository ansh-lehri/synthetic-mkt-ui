import { apiBase } from './config'

/**
 * A failed API call. The contract has two error envelopes:
 *   {"error": "<human message>"}   -> `message`
 *   {"reason": "<snake_case tag>"} -> `reason` (business rejects: 409 / 422)
 * `status` is 0 when the request never got a response (network down, CORS, etc.).
 *
 * NOTE: a 504 does NOT mean "nothing happened". Callers must reconcile with a read
 * before retrying any POST — this client never retries on its own.
 */
export class ApiError extends Error {
  readonly status: number
  readonly reason?: string
  readonly body: unknown

  constructor(status: number, message: string, reason?: string, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.reason = reason
    this.body = body
  }
}

type Query = Record<string, string | number | boolean | undefined>

function buildUrl(path: string, query?: Query): string {
  const url = new URL(apiBase() + path, window.location.origin)
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v))
  }
  return url.toString()
}

async function request<T>(method: 'GET' | 'POST', path: string, query?: Query, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (err) {
    throw new ApiError(0, err instanceof Error ? err.message : 'Network error')
  }

  let parsed: unknown
  const text = await res.text()
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = undefined
    }
  }

  if (!res.ok) {
    const env = (parsed ?? {}) as { error?: string; reason?: string }
    throw new ApiError(res.status, env.error ?? env.reason ?? `HTTP ${res.status}`, env.reason, parsed)
  }
  return parsed as T
}

export function apiGet<T>(path: string, query?: Query): Promise<T> {
  return request<T>('GET', path, query)
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>('POST', path, undefined, body)
}
