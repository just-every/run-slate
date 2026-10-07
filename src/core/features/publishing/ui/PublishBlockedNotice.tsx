import { Ban } from "lucide-react";
import type { ExternalAccessSettings } from "../../../shared/knowledge/model";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { cn } from "../../../ui";

export interface PublishBlockedNoticeProps {
  /** `CONT-007` — three switches, each vetoing its own act and no other. */
  externalAccess: ExternalAccessSettings;
  containerName: string;
  className?: string;
}

/**
 * `WEB-001` — each forbidden switch states its own effect. There is no plan,
 * tier or upgrade gate here, and none may ever be added (`CONT-007`).
 */
export function PublishBlockedNotice({ externalAccess, containerName, className }: PublishBlockedNoticeProps) {
  const vetoes: string[] = [];
  const container = knowledgeNoun("container");
  const member = knowledgeNoun("member");

  if (externalAccess.publicLinks === "forbidden") {
    vetoes.push(
      `The ${container} “${containerName}” does not allow public links. Publishing a page in it is rejected, and every public link already on its pages has stopped resolving.`,
    );
  }
  if (externalAccess.anonymous === "forbidden") {
    vetoes.push(
      `The ${container} “${containerName}” does not allow anonymous access. A published page in it opens only for a signed-in ${member} who may read it.`,
    );
  }
  if (externalAccess.guests === "forbidden") {
    vetoes.push(
      `The ${container} “${containerName}” does not allow guests. A guest invitation to it, or to a page in it, is rejected, and guest access it already carried has ended.`,
    );
  }

  if (vetoes.length === 0) return null;

  return (
    <div
      className={cn("flex items-start gap-2 rounded-card border border-line bg-sidebar p-3", className)}
      role="status"
    >
      <Ban aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
      <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
        {vetoes.map((veto) => (
          <li className="text-tiny text-ink-muted" key={veto}>
            {veto}
          </li>
        ))}
      </ul>
    </div>
  );
}
