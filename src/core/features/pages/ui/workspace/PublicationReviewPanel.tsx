import type { PublicationPreviewResponse } from "../../../lifecycle/publication-preview";
import { editorBlocks } from "../../../../client/content";
import { BlockView } from "../../../editor/ui/blocks/BlockView";
export function PublicationReviewPanel({
  review,
  onChange,
}: {
  review: PublicationPreviewResponse;
  onChange: () => void;
}) {
  return (
    <section aria-label="Reviewed publication">
      <h3>{review.content.properties.title}</h3>
      <p>
        Destination: {review.destination.containerName}
        {review.destination.parentTitle
          ? ` / ${review.destination.parentTitle}`
          : " / Top level"}
      </p>
      <p>
        {review.options.publishAt
          ? `Scheduled for ${new Date(review.options.publishAt).toLocaleString()}`
          : "Publish immediately"}
        {review.options.label ? ` · ${review.options.label}` : ""}
      </p>
      {review.content.properties.byline ? (
        <p>Published as {review.content.properties.byline}</p>
      ) : null}
      <section aria-label="Workspace publication preview">
        {editorBlocks(review.content.blocks).map((block) => (
          <BlockView
            key={block.id}
            block={block}
            canEdit={false}
            onChange={() => {}}
          />
        ))}
      </section>
      <h4>Reviewed audience</h4>
      {review.audience.map((item) => (
        <section key={item.pageId}>
          <h5>
            {item.pageId === review.pageId
              ? review.content.properties.title
              : (review.descendants.find((page) => page.pageId === item.pageId)
                  ?.title ?? "Page")}
          </h5>
          <ul>
            {item.readers.map((reader) => (
              <li key={reader.memberId}>
                {reader.name}: {reader.before ?? "No access"} →{" "}
                {reader.after ?? "No access"}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {review.descendants.length ? (
        <>
          <h4>Pages moving with this page</h4>
          <ul>
            {review.descendants.map((page) => (
              <li key={page.pageId}>
                {page.title} · {page.lifecycle}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p>
        This confirmation is bound to the saved content, destination, options
        and server-checked audience. A later change requires a new review.
      </p>
      <button type="button" onClick={onChange}>
        Change publication choices
      </button>
    </section>
  );
}
