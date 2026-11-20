'use client'

import { useEffect, useRef } from "react"
import { ArrowRight, Clock3, Users, X } from "lucide-react"
import { connections, formatTime, type FlightResult, type Simulation } from "@/src/engine"

export default function FlightDetail({ flight, result, onClose }: { flight: FlightResult | null; result: Simulation; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (!flight) return
    const previouslyFocused = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
        return
      }
      if (event.key !== "Tab") return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) {
        event.preventDefault()
        dialog.focus()
      } else if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [flight, onClose])
  if (!flight) return null
  const flightConnections = connections.filter(connection => connection.from_flight === flight.flight_id || connection.to_flight === flight.flight_id)
  const brokenIds = new Set(result.brokenConnections.map(item => item.connection_id))
  return <div className="drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <aside ref={dialogRef} className="flight-drawer" role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby="flight-drawer-title">
      <div className="drawer-heading"><div><p className="eyebrow">FLIGHT DETAIL / {flight.tail_id}</p><h2 id="flight-drawer-title">Why is this flight late?</h2></div><button ref={closeButtonRef} className="icon-button" onClick={onClose} aria-label="Close flight details"><X size={17}/></button></div>
      <div className="drawer-flight-id">{flight.flight_id}</div><div className="drawer-route"><span>{flight.origin}</span><ArrowRight size={16}/><span>{flight.destination}</span><small>{flight.pax} passengers</small></div>
      <div className="drawer-times"><div><small>SCHEDULED</small><strong>{formatTime(flight.scheduledDep)} → {formatTime(flight.scheduledArr)}</strong></div><div><small>ACTUAL</small><strong className={flight.departureDelay ? "amber-text" : ""}>{formatTime(flight.actualDep)} → {formatTime(flight.actualArr)}</strong></div><div><small>DEPARTURE DELAY</small><strong className={flight.departureDelay ? "amber-text" : ""}>{flight.departureDelay ? `+${flight.departureDelay} min` : "On time"}</strong></div></div>
      <section className="drawer-section"><h3><Clock3 size={14}/> Root-cause chain</h3>{flight.root_cause_chain.length ? <ol className="cause-chain">{flight.root_cause_chain.map((step, index) => <li key={`${step}-${index}`}><span>{index + 1}</span><p>{step}</p></li>)}</ol> : <p className="drawer-empty">This flight has no delay cause in the current simulation.</p>}</section>
      <section className="drawer-section"><h3><Users size={14}/> Passenger connections</h3>{flightConnections.length ? <div className="drawer-connections">{flightConnections.map(connection => <div className="drawer-connection" key={connection.connection_id}><strong>{connection.connection_id} · {connection.airport}</strong><span>{connection.from_flight} → {connection.to_flight}</span><small>{connection.passengers} pax · minimum {connection.min_connect_minutes}m <b className={brokenIds.has(connection.connection_id) ? "critical-text" : "green-text"}>{brokenIds.has(connection.connection_id) ? "· BROKEN" : "· SAFE"}</b></small></div>)}</div> : <p className="drawer-empty">No passenger connections reference this flight.</p>}</section>
    </aside>
  </div>
}
