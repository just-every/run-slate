import test from "node:test";
import assert from "node:assert/strict";
import { editorBlocks, storedBlocks } from "../../../src/core/client/content";
import type { BlockView } from "../../../src/core/shared/api/content";
import type { JsonValue } from "../../../src/core/shared/api/common";
import type { EditorBlock } from "../../../src/core/features/editor/ui/types";

test("rich document round trip retains structure and semantic inline attributes", () => {
  const blocks: EditorBlock[] = [
    {
      id: "one",
      type: "paragraph",
      indent: 0,
      text: [
        {
          text: "Link",
          link: { href: "https://example.com" },
          marks: ["bold"],
          commentAnchorId: "thread",
        },
      ],
    },
    {
      id: "two",
      type: "task",
      indent: 1,
      text: [{ text: "Work" }],
      done: false,
    },
  ];
  const stored: BlockView[] = storedBlocks(blocks).map((block) => ({
    ...block,
    content: block.content as JsonValue,
    pageId: "page",
    revisionId: "revision",
  }));
  assert.deepEqual(editorBlocks(stored), blocks);
  assert.equal(stored[1].parentBlockId, "one");
});

test("cyclic stored hierarchy fails visibly instead of hanging or inventing a page", () => {
  const block: BlockView = {
    id: "one",
    pageId: "page",
    parentBlockId: "one",
    blockType: "paragraph",
    content: { text: [] },
    treePosition: "0",
    revisionId: "revision",
  };
  assert.throws(() => editorBlocks([block]), /circular/);
});
