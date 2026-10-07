import { ChevronDown, Code2, Copy, Files, Palette, Share2 } from "lucide-react";
import { useId } from "react";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
} from "../../../ui";
import { SettingRow } from "./SettingRow";
import type { PublicExposure, PublishedTheme } from "./types";

export interface PublishSiteFieldsProps {
  exposure: PublicExposure;
  hosts: readonly { id: string; name: string }[];
  /** `WEB-002` — a slug already in use is rejected with this message. */
  slugError?: string | null;
  disabled: boolean;
  onHostChange: (host: string) => void;
  onSlugChange: (slug: string) => void;
  onThemeChange: (theme: PublishedTheme) => void;
  onHeaderControlChange: (controlId: string, enabled: boolean) => void;
  onDuplicateAsTemplateChange: (next: boolean) => void;
  onCopyUrl?: () => void;
  onOpenEmbed?: () => void;
  onShareViaSocial?: () => void;
}

export function PublishSiteFields({
  exposure,
  hosts,
  slugError = null,
  disabled,
  onHostChange,
  onSlugChange,
  onThemeChange,
  onHeaderControlChange,
  onDuplicateAsTemplateChange,
  onCopyUrl,
  onOpenEmbed,
  onShareViaSocial,
}: PublishSiteFieldsProps) {
  const slugId = useId();
  const hostId = useId();
  const duplicateId = useId();
  const slugErrorId = `${slugId}-error`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Label className="sr-only" htmlFor={hostId}>
          Public address
        </Label>
        <Select disabled={disabled} onValueChange={onHostChange} value={exposure.host}>
          <SelectTrigger aria-label="Public address" className="h-8 min-w-0 flex-1" id={hostId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {hosts.map((host) => (
              <SelectItem key={host.id} value={host.name}>
                {host.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span aria-hidden="true" className="text-ui text-ink-faint">
          /
        </span>
        <Label className="sr-only" htmlFor={slugId}>
          Page address
        </Label>
        <Input
          aria-describedby={slugError ? slugErrorId : undefined}
          aria-invalid={slugError ? true : undefined}
          className={cn("min-w-0 flex-1", slugError ? "border-danger" : null)}
          disabled={disabled}
          id={slugId}
          onChange={(event) => onSlugChange(event.target.value)}
          value={exposure.slug}
        />
        {onCopyUrl ? (
          <Button aria-label="Copy the public address" onClick={onCopyUrl} size="icon" variant="ghost">
            <Copy aria-hidden="true" className="size-4" />
          </Button>
        ) : null}
      </div>
      {slugError ? (
        <p className="px-1 text-tiny text-danger" id={slugErrorId} role="alert">
          {slugError}
        </p>
      ) : null}

      <details className="group rounded-control [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-control px-1 py-1.5 text-ui text-ink hover:bg-sidebar-hover">
          <Palette aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
          <span className="flex-1">Customise site styling</span>
          <ChevronDown aria-hidden="true" className="size-4 text-ink-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-2 border-l border-line pl-3 pt-1 ml-2.5">
          <fieldset className="flex items-center justify-between gap-2">
            <legend className="sr-only">Theme of the published page</legend>
            <span className="text-ui text-ink">Theme</span>
            <div className="flex rounded-control border border-line-strong p-0.5">
              {(["light", "dark"] as const).map((theme) => (
                <button
                  aria-pressed={exposure.theme === theme}
                  className={cn(
                    "rounded-control px-2 py-0.5 text-tiny capitalize transition-colors",
                    exposure.theme === theme ? "bg-sidebar-hover text-ink" : "text-ink-muted hover:text-ink",
                  )}
                  disabled={disabled}
                  key={theme}
                  onClick={() => onThemeChange(theme)}
                  type="button"
                >
                  {theme}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="pb-1 text-tiny font-medium text-ink-muted">Header controls readers see</legend>
            {exposure.headerControls.map((control) => (
              <label className="flex items-center justify-between gap-2 text-ui text-ink" key={control.id}>
                {control.label}
                <Switch
                  checked={control.enabled}
                  disabled={disabled}
                  onCheckedChange={(next) => onHeaderControlChange(control.id, next)}
                />
              </label>
            ))}
          </fieldset>
        </div>
      </details>

      <SettingRow
        control={
          <Switch
            aria-labelledby={duplicateId}
            checked={exposure.duplicateAsTemplate}
            disabled={disabled}
            onCheckedChange={onDuplicateAsTemplateChange}
          />
        }
        description="Readers may take their own copy of this page."
        icon={Files}
        label="Duplicate as template"
        labelId={duplicateId}
      />

      {onShareViaSocial ? (
        <SettingRow
          control={
            <Button onClick={onShareViaSocial} size="sm" variant="ghost">
              Edit
            </Button>
          }
          description="The title, description and image other sites show for this address."
          icon={Share2}
          label="Social preview"
        />
      ) : null}
      {onOpenEmbed ? (
        <SettingRow
          control={
            <Button onClick={onOpenEmbed} size="sm" variant="ghost">
              Get code
            </Button>
          }
          icon={Code2}
          label="Embed this page"
        />
      ) : null}
    </div>
  );
}
