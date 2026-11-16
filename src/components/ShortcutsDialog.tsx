import { Fragment, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  type Binding,
  type RemappableAction,
  SECTIONS,
  assignKey,
  bindingOf,
  isRemappable,
  keyCaps,
  keyFromEvent,
  resetKeys,
  useKeys,
} from "@/state/keymap";

/** What the mouse does; not in the keymap, so listed here. */
const MOUSE: { what: string; label: string }[] = [
  { what: "Double-click", label: "Play the track" },
  { what: "Drag a track", label: "Drop it on a destination tile or the Trash" },
  { what: "Click again", label: "Edit title, artist or file name of the current track" },
  { what: "Right-click", label: "Play, Reveal in Finder, Open With" },
  { what: "Drag a header", label: "Reorder columns (right-click: show / hide)" },
];

function Caps({ caps, muted }: { caps: string[]; muted?: boolean }) {
  return (
    <span className="flex justify-end gap-1">
      {caps.map((c) => (
        <kbd
          key={c}
          className={cn(
            "tabular inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5 text-[11px] font-semibold",
            muted && "font-normal text-muted-foreground",
          )}
        >
          {c}
        </kbd>
      ))}
    </span>
  );
}

/**
 * The `?` overview: every shortcut, built from the keymap. It is also where keys are
 * changed: click a key, press the new one (Esc cancels). A key another action had is
 * swapped with it, so every action always has a key.
 */
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const bindings = useKeys((s) => s.bindings);
  const customized = useKeys((s) => Object.keys(s.overrides).length > 0);
  /** The action waiting for its new key. */
  const [recording, setRecording] = useState<RemappableAction | null>(null);
  const [message, setMessage] = useState<{ text: string; warning?: boolean } | null>(null);

  useEffect(() => {
    if (!open) {
      setRecording(null);
      setMessage(null);
    }
  }, [open]);

  // While recording, the next key press is the new shortcut. Taken on the window in the
  // capture phase, before the dialog (Esc would close it) or a focused button (Space).
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(null);
        setMessage(null);
        return;
      }
      const key = keyFromEvent(e);
      if (key === null) return; // a modifier alone: wait for the key
      if (key === "unsupported") {
        setMessage({ text: "⌃ Control and ⌥ Option are not used – try another key.", warning: true });
        return;
      }
      const action = recording;
      assignKey(action, key).then(
        ({ swappedWith }) => {
          setRecording(null);
          const label = (a: RemappableAction) => bindingOf(a)?.label ?? a;
          setMessage(
            swappedWith
              ? { text: `Swapped with “${label(swappedWith)}”, which now has the old key.` }
              : null,
          );
        },
        (err: unknown) => setMessage({ text: err instanceof Error ? err.message : String(err), warning: true }),
      );
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [recording]);

  const reset = () => {
    setRecording(null);
    void resetKeys().then(() => setMessage({ text: "All keys are back to the defaults." }));
  };

  const keyCell = (b: Binding) => {
    if (!isRemappable(b.action)) {
      return (
        <span title="The destination keys – which folder sits on which number is set in Setup">
          <Caps caps={keyCaps(b)} />
        </span>
      );
    }
    const action = b.action;
    const active = recording === action;
    return (
      <button
        type="button"
        onClick={() => {
          setMessage(null);
          setRecording(active ? null : action);
        }}
        title="Click, then press the new key (Esc cancels)"
        aria-label={`Change the key of ${b.label}`}
        className={cn(
          "-my-0.5 rounded px-1 py-0.5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
          active && "bg-brand/15 ring-1 ring-brand",
        )}
      >
        {active ? (
          <span className="block px-1 text-[11px] font-medium text-brand">Press a key…</span>
        ) : (
          <Caps caps={keyCaps(b)} />
        )}
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100%-4rem)] overflow-y-auto sm:max-w-xl"
        onEscapeKeyDown={(e) => recording && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            One key per action, then the next track still to do. Click a key to change it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          {SECTIONS.map((section) => (
            <section key={section}>
              <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">{section}</h3>
              <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5">
                {bindings
                  .filter((b) => b.section === section && !b.hidden)
                  .map((b) => (
                    <Fragment key={`${b.action}-${b.arg ?? ""}`}>
                      <span className="text-[13px]">{b.label}</span>
                      {keyCell(b)}
                    </Fragment>
                  ))}
              </div>
            </section>
          ))}
        </div>
        <section>
          <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">Mouse</h3>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
            {MOUSE.map((m) => (
              <Fragment key={m.what}>
                <span className="text-muted-foreground">{m.what}</span>
                <span>{m.label}</span>
              </Fragment>
            ))}
          </div>
        </section>
        <DialogFooter className="items-center sm:justify-between">
          <p
            role="status"
            className={cn("min-h-5 text-xs", message?.warning ? "text-warning" : "text-muted-foreground")}
          >
            {message?.text ?? (recording ? "Press the new key – Esc cancels." : "")}
          </p>
          <Button variant="ghost" size="sm" onClick={reset} disabled={!customized}>
            <RotateCcw data-icon="inline-start" />
            Reset to defaults
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
