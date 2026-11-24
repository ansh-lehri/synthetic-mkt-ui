import posthog from 'posthog-js'

const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined

if (key) {
  posthog.init(key, {
    api_host: 'https://us.i.posthog.com',
    autocapture: false,
    capture_pageview: false,
  })
}

type Props = Record<string, unknown>

/** Fire-and-forget event. No-ops silently when VITE_POSTHOG_KEY is not set. */
export function track(event: string, props?: Props): void {
  if (!key) return
  posthog.capture(event, props)
}

/**
 * Pin the current browser to a stable identity. Call once when identity becomes known
 * (guest ID minted, account opened, or on boot when already stored).
 */
export function identify(id: string, traits?: Props): void {
  if (!key) return
  posthog.identify(id, traits)
}

/** Attach extra traits to the already-identified person without re-identifying. */
export function setTraits(traits: Props): void {
  if (!key) return
  posthog.setPersonProperties(traits)
}

/** Named page view. Call once per route render. */
export function page(name: string): void {
  if (!key) return
  posthog.capture('$pageview', { page_name: name })
}
