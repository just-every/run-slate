export type DependencyHealth = Record<"database" | "files", { status: "reachable" }>;

export interface DependencyBindings {
  database: D1Database;
  files: R2Bucket;
  jobs?: Queue<unknown>;
}

const storageProbeKey = "_system/health/reachability";

/** D1/R2 round trips plus native queue acceptance; response fields preserve the v1 health API. Queue processing failures are separately visible to owners. */
export async function probeDependencies(bindings: DependencyBindings): Promise<DependencyHealth> {
  await Promise.all([
    bindings.database.prepare("SELECT 1 AS ready").first(),
    bindings.files.head(storageProbeKey),
    bindings.jobs?.send({kind:"core.health"}),
  ]);
  return {
    database: { status: "reachable" },
    files: { status: "reachable" },
  };
}
