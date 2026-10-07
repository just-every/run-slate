import type { ReactNode } from "react";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { ExtensionSlotProvider } from "../core/app/ext-client";
import appCss from "../core/app/styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "description", content: "Slate — a self-hosted knowledge workspace." },
      { title: "Slate" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  notFoundComponent: NotFound,
  component: Root,
});

function Root() {
  return (
    <Document>
      <ExtensionSlotProvider>
        <Outlet />
      </ExtensionSlotProvider>
    </Document>
  );
}

function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-10 text-stone-900">
      <section className="max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-[-0.035em] text-stone-950">Not found</h1>
        <p className="mt-4 leading-7 text-stone-600">This workspace has no document at that address.</p>
      </section>
    </main>
  );
}

function Document({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
