import App from './App.tsx'
import KitPage from './features/kit/KitPage.tsx'
import RecordPage from './features/record/RecordPage.tsx'

/** Pathname -> page. No router dependency yet; replace this one file when a router lands. */
export default function Routes() {
  switch (window.location.pathname.replace(/\/+$/, '')) {
    case '/kit':
      return <KitPage />
    case '/record':
      return <RecordPage />
    default:
      return <App />
  }
}
