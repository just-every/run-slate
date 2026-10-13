import { SlateMark } from "../../../../ui/brand/SlateMark";

/** The mug at the window's right, with Slate's mark on it. Decoration only. */
export function Mug() {
  return (
    <div className="mug" aria-hidden="true">
      <svg className="mug-body" viewBox="0 0 130 118" fill="none" focusable="false">
        <path d="M100 32C134 28 136 86 95 90" stroke="#1b1b18" strokeWidth="3" strokeLinecap="round" />
        <path d="M100 46C119 46 119 76 96 77" stroke="#1b1b18" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M8 8C8 5 30 3 55 3 80 3 102 5 102 8L98 98C97 110 90 114 78 114L30 115C16 114 12 108 11 98Z" fill="#fbfaf3" stroke="#1b1b18" strokeWidth="3" strokeLinejoin="round" />
        <ellipse cx="55" cy="8" rx="47" ry="5" fill="#f1efe3" stroke="#1b1b18" strokeWidth="3" />
      </svg>
      <SlateMark className="mug-mark" />
    </div>
  );
}
