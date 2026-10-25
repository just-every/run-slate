import "./readership.css";
import { useState } from "react";
import { AnalyticsPanel } from "./AnalyticsPanel";

/** Opening readership is the only action that loads its metrics and report scopes. */
export function Readership({ pageId, containerId }: { pageId?: string; containerId?: string }) {
  const [open, setOpen] = useState(false);
  return <details className="readership-disclosure" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Readership</summary>
    {open ? <AnalyticsPanel pageId={pageId} containerId={containerId} /> : null}
  </details>;
}
