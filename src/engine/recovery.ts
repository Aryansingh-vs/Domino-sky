import { crews, schedule, simulate, spareAircraft, type Action, type Scenario, type Simulation } from "./index"

export type Candidate = { id: string; label: string; action: Action | null; score: number; result: Simulation; improvement: number }
export type RecoveryEvaluation = { baseline: Candidate; recommendations: Candidate[]; rejected: { action: Action; reason: string }[] }

export function validateAction(action: Action, scenario: Scenario, baseline: Simulation): string | null {
  if (action.type === "cancel_flight") return schedule.some(flight => flight.flight_id === action.flightId) ? null : `Flight ${action.flightId} does not exist.`
  const spare = spareAircraft.find(item => item.tail_id === action.spareTail)
  const flight = schedule.find(item => item.flight_id === action.flightId)
  if (!spare) return `Spare aircraft ${action.spareTail} does not exist.`
  if (!flight) return `Flight ${action.flightId} does not exist.`
  if (spare.base !== flight.origin) return `${spare.tail_id} is based at ${spare.base}, not ${flight.origin}.`
  const result = baseline.flights.find(item => item.flight_id === action.flightId)
  const newDeparture = result?.actualDep ?? toMinutes(flight.dep)
  if (spare.available_from && toMinutes(spare.available_from) > newDeparture - 30) return `${spare.tail_id} is not available 30 minutes before the new departure.`
  return null
}

function toMinutes(time: string) { const [hours, minutes] = time.split(":").map(Number); return hours * 60 + minutes }

export function evaluateRecoveries(scenario: Scenario): RecoveryEvaluation {
  const baselineResult = simulate(scenario)
  const baseline: Candidate = { id: "baseline", label: "Do nothing", action: null, score: baselineResult.score, result: baselineResult, improvement: 0 }
  const rejected: RecoveryEvaluation["rejected"] = []
  const candidates: Candidate[] = []
  const actions: Action[] = [
    ...schedule.map(flight => ({ type: "cancel_flight" as const, flightId: flight.flight_id })),
    ...spareAircraft.flatMap(spare => schedule.map(flight => ({ type: "swap_spare" as const, spareTail: spare.tail_id, flightId: flight.flight_id }))),
  ]
  const seen = new Set<string>()
  for (const action of actions) {
    const id = action.type === "cancel_flight" ? `cancel:${action.flightId}` : `swap:${action.spareTail}:${action.flightId}`
    if (seen.has(id)) continue
    seen.add(id)
    const invalid = validateAction(action, scenario, baselineResult)
    if (invalid) { if (action.type === "swap_spare") rejected.push({ action, reason: invalid }); continue }
    const result = simulate(scenario, [action])
    if (result.score < baseline.score) candidates.push({ id, label: action.type === "cancel_flight" ? `Cancel ${action.flightId}` : `Swap ${action.flightId} to ${action.spareTail}`, action, score: result.score, result, improvement: baseline.score - result.score })
  }
  candidates.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
  return { baseline, recommendations: candidates.slice(0, 3), rejected }
}
