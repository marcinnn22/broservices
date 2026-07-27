const MAX_ERROR_CAUSE_DEPTH = 12;

export function hasPostgresErrorCode(error: unknown, expectedCode: string): boolean {
  let current = error;
  const seen = new WeakSet<object>();

  for (let depth = 0; depth < MAX_ERROR_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== "object" || current === null || seen.has(current)) {
      return false;
    }

    seen.add(current);

    try {
      if ("code" in current && current.code === expectedCode) {
        return true;
      }

      current = "cause" in current ? current.cause : undefined;
    } catch {
      return false;
    }
  }

  return false;
}
