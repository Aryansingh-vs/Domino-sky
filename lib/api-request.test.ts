import { describe, expect, it } from "vitest"
import { readJsonRequest } from "./api-request"

describe("readJsonRequest", () => {
  it("parses a bounded JSON request", async () => {
    const request = new Request("http://localhost/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Why is DS0204 late?" }),
    })

    await expect(readJsonRequest(request)).resolves.toEqual({ question: "Why is DS0204 late?" })
  })

  it("rejects unsupported content types", async () => {
    const request = new Request("http://localhost/api", { method: "POST", body: "{}" })

    await expect(readJsonRequest(request)).rejects.toMatchObject({ status: 415 })
  })

  it("rejects oversized requests before parsing", async () => {
    const request = new Request("http://localhost/api", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "20" },
      body: "{}",
    })

    await expect(readJsonRequest(request, 10)).rejects.toMatchObject({ status: 413 })
  })

  it("enforces the size limit when Content-Length is absent", async () => {
    const request = new Request("http://localhost/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(20) }),
    })

    await expect(readJsonRequest(request, 10)).rejects.toMatchObject({ status: 413 })
  })

  it("rejects malformed JSON", async () => {
    const request = new Request("http://localhost/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    })

    await expect(readJsonRequest(request)).rejects.toMatchObject({ status: 400 })
  })
})
