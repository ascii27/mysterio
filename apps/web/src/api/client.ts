export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // Only declare a JSON content-type when we actually send a body. Fastify rejects an empty
  // body sent with `Content-Type: application/json` (FST_ERR_CTP_EMPTY_JSON_BODY → 400), which
  // breaks bodyless requests like DELETE /players/:id and DELETE .../clues/:clueId.
  const hasBody = init?.body != null;
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  let body: unknown = undefined;
  const text = await res.text();
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!res.ok) {
    throw new ApiError(res.status, body, `HTTP ${res.status} on ${path}`);
  }
  return body as T;
}
