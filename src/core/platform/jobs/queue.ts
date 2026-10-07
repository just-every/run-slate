export interface JobRequest<T> {
  type: string;
  payload: T;
  id?: string;
  enqueuedAt?: string;
}

export interface QueuedJob<T> {
  id: string;
  type: string;
  payload: T;
  enqueuedAt: string;
}

export interface JobDispatcher {
  dispatch<T>(request: JobRequest<T>): Promise<QueuedJob<T>>;
}

function createJobId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function assertJobType(type: string): void {
  if (!/^[a-z][a-z0-9.-]{2,127}$/.test(type)) {
    throw new Error("Job types must be dot-separated lower-case identifiers.");
  }
}

export function createQueueDispatcher(queue: Queue<unknown>, now: () => Date = () => new Date()): JobDispatcher {
  return {
    async dispatch<T>(request: JobRequest<T>): Promise<QueuedJob<T>> {
      assertJobType(request.type);
      const job: QueuedJob<T> = {
        id: request.id ?? createJobId(),
        type: request.type,
        payload: request.payload,
        enqueuedAt: request.enqueuedAt ?? now().toISOString(),
      };
      await queue.send(job);
      return job;
    },
  };
}

export function isQueuedJob(value: unknown): value is QueuedJob<unknown> {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<QueuedJob<unknown>>;
  return typeof job.id === "string"
    && typeof job.type === "string"
    && typeof job.enqueuedAt === "string"
    && Object.hasOwn(job, "payload");
}
