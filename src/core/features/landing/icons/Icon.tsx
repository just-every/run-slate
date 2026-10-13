import { iconPaths, type IconName } from "./iconPaths";

export type { IconName };

/** A decorative line icon. Always paired with real text, so it is hidden from assistive technology. */
export function Icon({ name, className = "ic" }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={iconPaths[name]} />
    </svg>
  );
}
