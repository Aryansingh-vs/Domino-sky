import { NextResponse } from "next/server"
import { simulate, type Action, type Scenario } from "@/src/engine"
import { validateAction } from "@/src/engine/recovery"
import { validateNumbers, type DispatcherPayload } from "@/src/engine/validator"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const body = await request.json() as { scenario?: Scenario; question?: string; actions?: Action[] }
    const { scenario, question = "", actions = [] } = body
    if (!scenario || typeof question !== "string" || question.length > 300 || !Array.isArray(actions)) return NextResponse.json({ answer: "Please enter a short question about this simulation." })
    const baseline = simulate(scenario)
    const validActions = actions.filter(action => action && validateAction(action, scenario, baseline) === null).slice(0, 1)
    const simulation = simulate(scenario, validActions)
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
  } catch {
    return NextResponse.json({ answer: "I could not answer that question from the current simulation.", verified: false })
  }
}
