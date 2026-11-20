import { NextResponse } from "next/server"
import { evaluateRecoveries } from "@/src/engine/recovery"
import { simulate, type Scenario } from "@/src/engine"
import { isDispatcherPayload, isScenario, validateNumbers, type DispatcherPayload } from "@/src/engine/validator"
import { ApiRequestError, isRecord, readJsonRequest } from "@/lib/api-request"

export const runtime = "nodejs"

function template(simulation: ReturnType<typeof simulate>, actionId: string): DispatcherPayload {
  const recommendation = actionId === "baseline" ? null : evaluateRecoveries(simulation.scenario).recommendations.find(item => item.id === actionId)
  const summary = recommendation
    ? `${recommendation.label} reduces the score from ${simulation.score} to ${recommendation.score}.`
    : simulation.score === 0 ? "The schedule remains on time; no recovery action improves the outcome." : `The closure produces ${simulation.delayedFlights} delayed flights and ${simulation.strandedPax} stranded passengers.`
  const why = [
    `${simulation.totalDepDelayMinutes} total departure-delay minutes; ${simulation.crewBreaches} crew duty breaches.`,
    `Cancellations remain at ${simulation.cancelledFlights}; the simulation only cancels flights when a recovery action is applied.`,
  ]
  return { recommended_action_id: recommendation?.id ?? "baseline", summary, why, numbers_cited: [simulation.delayedFlights, simulation.totalDepDelayMinutes, simulation.strandedPax, simulation.crewBreaches, simulation.cancelledFlights] }
}

function parseGeminiResponse(data: unknown): DispatcherPayload | null {
  if (!isRecord(data) || !Array.isArray(data.candidates)) return null
  const candidate = data.candidates[0]
  if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) return null
  const text = candidate.content.parts
    .map(part => isRecord(part) && typeof part.text === "string" ? part.text : "")
    .join("")
  if (!text) return null
  try {
    const payload: unknown = JSON.parse(text)
    return isDispatcherPayload(payload) ? payload : null
  } catch { return null }
}

async function requestGemini(context: unknown): Promise<DispatcherPayload | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  const prompt = `You are a flight operations dispatcher. Use only the supplied engine JSON. Do not calculate or invent figures. Return JSON with exactly recommended_action_id (one provided id), summary (string), why (string array), and numbers_cited (array of numbers or exact IDs/times copied from the data). Every numeric token in prose must occur in the engine data. Recommend baseline if no improvement exists.\nENGINE_JSON:\n${JSON.stringify(context)}`
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, signal: AbortSignal.timeout(9000),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: {
          type: "OBJECT", properties: {
            recommended_action_id: { type: "STRING" }, summary: { type: "STRING" },
            why: { type: "ARRAY", items: { type: "STRING" } },
            numbers_cited: { type: "ARRAY", items: { type: "STRING" } },
          }, required: ["recommended_action_id", "summary", "why", "numbers_cited"], propertyOrdering: ["recommended_action_id", "summary", "why", "numbers_cited"],
        } },
      }),
    })
    if (!response.ok) return null
    return parseGeminiResponse(await response.json())
  } catch { return null }
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await readJsonRequest(request)
  } catch (error) {
    if (error instanceof ApiRequestError) return NextResponse.json({ error: error.message }, { status: error.status })
    throw error
  }

  if (!isRecord(body) || !isScenario(body.scenario)) {
    return NextResponse.json({ error: "A valid scenario is required." }, { status: 400 })
  }
  const scenario: Scenario = body.scenario
  const evaluation = evaluateRecoveries(scenario)
  const simulation = simulate(scenario)
  const context = { simulation, baseline: evaluation.baseline, recommendations: evaluation.recommendations.map(({ id, label, score, improvement, result }) => ({ id, label, score, improvement, result })), actionIds: ["baseline", ...evaluation.recommendations.map(item => item.id)] }
  let payload = await requestGemini(context)
  let verified = false
  if (payload && !context.actionIds.includes(payload.recommended_action_id)) payload = null
  if (payload) {
    verified = validateNumbers(payload, context).valid
    if (!verified) {
      const retry = await requestGemini(context)
      if (retry && context.actionIds.includes(retry.recommended_action_id) && validateNumbers(retry, context).valid) { payload = retry; verified = true }
      else payload = null
    }
  }
  if (!payload) payload = template(simulation, evaluation.recommendations[0]?.id ?? "baseline")
  return NextResponse.json({ explanation: payload, verified, template: !verified, baseline: evaluation.baseline, recommendations: evaluation.recommendations })
}
