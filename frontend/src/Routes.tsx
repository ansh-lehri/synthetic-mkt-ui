import { lazy, Suspense } from 'react'
import HomePage from './features/home/HomePage.tsx'
import LandingPage from './features/landing/LandingPage.tsx'
import PracticePage from './features/practice/PracticePage.tsx'
import KitPage from './features/kit/KitPage.tsx'
import RecordPage from './features/record/RecordPage.tsx'
import SignupPage from './features/signup/SignupPage.tsx'
import { page } from './lib/analytics'

// The Terminal pulls in the charting library, so it loads on demand (not for Record or /kit).
const TerminalPage = lazy(() => import('./features/terminal/TerminalPage.tsx'))

/** Pathname -> page. No router dependency yet; replace this one file when a router lands. */
export default function Routes() {
  const path = window.location.pathname.replace(/\/+$/, '')
  switch (path) {
    case '/app':
      page('home')
      return <HomePage />
    case '/kit':
      page('kit')
      return <KitPage />
    case '/signup':
      page('signup')
      return <SignupPage />
    case '/practice':
      page('practice')
      return <PracticePage />
    case '/record':
      page('record')
      return <RecordPage />
    case '/terminal':
      page('terminal')
      return (
        <Suspense fallback={<p className="p-6 text-sm text-muted" role="status">Loading Terminal…</p>}>
          <TerminalPage />
        </Suspense>
      )
    default:
      page('landing')
      return <LandingPage /> // '/' and anything unknown
  }
}
