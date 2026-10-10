// Human labels for the contract's cost-line names (IN rules) and exit reasons.

const COST_LABELS: Record<string, string> = {
  stt: 'Securities transaction tax (STT)',
  exchange: 'Exchange charges',
  sebi: 'SEBI charges',
  stamp: 'Stamp duty',
  gst: 'GST',
  autosquare_fee: 'Auto square-off fee',
}

const COST_SHORT: Record<string, string> = {
  stt: 'STT',
  exchange: 'Exchange',
  sebi: 'SEBI',
  stamp: 'Stamp',
  gst: 'GST',
  autosquare_fee: 'Auto square-off',
}

function humanise(name: string): string {
  const s = name.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Long label for the aggregate list. Unknown names (new rules) still render, humanised. */
export function costLabel(name: string): string {
  return COST_LABELS[name] ?? humanise(name)
}

/** Short label for the inline per-trade breakdown. */
export function costShortLabel(name: string): string {
  return COST_SHORT[name] ?? humanise(name)
}

/**
 * Tag for a trade's exit reason, or null for an ordinary manual close. The contract only says
 * `exit_reason` is a string, so anything that isn't "manual" is shown (an automatic close is
 * the board's "auto" tag; other reasons are shown as written).
 */
export function exitReasonTag(reason: string): string | null {
  if (!reason || reason === 'manual') return null
  if (/auto/i.test(reason)) return 'auto'
  return humanise(reason)
}
