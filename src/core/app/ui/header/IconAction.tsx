import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

/**
 * An icon-only button. The label is both its accessible name and its tooltip (`header.css` shows it on hover and keyboard
 * focus), so no icon in the app is unnamed.
 */
export function IconAction({ label, children, className, tooltipAlign, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode; tooltipAlign?: "end" | "right" }) {
  return (
    <button type="button" className={className ? `icon-action ${className}` : "icon-action"} aria-label={label} data-tooltip={label} data-tooltip-align={tooltipAlign} {...props}>
      {children}
    </button>
  );
}

/** The link form of {@link IconAction}: an icon-only link to another page, named and with a tooltip. */
export function IconLink({ label, children, className, tooltipAlign, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { label: string; children: ReactNode; tooltipAlign?: "end" | "right" }) {
  return (
    <a className={className ? `icon-action ${className}` : "icon-action"} aria-label={label} data-tooltip={label} data-tooltip-align={tooltipAlign} {...props}>
      {children}
    </a>
  );
}
