import { Icon, type IconName } from "../icons/Icon";

/** A row of three line-icon features, each with a short label that wraps to two lines. */
export function Features({ items }: { items: readonly [IconName, string][] }) {
  return (
    <ul className="features">
      {items.map(([icon, label]) => (
        <li key={label}><Icon name={icon} className="ic ic--feature" /><span>{label}</span></li>
      ))}
    </ul>
  );
}
