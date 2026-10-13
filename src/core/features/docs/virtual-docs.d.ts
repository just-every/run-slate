// The modules src/core/features/docs/build/plugin.ts generates from the repository's Markdown.
declare module 'virtual:slate-docs' {
  export const repository: import('./types').DocsRepository;
  export const sections: import('./types').DocsSection[];
  export const pages: Record<string, () => Promise<{ default: import('./types').DocsPageData }>>;
  /** In `vite dev`, every broken link or page problem in one message; always null in a build, which fails instead. */
  export const problem: string | null;
  /** Counts the times the docs were read from the tree, so a page can tell it was served before the last change. */
  export const version: number;
}
declare module 'virtual:slate-docs/page/*' {
  const page: import('./types').DocsPageData;
  export default page;
}
