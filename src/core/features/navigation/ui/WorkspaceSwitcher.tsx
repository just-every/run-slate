import { ChevronsUpDown, LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../ui";
import type { ThemeChoice, WorkspaceSummary } from "./types";

const themeChoices: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "Match the system", Icon: Monitor },
];

export interface WorkspaceSwitcherProps {
  /** WORK-001: one workspace, its name and mark shown in the app header. */
  workspace: WorkspaceSummary;
  /** WORK-012: the member's theme, persisted per member by the caller. */
  theme: ThemeChoice;
  onThemeChange: (theme: ThemeChoice) => void;
  /** WORK-011: opens the workspace settings shell. */
  onOpenSettings: () => void;
  onSignOut: () => void;
  /** Optional default-open, for a preview or a test. */
  defaultOpen?: boolean;
}

export function WorkspaceSwitcher({
  workspace,
  theme,
  onThemeChange,
  onOpenSettings,
  onSignOut,
  defaultOpen,
}: WorkspaceSwitcherProps) {
  const mark = workspace.mark ?? workspace.name.charAt(0).toUpperCase();

  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="flex w-full min-w-0 items-center gap-2 rounded-control px-1.5 py-1.5 text-left hover:bg-sidebar-hover focus-visible:outline-2 focus-visible:outline-accent"
          type="button"
        >
          <span
            aria-hidden="true"
            className="grid size-5 shrink-0 place-items-center rounded-[0.25rem] bg-ink text-micro font-semibold text-canvas"
          >
            {mark}
          </span>
          <span className="truncate text-ui font-medium text-ink">{workspace.name}</span>
          <ChevronsUpDown aria-hidden="true" className="ml-auto size-3.5 shrink-0 text-ink-faint" />
          <span className="sr-only">Workspace menu</span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>{workspace.name}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={onOpenSettings}>
          <Settings aria-hidden="true" className="size-4" />
          Workspace settings
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup onValueChange={(value) => onThemeChange(value as ThemeChoice)} value={theme}>
          {themeChoices.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut}>
          <LogOut aria-hidden="true" className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
