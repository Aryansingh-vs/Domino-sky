'use client'

import { useCallback, useEffect, useMemo, useState } from "react"
import { Activity, ArrowRight, CircleHelp, Plane, RotateCcw, Sun, Moon } from "lucide-react"
import FlightTimeline from "@/components/flight-timeline"
import FlightDetail from "@/components/flight-detail"
import ImpactTable from "@/components/impact-table"
import DispatcherPanel from "@/components/dispatcher-panel"
import NetworkMap from "@/components/ops-map"
import { AirportImpact, CrewPanel, StrandedPanel } from "@/components/ops-panels"
import { airports, crews, getInitialScenario, schedule, simulate, spareAircraft, type Action, type FlightResult, type Scenario } from "@/src/engine"
import { evaluateRecoveries } from "@/src/engine/recovery"

function AnimatedCounter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [shown, setShown] = useState(value)
  useEffect(() => {
    const initial = shown
    const start = performance.now()
    let frame = 0
    const animate = (now: number) => {
      const progress = Math.min(1, (now - start) / 220)
      setShown(Math.round(initial + (value - initial) * progress))
      if (progress < 1) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return <strong className="kpi-number">{shown.toLocaleString()}{suffix}</strong>
}

const presets: Array<Scenario & { label: string }> = [
  { airport: "BOM", start: "09:00", end: "10:30", label: "BOM · 09:00–10:30" },
  { airport: "DEL", start: "12:00", end: "13:30", label: "DEL · 12:00–13:30" },
  { airport: "HYD", start: "11:30", end: "13:00", label: "HYD · 11:30–13:00" },
  { airport: "CCU", start: "12:00", end: "13:30", label: "CCU · 12:00–13:30" },
]

export default function DominoSky({ initialScenario = getInitialScenario() }: { initialScenario?: Scenario }) {
  const initial = initialScenario
  const [draft, setDraft] = useState<Scenario>(initial)
  const [scenario, setScenario] = useState<Scenario>(initial)
  const [activeAction, setActiveAction] = useState<Action | null>(null)
  const [theme, setTheme] = useState<"dark" | "light">("dark")
  const [selectedAirport, setSelectedAirport] = useState<string | null>(null)
  const [selectedFlight, setSelectedFlight] = useState<FlightResult | null>(null)
  const [replayMinute, setReplayMinute] = useState(12 * 60)
  const [playing, setPlaying] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const result = useMemo(() => simulate(scenario, activeAction ? [activeAction] : []), [scenario, activeAction])
  const baseline = useMemo(() => simulate(scenario), [scenario])
  const evaluation = useMemo(() => evaluateRecoveries(scenario), [scenario])
  const invalidWindow = draft.start >= draft.end
  const selectedAirportInfo = airports.find(item => item.id === (selectedAirport ?? scenario.airport)) ?? airports[0]

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => setReplayMinute(value => value >= 23 * 60 ? 5 * 60 : Math.min(23 * 60, value + 10)), 300)
    return () => window.clearInterval(timer)
  }, [playing])

  const runScenario = (next = draft) => {
    if (next.start >= next.end) return
    setScenario({ airport: next.airport, start: next.start, end: next.end })
    setDraft({ airport: next.airport, start: next.start, end: next.end })
    setActiveAction(null)
    setHasRun(true)
    setSelectedAirport(null)
  }
  const applyPreset = (preset: Scenario) => {
    setDraft(preset)
    runScenario(preset)
    setReplayMinute(12 * 60)
  }
  const resetScenario = () => {
    const reset = getInitialScenario()
    setDraft(reset); setScenario(reset); setActiveAction(null); setHasRun(true); setSelectedAirport(null); setSelectedFlight(null); setReplayMinute(12 * 60)
  }
  const selectFlight = (flightId: string) => setSelectedFlight(result.flights.find(flight => flight.flight_id === flightId) ?? null)
  const closeFlightDetail = useCallback(() => setSelectedFlight(null), [])
  const impactDelta = (current: number, before: number) => current === before ? "No change" : `${current - before > 0 ? "+" : ""}${current - before} vs baseline`

  return <main className="dashboard" data-theme={theme}>
    <header className="topbar"><a className="brand" href="/" aria-label="Domino Sky home"><span className="brand-mark"><Plane size={19}/></span><span>Domino <b>Sky</b></span></a><a className="github-link" href="/">Home</a><p className="top-description">Flight disruption cascade and recovery simulator</p><div className="top-actions"><button className="theme-toggle" onClick={() => setTheme(value => value === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>{theme === "dark" ? <Sun size={15}/> : <Moon size={15}/>}<span>{theme === "dark" ? "Light" : "Dark"}</span></button><a className="github-link" href="https://github.com/Aryansingh-vs/Domino-sky" target="_blank" rel="noreferrer">GitHub <ArrowRight size={13}/></a></div></header>

    <section className="control-sticky" aria-label="Simulation controls"><div className="control-main">
      <label className="control-field"><span>Airport</span><select value={draft.airport} onChange={event => setDraft(value => ({ ...value, airport: event.target.value }))}>{airports.map(airport => <option value={airport.id} key={airport.id}>{airport.id} · {airport.city}</option>)}</select></label>
      <label className="control-field time-control"><span>Closure start · IST</span><input type="time" value={draft.start} onChange={event => setDraft(value => ({ ...value, start: event.target.value }))}/></label>
      <span className="control-arrow" aria-hidden="true">→</span>
      <label className="control-field time-control"><span>Closure end · IST</span><input type="time" value={draft.end} onChange={event => setDraft(value => ({ ...value, end: event.target.value }))}/></label>
      <button className="run-button" onClick={() => runScenario()} disabled={invalidWindow}><Activity size={16}/>Run simulation</button>
      <button className="reset-button" onClick={resetScenario} aria-label="Reset scenario"><RotateCcw size={15}/><span>Reset</span></button>
    </div>
    {invalidWindow && <p className="window-error" role="alert">Closure end must be later than the start time.</p>}
    <div className="preset-row" aria-label="One-click demo scenarios"><span className="preset-caption">QUICK DEMOS</span>{presets.map(preset => <button className={`preset-chip ${scenario.airport === preset.airport && scenario.start === preset.start ? "preset-active" : ""}`} key={preset.label} onClick={() => applyPreset(preset)}>{preset.label}<ArrowRight size={12}/></button>)}</div>
    </section>

    <div className="page-shell" id="top">
      <div className="section-intro"><div><p className="eyebrow">DOMESTIC NETWORK / IST / LIVE SIMULATION</p><h1>Disruption control room</h1><p>Close one airport. Trace the cascade. Compare the recovery.</p></div><div className="dataset-status"><span className="status-dot green-dot"/><span>Schedule loaded</span><b>16 airports · {schedule.length} flights · {crews.length} crews · {spareAircraft.length} spares</b></div></div>

      <section className="kpi-grid" aria-label="Simulation key performance indicators">{
        [
          { label: "Flights delayed", value: result.delayedFlights, before: baseline.delayedFlights, sub: `${result.flights.filter(flight => flight.arrivalDelay > 0).length} with arrival delay`, tone: "amber" },
          { label: "Departure delay", value: result.totalDepDelayMinutes, before: baseline.totalDepDelayMinutes, sub: "Total minutes across network", suffix: " min", tone: "amber" },
          { label: "Passengers stranded", value: result.strandedPax, before: baseline.strandedPax, sub: `${result.brokenConnections.filter(connection => !connection.hasCancelledFlight).length} missed connections · ${result.cancelledPax} cancelled`, tone: "red" },
          { label: "Crew breaches", value: result.crewBreaches, before: baseline.crewBreaches, sub: `${result.crews.length} crews · duty limit 600m`, tone: "red" },
          { label: "Cancellations", value: result.cancelledFlights, before: baseline.cancelledFlights, sub: activeAction?.type === "cancel_flight" ? "By applied recovery action" : "Closure alone never cancels", tone: "slate" },
        ].map(metric => <article className={`kpi-card kpi-${metric.tone}`} key={metric.label}><div className="kpi-top"><span>{metric.label}</span><span className="kpi-delta">{activeAction ? impactDelta(metric.value, metric.before) : "BASELINE"}</span></div><AnimatedCounter value={metric.value} suffix={metric.suffix ?? ""}/><small>{metric.sub}</small></article>)
      }</section>

      <div className="operations-grid">
        <section className="panel map-panel" aria-labelledby="network-map-title"><div className="panel-headline"><div><p className="eyebrow">NETWORK MAP / OPENSTREETMAP</p><h2 id="network-map-title">{selectedAirportInfo.city} <span className="subheading-code">{selectedAirportInfo.id}</span></h2></div><div className="map-legend"><span><i className="legend-dot closed"/>Closed</span><span><i className="legend-dot affected"/>Impacted</span><span><i className="legend-dot clear"/>On time</span></div></div>
          <NetworkMap result={result} selectedAirport={selectedAirport} onSelectAirport={setSelectedAirport} onSelectFlight={selectFlight}/>
          <div className="map-footer"><span><b>{selectedAirportInfo.capacity_per_hour}</b> movements / hour</span><span><b>{result.affectedAirports.length}</b> airports impacted</span><span><b>{result.delayedFlights}</b> delayed flights</span></div>
          <div className="airport-keyboard-list" role="group" aria-label="Select an impacted airport">{[...new Set([scenario.airport, ...result.affectedAirports])].map(id => <button key={id} onClick={() => setSelectedAirport(id)} aria-pressed={selectedAirport === id}>{id}</button>)}</div>
          <AirportImpact airportId={selectedAirport} result={result} onSelectFlight={selectFlight}/>
        </section>
        <FlightTimeline result={result} replayMinute={replayMinute} onReplayChange={setReplayMinute} playing={playing} onPlayToggle={() => setPlaying(value => !value)} onSelectFlight={selectFlight}/>
      </div>

      <DispatcherPanel scenario={scenario} current={result} baseline={baseline} recommendations={evaluation.recommendations} activeAction={activeAction} onApply={setActiveAction} onUndo={() => setActiveAction(null)}/>

      <ImpactTable result={result} onSelectFlight={setSelectedFlight}/>

      <div className="support-grid"><StrandedPanel result={result}/><CrewPanel result={result}/></div>

      <footer className="page-footer"><div><a className="brand footer-brand" href="#top"><span className="brand-mark"><Plane size={15}/></span><span>Domino <b>Sky</b></span></a><p>Flight disruption cascade and recovery simulator.</p></div><details className="how-it-works"><summary><CircleHelp size={14}/> How it works</summary><div className="how-content"><p><strong>Closure rule</strong> · All times are minutes after midnight. Departure is the later of its schedule and the previous actual arrival plus 30 minutes. Flights departing from the closed airport inside the half-open window [start, end) wait until reopening; arrivals into a closed airport inside that window hold until reopening. Closure alone never cancels.</p><p><strong>Recovery score</strong> · Departure-delay minutes × {1} + stranded passengers × {3} + crew breaches × {200} + cancellations × {150}. Recommendations are single actions evaluated with the same simulator and shown only when they strictly improve the baseline.</p><p><strong>Passenger and crew rules</strong> · Broken connections are those arriving short of minimum connect time. Passengers on cancelled flights are counted once; connections involving a cancelled flight add no duplicate passengers. Crew duty is last non-cancelled arrival minus duty start; breach means more than 600 minutes.</p><p><strong>Dispatcher</strong> · Gemini receives only engine output. Its numbers and citations are checked against that output; one mismatch retry is allowed, then the deterministic template is used.</p></div></details><a className="footer-github" href="https://github.com/Aryansingh-vs/Domino-sky" target="_blank" rel="noreferrer">View source on GitHub <ArrowRight size={13}/></a></footer>
      {hasRun && <span className="sr-only" aria-live="polite">Simulation updated for {scenario.airport}, {scenario.start} to {scenario.end}.</span>}
    </div>
    <FlightDetail flight={selectedFlight} result={result} onClose={closeFlightDetail}/>
  </main>
}
