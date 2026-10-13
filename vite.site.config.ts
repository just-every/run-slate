import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { docsSite } from "./src/core/features/docs/build/plugin.ts";

// The run site's pages (src/site/pages.tsx, built by `rer build --site`): the docs virtual module, React and the app's
// Tailwind stylesheet, which the landing and the docs pages wear on an installed Slate too. Never the Worker's plugins.
export default defineConfig({ plugins: [docsSite(), react(), tailwindcss()] });
