'use client'

import { AlertTriangle, Users } from "lucide-react"
import { airports, type Simulation } from "@/src/engine"

export function AirportImpact({ airportId, result, onSelectFlight }: { airportId: string | null; result: Simulation; onSelectFlight: (id: string) => void }) {
  if (!airportId) return null
  const airport = airports.find(item => item.id === airportId)
  const impacted = result.flights.filter(flight => (flight.origin === airportId && flight.departureDelay > 0) || (flight.destination === airportId && flight.arrivalDelay > 0))
  return <div className="airport-impact"><div><strong>{airportId}</strong><span>{airport?.city ?? "Airport"} · {impacted.length} impacted flights</span></div><div className="airport-impact-list">{impacted.length ? impacted.map(flight => <button key={flight.flight_id} onClick={() => onSelectFlight(flight.flight_id)}>{flight.flight_id}<small>{flight.departureDelay ? `+${flight.departureDelay}m dep` : `+${flight.arrivalDelay}m arr`}</small></button>) : <span>No delayed flights at this airport.</span>}</div></div>
}

export function StrandedPanel({ result }: { result: Simulation }) {
  return <section className="panel side-panel" aria-labelledby="connections-title"><div className="panel-headline"><div><p className="eyebrow">PASSENGER CONNECTIONS</p><h2 id="connections-title">Stranded passengers</h2></div><span className={`panel-count ${result.strandedPax ? "critical-count" : ""}`}><Users size={14}/>{result.strandedPax}</span></div>
    {result.brokenConnections.length ? <div className="connection-list">{result.brokenConnections.map(connection => <article key={connection.connection_id} className="connection-item"><div className="connection-top"><strong>{connection.connection_id}</strong><span className="critical-tag">{connection.hasCancelledFlight ? "Flight cancelled" : `${connection.passengers} pax at risk`}</span></div><p>{connection.airport} · {connection.from_flight} <span>→</span> {connection.to_flight}</p><small>{connection.hasCancelledFlight ? `${connection.passengers} connection passengers are included in cancelled-flight totals` : `${connection.minutesShort} minutes short of ${connection.min_connect_minutes} minute minimum`}</small></article>)}</div> : <div className="empty-inline"><span className="status-dot green-dot"/>No broken passenger connections in this scenario.</div>}
    {result.cancelledPax > 0 && <p className="cancelled-pax"><AlertTriangle size={13}/>{result.cancelledPax} passengers on cancelled flights. Not double-counted against broken connections.</p>}
  </section>
}

export function CrewPanel({ result }: { result: Simulation }) {
  return <section className="panel side-panel" aria-labelledby="crew-title"><div className="panel-headline"><div><p className="eyebrow">CREW DUTY TRACKING</p><h2 id="crew-title">Crew readiness <span className="count-label">{result.crewBreaches} breaches</span></h2></div><span className="crew-limit">600 MIN LIMIT</span></div><div className="crew-grid">{result.crews.map(crew => <div className={`crew-item ${crew.breach ? "crew-breached" : ""}`} key={crew.crew_id}><div className="crew-row"><strong>{crew.crew_id}</strong><span>{crew.tail_id.replace("VT-", "")}</span><b>{crew.dutyMinutes}m used</b></div><div className="crew-progress" role="meter" aria-label={`${crew.crew_id} duty used`} aria-valuemin={0} aria-valuemax={crew.max_duty_mins} aria-valuenow={Math.max(0, Math.min(crew.max_duty_mins, crew.dutyMinutes))}><span style={{ width: `${Math.min(100, Math.max(0, crew.dutyMinutes / crew.max_duty_mins * 100))}%` }}/></div><div className="crew-foot"><small>{crew.breach ? <><AlertTriangle size={11}/> BREACH</> : "Within limit"}</small><span>{crew.slack >= 0 ? `${crew.slack}m slack` : `${Math.abs(crew.slack)}m over`}</span></div></div>)}</div></section>
}
