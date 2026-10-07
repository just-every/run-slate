import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Editable } from "../../../../src/core/features/editor/ui/blocks/Editable";
import type { RichText } from "../../../../src/core/features/editor/ui/types";

declare global {
  interface Window {
    editableTest: {
      value: RichText;
      changes: RichText[];
      setValue: (value: RichText) => void;
      rerender: () => void;
    };
  }
}

const changes: RichText[] = [];
function Fixture() {
  const [value, setValue] = useState<RichText>([]);
  const [, setRenderCount] = useState(0);
  window.editableTest = { value, changes, setValue, rerender: () => setRenderCount(count => count + 1) };
  return <Editable value={value} canEdit label="Test editor" placeholder="Write" onChange={next => {
    changes.push(next);
    setValue(next);
  }} />;
}

// Match the production whitespace rule without loading the whole visual shell.
const style = document.createElement("style");
style.textContent = "[data-slate-editable] { white-space: pre-wrap; min-height: 2em; }";
document.head.appendChild(style);
createRoot(document.getElementById("root")!).render(<Fixture />);
