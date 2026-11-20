'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, GitBranch, Plane } from 'lucide-react'

const SKIP_KEY = 'domino-sky-skip-intro'

function RouteBackdrop() {
  return <svg className="intro-routes" viewBox="0 0 900 560" aria-hidden="true" focusable="false">
    <g className="route-lines"><path d="M80 360 C220 240 275 410 390 260 S610 120 800 190"/><path d="M120 120 C250 210 310 70 460 180 S680 390 840 330"/><path d="M80 360 C270 490 560 440 800 190"/><path d="M120 120 C300 70 590 500 840 330"/></g>
    <g className="route-points"><circle cx="80" cy="360" r="5"/><circle cx="120" cy="120" r="5"/><circle cx="390" cy="260" r="5"/><circle cx="460" cy="180" r="5"/><circle cx="800" cy="190" r="6"/><circle cx="840" cy="330" r="5"/></g>
  </svg>
}

export default function IntroPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      if (window.localStorage.getItem(SKIP_KEY) === 'true') {
        router.replace('/simulator')
        return
      }
    } catch {
      // Storage is optional; the intro remains usable when it is unavailable.
    }
    setReady(true)
  }, [router])

  const launch = (airport: string, start: string, end: string, remember = false) => {
    if (remember) {
      try {
        window.localStorage.setItem(SKIP_KEY, 'true')
      } catch {
        // Continue to the simulator even when the preference cannot be saved.
      }
    }
    router.push(`/simulator?airport=${airport}&start=${start}&end=${end}`)
  }

  return <main className="intro-page">
    <RouteBackdrop />
    <header className="intro-topbar"><a className="intro-brand" href="/" aria-label="Domino Sky home"><span className="intro-brand-mark"><Plane size={19}/></span><span>DOMINO <b>SKY</b></span></a><a className="intro-github" href="https://github.com/Aryansingh-vs/Domino-sky" target="_blank" rel="noreferrer"><GitBranch size={17}/> Source <ArrowRight size={14}/></a></header>
    <section className="intro-hero" aria-labelledby="intro-heading">
      <p className="intro-kicker"><span className="intro-live-dot"/> INDIAN DOMESTIC NETWORK SIMULATOR</p>
      <h1 id="intro-heading">A storm in Mumbai<br/><span>can delay a flight</span><br/>in Kolkata.</h1>
      <p className="intro-subline">Close any airport. Watch the delay spread. Let the dispatcher recover the network, with every number verified.</p>
      <div className="intro-facts" aria-label="Simulator facts"><span>16 airports · 70 flights</span><span>Deterministic engine</span><span>AI figures verified</span></div>
      <div className="intro-actions"><button className="intro-primary" onClick={() => launch('DEL', '12:00', '13:30')} disabled={!ready}>Start simulator <ArrowRight size={18}/></button><button className="intro-secondary" onClick={() => launch('BOM', '09:00', '10:30')} disabled={!ready}>Try the Mumbai storm demo</button></div>
      <button className="intro-skip" onClick={() => launch('DEL', '12:00', '13:30', true)}>Skip intro <ArrowRight size={14}/></button>
    </section>
    <footer className="intro-footer"><span>REAL SCHEDULE · DETERMINISTIC OUTCOMES · NO LOGIN REQUIRED</span><a href="https://github.com/Aryansingh-vs/Domino-sky" target="_blank" rel="noreferrer">View project on GitHub <ArrowRight size={13}/></a></footer>
  </main>
}
