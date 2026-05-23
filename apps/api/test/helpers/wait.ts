export async function waitForCondition<T>(
  predicate: () => Promise<T | null | undefined>,
  opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const intervalMs = opts.intervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    `waitForCondition timed out after ${timeoutMs}ms${opts.label ? `: ${opts.label}` : ''}`,
  );
}
