import { useId } from "react";
import { cn } from "../../../ui";
import { SettingsSection } from "./SettingsSection";
import { memberNoun } from "./nouns";
import type { ThemeChoice } from "./types";

const choices: Array<{ value: ThemeChoice; label: string; description: string }> = [
  { value: "light", label: "Light", description: "The pale ground, whatever this device prefers." },
  { value: "dark", label: "Dark", description: "The dark ground, whatever this device prefers." },
  { value: "system", label: "Follow the system", description: "Change with this device's own light and dark setting." },
];

/**
 * `WORK-012` — light, dark and follow-the-system, applying to every operator
 * surface including the editor and persisting for this member across sessions
 * and devices.
 *
 * The anonymous read view is not affected: a published page is read in its own
 * theme, never in the reader's setting.
 */
export function ThemeSection({
  value,
  onChange,
  className,
}: {
  value: ThemeChoice;
  onChange: (next: ThemeChoice) => void;
  className?: string;
}) {
  const name = useId();

  return (
    <SettingsSection
      className={className}
      description={`Your own choice. It follows you to every device you sign in on and changes nothing for any other ${memberNoun}.`}
      title="Theme"
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Theme</legend>
        {choices.map((choice) => (
          <label
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-card border px-3 py-2.5 transition-colors",
              value === choice.value ? "border-accent bg-accent-soft" : "border-line hover:bg-sidebar-hover",
            )}
            key={choice.value}
          >
            <input
              checked={value === choice.value}
              className="mt-1 accent-accent"
              name={name}
              onChange={() => onChange(choice.value)}
              type="radio"
              value={choice.value}
            />
            <span>
              <span className="block text-ui font-medium text-ink">{choice.label}</span>
              <span className="block text-tiny text-ink-muted">{choice.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <p className="max-w-reading rounded-card border border-line bg-sidebar px-3 py-2 text-ui text-ink-muted">
        A page published to the anonymous web is read in the published page&rsquo;s own theme. This setting never
        changes what an anonymous reader sees.
      </p>
    </SettingsSection>
  );
}
