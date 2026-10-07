import { useState, type ReactNode } from "react";
/** Fetch detailed work only after it is requested; retain local edits when folded. */
export function ContextDisclosure({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  const [seen, setSeen] = useState(false);
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open) setSeen(true);
      }}
    >
      <summary>{label}</summary>
      {seen ? children : null}
    </details>
  );
}
