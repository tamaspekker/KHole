import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, FolderOpen, Trash2, TriangleAlert, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, events, type SessionStats, type SessionUndone } from "@/lib/api";
import { fileName, tildify } from "@/lib/format";
import { cn } from "@/lib/utils";
import { goHome, goTo } from "@/state/app";
import { useKeyText } from "@/state/keymap";
import { refresh, refreshDestinations, useSession } from "@/state/session";

/** "about 42 min", "1 h 5 min", "under a minute". */
function formatWorkTime(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return "under a minute";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The end of a session (spec #15): what went where, how long it took, Open in Finder for
 * each destination, and Undo session as a safety net (every open action reverted, newest
 * first, like ⌘Z until nothing is left).
 */
export function SummaryScreen() {
  const session = useSession((s) => s.session)!;
  const tracks = useSession((s) => s.tracks);
  const destinations = useSession((s) => s.destinations);
  const keyOf = useKeyText();

  const [stats, setStats] = useState<SessionStats | null>(null);
  const loadStats = useCallback(
    () => api.sessionStats(session.id).then(setStats, () => setStats(null)),
    [session.id],
  );
  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const [confirm, setConfirm] = useState(false);
  const [undoing, setUndoing] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<SessionUndone | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const off = events.onUndoProgress((p) => {
      if (p.sessionId === session.id) setUndoing({ done: p.done, total: p.total });
    });
    return () => void off.then((f) => f());
  }, [session.id]);

  const undoSession = async () => {
    setConfirm(false);
    setError(null);
    setResult(null);
    setUndoing({ done: 0, total: stats?.open ?? 0 });
    try {
      setResult(await api.undoSession(session.id));
    } catch (e) {
      setError(String(e));
    } finally {
      setUndoing(null);
      await Promise.all([refresh(), refreshDestinations(), loadStats()]);
    }
  };

  const openFolder = (destinationId: number) =>
    api.openDestination(session.id, destinationId).catch((e) => setError(String(e)));

  const all = tracks ?? [];
  const count = (status: string) => all.filter((t) => t.status === status).length;
  const moved = count("moved");
  const copied = count("copied");
  const kept = count("kept");
  const trashed = count("trashed");
  const left = count("pending");
  const missing = count("missing");
  const done = moved + copied + kept + trashed;
  const perTrack = stats && done > 0 && stats.activeMs > 0 ? stats.activeMs / done / 1000 : null;
  const open = stats?.open ?? 0;
  const edits = stats?.openEdits ?? 0;
  const decisions = open - edits;
  const busy = undoing != null;

  const used = destinations.filter((d) => d.count > 0);
  const unused = destinations.length - used.length;

  return (
    <main className="flex h-full flex-col">
      <header className="chassis flex h-12 shrink-0 items-center gap-3 px-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => goTo("triage")}
          disabled={busy}
          title="Back to the tracks"
        >
          <ChevronLeft />
        </Button>
        <div className="min-w-0 flex-1" title={session.sourcePath}>
          <div className="truncate text-sm font-semibold">{fileName(session.sourcePath)}</div>
          <div className="truncate text-xs text-muted-foreground">
            {tildify(session.sourcePath)}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={goHome} disabled={busy}>
          Done
        </Button>
        <ThemeToggle />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-xl flex-col gap-8 px-6 py-10">
          <section className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {all.length === 0
                ? "Nothing here yet"
                : left === 0
                  ? "All tracks done"
                  : `${done} of ${all.length - missing} done`}
            </h1>
            <p className="tabular text-sm text-muted-foreground">
              {stats && stats.activeMs > 0
                ? `${formatWorkTime(stats.activeMs)} of work${perTrack ? ` · about ${Math.round(perTrack)} s per track` : ""}`
                : "No decisions yet."}
              {left > 0 && ` · ${plural(left, "track")} left`}
            </p>
          </section>

          <section className="grid grid-cols-4 gap-2">
            <Stat label={session.mode === "copy" && moved === 0 ? "Copied" : "Sorted"} value={moved + copied} />
            <Stat label="Kept" value={kept} />
            <Stat label="Trashed" value={trashed} />
            <Stat label="Left" value={left} muted={left === 0} />
          </section>

          <section>
            <h2 className="mb-2 text-xs font-medium text-muted-foreground">Where they went</h2>
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {used.map((d) => (
                <li key={d.id} className="flex h-11 items-center gap-3 px-3">
                  <kbd className="tabular flex size-5 shrink-0 items-center justify-center rounded bg-muted text-xs font-semibold">
                    {d.hotkey ?? "·"}
                  </kbd>
                  <span className="min-w-0 flex-1" title={d.path}>
                    <span className={cn("block truncate text-sm", !d.available && "line-through opacity-60")}>
                      {fileName(d.path)}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-sm">{d.count}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void openFolder(d.id)}
                    disabled={!d.available}
                    title={d.available ? "Open in Finder" : "Not available (moved, deleted or drive not connected)"}
                    aria-label={`Open ${fileName(d.path)} in Finder`}
                  >
                    {d.available ? <FolderOpen /> : <TriangleAlert className="text-warning" />}
                  </Button>
                </li>
              ))}
              <li className="flex h-11 items-center gap-3 px-3">
                <Trash2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-sm">Trash</span>
                <span className="tabular shrink-0 text-sm">{trashed}</span>
                {/* Same width as the Finder buttons above, so the counts line up. */}
                <span className="size-7 shrink-0" />
              </li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              {[
                unused > 0 && `${plural(unused, "destination")} got nothing.`,
                missing > 0 && `${plural(missing, "file")} disappeared in Finder meanwhile.`,
              ]
                .filter(Boolean)
                .join(" ")}
            </p>
          </section>

          <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-medium">Undo session</h2>
                <p className="text-xs text-muted-foreground">
                  {open === 0
                    ? "Nothing to undo."
                    : `Puts every file back where it was${edits > 0 ? " and reverts the edits" : ""} – like ${keyOf("undo")} until nothing is left. Copies go to the Trash.`}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setConfirm(true)}
                disabled={open === 0 || busy}
              >
                <Undo2 data-icon="inline-start" />
                Undo session
              </Button>
            </div>
            {undoing && (
              <div className="flex flex-col gap-1.5">
                <div className="h-1 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-brand"
                    style={{
                      width: `${undoing.total > 0 ? (undoing.done / undoing.total) * 100 : 0}%`,
                      transition: "width 150ms",
                    }}
                  />
                </div>
                <p className="tabular text-xs text-muted-foreground">
                  Undoing {undoing.done} / {undoing.total}…
                </p>
              </div>
            )}
            {result && <UndoResult result={result} />}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </section>
        </div>
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Undo the whole session?</DialogTitle>
            <DialogDescription>
              {[
                decisions > 0 && `${plural(decisions, "decision")} will be reverted: moved and trashed files go back into ${fileName(session.sourcePath)}, copies go to the Trash.`,
                edits > 0 && `${plural(edits, "edit")} (names, tags, BPM) will be reverted too.`,
              ]
                .filter(Boolean)
                .join(" ")}{" "}
              There is no redo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button autoFocus onClick={() => void undoSession()}>
              Undo session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Stat({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-muted/50 px-3 py-2.5">
      <span className={cn("tabular text-xl font-semibold", muted && "text-muted-foreground")}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function UndoResult({ result }: { result: SessionUndone }) {
  const notes = result.notes.slice(0, 5);
  return (
    <div className="flex flex-col gap-1 text-xs">
      {result.error ? (
        <p role="alert" className="flex gap-1.5 text-warning">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          <span>
            Stopped after {result.undone} of {result.total}: {result.error} The rest is unchanged;
            Undo session tries again.
          </span>
        </p>
      ) : (
        <p role="status" className="text-muted-foreground">
          Undid {plural(result.undone, "action")}.
          {result.notes.length === 0 ? " Everything is back where it was." : " Not everything went back exactly:"}
        </p>
      )}
      {notes.map((n) => (
        <p key={n} className="truncate text-muted-foreground" title={n}>
          {n}
        </p>
      ))}
      {result.notes.length > notes.length && (
        <p className="text-muted-foreground">…and {result.notes.length - notes.length} more.</p>
      )}
    </div>
  );
}
