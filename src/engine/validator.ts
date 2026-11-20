export type DispatcherPayload = {
  recommended_action_id: string
  summary: string
  why: string[]
  numbers_cited: Array<number | string>
}

const formatNumber = (value: number) => new Intl.NumberFormat("en-US").format(value)

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
  const allowedIdentifiers = collectIdentifiersAndTimes(engineOutput).identifiers
  const allowedTimes = collectIdentifiersAndTimes(engineOutput).times
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
    && typeof payload.summary === "string"
    && Array.isArray(payload.why) && payload.why.every(item => typeof item === "string")
    && Array.isArray(payload.numbers_cited) && payload.numbers_cited.every(item => typeof item === "number" || typeof item === "string")
}
