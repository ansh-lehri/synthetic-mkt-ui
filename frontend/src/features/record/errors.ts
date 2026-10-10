/** Was this a 501 (feature not implemented for the requested country)? */
export function isNotImplemented(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 501
}
