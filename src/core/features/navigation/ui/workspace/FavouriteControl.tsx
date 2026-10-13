import { Star } from "lucide-react";
import { useState } from "react";
import { IconAction } from "../../../../app/ui/header/IconAction";
import { useResource } from "../../../../client/useResource";
import { mutate, operationKey, errorMessage } from "../../../../client/transport";

/** A favourite toggle; `iconOnly` shows the star alone, named and with a tooltip like the other top-bar icons. */
export function FavouriteControl({ kind, id, className, iconOnly }: { kind: "page" | "container" | "database"; id: string; className?: string; iconOnly?: boolean }) {
  const resource = useResource<{ favourites: { kind: string; id: string }[] }>("/api/navigation");
  const [error, setError] = useState<unknown>();
  const enabled = resource.data?.favourites.some((item) => item.kind === kind && item.id === id) ?? false;
  const label = enabled ? "Remove from favourites" : "Add to favourites";
  const toggle = () =>
    void mutate("/api/navigation/favourites", { operationKey: operationKey(), kind, id, enabled: !enabled }, "PUT")
      .then(() => {
        resource.reload();
        window.dispatchEvent(new Event("slate:navigation-changed"));
      })
      .catch(setError);
  const star = <Star aria-hidden="true" fill={enabled ? "currentColor" : "none"} />;
  return (
    <>
      {iconOnly ? (
        <IconAction className={className} label={label} aria-pressed={enabled} disabled={!resource.data} onClick={toggle}>
          {star}
        </IconAction>
      ) : (
        <button className={className} aria-pressed={enabled} disabled={!resource.data} onClick={toggle}>
          {star}
          {label}
        </button>
      )}
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
    </>
  );
}
