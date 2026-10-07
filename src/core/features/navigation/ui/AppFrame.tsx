import { Menu, PanelLeft, PanelLeftClose } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, Sheet, SheetContent, SheetTitle, cn } from "../../../ui";

export interface AppFrameProps {
  /** The one sidebar (NAV-004). Rendered in the column on desktop and in the drawer on a phone. */
  sidebar: ReactNode;
  /** The thin sticky header of the main column. */
  header?: ReactNode;
  children: ReactNode;
  /** An optional right-hand panel beside the main region. */
  rightPanel?: ReactNode;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  /** NAV-006 — the phone drawer, controlled when the caller wants to own it. */
  mobileNavOpen?: boolean;
  onMobileNavOpenChange?: (open: boolean) => void;
  className?: string;
}

export function AppFrame({
  sidebar,
  header,
  children,
  rightPanel,
  sidebarCollapsed,
  onToggleSidebar,
  mobileNavOpen,
  onMobileNavOpenChange,
  className,
}: AppFrameProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const drawerOpen = mobileNavOpen ?? internalOpen;
  const setDrawerOpen = onMobileNavOpenChange ?? setInternalOpen;

  return (
    <div className={cn("flex min-h-screen w-full overflow-x-hidden bg-canvas", className)}>
      {sidebarCollapsed ? null : (
        <div className="hidden h-screen w-sidebar shrink-0 border-r border-line md:sticky md:top-0 md:block">
          {sidebar}
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-11 shrink-0 items-center gap-1.5 border-b border-line bg-canvas px-2">
          <Button
            aria-label="Open navigation"
            className="md:hidden"
            onClick={() => setDrawerOpen(true)}
            size="icon"
            variant="ghost"
          >
            <Menu aria-hidden="true" className="size-4" />
          </Button>
          <Button
            aria-label={sidebarCollapsed ? "Show the sidebar" : "Hide the sidebar"}
            className="hidden md:inline-flex"
            onClick={onToggleSidebar}
            size="icon"
            variant="ghost"
          >
            {sidebarCollapsed ? (
              <PanelLeft aria-hidden="true" className="size-4" />
            ) : (
              <PanelLeftClose aria-hidden="true" className="size-4" />
            )}
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-2">{header}</div>
        </header>

        <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
          <main className="min-w-0 flex-1">{children}</main>
          {rightPanel ? (
            <aside className="w-full shrink-0 border-t border-line lg:sticky lg:top-11 lg:h-[calc(100vh-2.75rem)] lg:w-panel lg:border-t-0 lg:border-l">
              {rightPanel}
            </aside>
          ) : null}
        </div>
      </div>

      <Sheet onOpenChange={setDrawerOpen} open={drawerOpen}>
        <SheetContent className="p-0 md:hidden" side="left">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="h-full overflow-y-auto pt-8">{sidebar}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
