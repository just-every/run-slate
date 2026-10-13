import { useEffect, useRef, useState } from "react";
import { displayDate, parseAccessExpiry } from "./displayDate";

/** Display, validation and submission share the same strict local-time parser. */
export function AccessExpiry({ name, value, onSave }: { name?: string; value?: string | null; onSave?: (instant: string | null) => void }) {
  const [text, setText] = useState(value ? displayDate(value, true) : "");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setText(value ? displayDate(value, true) : "");
    setError("");
    input.current?.setCustomValidity("");
  }, [value]);
  const parsed = parseAccessExpiry(text);
  function validate(input: HTMLInputElement) {
    const instant = parseAccessExpiry(input.value);
    const message = instant === undefined ? "Use a valid date and time: DD Mon YYYY, HH:mm." : "";
    input.setCustomValidity(message);
    setError(message);
    return instant;
  }
  return <span className="access-expiry"><input ref={input} aria-label="Access expiry date and time" value={text} onChange={event => { setText(event.target.value); validate(event.target); }} onBlur={event => { const instant = validate(event.target); if (instant !== undefined) onSave?.(instant); }} placeholder="DD Mon YYYY, HH:mm" />
    {name ? <input type="hidden" name={name} value={parsed ?? ""} /> : null}
    <small>Day month year, 24-hour time · your time zone</small>{error ? <small role="alert">{error}</small> : null}</span>;
}
