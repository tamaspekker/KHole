import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
} from "lucide-react";
import { type FolderNode, ancestors, visibleFolders } from "@/lib/folders";
import { loadPref, savePref, isStringArray } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { useKeyText } from "@/state/keymap";

const MIN_WIDTH = 160;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 224;
/** Dragged narrower than this, the sidebar closes. */
const CLOSE_BELOW = 110;
/** Dragging the closed rail this far to the right opens it. */
const OPEN_AFTER = 40;

const isWidth = (v: unknown): v is number => typeof v === "number" && v >= MIN_WIDTH && v <= MAX_WIDTH;

interface Props {
  sessionId: number;
  tree: FolderNode;
  /** The selected folder; null: all of the source. */
  selected: string | null;
  onSelect: (folder: string | null) => void;
  query: string;
  onQueryChange: (query: string) => void;
  /** Enter in the search field: go to the first match. */
  onSearchEnter: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The left sidebar of the triage: a track search on top, the source's folder tree below
 * (the root is the whole folder). Opens and closes from its edge: drag it, or click the
 * rail / the close button; a key toggles it (S), another opens it in the search (⌘F).
 */
export function Sidebar({
  sessionId,
  tree,
  selected,
  onSelect,
  query,
  onQueryChange,
  onSearchEnter,
  searchRef,
  open,
  onOpenChange,
}: Props) {
  const keyOf = useKeyText();
  const [width, setWidth] = useState(() => loadPref("sidebar.width", DEFAULT_WIDTH, isWidth));
  useEffect(() => savePref("sidebar.width", width), [width]);

  // Collapsed folders, per session (a view preference).
  const collapsedPref = `tree.collapsed.${sessionId}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(loadPref(collapsedPref, [], isStringArray)),
  );
  useEffect(() => savePref(collapsedPref, [...collapsed]), [collapsed, collapsedPref]);
  const toggle = (path: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  // The selected folder is always visible: its parents open up.
  useEffect(() => {
    if (!selected) return;
    const up = ["", ...ancestors(selected)];
    setCollapsed((c) => (up.some((p) => c.has(p)) ? new Set([...c].filter((p) => !up.includes(p))) : c));
  }, [selected]);

  // ── Dragging the edge ─────────────────────────────────────────────────────────────────
  const drag = useRef<{ x: number; width: number; open: boolean } | null>(null);
  const [resizing, setResizing] = useState(false);
  const onEdgeDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { x: e.clientX, width: open ? width : 0, open };
    setResizing(true);
  };
  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const w = d.width + e.clientX - d.x;
      if (!d.open) {
        if (w > OPEN_AFTER) {
          onOpenChange(true);
          d.open = true;
          d.width = Math.max(MIN_WIDTH, width);
          d.x = e.clientX;
        }
        return;
      }
      if (w < CLOSE_BELOW) return;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w)));
    };
    const onUp = (e: PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      setResizing(false);
      if (d?.open && d.width + e.clientX - d.x < CLOSE_BELOW) onOpenChange(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [resizing, onOpenChange, width]);

  const edge = (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={open ? "Resize the sidebar (drag left to close)" : "Open the sidebar"}
      title={open ? "Drag to resize, drag to the left to close" : "Drag or click to open"}
      onPointerDown={onEdgeDown}
      onClick={() => !open && onOpenChange(true)}
      onDoubleClick={() => open && onOpenChange(false)}
      className={cn(
        "absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:bg-transparent hover:after:bg-brand/60",
        resizing && "after:bg-brand/60",
      )}
    />
  );

  if (!open) {
    return (
      <aside className="relative flex w-9 shrink-0 flex-col items-center gap-1 border-r border-border bg-sidebar py-2">
        <RailButton title={`Show the sidebar (${keyOf("toggleSidebar")})`} onClick={() => onOpenChange(true)}>
          <PanelLeftOpen />
        </RailButton>
        <RailButton
          title={`Search tracks (${keyOf("search")})`}
          onClick={() => {
            onOpenChange(true);
            requestAnimationFrame(() => searchRef.current?.focus());
          }}
        >
          <Search />
        </RailButton>
        {(selected || query) && (
          <span
            className="mt-1 size-1.5 rounded-full bg-muted-foreground"
            title={[selected && `Folder: ${selected}`, query && `Search: ${query}`].filter(Boolean).join(" · ")}
          />
        )}
        {edge}
      </aside>
    );
  }

  const searching = query.trim() !== "";
  const rows = visibleFolders(tree, collapsed);
  const current = selected ?? "";

  return (
    <aside
      className="relative flex shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground"
      style={{ width }}
    >
      <div className="flex h-10 shrink-0 items-center gap-1 px-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                if (query) onQueryChange("");
                else e.currentTarget.blur();
              } else if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
                onSearchEnter();
              } else if (e.key === "ArrowDown" || e.key === "Tab") {
                // Back to the list: the arrow keys step through tracks again.
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            placeholder="Search tracks"
            spellCheck={false}
            autoComplete="off"
            className="h-7 w-full rounded-md border border-border bg-background pr-6 pl-7 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                onQueryChange("");
                searchRef.current?.focus();
              }}
              aria-label="Clear the search"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
        <RailButton title={`Hide the sidebar (${keyOf("toggleSidebar")})`} onClick={() => onOpenChange(false)}>
          <PanelLeftClose />
        </RailButton>
      </div>

      <ul role="tree" aria-label="Folders" className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {rows.map((n) => {
          const isSelected = n.path === current;
          const isOpen = !collapsed.has(n.path);
          const dim = searching ? n.matches === 0 : false;
          return (
            <li
              key={n.path}
              role="treeitem"
              aria-selected={isSelected}
              aria-expanded={n.children.length > 0 ? isOpen : undefined}
            >
              <div
                className={cn(
                  "group flex h-[26px] items-center gap-1 rounded-md pr-2 text-[13px]",
                  isSelected ? "bg-sidebar-accent font-medium" : "hover:bg-sidebar-accent/60",
                  dim && "opacity-45",
                )}
                style={{ paddingLeft: 4 + n.depth * 12 }}
              >
                {n.children.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => toggle(n.path)}
                    aria-label={isOpen ? `Collapse ${n.name}` : `Expand ${n.name}`}
                    className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                  >
                    <ChevronRight className={cn("size-3 transition-transform", isOpen && "rotate-90")} />
                  </button>
                ) : (
                  <span className="size-4 shrink-0" />
                )}
                <button
                  type="button"
                  onClick={() => onSelect(n.path || null)}
                  title={`${n.path || n.name}\n${n.pending} of ${n.total} left`}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                >
                  {isSelected ? (
                    <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{n.name}</span>
                  <span className="tabular shrink-0 text-[11px] text-muted-foreground">
                    {searching ? (
                      n.matches || ""
                    ) : n.pending > 0 ? (
                      n.pending
                    ) : (
                      <Check className="size-3" aria-label="All done" />
                    )}
                  </span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {edge}
    </aside>
  );
}

function RailButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground [&_svg]:size-4"
    >
      {children}
    </button>
  );
}
