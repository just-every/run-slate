import { useEffect } from "react";
import { request } from "./transport";
import type { MemberView, Theme } from "../shared/api/workspace";
export function applyAppearance(theme: Theme) {
  document.documentElement.dataset.theme =
    theme === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
}
export function useAppearance() {
  useEffect(() => {
    let active = true;
    let theme: Theme = "system";
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyAppearance(theme);
    const changed = (event: Event) => {
      theme = (event as CustomEvent<Theme>).detail;
      update();
    };
    request<MemberView>("/api/members/current")
      .then((member) => {
        if (active) {
          theme = member.theme;
          update();
        }
      })
      .catch(() => {});
    media.addEventListener("change", update);
    window.addEventListener("slate-appearance", changed);
    return () => {
      active = false;
      media.removeEventListener("change", update);
      window.removeEventListener("slate-appearance", changed);
    };
  }, []);
}
