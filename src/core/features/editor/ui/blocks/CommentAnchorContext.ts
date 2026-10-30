import { createContext } from "react";

/** Display state is separate from the durable anchor metadata in rich text. */
export const ResolvedCommentAnchorsContext = createContext<readonly string[]>([]);
