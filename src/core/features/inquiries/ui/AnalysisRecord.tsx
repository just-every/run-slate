import { DateStamp } from "../../../app/ui/displayDate";
import { FindingSources } from "./FindingRecords";
export interface Analysis {
  id: string;
  kind: string;
  engine_version: string;
  inputs_json: string;
  input_hash: string;
  result_json: string;
  created_at: string;
  refs_json?: string;
}
export function AnalysisRecord({ analysis }: { analysis: Analysis }) {
  const result = JSON.parse(analysis.result_json) as {
    effect?: number;
    lower?: number;
    upper?: number;
    confidence?: number;
    ids?: string[];
    value?: number;
    capacity?: number;
    feasibilityOnly?: boolean;
  };
  return (
    <article className="finding">
      <h3>
        {analysis.kind === "compare-means"
          ? "Comparison of observed groups"
          : "Allocation under the declared limit"}
      </h3>
      {typeof result.effect === "number" ? (
        <>
          <p>
            Estimated difference:{" "}
            <strong>{result.effect.toLocaleString()}</strong>
          </p>
          <p>
            {(100 * (result.confidence ?? 0.95)).toFixed(0)}% interval:{" "}
            {result.lower?.toLocaleString()} to {result.upper?.toLocaleString()}
          </p>
          <p className="muted">
            An observed comparison does not establish causality by itself.
          </p>
        </>
      ) : (
        <>
          <p>
            {result.ids?.length ?? 0} selected · total value {result.value} ·
            capacity {result.capacity}
          </p>
          <p className="muted">
            This establishes feasibility under the supplied inputs, not customer
            benefit.
          </p>
        </>
      )}
      <details>
        <summary>Reproduce this analysis</summary>
        <dl>
          <dt>Method</dt>
          <dd>{analysis.engine_version}</dd>
          <dt>Recorded</dt>
          <dd><DateStamp value={analysis.created_at} /></dd>
          <dt>Input fingerprint</dt>
          <dd style={{overflowWrap:"anywhere"}}>{analysis.input_hash}</dd>
        </dl>
        {analysis.refs_json ? (
          <FindingSources
            refs={JSON.parse(analysis.refs_json)}
            prefix={`analysis-${analysis.id}`}
          />
        ) : null}
        <h4>Exact inputs</h4>
        <pre>{JSON.stringify(JSON.parse(analysis.inputs_json), null, 2)}</pre>
        <h4>Recorded result</h4>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </details>
    </article>
  );
}
