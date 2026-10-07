/**
 * `WEB-002` — the public exposure record a published page carries. The theme
 * lives here, on the page, never on the reader (`WORK-012`, `WEB-003`).
 */
export type PublishedTheme = "light" | "dark";

export interface PublishHeaderControl {
  id: string;
  label: string;
  enabled: boolean;
}

export interface PublicExposure {
  host: string;
  slug: string;
  /** The address the record resolves to, assembled by the caller. */
  url: string;
  theme: PublishedTheme;
  /** `WEB-005` — off for a newly published page. */
  indexing: boolean;
  headerControls: readonly PublishHeaderControl[];
  duplicateAsTemplate: boolean;
  publishedAt: string | null;
  revokedAt: string | null;
}

export type PublishSurfaceState = "ready" | "loading" | "error" | "denied";
