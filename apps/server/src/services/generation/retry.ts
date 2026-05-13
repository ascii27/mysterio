export interface AttemptResult<T> {
  attempts: number;
  result: T | null;
  errors: string[];
}

export async function retryUntil<T>(
  maxAttempts: number,
  fn: (attempt: number, prevErrors: string[]) => Promise<{ ok: true; value: T } | { ok: false; error: string }>,
): Promise<AttemptResult<T>> {
  const errors: string[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await fn(attempt, errors);
    if (r.ok) return { attempts: attempt, result: r.value, errors };
    errors.push(r.error);
  }
  return { attempts: maxAttempts, result: null, errors };
}
