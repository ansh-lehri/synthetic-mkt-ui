import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './tokens/tokens.css'
import './index.css'
import Routes from './Routes.tsx'
import { identify } from './lib/analytics'
import { getStoredAccountId, getStoredEmail } from './lib/identity'
import { isGuestEmail } from './lib/guestIdentity'

// Re-identify on every page load so PostHog links events to the right person.
const _storedEmail = getStoredEmail()
const _storedAccountId = getStoredAccountId()
if (_storedEmail && _storedAccountId) {
  identify(_storedEmail, { account_id: _storedAccountId, is_guest: isGuestEmail(_storedEmail) })
}

// Reads retry once; mutations never retry (a failed POST must be reconciled with a read,
// not blindly re-sent).
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 }, mutations: { retry: 0 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Routes />
    </QueryClientProvider>
  </StrictMode>,
)
