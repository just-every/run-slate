// Where the landing page's links go. The Run page and the docs pages are this site's own (the docs named by their slug in
// docs/site.json); the rest are outbound navigation only: the page loads nothing from them.
export const docsHomeSlug = "";
export const installSlug = "install";
export const sourceUrl = "https://github.com/just-every/run-slate";
/** The repository `rer` clones and starts: the public source. */
export const repository = new URL(sourceUrl).pathname.slice(1);
export const creditUrl = "https://runeditrun.com";
/** Run Edit Run's installer, named as text in the terminal drawing while the credit is on; the page loads nothing from it. */
export const installerUrl = `${creditUrl}/install.sh`;
/** The run site's Run page: the one line that runs Slate on your own computer. */
export const runPath = "/run";
/** The contract remains available from documentation and the shared Run page. */
export const contractPath = "/contract";
