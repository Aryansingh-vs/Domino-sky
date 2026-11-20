import dataset from "../../data/flight_network.json"

export type Scenario = { airport: string; start: string; end: string }
export type Action =
  | { type: "cancel_flight"; flightId: string }
  | { type: "swap_spare"; spareTail: string; flightId: string }
export type Cause = { type: "closure_origin" | "closure_destination" | "late_inbound" | "cancelled_by_action"; previousFlightId?: string }
export type FlightResult = (typeof dataset.flights)[number] & {
  scheduledDep: number; scheduledArr: number; actualDep: number; actualArr: number
  departureDelay: number; arrivalDelay: number; status: "On time" | "Delayed" | "Cancelled"
  cause: Cause | null; root_cause_chain: string[]; tail_id: string
}
export type ConnectionResult = (typeof dataset.connections)[number] & { minutesShort: number; hasCancelledFlight: boolean }
export type CrewResult = (typeof dataset.crews)[number] & { dutyMinutes: number; slack: number; breach: boolean }
export type Simulation = {
  scenario: Scenario; flights: FlightResult[]; delayedFlights: number; totalDepDelayMinutes: number
  totalArrivalDelayMinutes: number; cancelledFlights: number; strandedPax: number; strandedConnections: number
  cancelledPax: number; brokenConnections: ConnectionResult[]; crews: CrewResult[]; crewBreaches: number
  affectedAirports: string[]; actions: Action[]; score: number
}

export const airports = dataset.airports
export const schedule = dataset.flights
export const crews = dataset.crews
export const connections = dataset.connections
export const spareAircraft = dataset.spare_aircraft
export const minimumTurnaround = dataset.meta.min_turnaround_minutes
export const scoreWeights = { depDelayMinute: 1, strandedPassenger: 3, crewBreach: 200, cancellation: 150 } as const

export function toMinutes(time: string): number {
  const [hours, mins] = time.split(":").map(Number)
  return hours * 60 + mins
}
export function formatTime(value: number): string {
  const time = ((value % 1440) + 1440) % 1440
  return `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`
}
export const formatClock = (time: string, delay = 0) => formatTime(toMinutes(time) + delay)
export const formatDuration = (total: number) => `${Math.floor(total / 60)}h ${total % 60}m`

function runFlights(scenario: Scenario, actions: Action[]) {
  const start = toMinutes(scenario.start), end = toMinutes(scenario.end)
  const cancel = new Set(actions.filter((action): action is Extract<Action, { type: "cancel_flight" }> => action.type === "cancel_flight").map(action => action.flightId))
  const swaps = new Map(actions.filter((action): action is Extract<Action, { type: "swap_spare" }> => action.type === "swap_spare").map(action => [action.flightId, action.spareTail]))
  const swapStarts = new Map<string, number>()
  for (const [flightId] of swaps) {
    const target = schedule.find(flight => flight.flight_id === flightId)
    if (target) swapStarts.set(target.tail_id, Math.min(swapStarts.get(target.tail_id) ?? Number.POSITIVE_INFINITY, target.leg_order))
  }
  const tails = [...new Set(schedule.map(flight => flight.tail_id))]
  const source = [...schedule]
  for (const [flightId, spareTail] of swaps) {
    const target = schedule.find(flight => flight.flight_id === flightId)
    if (!target) continue
    const remaining = schedule.filter(flight => flight.tail_id === target.tail_id && flight.leg_order >= target.leg_order)
    remaining.forEach((flight, index) => source.push({ ...flight, tail_id: spareTail, leg_order: index + 1 }))
  }
  const grouped = new Map<string, typeof source>()
  for (const tail of tails) grouped.set(tail, source.filter(flight => flight.tail_id === tail && flight.leg_order < (swapStarts.get(tail) ?? Number.POSITIVE_INFINITY)))
  for (const spare of spareAircraft) grouped.set(spare.tail_id, source.filter(flight => flight.tail_id === spare.tail_id))
  const results: FlightResult[] = []
  const actualById = new Map<string, FlightResult>()

  for (const [tail, flights] of grouped) {
    let previousArrival: number | null = null
    const ordered = [...flights].sort((a, b) => a.leg_order - b.leg_order)
    for (const flight of ordered) {
      const scheduledDep = toMinutes(flight.dep), scheduledArr = toMinutes(flight.arr)
      const cancelled = cancel.has(flight.flight_id)
      let actualDep = Math.max(scheduledDep, previousArrival === null ? scheduledDep : previousArrival + minimumTurnaround)
      let cause: Cause | null = null
      if (cancelled) {
        actualDep = scheduledDep
        cause = { type: "cancelled_by_action" }
      } else if (flight.origin === scenario.airport && actualDep >= start && actualDep < end) {
        actualDep = end
        cause = { type: "closure_origin" }
      }
      let actualArr = cancelled ? scheduledArr : actualDep + flight.block_minutes
      if (!cancelled && flight.destination === scenario.airport && actualArr >= start && actualArr < end) {
        actualArr = end
        if (!cause) cause = { type: "closure_destination" }
      }
      if (!cancelled && !cause && actualDep > scheduledDep && previousArrival !== null) {
        const previous = ordered.find(item => item.leg_order === flight.leg_order - 1)
        cause = { type: "late_inbound", ...(previous ? { previousFlightId: previous.flight_id } : {}) }
      }
      const departureDelay = cancelled ? 0 : Math.max(0, actualDep - scheduledDep)
      const arrivalDelay = cancelled ? 0 : Math.max(0, actualArr - scheduledArr)
      const result: FlightResult = {
        ...flight, tail_id: tail, scheduledDep, scheduledArr, actualDep, actualArr,
        departureDelay, arrivalDelay, status: cancelled ? "Cancelled" : departureDelay > 0 ? "Delayed" : "On time",
        cause, root_cause_chain: [],
      }
      results.push(result); actualById.set(flight.flight_id, result)
      if (!cancelled) previousArrival = actualArr
    }
  }
  for (const flight of results) {
    if (!flight.cause) continue
    if (flight.cause.type === "cancelled_by_action") flight.root_cause_chain = [`${flight.flight_id} cancelled by recovery action`]
    else if (flight.cause.type === "closure_origin") flight.root_cause_chain = [`${flight.flight_id} delayed`, `${scenario.airport} closed ${scenario.start}-${scenario.end}`]
    else if (flight.cause.type === "closure_destination") flight.root_cause_chain = [`${flight.flight_id} arrival held`, `${scenario.airport} closed ${scenario.start}-${scenario.end}`]
    else {
      const previous = actualById.get(flight.cause.previousFlightId ?? "")
      const previousChain = previous?.root_cause_chain.length
        ? [`${previous.flight_id} late`, ...previous.root_cause_chain.slice(1)]
        : previous ? [`${previous.flight_id} late`] : []
      const closureCause = `${scenario.airport} closed ${scenario.start}-${scenario.end}`
      flight.root_cause_chain = [`${flight.flight_id} late`, ...previousChain]
      if (!flight.root_cause_chain.includes(closureCause)) flight.root_cause_chain.push(closureCause)
    }
  }
  return results.sort((a, b) => a.flight_id.localeCompare(b.flight_id))
}

