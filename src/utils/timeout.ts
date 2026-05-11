/**
 * Wrap a promise with a hard timeout. If the timeout fires first,
 * the returned promise rejects with an Error tagged `timeoutMessage`.
 *
 * Note: the underlying promise is NOT cancelled — callers that own a
 * cancellable resource (AbortController, session.close(), etc.) must
 * tear it down in their catch block.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
