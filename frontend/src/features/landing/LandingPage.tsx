import { useState } from 'react'
import './landing.css'
import { getGuestQuota } from '../../api/landing'
import { openAccount, storeAccountId, storeEmail, getStoredAccountId } from '../../lib/identity'
import { guestEmail, getStoredGuestId, mintOrLoadGuestId } from '../../lib/guestIdentity'
import { identify, setTraits, track } from '../../lib/analytics'
import RegisterModal from './RegisterModal'
import Tape from './Tape'

const ICON = (
  <svg viewBox="0 0 100 100" width="24" height="24" style={{ flexShrink: 0 }} aria-hidden="true">
    <rect x="6" y="6" width="88" height="88" rx="22" fill="#3350DD" />
    <g transform="translate(50 50) scale(0.82) translate(-50 -50)">
      <g fill="none" stroke="#fff" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round">
        <path d="M37 22 V78" />
        <path d="M37 22 H49 A14 14 0 0 1 49 50 H37" />
        <path d="M37 50 H51 A14.5 14.5 0 0 1 51 78 H37" />
      </g>
      <line x1="37" y1="7" x2="37" y2="93" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
    </g>
  </svg>
)

// Paste the YouTube video ID here once uploaded (e.g. "dQw4w9WgXcQ").
// Leave empty to keep the static mockup in place during development.
const YT_VIDEO_ID = 'o56haH6AIXw'

type RegisterSource = 'hero' | 'nav' | 'footer' | 'free_limit_wall'

