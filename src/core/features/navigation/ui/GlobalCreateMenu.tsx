import { Database, FileText, FolderTree, LayoutTemplate, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Button,
} from "../../../ui";
import { capitalise, noun } from "./nouns";

export type CreateKind = "page" | "database" | "container" | "template";

export interface CreateDestination {
  id: string;
  label: string;
}

export interface GlobalCreateMenuProps {
  /** NAV-005: the destination is named before anything is created. */
  destination: CreateDestination;
  destinations: readonly CreateDestination[];
  onDestinationChange: (id: string) => void;
  onCreate: (kind: CreateKind) => void;
  /** Full-width trigger for the sidebar; compact for a header. */
  triggerClassName?: string;
  defaultOpen?: boolean;
}

export function GlobalCreateMenu({
  destination,
  destinations,
  onDestinationChange,
  onCreate,
  triggerClassName,
  defaultOpen,
}: GlobalCreateMenuProps) {
  const containerNoun = noun("container");

  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger asChild>
        <Button className={triggerClassName} size="sm" variant="primary">
          <Plus aria-hidden="true" className="size-3.5" />
          New
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Create in</DropdownMenuLabel>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FolderTree aria-hidden="true" className="size-4" />
            <span className="truncate">{destination.label}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuRadioGroup onValueChange={onDestinationChange} value={destination.id}>
              {destinations.map((option) => (
                <DropdownMenuRadioItem key={option.id} value={option.id}>
                  <span className="truncate">{option.label}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onCreate("page")} shortcut="N">
          <FileText aria-hidden="true" className="size-4" />
          Page
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onCreate("database")}>
          <Database aria-hidden="true" className="size-4" />
          Database
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onCreate("container")}>
          <FolderTree aria-hidden="true" className="size-4" />
          {capitalise(containerNoun)}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onCreate("template")}>
          <LayoutTemplate aria-hidden="true" className="size-4" />
          Page from a template
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