export function simulate(scenario: Scenario, actions: Action[] = []): Simulation {
  const flights = runFlights(scenario, actions)
  const byId = new Map(flights.map(flight => [flight.flight_id, flight]))
  const brokenConnections = connections.flatMap(connection => {
    const from = byId.get(connection.from_flight), to = byId.get(connection.to_flight)
    if (!from || !to) return []
    const hasCancelledFlight = from.status === "Cancelled" || to.status === "Cancelled"
    const minutesShort = hasCancelledFlight ? 0 : Math.max(0, from.actualArr + connection.min_connect_minutes - to.actualDep)
    return hasCancelledFlight || minutesShort > 0 ? [{ ...connection, minutesShort, hasCancelledFlight }] : []
  })
  const cancelled = flights.filter(flight => flight.status === "Cancelled")
  const cancelledPax = cancelled.reduce((sum, flight) => sum + flight.pax, 0)
  const strandedConnectionsList = brokenConnections.filter(connection => !connection.hasCancelledFlight)
  const strandedPax = cancelledPax + strandedConnectionsList.reduce((sum, connection) => sum + connection.passengers, 0)
  const crewResults: CrewResult[] = crews.map(crew => {
    const worked = crew.flight_ids.map(id => byId.get(id)).filter((flight): flight is FlightResult => flight !== undefined && flight.status !== "Cancelled")
    const last = worked.at(-1)
    const dutyMinutes = last ? last.actualArr - toMinutes(crew.duty_start) : 0
    return { ...crew, dutyMinutes, slack: crew.max_duty_mins - dutyMinutes, breach: dutyMinutes > crew.max_duty_mins }
  })
  const affectedAirports = [...new Set(flights.filter(flight => flight.departureDelay > 0 || flight.arrivalDelay > 0).flatMap(flight => [flight.origin, flight.destination]))].sort()
  const delayedFlights = flights.filter(flight => flight.departureDelay > 0).length
  const totalDepDelayMinutes = flights.reduce((sum, flight) => sum + flight.departureDelay, 0)
  const crewBreaches = crewResults.filter(crew => crew.breach).length
  const score = totalDepDelayMinutes * scoreWeights.depDelayMinute + strandedPax * scoreWeights.strandedPassenger + crewBreaches * scoreWeights.crewBreach + cancelled.length * scoreWeights.cancellation
  return { scenario, flights, delayedFlights, totalDepDelayMinutes, totalArrivalDelayMinutes: flights.reduce((sum, flight) => sum + flight.arrivalDelay, 0), cancelledFlights: cancelled.length, strandedPax, strandedConnections: strandedConnectionsList.reduce((sum, connection) => sum + connection.passengers, 0), cancelledPax, brokenConnections, crews: crewResults, crewBreaches, affectedAirports, actions, score }
}

export function getInitialScenario(): Scenario { return { airport: "DEL", start: "12:00", end: "13:30" } }
