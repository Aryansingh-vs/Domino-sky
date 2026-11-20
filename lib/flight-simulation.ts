import dataset from '@/data/flight_network.json'

type AirportRecord = (typeof dataset.airports)[number]
type SourceFlight = (typeof dataset.flights)[number]
type CrewRecord = (typeof dataset.crews)[number]
type SpareAircraft = (typeof dataset.spare_aircraft)[number]
type Connection = (typeof dataset.connections)[number]

export type Airport = AirportRecord
export type ScheduledFlight = SourceFlight & {
  departureDelay: number
  arrivalDelay: number
  status: 'On time' | 'Delayed' | 'Cancelled'
  cause: string
}
export type Crew = CrewRecord & {
  dutyMinutes: number
  dutyLimit: number
  breach: boolean
  status: 'Within limits' | 'Duty risk' | 'Duty breach'
}
export type Recovery = { flightId: string; spare: SpareAircraft; recoveredFlights: number }
export type Simulation = {
  flights: ScheduledFlight[]
  delayed: number
  cancelled: number
  stranded: number
  crewBreaches: number
  brokenConnections: number
  impacted: number
  crews: Crew[]
  recovery: Recovery | null
}

export const airports: Airport[] = dataset.airports
export const schedule: SourceFlight[] = dataset.flights
export const crews: CrewRecord[] = dataset.crews
export const spareAircraft: SpareAircraft[] = dataset.spare_aircraft
export const connections: Connection[] = dataset.connections
export const minimumTurnaround = dataset.meta.min_turnaround_minutes

export function minutes(time: string) {
  const [hours, mins] = time.split(':').map(Number)
  return hours * 60 + mins
}

export function formatClock(time: string, delay = 0) {
  const total = (minutes(time) + delay) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function formatDuration(total: number) {
  return `${Math.floor(total / 60)}h ${total % 60}m`
}

function runFlights(airportId: string, closureStart: string, closureEnd: string, recoveredFlightId?: string) {
  const start = minutes(closureStart)
  const end = minutes(closureEnd)
  const airportFlights = new Map<string, ScheduledFlight[]>()
  const sorted = [...schedule].sort((a, b) => a.tail_id.localeCompare(b.tail_id) || a.leg_order - b.leg_order)
  const previousByTail = new Map<string, ScheduledFlight>()
  const impacted = new Set<string>()
  const results: ScheduledFlight[] = []

  for (const flight of sorted) {
    const departure = minutes(flight.dep)
    const arrival = minutes(flight.arr)
    const originClosed = flight.origin === airportId && departure >= start && departure < end
    const destinationClosed = flight.destination === airportId && arrival >= start && arrival < end
    const prior = previousByTail.get(flight.tail_id)
    const turnBuffer = flight.turnaround_before_min === null ? 0 : Math.max(0, flight.turnaround_before_min - minimumTurnaround)
    const propagatedDelay = prior ? Math.max(0, prior.arrivalDelay - turnBuffer) : 0
    const closureDepartureDelay = originClosed ? end - departure : 0
    let departureDelay = Math.max(propagatedDelay, closureDepartureDelay)
    let arrivalDelay = Math.max(departureDelay, destinationClosed ? end - arrival : 0)
    let cause = ''
    if (originClosed) cause = `${airportId} closure`
    if (destinationClosed && end - arrival >= arrivalDelay) cause = `${airportId} closure`
    if (propagatedDelay > closureDepartureDelay && prior) cause = `${prior.flight_id} was delayed because ${prior.cause || 'its previous rotation ran late'}`

    if (flight.flight_id === recoveredFlightId && departureDelay > 0) {
      departureDelay = closureDepartureDelay
      arrivalDelay = Math.max(departureDelay, destinationClosed ? end - arrival : 0)
      cause = departureDelay > 0 || arrivalDelay > 0 ? `${airportId} closure (spare aircraft limits rotation delay)` : ''
    }

    const status = arrivalDelay >= 180 ? 'Cancelled' : departureDelay > 0 || arrivalDelay > 0 ? 'Delayed' : 'On time'
    const result: ScheduledFlight = { ...flight, departureDelay, arrivalDelay, status, cause }
    previousByTail.set(flight.tail_id, result)
    results.push(result)
    if (originClosed || destinationClosed) impacted.add(flight.flight_id)
    airportFlights.set(flight.tail_id, [...(airportFlights.get(flight.tail_id) ?? []), result])
  }

  return { results, impacted, airportFlights }
}

export function simulate(airportId: string, closureStart: string, closureEnd: string, recovered = false): Simulation {
  const baseline = runFlights(airportId, closureStart, closureEnd)
  let flights = baseline.results
  let recovery: Recovery | null = null

  if (recovered) {
    const eligible = spareAircraft.flatMap(spare => {
      const candidate = flights
        .filter(flight => flight.origin === spare.base && flight.departureDelay > 0 && flight.status !== 'Cancelled')
        .sort((a, b) => b.departureDelay - a.departureDelay)[0]
      return candidate ? [{ spare, candidate }] : []
    }).sort((a, b) => b.candidate.departureDelay - a.candidate.departureDelay)
    const best = eligible[0]
    if (best) {
      const recoveredRun = runFlights(airportId, closureStart, closureEnd, best.candidate.flight_id)
      flights = recoveredRun.results
      recovery = { flightId: best.candidate.flight_id, spare: best.spare, recoveredFlights: Math.max(0, baseline.results.filter(f => f.departureDelay > 0).length - flights.filter(f => f.departureDelay > 0).length) }
    }
  }

  const byId = new Map(flights.map(flight => [flight.flight_id, flight]))
  const cancelledFlights = flights.filter(flight => flight.status === 'Cancelled')
  const brokenConnections = connections.filter(connection => {
    const inbound = byId.get(connection.from_flight)
    const outbound = byId.get(connection.to_flight)
    if (!inbound || !outbound || inbound.status === 'Cancelled' || outbound.status === 'Cancelled') return true
    return minutes(outbound.dep) + outbound.departureDelay < minutes(inbound.arr) + inbound.arrivalDelay + connection.min_connect_minutes
  })
  const stranded = cancelledFlights.reduce((sum, flight) => sum + flight.pax, 0) + brokenConnections.reduce((sum, connection) => sum + connection.passengers, 0)
  const flightById = new Map(flights.map(flight => [flight.flight_id, flight]))
  const crewResults: Crew[] = crews.map(crew => {
    const lastFlight = crew.flight_ids.map(id => flightById.get(id)).filter((flight): flight is ScheduledFlight => Boolean(flight)).at(-1)
    const dutyMinutes = lastFlight ? minutes(lastFlight.arr) + lastFlight.arrivalDelay - minutes(crew.duty_start) : 0
    const breach = dutyMinutes > crew.max_duty_mins
    const status = breach ? 'Duty breach' : dutyMinutes >= crew.max_duty_mins * 0.9 ? 'Duty risk' : 'Within limits'
    return { ...crew, dutyMinutes, dutyLimit: crew.max_duty_mins, breach, status }
  })
  const delayed = flights.filter(flight => flight.status === 'Delayed').length
  return {
    flights,
    delayed,
    cancelled: cancelledFlights.length,
    stranded,
    crewBreaches: crewResults.filter(crew => crew.breach).length,
    brokenConnections: brokenConnections.length,
    impacted: baseline.impacted.size,
    crews: crewResults,
    recovery,
  }
}

export function getInitialScenario() {
  return { airport: 'DEL', start: '10:00', end: '11:30' }
}
