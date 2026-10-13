/**
 * Slate's mark: two blank cards stacked, a sage-washed one square behind a paper one tilted forward. It is the one drawing used
 * for the landing, the sign-in page, the app's sidebar and (as `public/favicon.svg`) the favicon. Decoration only, so it is hidden
 * from assistive technology; the name beside it says what it is.
 *
 * The ink is `currentColor`. The two card fills come from `--slate-mark-back` and `--slate-mark-front`, which the app theme
 * defines for light and dark and the landing's fixed light palette overrides, so the mark follows whatever surface it sits on
 * (`app/styles/mark.css` turns them into fills).
 */
export function SlateMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 3 56 50" fill="none" aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round">
        <rect x="5" y="22" width="26" height="27" rx="4" className="slate-mark-back" />
        <rect x="16" y="9" width="30" height="30" rx="4.5" transform="rotate(-20 31 24)" className="slate-mark-front" />
      </g>
    </svg>
  );
}
