/** Declarations at the native boundary for the invitation page; copied Base implementation stays byte-exact. */
declare module '*modules/operator-auth/page.mjs' {
  export function pageResponse(input: {
    branding: { productName: string; accentColor: string; signInPath: string; theme?: string };
    title?: string; heading: string; content: string; status?: number; method?: string; referrer?: string; formTargets?: string[];
  }): Promise<Response>;
}
declare module '*modules/operator-auth/http.mjs' {
  export function escapeHtml(value: string): string;
}
