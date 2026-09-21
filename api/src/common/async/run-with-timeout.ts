export type Guarded<T> = { status: 'ok'; value: T } | { status: 'timeout' } | { status: 'error'; error: unknown };

const TIMED_OUT = Symbol('timed out');

/**
 * Runs `work` and reports how it went instead of ever rejecting or hanging:
 * its value, that it took longer than `timeoutMs`, or that it threw (including
 * synchronously). A timed-out job cannot be cancelled, so it is left to finish in
 * the background, with a handler attached so a late rejection is not "unhandled".
 */
export async function runWithTimeout<T>(work: () => Promise<T>, timeoutMs: number): Promise<Guarded<T>> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
  });
  const running = (async () => work())();
  running.catch(() => undefined);

  try {
    const outcome = await Promise.race([running, timeout]);
    return outcome === TIMED_OUT ? { status: 'timeout' } : { status: 'ok', value: outcome as T };
  } catch (error) {
    return { status: 'error', error };
  } finally {
    clearTimeout(timer);
  }
}
