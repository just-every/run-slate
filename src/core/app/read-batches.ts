/** Coalesce independent SELECTs from one request into D1's read transaction.
 * Results exist only until their awaiting caller receives them. Writes keep
 * their own atomic batches, guards and ordering; no result is retained. */
export function batchRequestReads(database: D1Database): D1Database {
  type Pending = { statement: D1PreparedStatement; resolve: (result: D1Result) => void; reject: (cause: unknown) => void };
  let pending: Pending[] = [];
  const native = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  const enqueue = (statement: D1PreparedStatement): Promise<D1Result> => new Promise((resolve, reject) => {
    pending.push({ statement, resolve, reject });
    if (pending.length !== 1) return;
    queueMicrotask(() => {
      const reads = pending;
      pending = [];
      // Each wave starts at the primary. A later read must observe writes
      // committed between waves, including writes outside this read session.
      void database.withSession('first-primary').batch(reads.map(read => read.statement)).then(
        results => reads.forEach((read, index) => read.resolve(results[index]!)),
        cause => reads.forEach(read => read.reject(cause)),
      );
    });
  });
  const prepare = (statement: D1PreparedStatement, select: boolean): D1PreparedStatement => {
    const wrapped = new Proxy(statement, {
      get(target, key) {
        if (key === 'bind') return (...values: unknown[]) => prepare(target.bind(...values), select);
        if (select && key === 'all') return () => enqueue(target);
        if (select && key === 'first') return (column?: string) => column === undefined
          ? enqueue(target).then(result => result.results[0] ?? null)
          : target.first(column);
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    native.set(wrapped, statement);
    return wrapped;
  };
  return new Proxy(database, {
    get(target, key) {
      if (key === 'prepare') return (sql: string) => prepare(target.prepare(sql), /^\s*SELECT\b/i.test(sql));
      if (key === 'batch') return (statements: D1PreparedStatement[]) => target.batch(statements.map(statement => native.get(statement) ?? statement));
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
