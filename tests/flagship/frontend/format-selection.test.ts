import test from "node:test";
import assert from "node:assert/strict";
import { formatSelection } from "../../../src/core/features/editor/ui/formatSelection";

test("partial backward selection retains links and comment anchors", () => {
  const source = [
    {
      text: "A precise finding",
      link: { href: "https://example.com" },
      commentAnchorId: "anchor",
    },
  ];
  const result = formatSelection(source, 9, 2, (span) => ({
    ...span,
    marks: ["bold"],
  }));
  assert.equal(result.map((span) => span.text).join(""), source[0].text);
  assert.deepEqual(
    result.map((span) => span.marks),
    [undefined, ["bold"], undefined],
  );
  assert.ok(
    result.every(
      (span) =>
        span.commentAnchorId === "anchor" &&
        span.link?.href === "https://example.com",
    ),
  );
  assert.equal(source[0].text, "A precise finding");
});

test("formatting does not split or mutate a semantic mention", () => {
  const mention = {
    text: "",
    mention: { kind: "person" as const, label: "Alex", id: "person-1" },
  };
  const result = formatSelection(
    [mention, { text: " hello" }],
    1,
    8,
    (span) => ({ ...span, marks: ["italic"] }),
  );
  assert.equal(result[0], mention);
  assert.equal(result[1].text, " hel");
  assert.deepEqual(result[1].marks, ["italic"]);
});