export default function LandingPage() {
  const [registerSource, setRegisterSource] = useState<RegisterSource | null>(null)
  const [trialBusy, setTrialBusy] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)

  async function handleTryFree(e: React.MouseEvent) {
    e.preventDefault()
    if (trialBusy) return
    track('landing_cta_clicked', { cta: 'try_free' })

    // If the user already has a stored identity (returning visitor), take them
    // straight to the app — no quota check, no account open needed.
    if (getStoredAccountId()) {
      window.location.assign('/app')
      return
    }

    setTrialBusy(true)
    try {
      const isNew = !getStoredGuestId()
      const guestId = mintOrLoadGuestId()
      const email = guestEmail(guestId)
      // Pin identity as soon as we have a stable ID.
      identify(guestId, { is_guest: true })
      track(isNew ? 'guest_identity_minted' : 'guest_identity_loaded')
      // Check quota before touching the account — consume happens at practice start.
      const quota = await getGuestQuota(guestId)
      if (quota.remaining <= 0) {
        track('guest_quota_exhausted', { source: 'landing' })
        setRegisterSource('free_limit_wall')
        return
      }
      // Open (or recover) the guest account — idempotent, same guestId always gives same account.
      const res = await openAccount(email)
      storeAccountId(res.account_id)
      storeEmail(email)
      setTraits({ account_id: res.account_id })
      window.location.assign('/app')
    } catch {
      // Any network error: unblock the button so the user can retry.
    } finally {
      setTrialBusy(false)
    }
  }

  return (
    <div className="landing">
      <RegisterModal
        source={registerSource ?? 'hero'}
        open={registerSource !== null}
        onClose={() => setRegisterSource(null)}
        wallMessage={registerSource === 'free_limit_wall' ? "You've used all your free sessions. Register for full access — it's free." : undefined}
      />

      {/* ---- Navigation ---- */}
      <nav className="l-nav">
        <div className="l-nav-in">
          <a href="/" className="l-brand">
            {ICON}
            <span>BlindSide</span>
          </a>
          <span className="l-sim-pill">● Simulation</span>
          <span className="l-nav-sp" />
          <a className="l-navlink" href="#how">How it works</a>
          <button className="l-btn l-btn-ghost l-btn-nav"
            onClick={() => { track('landing_cta_clicked', { cta: 'register_nav' }); setRegisterSource('nav') }}>
            Register as early tester →
          </button>
        </div>
      </nav>

      {/* ---- Hero ---- */}
      <section className="l-hero">
        <div className="l-wrap l-hterm">
          <div>
            <span className="l-eyebrow">Synthetic market · live order book</span>
            <h1>Face the market you're not ready for — before it's the real one.</h1>
            <p className="l-sub">
              A synthetic stock market, <b>run by agents</b>, that you can trade inside.
            </p>
            <div className="l-cta">
              <button className={`l-btn l-btn-primary${trialBusy ? ' l-btn-busy' : ''}`}
                onClick={handleTryFree} disabled={trialBusy}>
                {trialBusy ? 'Starting…' : 'Try a session free'}
              </button>
              <button className="l-btn l-btn-ghost"
                onClick={() => { track('landing_cta_clicked', { cta: 'register_hero' }); setRegisterSource('hero') }}>
                Register as early tester →
              </button>
            </div>
            <p className="l-reassure">Free during early access. No real money, ever.</p>
          </div>
          <Tape />
        </div>
      </section>

      {/* ---- Problem ---- */}
      <section className="l-block l-problem">
        <div className="l-wrap l-problem-grid">
          <div className="l-problem-left">
            <div className="l-sec-eyebrow">The problem</div>
            <h2>The market only lets you learn live — with your money already in it.</h2>
            <p className="l-lead">Every new kind of day, you meet it for the first time when it's real.</p>
          </div>
          <div className="l-problem-right">
            <blockquote className="l-vignette">
              <p>In 2024 I was long into the election result, certain how it would land. The market did something I'd never rehearsed — and I paid for it with real money.</p>
              <div className="l-vignette-by">— Why this exists</div>
            </blockquote>
            <div className="l-stat">
              <span>
                Most active retail traders lose money — in every market that's been studied.<sup>1</sup>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Reveal ---- */}
      <section className="l-block l-reveal">
        <div className="l-wrap">
          <div className="l-sec-eyebrow">This isn't paper trading</div>
          <div className="l-rev-grid">
            <div className="l-rev-card them">
              <div className="l-rev-tag">Paper trading · backtesting</div>
              <p>You trade against a chart — a recording, with nobody on the other side. Your order always fills at your price. Nothing front-runs you. Nothing reacts.</p>
            </div>
            <div className="l-rev-card us">
              <div className="l-rev-tag">Here</div>
              <p>There's a market on the other side: agents with their own strategies, a real order book, orders that don't always fill. It reacts to you.</p>
            </div>
          </div>
          <div className="l-rev-punch">
            <h2>A chart can't push back. <em>A market does.</em></h2>
          </div>
        </div>
      </section>

      {/* ---- See it ---- */}
      <section className="l-block l-seeit">
        <div className="l-wrap">
          <div className="l-sec-head">
            <div>
              <div className="l-sec-eyebrow">See it move</div>
              <h2>Two doors in. Pick your conditions, or take the real session.</h2>
            </div>
          </div>

          {videoPlaying && YT_VIDEO_ID ? (
            <div className="l-app" style={{ aspectRatio: '16/9', padding: 0, overflow: 'hidden' }}>
              <iframe
                src={`https://www.youtube.com/embed/${YT_VIDEO_ID}?autoplay=1&rel=0&modestbranding=1`}
                title="BlindSide demo"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              />
            </div>
          ) : (
            <div className="l-app l-app-play">
              <div className="l-app-bar">
                <span className="nm">BlindSide</span>
                <span className="sim-pill">● Simulation</span>
                <span className="rt">
                  <span className="pill">India (IN)</span>
                  <span className="pill">Lab</span>
                  <span className="pill">SYNTH_DEF</span>
                </span>
              </div>
              <div className="l-app-tabs">
                <span className="on">Market</span>
                <span>Chart</span>
                <span>Orders</span>
                <span>Positions</span>
                <span>Trades</span>
                <span>P&amp;L</span>
              </div>
              <div className="l-app-body">
                <div className="l-app-cards">
                  <div className="l-app-card">
                    <h4>Live session</h4>
                    <div className="d">Trade the market's real session. Results go to your record. Positions close at the close.</div>
                    <button className="l-app-join" tabIndex={-1}>Join live session</button>
                  </div>
                  <div className="l-app-card sel">
                    <h4>Practice</h4>
                    <div className="d">A scenario of your choice. Nothing from it is recorded.</div>
                    <div className="l-app-sel">
                      <label>Scenario</label>
                      <div className="l-app-drop">
                        <div className="pick"><span className="ck">✓</span>Normal day</div>
                        <div>Calm range</div>
                        <div>Trending day</div>
                        <div>Whipsaw</div>
                        <div>Unstable day</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="l-app-inst">
                  <div className="ih"><span>Instrument</span><span>Last</span><span>Change</span></div>
                  <div className="ir"><span>SYNTH_DEF</span><span>—</span><span>—</span></div>
                </div>
              </div>
              <div className="l-app-ov">
                <button
                  className="l-play-btn"
                  onClick={() => { if (YT_VIDEO_ID) setVideoPlaying(true) }}
                  disabled={!YT_VIDEO_ID}
                  title={YT_VIDEO_ID ? undefined : 'Demo video coming soon'}
                >
                  <span className="l-play-tri" aria-hidden="true" />
                  Watch the demo
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ---- How it works ---- */}
      <section className="l-block l-how" id="how">
        <div className="l-wrap">
          <div className="l-sec-eyebrow">How it works</div>
          <ol>
            <li>
              <h4>Pick your conditions</h4>
              <p>Calm, trending, whippy, unstable — choose the kind of market you face.</p>
            </li>
            <li>
              <h4>Step into a live book</h4>
              <p>A real order book against agents with their own strategies.</p>
            </li>
            <li>
              <h4>Place real orders</h4>
              <p>Limit and market. They don't always fill — same as the real thing.</p>
            </li>
            <li>
              <h4>Trade it out</h4>
              <p>Work the position, close it, and read your P&amp;L.</p>
            </li>
          </ol>
          <p className="flag">Conditions shown are what's live today. Building your own scenarios is on the way.</p>
        </div>
      </section>

      {/* ---- Newcomer doorway ---- */}
      <section className="l-block">
        <div className="l-wrap l-newb">
          <div className="t">
            <div className="tag">New to markets?</div>
            <h3>Start from zero.</h3>
            <p>Learn how a market actually moves by being inside one — not by reading about it.</p>
          </div>
          <button className={`l-btn l-btn-ghost${trialBusy ? ' l-btn-busy' : ''}`}
            onClick={handleTryFree} disabled={trialBusy}>
            {trialBusy ? 'Starting…' : 'Start a first session'}
          </button>
        </div>
      </section>

      {/* ---- Final CTA ---- */}
      <section className="l-block l-fin">
        <div className="l-wrap">
          <h2>Face the market you're not ready for — before it's the real one.</h2>
          <div className="l-cta">
            <button className={`l-btn l-btn-primary${trialBusy ? ' l-btn-busy' : ''}`}
              onClick={handleTryFree} disabled={trialBusy}>
              {trialBusy ? 'Starting…' : 'Try a session free'}
            </button>
            <button className="l-btn l-btn-ghost"
              onClick={() => { track('landing_cta_clicked', { cta: 'register_footer' }); setRegisterSource('footer') }}>
              Register as early tester →
            </button>
          </div>
          <p className="l-reassure">Free during early access. No real money, ever.</p>
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer className="l-foot">
        <div className="l-wrap l-foot-in">
          <a href="/" className="l-brand">
            {ICON}
            <span>BlindSide</span>
          </a>
          <span className="l-foot-comp">Analytical and educational. Not investment advice.</span>
          <span className="l-foot-links">
            <a href="#">Contact</a>
            <a href="#">Privacy</a>
          </span>
        </div>
      </footer>

    </div>
  )
}
