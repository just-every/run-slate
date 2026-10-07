import { ArrowLeft, FileStack, Layers, ListChecks, ShieldCheck, SlidersHorizontal, Trash2 } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Button, cn } from "../../../ui";
import { containerNoun, memberNoun } from "./nouns";

export type ContainerSettingsSection =
  | "identity"
  | "access"
  | "external-access"
  | "templates"
  | "trash"
  | "bulk-tools";

const sections: readonly {
  id: ContainerSettingsSection;
  label: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { id: "identity", label: "Identity", icon: SlidersHorizontal },
  { id: "access", label: `${capitalisePlural(memberNoun)} and grants`, icon: Layers },
  { id: "external-access", label: "External access", icon: ShieldCheck },
  { id: "templates", label: "Templates", icon: FileStack },
  { id: "trash", label: "Trash", icon: Trash2 },
  { id: "bulk-tools", label: "Bulk tools", icon: ListChecks },
];

export interface ContainerSettingsShellProps {
  containerIcon: string;
  containerName: string;
  section: ContainerSettingsSection;
  onSelectSection: (section: ContainerSettingsSection) => void;
  onBack: () => void;
  children: ReactNode;
  className?: string;
}

/** CONT-004 — a container's own settings shell, separate from workspace settings. */
export function ContainerSettingsShell({
  containerIcon,
  containerName,
  section,
  onSelectSection,
  onBack,
  children,
  className,
}: ContainerSettingsShellProps) {
  const current = sections.find((candidate) => candidate.id === section) ?? sections[0];

  return (
    <div className={cn("flex min-h-screen flex-col bg-canvas md:flex-row", className)}>
      <nav
        aria-label={`${capitalise(containerNoun)} settings`}
        className="shrink-0 border-line bg-sidebar md:w-sidebar md:border-r"
      >
        <div className="flex flex-col gap-1 p-3">
          <Button className="justify-start px-2" onClick={onBack} size="sm" variant="ghost">
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            Back to {containerName}
          </Button>
          <p className="flex items-center gap-1.5 px-2 pt-2 text-tiny text-ink-faint">
            <span aria-hidden="true">{containerIcon}</span>
            Settings for this {containerNoun} only
          </p>
        </div>
        <ul className="flex gap-0.5 overflow-x-auto px-2 pb-3 md:flex-col md:overflow-visible">
          {sections.map((item) => (
            <li className="shrink-0 md:shrink" key={item.id}>
              <button
                aria-current={item.id === section ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-ui transition-colors",
                  item.id === section ? "bg-sidebar-hover font-medium text-ink" : "text-ink-muted hover:bg-sidebar-hover hover:text-ink",
                )}
                onClick={() => onSelectSection(item.id)}
                type="button"
              >
                <item.icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="whitespace-nowrap">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <main className="min-w-0 flex-1">
        <header className="border-b border-line px-4 py-3 md:px-8 md:py-5">
          <p className="text-tiny text-ink-faint">
            {containerIcon} {containerName}
          </p>
          <h1 className="text-h2 font-semibold text-ink">{current.label}</h1>
        </header>
        <div className="mx-auto max-w-wide px-4 py-5 md:px-8">{children}</div>
      </main>
    </div>
  );
}

function capitalise(noun: string): string {
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}

function capitalisePlural(noun: string): string {
  return `${capitalise(noun)}s`;
}
