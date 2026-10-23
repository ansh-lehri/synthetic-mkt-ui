// The globally selected market (the top bar's dropdown). Remembered per browser; the first market
// the backend lists is the default. Home reads it; balances are global and do not depend on it.
import { create } from 'zustand'

const KEY = 'selected-market'

function load(): string | null {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null
  }
}

interface State {
  code: string | null
  select: (code: string) => void
}

export const useSelectedMarket = create<State>((set) => ({
  code: load(),
  select: (code) => {
    try {
      window.localStorage.setItem(KEY, code)
    } catch {
      // private mode etc.: the choice just won't be remembered
    }
    set({ code })
  },
}))

/** The chosen market if the backend still lists it, else the first listed one. */
export function pickMarket<T extends { tag: string }>(markets: readonly T[], chosen: string | null): T | undefined {
  return markets.find((m) => m.tag === chosen) ?? markets[0]
}
