import { Copy, ExternalLink, Globe } from "lucide-react";
import { useId } from "react";
import { Button, Input, Label, Switch, cn } from "../../../ui";
import type { PublicExposure } from "./types";

export interface PublishLinkFieldsProps {
  /** `WEB-007` under `link`: one toggle, the address, and nothing else here. */
  published: boolean;
  exposure: PublicExposure;
  disabled: boolean;
  onToggle: (next: boolean) => void;
  onCopyUrl?: () => void;
  onOpenUrl?: () => void;
  className?: string;
}

export function PublishLinkFields({
  published,
  exposure,
  disabled,
  onToggle,
  onCopyUrl,
  onOpenUrl,
  className,
}: PublishLinkFieldsProps) {
  const labelId = useId();
  const urlId = useId();

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-start gap-2 px-1">
        <Globe aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-ui text-ink" id={labelId}>
            Anyone with the link
          </span>
          <span className="text-tiny text-ink-muted">
            {published
              ? "No sign-in required. Turning this off unpublishes the page."
              : "No sign-in required once this is on."}
          </span>
        </div>
        <Switch aria-labelledby={labelId} checked={published} disabled={disabled} onCheckedChange={onToggle} />
      </div>
      {published ? (
        <div className="flex items-center gap-1">
          <Label className="sr-only" htmlFor={urlId}>
            Public address
          </Label>
          <Input className="min-w-0 flex-1 text-tiny" id={urlId} readOnly value={exposure.url} />
          {onCopyUrl ? (
            <Button onClick={onCopyUrl} size="sm" variant="secondary">
              <Copy aria-hidden="true" className="size-3.5" />
              Copy link
            </Button>
          ) : null}
          {onOpenUrl ? (
            <Button aria-label="Open the public address" onClick={onOpenUrl} size="icon" variant="ghost">
              <ExternalLink aria-hidden="true" className="size-4" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
