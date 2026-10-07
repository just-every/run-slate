import { Search } from "lucide-react";
import { useId } from "react";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { Switch, cn } from "../../../ui";
import { SettingRow } from "./SettingRow";

export interface IndexingSwitchProps {
  /** `WEB-005` — off for a newly published page until someone turns it on. */
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function IndexingSwitch({ checked, onCheckedChange, disabled = false, className }: IndexingSwitchProps) {
  const labelId = useId();
  return (
    <SettingRow
      className={cn(className)}
      control={
        <>
          <span className="text-tiny text-ink-muted">{checked ? "On" : "Off"}</span>
          <Switch
            aria-labelledby={labelId}
            checked={checked}
            disabled={disabled}
            onCheckedChange={onCheckedChange}
          />
        </>
      }
      description={
        checked
          ? "Search engines may index this page and show it in their results."
          : `Search engines are told not to index this page until a ${knowledgeNoun("member")} turns this on.`
      }
      icon={Search}
      label="Search engine indexing"
      labelId={labelId}
    />
  );
}
