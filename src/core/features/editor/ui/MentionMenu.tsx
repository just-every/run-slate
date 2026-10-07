import { Calendar, FileText, User } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
} from "../../../ui";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import type { MentionKind } from "./types";

const kindIcon = { person: User, page: FileText, date: Calendar };

export interface MentionOption {
  id: string;
  kind: MentionKind;
  label: string;
  /** A role, a breadcrumb, or the date as the reader's locale writes it. */
  hint?: string;
}

export interface MentionMenuProps {
  open: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  /** People, pages and dates in one list, in the order they should be offered. */
  options: MentionOption[];
  onSelect: (option: MentionOption) => void;
  onClose: () => void;
  className?: string;
}

/** `BLOCK-005` — typing `@` offers people, pages and dates in one list. */
export function MentionMenu({ open, query, onQueryChange, options, onSelect, onClose, className }: MentionMenuProps) {
  if (!open) return null;

  return (
    <div
      className={cn(
        "w-80 overflow-hidden rounded-card border border-line bg-surface shadow-[0_16px_48px_rgb(15_15_15/0.16)]",
        className,
      )}
    >
      <Command label={`Mention a ${knowledgeNoun("member")}, a page or a date`} onEscape={onClose}>
        <CommandInput
          autoFocus
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={`Mention a ${knowledgeNoun("member")}, a page or a date`}
          value={query}
        />
        <CommandList>
          {options.map((option) => {
            const Icon = kindIcon[option.kind];
            return (
              <CommandItem
                hint={option.hint}
                key={option.id}
                onSelect={() => onSelect(option)}
                value={option.id}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
                <span className="truncate">{option.label}</span>
              </CommandItem>
            );
          })}
          {options.length === 0 ? <CommandEmpty>Nothing matches “{query}”.</CommandEmpty> : null}
        </CommandList>
      </Command>
    </div>
  );
}
