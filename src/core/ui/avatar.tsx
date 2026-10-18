import * as AvatarPrimitive from "@radix-ui/react-avatar";
import type { ComponentProps } from "react";
import { cn } from "./cn";
import { personInitials } from "../shared/person-identity";

export function Avatar({ className, ...props }: ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      className={cn("relative flex size-6 shrink-0 overflow-hidden rounded-full bg-sidebar-hover", className)}
      {...props}
    />
  );
}

export function AvatarImage({ className, ...props }: ComponentProps<typeof AvatarPrimitive.Image>) {
  return <AvatarPrimitive.Image className={cn("size-full object-cover", className)} {...props} />;
}

export function AvatarFallback({ className, ...props }: ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      className={cn("flex size-full items-center justify-center text-micro font-medium text-ink-muted", className)}
      {...props}
    />
  );
}

/** An avatar stack — the whole of what SAVE-006 lets a page show about others. */
export function AvatarStack({
  people,
  className,
}: {
  people: ReadonlyArray<{ id: string; name: string; email?: string | null; imageUrl?: string | null }>;
  className?: string;
}) {
  if (people.length === 0) return null;
  return (
    <div aria-label={`${people.length} editing now`} className={cn("flex -space-x-1.5", className)} role="group">
      {people.map((person) => (
        <Avatar className="size-6 ring-2 ring-canvas" key={person.id} title={person.name}>
          {person.imageUrl ? <AvatarImage alt="" src={person.imageUrl} /> : null}
          <AvatarFallback>{personInitials(person.name, person.email)}</AvatarFallback>
        </Avatar>
      ))}
    </div>
  );
}
