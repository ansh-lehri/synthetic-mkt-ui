import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './tokens/tokens.css'
import './index.css'
import Routes from './Routes.tsx'

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
