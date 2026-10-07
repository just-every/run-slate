import { EvidenceReference } from "../../ai/ui/EvidenceReference";
export interface FindingArtifact {
  id: string;
  kind: string;
  content_json: string;
  refs_json: string;
  created_at: string;
}
export interface FindingReference {
  kind: "page" | "source";
  sourceId: string;
  revisionId: string;
  passageId?: string;
}
export function FindingSources({
  refs,
  prefix,
}: {
  refs: FindingReference[];
  prefix: string;
}) {
  return (
    <details>
      <summary>Exact supporting evidence</summary>
      {refs.map((ref, index) => (
        <EvidenceReference
          key={`${ref.sourceId}:${ref.revisionId}:${index}`}
          idPrefix={prefix}
          index={index}
          reference={{
            ...ref,
            sourceRevisionId: ref.revisionId,
            freshness: "rechecked-on-read",
            authorityState: "evidence-not-authority",
          }}
        />
      ))}
    </details>
  );
}
export function FindingRecords({
  artifacts,
}: {
  artifacts: FindingArtifact[];
}) {
  return artifacts.length ? (
    <section>
      <h2>What changed our understanding</h2>
      {artifacts.map((artifact) => {
        const content = JSON.parse(artifact.content_json) as {
          finding?: string;
        };
        return (
          <article key={artifact.id} className="finding">
            <p className="eyebrow">{artifact.kind}</p>
            <p>{content.finding}</p>
            <p className="muted">
              {new Date(artifact.created_at).toLocaleString()}
            </p>
            <FindingSources
              refs={JSON.parse(artifact.refs_json)}
              prefix={`finding-${artifact.id}`}
            />
          </article>
        );
      })}
    </section>
  ) : null;
}
