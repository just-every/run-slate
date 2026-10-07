import type { attemptView } from "../attempt-view";
export type RunInstrumentationData = Awaited<ReturnType<typeof attemptView>>;
const duration = (value: number | null) =>
  value === null ? "Unavailable" : `${(value / 1000).toFixed(3)} seconds`;
const money = (value: number | null) =>
  value === null ? "Unavailable" : `USD ${(value / 1_000_000).toFixed(6)}`;
export function RunInstrumentation({
  value,
}: {
  value: RunInstrumentationData;
}) {
  return (
    <section aria-label="Attempt measurements">
      <h3>Attempts and measured usage</h3>
      <p>
        Machine timing runs from client dispatch through result validation.
        Provider timing is shown separately when retained.
      </p>
      {value.parentRunId ? (
        <p>
          Continues{" "}
          <a href={`/app/runs/${encodeURIComponent(value.parentRunId)}`}>
            an earlier run
          </a>
          .
        </p>
      ) : null}
      <dl className="run-detail">
        <dt>Human attention</dt>
        <dd>Unmeasured</dd>
        <dt>Setup effort</dt>
        <dd>Unmeasured</dd>
        <dt>Repair effort</dt>
        <dd>Unmeasured</dd>
      </dl>
      {value.historicalCoverageGap ? (
        <p>
          {value.historicalCoverageGap} historical attempt
          {value.historicalCoverageGap === 1 ? " has" : "s have"} no retained
          detailed measurements.
        </p>
      ) : null}
      {value.attempts.length ? (
        <ol>
          {value.attempts.map((attempt) => (
            <li key={attempt.id}>
              <h4>
                Attempt {attempt.detail?.ordinal ?? attempt.id} ·{" "}
                {attempt.state}
              </h4>
              <p>
                {attempt.executionState === "active"
                  ? "In progress"
                  : attempt.executionState === "historical-unfinished"
                    ? "Historical attempt with no observed completion"
                    : "Closed"}
              </p>
              <dl className="run-detail">
                <dt>Started</dt>
                <dd>
                  <time dateTime={attempt.startedAt}>
                    {new Date(attempt.startedAt).toLocaleString()}
                  </time>
                </dd>
                <dt>Completed</dt>
                <dd>
                  {attempt.completedAt ? (
                    <time dateTime={attempt.completedAt}>
                      {new Date(attempt.completedAt).toLocaleString()}
                    </time>
                  ) : (
                    "Not recorded"
                  )}
                </dd>
                <dt>Machine elapsed</dt>
                <dd>{duration(attempt.machineElapsedMs)}</dd>
                <dt>Provider elapsed</dt>
                <dd>{duration(attempt.providerElapsedMs)}</dd>
              </dl>
              {attempt.detail ? (
                <>
                  <dl className="run-detail">
                    <dt>Phase</dt>
                    <dd>{attempt.detail.phase}</dd>
                    <dt>Known tokens</dt>
                    <dd>
                      {attempt.detail.knownTokens === null
                        ? "Unavailable"
                        : attempt.detail.knownTokens.toLocaleString()}
                    </dd>
                    <dt>Known monetary cost</dt>
                    <dd>
                      {attempt.detail.accountingUnit === "usd-micros"
                        ? money(attempt.detail.knownCost)
                        : "Unavailable · accounting is in tokens"}
                    </dd>
                    <dt>Unsettled upper bound</dt>
                    <dd>
                      {attempt.detail.accountingUnit === "tokens"
                        ? `${attempt.detail.uncertainUpperBound.toLocaleString()} tokens`
                        : money(attempt.detail.uncertainUpperBound)}
                    </dd>
                    <dt>Outcome</dt>
                    <dd>{attempt.detail.outcome ?? "Not recorded"}</dd>
                    <dt>Measurement</dt>
                    <dd>
                      {attempt.detail.measurement === "recovery-observed-bound"
                        ? "Observed recovery bound"
                        : "Observed"}
                    </dd>
                  </dl>
                  {attempt.detail.errorCode ? (
                    <p>Error: {attempt.detail.errorCode}</p>
                  ) : null}
                  {attempt.detail.retryScheduled ? (
                    <p>
                      Retry scheduled
                      {attempt.detail.nextEligibleAt ? (
                        <>
                          {" "}
                          from{" "}
                          <time dateTime={attempt.detail.nextEligibleAt}>
                            {new Date(
                              attempt.detail.nextEligibleAt,
                            ).toLocaleString()}
                          </time>
                        </>
                      ) : null}
                      .
                    </p>
                  ) : null}
                </>
              ) : (
                <p>
                  {attempt.detailAvailability === "legacy-unavailable"
                    ? "Detailed measurements were not retained for this legacy attempt."
                    : "Detailed measurements are redacted or unavailable."}
                </p>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p>No retained attempts.</p>
      )}
      {value.interruptions.length ? (
        <>
          <h4>Interruption allowances</h4>
          <ul>
            {value.interruptions.map((item, index) => (
              <li key={index}>
                {item.state} · {item.allowanceSeconds} seconds policy allowance;
                actual human time is unmeasured.
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
