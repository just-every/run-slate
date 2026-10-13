// The root document carries these on every route (Base UI convention 9): one
// self-hosted font stylesheet and a preload whose URL matches its first face.
export const fontLinks = [
  { rel: "preload", href: "/fonts/outfit/outfit-latin-wght-normal.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
  { rel: "stylesheet", href: "/fonts/fonts.css" },
] as const;
