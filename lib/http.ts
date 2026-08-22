export function jsonOk(data: unknown, init?: ResponseInit) {
  return Response.json(data, { status: 200, ...init });
}

export function jsonError(status: number, message: string, details?: unknown) {
  return Response.json(
    {
      error: {
        message,
        details: details ?? null
      }
    },
    { status }
  );
}
