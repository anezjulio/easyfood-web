export async function readJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const payload = (await response.json()) as { message?: unknown };
      const fromServer = typeof payload?.message === "string" ? payload.message.trim() : "";
      if (fromServer) {
        message = fromServer;
      }
    } catch {
      // ignore malformed/empty error payload and keep fallback message
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}
