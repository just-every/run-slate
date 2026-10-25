import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "./cn";

/**
 * A keyboard-driven command list wired as a combobox over a listbox: the field
 * keeps focus and names the active option through `aria-activedescendant`, so a
 * grouped insert menu (`BLOCK-003`) and a filtered result list (`SEARCH-002`)
 * are both operable by keyboard alone without a third-party list library.
 * Registration order is the navigation order.
 */
interface CommandContextValue {
  activeId: string | null;
  label: string;
  listId: string;
  optionDomId: (value: string) => string;
  register: (id: string, run: () => void) => () => void;
  setActiveId: (id: string) => void;
}

const CommandContext = createContext<CommandContextValue | null>(null);

function useCommandContext(component: string): CommandContextValue {
  const value = useContext(CommandContext);
  if (!value) throw new Error(`${component} must be rendered inside <Command>.`);
  return value;
}

export function Command({
  className,
  children,
  label,
  onEscape,
  ...props
}: ComponentProps<"div"> & { label: string; onEscape?: () => void }) {
  const items = useRef<{ id: string; run: () => void }[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const listId = useId();

  const register = useCallback((id: string, run: () => void) => {
    items.current = [...items.current.filter((item) => item.id !== id), { id, run }];
    setActiveId((current) => current ?? id);
    return () => {
      items.current = items.current.filter((item) => item.id !== id);
      setActiveId((current) => (current === id ? (items.current[0]?.id ?? null) : current));
    };
  }, []);

  const move = useCallback(
    (step: number) => {
      const list = items.current;
      if (list.length === 0) return;
      const index = list.findIndex((item) => item.id === activeId);
      const next = list[(index + step + list.length) % list.length];
      if (next) setActiveId(next.id);
    },
    [activeId],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
      return;
    }
    if (event.key === "Enter") {
      const active = items.current.find((item) => item.id === activeId);
      if (active) {
        event.preventDefault();
        active.run();
      }
      return;
    }
    if (event.key === "Escape" && onEscape) {
      event.preventDefault();
      onEscape();
    }
  };

  const optionDomId = useCallback(
    (value: string) => `${listId}-${value.replace(/[^A-Za-z0-9_-]/g, "-")}`,
    [listId],
  );

  const value = useMemo<CommandContextValue>(
    () => ({ activeId, label, listId, optionDomId, register, setActiveId }),
    [activeId, label, listId, optionDomId, register],
  );

  return (
    <CommandContext.Provider value={value}>
      <div className={cn("flex flex-col overflow-hidden", className)} onKeyDown={onKeyDown} {...props}>
        {children}
      </div>
    </CommandContext.Provider>
  );
}

export function CommandInput({ className, ...props }: ComponentProps<"input">) {
  const { activeId, label, listId, optionDomId } = useCommandContext("CommandInput");
  return (
    <div className="flex items-center gap-2 border-b border-line px-3">
      <input
        aria-activedescendant={activeId ? optionDomId(activeId) : undefined}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded="true"
        aria-label={label}
        className={cn(
          "h-11 w-full bg-transparent text-body text-ink outline-none placeholder:text-ink-faint",
          className,
        )}
        role="combobox"
        type="text"
        {...props}
      />
    </div>
  );
}

export function CommandList({ className, children, ...props }: ComponentProps<"div">) {
  const { label, listId } = useCommandContext("CommandList");
  return (
    <div
      aria-label={label}
      className={cn("max-h-80 overflow-y-auto overscroll-contain p-1", className)}
      id={listId}
      role="listbox"
      tabIndex={0}
      {...props}
    >
      {children}
    </div>
  );
}

export function CommandGroup({ heading, className, children, ...props }: ComponentProps<"div"> & { heading?: string }) {
  const headingId = useId();
  return (
    <div aria-labelledby={heading ? headingId : undefined} className={cn("py-1", className)} role="group" {...props}>
      {heading ? (
        <div className="px-2 py-1 text-micro font-medium tracking-wide text-ink-faint uppercase" id={headingId}>
          {heading}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function CommandItem({
  value,
  onSelect,
  className,
  children,
  hint,
  ...props
}: Omit<ComponentProps<"div">, "onSelect"> & { value: string; onSelect: () => void; hint?: ReactNode }) {
  const { activeId, optionDomId, register, setActiveId } = useCommandContext("CommandItem");
  const run = useRef(onSelect);
  run.current = onSelect;

  useEffect(() => register(value, () => run.current()), [register, value]);

  const active = activeId === value;
  return (
    <div
      aria-selected={active}
      className={cn(
        "max-[700px]:min-h-11 flex cursor-pointer items-center gap-2 rounded-control px-2 py-1.5 text-ui text-ink",
        active ? "bg-sidebar-hover" : "",
        className,
      )}
      id={optionDomId(value)}
      onClick={onSelect}
      onPointerMove={() => setActiveId(value)}
      role="option"
      {...props}
    >
      {children}
      {hint ? <span className="ml-auto text-tiny text-ink-faint">{hint}</span> : null}
    </div>
  );
}

export function CommandEmpty({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("px-3 py-6 text-center text-ui text-ink-muted", className)} {...props} />;
}
