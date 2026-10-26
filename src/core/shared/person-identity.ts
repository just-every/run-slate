const roleName = /^(owner|member|admin|administrator|guest)$/i;

export function isPersonalName(name: string): boolean {
  return !!name.trim() && !roleName.test(name.trim());
}

/** A person's name, or their mailbox name when no personal name is supplied. */
export function personDisplayName(displayName?: string | null, email?: string | null): string {
  const name = displayName?.trim() ?? "";
  if (name && !roleName.test(name)) return name;
  return email?.trim().split("@", 1)[0]?.trim() ?? "";
}

/** Initials use personal identity only; email domains never contribute. */
export function personInitials(displayName?: string | null, email?: string | null): string {
  const identity = personDisplayName(displayName, email).split("@", 1)[0]?.trim() ?? "";
  const words = identity.split(/\s+/).filter(Boolean);
  const initials = words.length > 1
    ? words.slice(0, 2).map(word => Array.from(word)[0] ?? "").join("")
    : Array.from(identity).slice(0, 2).join("");
  return initials.toUpperCase();
}
