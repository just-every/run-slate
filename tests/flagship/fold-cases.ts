/** Run independent clause points without hiding later failures behind the first. */
export async function runFoldCases(cases: readonly {
  name: string;
  before?: () => Promise<void>;
  run: () => Promise<void> | void;
}[]): Promise<void> {
  const failures: Error[] = [];
  for (const [index, point] of cases.entries()) {
    try {
      if (index > 0) await point.before?.();
      await point.run();
    } catch (cause) {
      failures.push(new Error(`[${point.name}] ${cause instanceof Error ? cause.message : String(cause)}`, {cause}));
    }
  }
  if (failures.length) throw new AggregateError(failures, failures.map(error => error.message).join('\n'));
}
