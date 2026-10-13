import type { ReactNode } from "react";

/** The one visible heading of a destination: same family, size and weight everywhere. */
export function PageTitle({ children, id }: { children: ReactNode; id?: string }) {
  return <h1 className="page-title" id={id}>{children}</h1>;
}
