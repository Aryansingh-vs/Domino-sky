import { describe, expect, it } from "vitest"
import { POST } from "./route"

function request(body: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("chat route", () => {
  it("rejects malformed scenarios with a client error", async () => {
    const response = await POST(request({
      scenario: { airport: "XYZ", start: "99:00", end: "100:00" },
      question: "How many flights are delayed?",
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) })
  })

  it("returns a verified deterministic answer for a valid request", async () => {
    const response = await POST(request({
      scenario: { airport: "BOM", start: "09:00", end: "10:30" },
      question: "How many flights are delayed?",
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      answer: expect.stringContaining("6 delayed flights"),
      verified: true,
    })
  })
})
