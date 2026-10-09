import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './tokens/tokens.css'
import './index.css'
import App from './App.tsx'
import KitPage from './features/kit/KitPage.tsx'

// Reads retry once; mutations never retry (a failed POST must be reconciled with a read,
// not blindly re-sent).
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 }, mutations: { retry: 0 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Tiny pathname switch until the router lands in Phase 1b. */}
      {window.location.pathname.replace(/\/+$/, '') === '/kit' ? <KitPage /> : <App />}
    </QueryClientProvider>
  </StrictMode>,
)
