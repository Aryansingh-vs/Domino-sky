'use client'

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, Ban, CheckCircle2, Clock3, Search } from "lucide-react"
import { formatTime, type FlightResult, type Simulation } from "@/src/engine"

type Filter = "All" | "Delayed" | "Cancelled" | "Crew breach"

export default function ImpactTable({ result, onSelectFlight }: { result: Simulation; onSelectFlight: (flight: FlightResult) => void }) {
  const [filter, setFilter] = useState<Filter>("All")
  const [query, setQuery] = useState("")
  const [sortBy, setSortBy] = useState<"flight_id" | "departureDelay">("departureDelay")
  const [descending, setDescending] = useState(true)
  const crewTails = new Set(result.crews.filter(crew => crew.breach).map(crew => crew.tail_id))
  const filtered = useMemo(() => result.flights.filter(flight => {
    const matchesFilter = filter === "All" || filter === "Delayed" && flight.departureDelay > 0 || filter === "Cancelled" && flight.status === "Cancelled" || filter === "Crew breach" && crewTails.has(flight.tail_id)
    return matchesFilter && `${flight.flight_id} ${flight.origin} ${flight.destination} ${flight.tail_id} ${flight.cause?.type ?? ""}`.toLowerCase().includes(query.toLowerCase())
  }).sort((a, b) => {
    const order = sortBy === "flight_id" ? a.flight_id.localeCompare(b.flight_id) : a.departureDelay - b.departureDelay
    return descending ? -order : order
  }), [result, filter, query, sortBy, descending])
  const sortButton = (label: string, key: "flight_id" | "departureDelay") => <button className="sort-button" onClick={() => { setSortBy(key); setDescending(value => sortBy === key ? !value : true) }} aria-label={`Sort by ${label}${sortBy === key ? `, ${descending ? "descending" : "ascending"}` : ""}`} aria-pressed={sortBy === key}>{label}{sortBy === key && (descending ? <ArrowDown size={12}/> : <ArrowUp size={12}/>)}</button>
  return <section className="panel table-panel" aria-labelledby="flight-impact-heading">
    <div className="panel-headline"><div><p className="eyebrow">NETWORK IMPACT</p><h2 id="flight-impact-heading">Flight impact <span className="count-label">{filtered.length} / {result.flights.length}</span></h2></div><label className="searchbox"><Search size={14}/><input value={query} onChange={event => setQuery(event.target.value)} aria-label="Search flights" placeholder="Flight, route, tail"/></label></div>
    <div className="filter-row" role="group" aria-label="Filter flights">{(["All", "Delayed", "Cancelled", "Crew breach"] as Filter[]).map(item => <button key={item} className={`filter-button ${filter === item ? "selected" : ""}`} onClick={() => setFilter(item)} aria-pressed={filter === item}>{item}</button>)}</div>
    <div className="table-scroll"><table><caption className="sr-only">Flight schedule and disruption impact for the selected scenario</caption><thead><tr>
      <th scope="col" aria-sort={sortBy === "flight_id" ? descending ? "descending" : "ascending" : "none"}>{sortButton("Flight", "flight_id")}</th>
      <th scope="col">Route</th><th scope="col">Scheduled dep</th><th scope="col">Actual dep</th>
      <th scope="col" aria-sort={sortBy === "departureDelay" ? descending ? "descending" : "ascending" : "none"}>{sortButton("Delay", "departureDelay")}</th>
      <th scope="col">Status</th><th scope="col">Cause</th></tr></thead><tbody>
      {filtered.map(flight => <tr key={flight.flight_id} className={flight.departureDelay ? "row-late" : ""}>
        <td><button className="flight-link mono" onClick={() => onSelectFlight(flight)}>{flight.flight_id}</button></td><td className="mono route-text">{flight.origin} → {flight.destination}</td><td className="mono subtle">{formatTime(flight.scheduledDep)}</td><td className={`mono ${flight.departureDelay ? "amber-text" : ""}`}>{formatTime(flight.actualDep)}</td><td className={`mono ${flight.departureDelay ? "amber-text" : ""}`}>{flight.departureDelay ? `+${flight.departureDelay}m` : "—"}</td>
        <td><span className={`status-chip ${flight.status.toLowerCase().replace(" ", "-")}`}>{flight.status === "Delayed" ? <Clock3 aria-hidden="true"/> : flight.status === "Cancelled" ? <Ban aria-hidden="true"/> : <CheckCircle2 aria-hidden="true"/>}{flight.status}</span></td><td><span className="cause-text">{flight.cause?.type.replaceAll("_", " ") ?? "—"}</span></td>
      </tr>)}
      {!filtered.length && <tr><td colSpan={7} className="empty-table">No flights match this filter.</td></tr>}
    </tbody></table></div>
  </section>
}
