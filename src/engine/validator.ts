import { airports, schedule, spareAircraft, toMinutes, type Action, type Scenario } from "./index"

export type DispatcherPayload = {
  recommended_action_id: string
  summary: string
  why: string[]
  numbers_cited: Array<number | string>
}

const formatNumber = (value: number) => new Intl.NumberFormat("en-US").format(value)

export function isScenario(value: unknown): value is Scenario {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const scenario = value as Record<string, unknown>
  if (typeof scenario.airport !== "string" || typeof scenario.start !== "string" || typeof scenario.end !== "string") return false
  const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/
  return airports.some(airport => airport.id === scenario.airport)
    && validTime.test(scenario.start)
    && validTime.test(scenario.end)
    && toMinutes(scenario.start) <= toMinutes(scenario.end)
}

export function isAction(value: unknown): value is Action {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const action = value as Record<string, unknown>
  if (action.type === "cancel_flight") {
    return typeof action.flightId === "string" && schedule.some(flight => flight.flight_id === action.flightId)
  }
  if (action.type === "swap_spare") {
    return typeof action.spareTail === "string"
      && spareAircraft.some(spare => spare.tail_id === action.spareTail)
      && typeof action.flightId === "string"
      && schedule.some(flight => flight.flight_id === action.flightId)
  }
  return false
}

function engineNumbers(value: unknown, numbers = new Set<string>()): Set<string> {
  if (typeof value === "number" && Number.isFinite(value)) {
    numbers.add(String(value))
    numbers.add(formatNumber(value))
  } else if (Array.isArray(value)) {
    value.forEach(item => engineNumbers(item, numbers))
  } else if (value && typeof value === "object") {
    Object.values(value).forEach(item => engineNumbers(item, numbers))
  }
  return numbers
}

function collectIdentifiersAndTimes(value: unknown, key = "", identifiers = new Set<string>(), times = new Set<string>()): { identifiers: Set<string>; times: Set<string> } {
  if (typeof value === "string") {
    value.match(/\b(?:VT-DS\d{2}|DS\d{4}|CR\d{2}|CX\d{2}|[A-Z]{3})\b/g)?.forEach(item => identifiers.add(item))
    value.match(/\b\d{2}:\d{2}\b/g)?.forEach(item => times.add(item))
  } else if (typeof value === "number" && /^(?:actual|scheduled)(?:Dep|Arr)$/.test(key) && value >= 0 && value < 1440) {
    times.add(`${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`)
  } else if (Array.isArray(value)) {
    value.forEach(item => collectIdentifiersAndTimes(item, "", identifiers, times))
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([name, item]) => collectIdentifiersAndTimes(item, name, identifiers, times))
  }
  return { identifiers, times }
}

function extractNumbers(text: string): string[] {
  const withoutIdsAndTimes = text
    .replace(/\b(?:VT-DS\d{2}|DS\d{4}|CR\d{2}|CX\d{2}|[A-Z]{3})\b/g, " ")
    .replace(/\b\d{2}:\d{2}\b/g, " ")
  return withoutIdsAndTimes.match(/(?<![A-Za-z0-9])\d+(?:,\d{3})*(?:\.\d+)?/g) ?? []
}

export function validateNumbers(payload: DispatcherPayload, engineOutput: unknown): { valid: boolean; invalid: string[] } {
  const allowed = engineNumbers(engineOutput)
  const { identifiers: allowedIdentifiers, times: allowedTimes } = collectIdentifiersAndTimes(engineOutput)
  const citedStrings = payload.numbers_cited.filter((value): value is string => typeof value === "string")
  const prose = [payload.summary, ...payload.why, ...citedStrings]
  const citedNumbers = payload.numbers_cited.flatMap(value => typeof value === "number" ? [String(value), formatNumber(value)] : extractNumbers(value))
  const allNumbers = [...prose.flatMap(extractNumbers), ...citedNumbers]
  const allIdentifiers = prose.flatMap(text => text.match(/\b(?:VT-DS\d{2}|DS\d{4}|CR\d{2}|CX\d{2}|[A-Z]{3})\b/g) ?? [])
  const allTimes = prose.flatMap(text => text.match(/\b\d{2}:\d{2}\b/g) ?? [])
  const invalid = [...new Set([
    ...allNumbers.filter(number => !allowed.has(number) && !allowed.has(number.replaceAll(",", ""))),
    ...allIdentifiers.filter(identifier => !allowedIdentifiers.has(identifier)),
    ...allTimes.filter(time => !allowedTimes.has(time)),
  ])]
  return { valid: invalid.length === 0, invalid }
}

export function isDispatcherPayload(value: unknown): value is DispatcherPayload {
  if (!value || typeof value !== "object") return false
  const payload = value as Record<string, unknown>
  return typeof payload.recommended_action_id === "string"
    && payload.recommended_action_id.length <= 80
    && typeof payload.summary === "string"
    && payload.summary.length <= 1200
    && Array.isArray(payload.why)
    && payload.why.length <= 8
    && payload.why.every(item => typeof item === "string" && item.length <= 500)
    && Array.isArray(payload.numbers_cited)
    && payload.numbers_cited.length <= 24
    && payload.numbers_cited.every(item => typeof item === "string"
      ? item.length <= 80
      : typeof item === "number" && Number.isFinite(item))
}
