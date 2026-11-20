'use client'

import { useEffect } from "react"
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from "react-leaflet"
import { ArrowRight } from "lucide-react"
import { airports, schedule, type Simulation } from "@/src/engine"

const tierRadius: Record<string, number> = { mega_hub: 8, regional_hub: 6, spoke: 4 }

function ObserveMapSize() {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return null
}

export default function NetworkMapClient({ result, selectedAirport, onSelectAirport, onSelectFlight }: { result: Simulation; selectedAirport: string | null; onSelectAirport: (id: string) => void; onSelectFlight: (id: string) => void }) {
  const delayed = new Set(result.flights.filter(flight => flight.departureDelay > 0 || flight.arrivalDelay > 0).map(flight => flight.flight_id))
  const impact = new Set(result.affectedAirports)
  const closed = result.scenario.airport
  return <MapContainer center={[21.5, 79]} zoom={4} minZoom={3} maxZoom={7} scrollWheelZoom={false} className="leaflet-map" aria-label="India flight network map">
    <ObserveMapSize/>
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    {schedule.map(flight => {
      const from = airports.find(airport => airport.id === flight.origin), to = airports.find(airport => airport.id === flight.destination)
      if (!from || !to) return null
      const disrupted = delayed.has(flight.flight_id)
      return <Polyline key={flight.flight_id} positions={[[from.lat, from.lng], [to.lat, to.lng]]} pathOptions={{ color: disrupted ? "#f06459" : "#82919a", weight: disrupted ? 1.8 : .7, opacity: disrupted ? .82 : .24 }}>
        <Popup><button className="map-flight-popup" onClick={() => onSelectFlight(flight.flight_id)}>{flight.flight_id} · {flight.origin} <ArrowRight size={12}/> {flight.destination}</button></Popup>
      </Polyline>
    })}
    {airports.map(airport => {
      const isClosed = airport.id === closed
      const color = isClosed ? "#f06459" : impact.has(airport.id) ? "#e8aa52" : "#39b8a5"
      return <CircleMarker key={airport.id} center={[airport.lat, airport.lng]} radius={tierRadius[airport.tier]} pathOptions={{ color, fillColor: color, fillOpacity: .92, weight: isClosed ? 3 : 1.5, className: isClosed ? "map-closed-marker" : undefined }} eventHandlers={{ click: () => onSelectAirport(airport.id) }}>
        <Popup><button className="map-flight-popup" onClick={() => onSelectAirport(airport.id)}>{airport.id} · {airport.city}</button></Popup>
      </CircleMarker>
    })}
  </MapContainer>
}
