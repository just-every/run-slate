import { containerNoun } from "./nouns";

/** The three steps `WORK-013` runs, and no fourth. */
export const firstRunStepTitles: readonly string[] = [
  "Name the workspace",
  `Create the first ${containerNoun} and its first page`,
  "Invite people",
];

export type FirstRunStep = 1 | 2 | 3;

export function FirstRunProgress({ step }: { step: FirstRunStep }) {
  return (
    <div className="paper-steps" role="group" aria-label="Setup progress">
      <p className="paper-steps-label">Step {step} of 3</p>
      <ol className="paper-steps-list">
        {firstRunStepTitles.map((title, index) => {
          const position = index + 1;
          const done = position < step;
          const current = position === step;
          return (
            <li
              aria-current={current ? "step" : undefined}
              className={`paper-step${done ? " paper-step--done" : ""}`}
              key={title}
            >
              <span aria-hidden="true" className="paper-step-num">{position}</span>
              <span className="paper-step-title">
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
