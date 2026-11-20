import { describe, expect, it } from "vitest"
import { POST } from "./route"

describe("dispatcher route", () => {
  it("rejects malformed scenarios instead of returning a success-shaped fallback", async () => {
    const response = await POST(new Request("http://localhost/api/dispatcher", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario: { airport: "BOM", start: "09:60", end: "10:30" } }),
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) })
  })
})
