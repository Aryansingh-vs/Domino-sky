import { describe, expect, it } from "vitest"
import { schedule, simulate, toMinutes, type Scenario } from "./index"
import { evaluateRecoveries, validateAction } from "./recovery"
import { validateNumbers, type DispatcherPayload } from "./validator"

const scenarios: Record<string, Scenario> = {
  bom: { airport: "BOM", start: "09:00", end: "10:30" },
  del: { airport: "DEL", start: "12:00", end: "13:30" },
  hyd: { airport: "HYD", start: "11:30", end: "13:00" },
  ccu: { airport: "CCU", start: "12:00", end: "13:30" },
}

describe("deterministic schedule simulation", () => {
  it("converts HH:MM to minutes since midnight", () => expect(toMinutes("12:30")).toBe(750))
  it("has no impact without a closure", () => {
    const result = simulate({ airport: "BOM", start: "00:00", end: "00:00" })
    expect(result.delayedFlights).toBe(0)
    expect(result.totalDepDelayMinutes).toBe(0)
    expect(result.brokenConnections).toHaveLength(0)
    expect(result.strandedPax).toBe(0)
    expect(result.crewBreaches).toBe(0)
    expect(result.flights.every(flight => flight.actualDep === flight.scheduledDep && flight.actualArr === flight.scheduledArr)).toBe(true)
  })
  it("matches the BOM demo expectations", () => {
    const result = simulate(scenarios.bom)
    expect(result.delayedFlights).toBe(6)
    expect(result.totalDepDelayMinutes).toBe(275)
    expect(result.strandedPax).toBe(0)
    expect(result.crewBreaches).toBe(0)
    expect(result.cancelledFlights).toBe(0)
    expect(result.flights.find(flight => flight.flight_id === "DS0202")?.actualDep).toBe(toMinutes("10:30"))
    expect(result.flights.find(flight => flight.flight_id === "DS0203")?.actualDep).toBe(toMinutes("11:40"))
    expect(result.flights.find(flight => flight.flight_id === "DS0402")?.actualArr).toBe(toMinutes("10:30"))
    expect(result.affectedAirports).toEqual(["BLR", "BOM", "GOI", "HYD", "PNQ"])
  })
  it("builds a non-duplicated late-inbound root cause chain", () => {
    const flight = simulate(scenarios.bom).flights.find(item => item.flight_id === "DS0204")
    expect(flight?.cause).toEqual({ type: "late_inbound", previousFlightId: "DS0203" })
    expect(flight?.root_cause_chain).toEqual(["DS0204 late", "DS0203 late", "DS0202 late", "BOM closed 09:00-10:30"])
  })
  it("matches the DEL demo expectations", () => {
    const result = simulate(scenarios.del)
    expect(result.delayedFlights).toBe(8)
    expect(result.totalDepDelayMinutes).toBe(515)
    expect(result.strandedPax).toBe(18)
    expect(result.brokenConnections.map(item => item.connection_id)).toContain("CX10")
    expect(result.crews.find(item => item.crew_id === "CR03")?.breach).toBe(true)
  })
  it("matches the HYD demo expectations", () => {
    const result = simulate(scenarios.hyd)
    expect(result.delayedFlights).toBe(7)
    expect(result.strandedPax).toBe(99)
    expect(result.brokenConnections.map(item => item.connection_id)).toEqual(expect.arrayContaining(["CX11", "CX12", "CX17"]))
    expect(result.crews.find(item => item.crew_id === "CR07")?.breach).toBe(true)
  })
  it("matches the CCU demo expectations", () => {
    const result = simulate(scenarios.ccu)
    expect(result.delayedFlights).toBe(9)
    expect(result.strandedPax).toBe(34)
    expect(result.brokenConnections.map(item => item.connection_id)).toEqual(expect.arrayContaining(["CX14", "CX21"]))
    expect(result.crews.find(item => item.crew_id === "CR11")?.breach).toBe(true)
  })
  it("has no impact from a closure outside operating hours", () => {
    const result = simulate({ airport: "DEL", start: "01:00", end: "04:00" })
    expect(result.delayedFlights).toBe(0)
    expect(result.totalDepDelayMinutes).toBe(0)
  })
  it("is deterministic", () => expect(simulate(scenarios.del)).toEqual(simulate(scenarios.del)))
  it("does not double count passengers on connections touching cancelled flights", () => {
    const action = { type: "cancel_flight" as const, flightId: "DS1203" }
    const result = simulate(scenarios.del, [action])
    const passengersOnCanceled = result.flights.filter(flight => flight.status === "Cancelled").reduce((total, flight) => total + flight.pax, 0)
    expect(result.brokenConnections.some(connection => connection.connection_id === "CX10" && connection.hasCancelledFlight)).toBe(true)
    expect(result.strandedPax).toBe(passengersOnCanceled + result.brokenConnections.filter(connection => !connection.hasCancelledFlight).reduce((total, item) => total + item.passengers, 0))
  })
  it("never auto-cancels for a closure", () => expect(simulate(scenarios.del).cancelledFlights).toBe(0))
})

describe("recovery actions", () => {
  it("only returns strictly improving actions", () => {
    const evaluation = evaluateRecoveries(scenarios.del)
    expect(evaluation.recommendations.length).toBeLessThanOrEqual(3)
    expect(evaluation.recommendations.every(candidate => candidate.score < evaluation.baseline.score)).toBe(true)
  })
  it("rejects a swap to an incompatible base", () => {
    const baseline = simulate(scenarios.del)
    const reason = validateAction({ type: "swap_spare", spareTail: "VT-DS17", flightId: "DS0202" }, scenarios.del, baseline)
    expect(reason).toMatch(/based at BLR, not BOM/)
  })
  it("does not mutate the provided dataset", () => expect(schedule).toHaveLength(70))
})

describe("dispatcher numeric validation", () => {
  const engineOutput = { scenario: { start: "12:00", end: "13:30" }, delayedFlights: 8, totalDepDelayMinutes: 515, strandedPax: 18, flight: "DS0204" }
  const faithful: DispatcherPayload = { recommended_action_id: "baseline", summary: "8 flights delayed for 515 minutes.", why: ["DS0204 is delayed during 12:00-13:30."], numbers_cited: [8, 515, "DS0204", "12:00", "13:30"] }
  it("rejects an invented number", () => expect(validateNumbers({ ...faithful, summary: "8 flights delayed for 516 minutes." }, engineOutput).valid).toBe(false))
  it("accepts a faithful explanation", () => expect(validateNumbers(faithful, engineOutput).valid).toBe(true))
  it("rejects unknown identifiers and times", () => {
    const checked = validateNumbers({ ...faithful, why: ["DS9999 is scheduled at 18:88."] }, engineOutput)
    expect(checked.valid).toBe(false)
    expect(checked.invalid).toEqual(expect.arrayContaining(["DS9999", "18:88"]))
  })
})
