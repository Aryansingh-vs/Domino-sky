import { NextResponse } from "next/server"
import { simulate, type Action } from "@/src/engine"
import { validateAction } from "@/src/engine/recovery"
import { isAction, isScenario, validateNumbers, type DispatcherPayload } from "@/src/engine/validator"
import { ApiRequestError, isRecord, readJsonRequest } from "@/lib/api-request"

export const runtime = "nodejs"

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await readJsonRequest(request)
  } catch (error) {
    if (error instanceof ApiRequestError) return NextResponse.json({ error: error.message }, { status: error.status })
    throw error
  }

  if (!isRecord(body)) return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 })
  const scenario = body.scenario
  const question = body.question ?? ""
  const actions = body.actions ?? []
  if (!isScenario(scenario) || typeof question !== "string" || question.length > 300
    || !Array.isArray(actions) || actions.length > 1 || !actions.every(isAction)) {
    return NextResponse.json({ error: "Provide a valid scenario, at most one valid action, and a question of 300 characters or fewer." }, { status: 400 })
  }

  const baseline = simulate(scenario)
  const action = actions.find(isAction)
  if (action && validateAction(action, scenario, baseline) !== null) {
    return NextResponse.json({ error: "The recovery action is not valid for this scenario." }, { status: 400 })
  }
  const simulation = simulate(scenario, action ? [action] : [])
  const id = question.match(/DS\d{4}/i)?.[0]?.toUpperCase()
  const flight = id ? simulation.flights.find(item => item.flight_id === id) : undefined
  const payload: DispatcherPayload = flight
    ? {
        recommended_action_id: "baseline",
        summary: flight.status === "Cancelled"
          ? `${flight.flight_id} was cancelled by an applied recovery action.`
          : flight.departureDelay > 0
            ? `${flight.flight_id} departs ${flight.departureDelay} minutes late at ${String(Math.floor(flight.actualDep / 60)).padStart(2, "0")}:${String(flight.actualDep % 60).padStart(2, "0")}.`
            : `${flight.flight_id} is on time at ${String(Math.floor(flight.actualDep / 60)).padStart(2, "0")}:${String(flight.actualDep % 60).padStart(2, "0")}.`,
        why: flight.root_cause_chain,
        numbers_cited: [flight.departureDelay, flight.actualDep, flight.actualArr],
      }
    : {
        recommended_action_id: "baseline",
        summary: `This scenario has ${simulation.delayedFlights} delayed flights, ${simulation.totalDepDelayMinutes} departure-delay minutes, and ${simulation.strandedPax} stranded passengers.`,
        why: ["All figures come from the deterministic simulation."],
        numbers_cited: [simulation.delayedFlights, simulation.totalDepDelayMinutes, simulation.strandedPax],
      }
  const checked = validateNumbers(payload, simulation)
  const answer = checked.valid ? `${payload.summary}${payload.why.length ? ` ${payload.why.join(" → ")}` : ""}` : "I could not verify an answer for that question from this simulation."
  return NextResponse.json({ answer, verified: checked.valid })
}
