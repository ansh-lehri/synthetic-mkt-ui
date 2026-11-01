import { ApiError } from '../api/client'

/**
 * Turn any thrown value into a short, user-facing message.
 * Never exposes raw backend text, HTTP status codes, or internal reason tags.
 */
export function httpErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Something went wrong. Try again.'
  if (err.status === 0) return 'Connection problem. Check your internet and try again.'
  if (err.status === 401 || err.status === 403) return 'Your session has expired. Try refreshing the page.'
  if (err.status === 409) {
    if (err.reason === 'already_in_session') return 'You are already in a session on another device.'
    if (err.reason === 'below_minimum_balance') return 'Your trading balance is below the minimum for practice.'
    return 'Action not available right now.'
  }
  if (err.status === 503) return 'The service is temporarily unavailable. Try again in a moment.'
  if (err.status === 504) return 'The request timed out. Nothing was retried — check your positions before trying again.'
  if (err.status >= 500) return 'Something went wrong on our end. Try again.'
  return 'Something went wrong. Try again.'
}
