import { SlidersHorizontal } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../ui";
import { memberNoun } from "./nouns";
import type { CommentAnchorKind, CommentPerson, CommentThreadStatus } from "./types";

/** COMM-006 — the panel filters by kind, status and person. */
export interface DiscussionsFilter {
  kind: CommentAnchorKind | "all";
  status: CommentThreadStatus | "all";
  personId: string | "all";
}

export interface DiscussionsFiltersProps {
  filter: DiscussionsFilter;
  people: readonly CommentPerson[];
  onChange: (next: DiscussionsFilter) => void;
}

export function DiscussionsFilters({ filter, people, onChange }: DiscussionsFiltersProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Filter threads" size="iconSm" variant="ghost">
          <SlidersHorizontal aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Kind</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          onValueChange={(value) => onChange({ ...filter, kind: value as DiscussionsFilter["kind"] })}
          value={filter.kind}
        >
          <DropdownMenuRadioItem value="all">Every thread</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="inline">Anchored in the body</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="page">On the whole page</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Status</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          onValueChange={(value) => onChange({ ...filter, status: value as DiscussionsFilter["status"] })}
          value={filter.status}
        >
          <DropdownMenuRadioItem value="all">Open and resolved</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="open">Open</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="resolved">Resolved</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Person</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          onValueChange={(value) => onChange({ ...filter, personId: value })}
          value={filter.personId}
        >
          <DropdownMenuRadioItem value="all">Every {memberNoun}</DropdownMenuRadioItem>
          {people.map((person) => (
            <DropdownMenuRadioItem key={person.id} value={person.id}>
              {person.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
