import { ShieldOff } from "lucide-react";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { cn } from "../../../ui";

/**
 * `AI-011` — the list of things AI cannot do, written out where a reader would
 * otherwise go looking for the control. Nine items, each one a real product
 * action a member might expect to hand over. They are rendered as a list rather
 * than a paragraph so a reader can scan for the one they came for.
 *
 * `variant="inline"` is the quiet form for the foot of a panel; `variant="block"`
 * is the form a settings page or an agent editor uses, where the list is the
 * point of the section.
 */
export function AiNoAuthorityNote({ variant = "block", className }: { variant?: "inline" | "block"; className?: string }) {
  const member = knowledgeNoun("member");

  const items = [
    "publish or unpublish a page",
    "change a grant or an external-access switch",
    "set or renew a verification",
    "archive, trash or permanently delete anything",
    "empty the trash",
    `invite or remove a ${member}`,
    "change a policy value",
    "send data outside this deployment",
  ];

  if (variant === "inline") {
    return (
      <p className={cn("flex items-start gap-1.5 text-tiny text-ink-faint", className)}>
        <ShieldOff aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <span>
          AI proposes; it never acts. It cannot publish, change access, verify, archive, trash, delete, empty the trash,
          invite or remove a {member}, change a policy value, or send data outside this deployment. Only a {member} does
          those.
        </span>
      </p>
    );
  }

  return (
    <section aria-labelledby="ai-no-authority-heading" className={cn("rounded-card border border-line bg-sidebar p-3", className)}>
      <h3 className="flex items-center gap-1.5 text-ui font-medium text-ink" id="ai-no-authority-heading">
        <ShieldOff aria-hidden="true" className="size-4 text-ink-faint" />
        What AI cannot do
      </h3>
      <p className="mt-1 text-tiny text-ink-muted">
        Only a {member} action does any of these. No policy value, extension or agent changes that.
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {items.map((item) => (
          <li className="flex items-start gap-1.5 text-tiny text-ink-muted" key={item}>
            <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-line-strong" />
            <span>AI cannot {item}.</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
