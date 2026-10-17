import { isPreviewWorker } from "../platform/config/preview";
import { previewStylesheet, previewBannerHtml } from "./preview-banner";

/** Native HTML pages (Lobby, confirmations, public shares) do not use Start's root. */
export function previewDocument(response: Response, bindings: { RER_PREVIEW_OWNER_SIGNIN?: string }): Response {
  if (!isPreviewWorker(bindings) || !response.body || !response.headers.get("content-type")?.startsWith("text/html")) return response;
  return new HTMLRewriter()
    .on("html", { element(element) { element.setAttribute("data-slate-preview", ""); } })
    .on("head", { element(element) { element.append(`<link rel="stylesheet" href="${previewStylesheet}">`, { html: true }); } })
    .on("body", { element(element) { element.prepend(previewBannerHtml, { html: true }); } })
    .transform(response);
}
