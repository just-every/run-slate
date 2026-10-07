const primary: Record<string, string> = {
  pages: "Pages",
  page_blocks: "Blocks",
  page_revisions: "Page versions",
  database_records: "Records",
  members: "People",
  files: "Files",
};
export function TransferCounts({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (!entries.length) return null;
  const rows = (items: [string, number][]) =>
    items.map(([key, count]) => (
      <div key={key}>
        <dt>{primary[key] ?? key.replaceAll("_", " ")}</dt>
        <dd>{count.toLocaleString()}</dd>
      </div>
    ));
  return (
    <>
      <dl className="transfer-counts">
        {rows(entries.filter(([key]) => key in primary))}
      </dl>
      <details>
        <summary>All archive counts ({entries.length} categories)</summary>
        <dl className="transfer-counts">
          {rows(entries.filter(([key]) => !(key in primary)))}
        </dl>
      </details>
    </>
  );
}
