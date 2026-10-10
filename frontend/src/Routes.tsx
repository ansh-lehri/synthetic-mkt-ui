import { lazy, Suspense } from 'react'
import App from './App.tsx'
import KitPage from './features/kit/KitPage.tsx'
import RecordPage from './features/record/RecordPage.tsx'

// The Terminal pulls in the charting library, so it loads on demand (not for Record or /kit).
const TerminalPage = lazy(() => import('./features/terminal/TerminalPage.tsx'))

/** Pathname -> page. No router dependency yet; replace this one file when a router lands. */
export default function Routes() {
  switch (window.location.pathname.replace(/\/+$/, '')) {
    case '/kit':
      return <KitPage />
    case '/record':
      return <RecordPage />
    case '/terminal':
      return (
        <Suspense fallback={<p className="p-6 text-sm text-muted" role="status">Loading Terminal…</p>}>
          <TerminalPage />
        </Suspense>
      )
    default:
      return <App />
  }
}
