export class ApiRequestError extends Error {
  constructor(message: string, readonly status: 400 | 413 | 415) {
    super(message)
    this.name = "ApiRequestError"
  }
}

export async function readJsonRequest(request: Request, maxBytes = 16_384): Promise<unknown> {
  const contentType = request.headers.get("content-type")
  if (contentType?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new ApiRequestError("Content-Type must be application/json.", 415)
  }

  const contentLength = request.headers.get("content-length")
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) throw new ApiRequestError("Invalid Content-Length.", 400)
    if (Number(contentLength) > maxBytes) throw new ApiRequestError("Request body is too large.", 413)
  }

  if (!request.body) throw new ApiRequestError("A JSON request body is required.", 400)

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        throw new ApiRequestError("Request body is too large.", 413)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown
  } catch {
    throw new ApiRequestError("Request body must contain valid JSON.", 400)
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
