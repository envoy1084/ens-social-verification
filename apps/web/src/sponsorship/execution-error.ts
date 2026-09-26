export function sponsorshipExecutionError(error: unknown): unknown {
  let cause = error;
  const visited = new Set<unknown>();
  while (cause && typeof cause === "object" && !visited.has(cause)) {
    visited.add(cause);
    if ("status" in cause && cause.status === 429)
      return new Error("RPC rate limit reached during the sponsored update. Try again shortly.", {
        cause: error,
      });
    cause = "cause" in cause ? cause.cause : undefined;
  }
  return error;
}
