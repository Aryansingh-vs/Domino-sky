import { describe, expect, it } from "vitest"
import { isAction, isDispatcherPayload, isScenario } from "./validator"

describe("request validation", () => {
  it("accepts known airports and valid same-day closure windows", () => {
    expect(isScenario({ airport: "BOM", start: "09:00", end: "10:30" })).toBe(true)
    expect(isScenario({ airport: "DEL", start: "12:00", end: "12:00" })).toBe(true)
  })

  it.each([
    { airport: "XYZ", start: "09:00", end: "10:30" },
    { airport: "BOM", start: "24:00", end: "25:00" },
    { airport: "BOM", start: "10:30", end: "09:00" },
    null,
  ])("rejects invalid scenarios: %s", scenario => {
    expect(isScenario(scenario)).toBe(false)
  })

  it("accepts only actions that reference known schedule entities", () => {
    expect(isAction({ type: "cancel_flight", flightId: "DS0204" })).toBe(true)
    expect(isAction({ type: "swap_spare", spareTail: "VT-DS17", flightId: "DS0204" })).toBe(true)
    expect(isAction({ type: "cancel_flight", flightId: "DS9999" })).toBe(false)
    expect(isAction(null)).toBe(false)
  })

  it("rejects oversized or malformed dispatcher responses", () => {
    expect(isDispatcherPayload({
      recommended_action_id: "baseline",
      summary: "x".repeat(1201),
      why: [],
      numbers_cited: [],
    })).toBe(false)
    expect(isDispatcherPayload({
      recommended_action_id: "baseline",
      summary: "All good.",
      why: ["x".repeat(501)],
      numbers_cited: [],
    })).toBe(false)
  })
})
