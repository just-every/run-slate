import { cn } from "../../../ui";
import { containerNoun } from "./nouns";

/** The three steps `WORK-013` runs, and no fourth. */
export const firstRunStepTitles: readonly string[] = [
  "Name the workspace",
  `Create the first ${containerNoun} and its first page`,
  "Invite people",
];

export type FirstRunStep = 1 | 2 | 3;

export function FirstRunProgress({ step, className }: { step: FirstRunStep; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="text-tiny font-medium text-ink-muted">Step {step} of 3</p>
      <ol className="flex gap-1.5">
        {firstRunStepTitles.map((title, index) => {
          const position = index + 1;
          const done = position < step;
          const current = position === step;
          return (
            <li
              aria-current={current ? "step" : undefined}
              className="flex flex-1 flex-col gap-1"
              key={title}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "block h-1 rounded-full",
                  done ? "bg-accent" : current ? "bg-accent" : "bg-line",
                )}
              />
              <span className={cn("text-tiny", current ? "font-medium text-ink" : "text-ink-faint")}>
                <span className="sr-only">{done ? "Done: " : current ? "Now: " : "Next: "}</span>
                {title}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
