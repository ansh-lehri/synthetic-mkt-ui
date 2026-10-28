import { lazy, Suspense } from 'react'
import HomePage from './features/home/HomePage.tsx'
import LandingPage from './features/landing/LandingPage.tsx'
import PracticePage from './features/practice/PracticePage.tsx'
import KitPage from './features/kit/KitPage.tsx'
import RecordPage from './features/record/RecordPage.tsx'
import SignupPage from './features/signup/SignupPage.tsx'

// The Terminal pulls in the charting library, so it loads on demand (not for Record or /kit).
const TerminalPage = lazy(() => import('./features/terminal/TerminalPage.tsx'))

/** Pathname -> page. No router dependency yet; replace this one file when a router lands. */
export default function Routes() {
  switch (window.location.pathname.replace(/\/+$/, '')) {
    case '/app':
      return <HomePage />
    case '/kit':
      return <KitPage />
    case '/signup':
      return <SignupPage />
    case '/practice':
      return <PracticePage />
    case '/record':
      return <RecordPage />
    case '/terminal':
      return (
        <Suspense fallback={<p className="p-6 text-sm text-muted" role="status">Loading Terminal…</p>}>
          <TerminalPage />
        </Suspense>
      )
    default:
      return <LandingPage /> // '/' and anything unknown
  }
}
