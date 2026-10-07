import { Avatar, AvatarFallback, AvatarImage, cn } from "../../../../ui";
import type { RecordPerson } from "../types";
import type { FieldRendererProps } from "./props";

function initial(name: string): string {
  return name.trim().slice(0, 1).toUpperCase();
}

/** One person: their picture when the value carries one, their initial when not. */
export function PersonChip({ person, className }: { person: RecordPerson; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <Avatar className="size-5">
        {person.imageUrl ? <AvatarImage alt="" src={person.imageUrl} /> : null}
        <AvatarFallback>{initial(person.name)}</AvatarFallback>
      </Avatar>
      <span className="truncate">{person.name}</span>
    </span>
  );
}

/** `DB-002` — the people a record's person field holds. */
export function PersonField({ value }: FieldRendererProps) {
  if (!value || value.kind !== "people" || value.people.length === 0) return null;

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      {value.people.map((person) => (
        <PersonChip key={person.id} person={person} />
      ))}
    </span>
  );
}
