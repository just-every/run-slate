import {editorLeaf} from "../editor-leaf";
import { createFileRoute } from "@tanstack/react-router";
import { ReviewQueue } from "../core/features/page-status/ui/workspace/ReviewQueue";
export const Route = createFileRoute("/app/review")({
  component: editorLeaf(ReviewQueue),
});
