import { type ReactNode, useMemo, useState } from "react";
import { ChevronLeft, FolderPlus, Play, X } from "lucide-react";
import { START_AT_OPTIONS, Segmented } from "@/components/Segmented";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Switch } from "@/components/ui/switch";
import type { Destination } from "@/lib/api";
import { allFolders, buildTree } from "@/lib/folders";
import { fileName, parentPath, tildify } from "@/lib/format";
import { cn } from "@/lib/utils";
import { goHome, goTo } from "@/state/app";
import {
  pickDestination,
  removeDestination,
  setAutoNext,
  setBpmRange,
  setDestinationHotkey,
  setMode,
  setStartAt,
  setTargetBpm,
  useSession,
} from "@/state/session";
import { useKeyText } from "@/state/keymap";

const HOTKEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

/** Lower bounds of the BPM ranges on offer (each range is [min, 2 × min)). */
const BPM_RANGES = [60, 70, 80, 88, 100, 110, 120];

const MODE_OPTIONS = [
  { value: "move", label: "Move" },
  { value: "copy", label: "Copy" },
] as const;

/**
 * Session setup: everything has a default, so Start works right away. The scan runs
 * meanwhile; its progress shows next to the track count.
 */
export function SetupScreen() {
  const session = useSession((s) => s.session)!;
  const keyOf = useKeyText();
  const tracks = useSession((s) => s.tracks);
  const progress = useSession((s) => s.progress);
  const destinations = useSession((s) => s.destinations);
  const error = useSession((s) => s.error);
  const analysis = useSession((s) => s.analysis);
  const analysisError = useSession((s) => s.analysisError);

  const count = tracks?.length ?? 0;
  const folders = useMemo(
    () => (tracks ? allFolders(buildTree(tracks, session.sourcePath)).length - 1 : 0),
    [tracks, session.sourcePath],
  );
  const left = tracks?.filter((t) => t.status === "pending").length ?? 0;
  const trackLabel = progress
    ? progress.total > 0
      ? `Scanning ${progress.done} / ${progress.total}`
      : "Scanning…"
    : analysis
      ? `Analyzing ${analysis.done} / ${analysis.total}`
      : `${count} ${count === 1 ? "track" : "tracks"}${left < count ? ` · ${left} left` : ""}`;

  return (
    <main className="flex h-full flex-col">
      <header className="chassis flex h-12 shrink-0 items-center gap-3 px-3">
        <Button variant="ghost" size="icon-sm" onClick={goHome} title="Back to start">
          <ChevronLeft />
        </Button>
        <h1 className="flex-1 text-sm font-semibold">Session setup</h1>
        <ThemeToggle />
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-8">
          <Section title="Source">
            <Row>
              <div className="min-w-0 flex-1" title={session.sourcePath}>
                <div className="truncate text-sm font-medium">{fileName(session.sourcePath)}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {tildify(parentPath(session.sourcePath))}
                </div>
              </div>
              <span className="tabular shrink-0 text-xs text-muted-foreground">{trackLabel}</span>
            </Row>
            {analysis && (
              <div
                className="h-0.5 bg-muted"
                role="progressbar"
                aria-label="Analyzing BPM and key"
                aria-valuenow={analysis.done}
                aria-valuemax={analysis.total}
              >
                <div
                  className="h-full bg-brand"
                  style={{
                    width: `${(analysis.done / analysis.total) * 100}%`,
                    transition: "width 150ms",
                  }}
                />
              </div>
            )}
            {folders > 0 && (
              <Row>
                <span className="flex-1 text-sm">
                  {folders} {folders === 1 ? "subfolder" : "subfolders"}, all included
                </span>
                <span className="text-xs text-muted-foreground">
                  Pick one in the sidebar while sorting
                </span>
              </Row>
            )}
          </Section>

          <Section
            title="Destinations"
            action={
              <Button variant="ghost" size="sm" onClick={() => void pickDestination()}>
                <FolderPlus data-icon="inline-start" />
                Add folder
              </Button>
            }
          >
            {destinations.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">
                No destinations – cleanup mode: keep or delete only.
              </p>
            ) : (
              destinations.map((d) => <DestinationRow key={d.id} destination={d} />)
            )}
          </Section>

          <Section title="Decisions">
            <Row>
              <span className="flex-1 text-sm">When sorting</span>
              <Segmented
                label="When sorting"
                value={session.mode}
                options={MODE_OPTIONS}
                onChange={(m) => void setMode(m)}
              />
            </Row>
            <Row>
              <span className="flex-1 text-sm">Start playback at</span>
              <Segmented
                label="Start playback at"
                value={session.startAt}
                options={START_AT_OPTIONS}
                onChange={(v) => void setStartAt(v)}
              />
            </Row>
            <FixedTempoRow value={session.targetBpm} />
            <Row>
              <label htmlFor="auto-next" className="flex-1 text-sm">
                Auto-play next track after a decision
              </label>
              <Switch
                id="auto-next"
                checked={session.autoNext}
                onCheckedChange={(v) => void setAutoNext(v)}
              />
            </Row>
          </Section>

          <Section title="Analysis">
            <Row>
              <label htmlFor="bpm-range" className="flex-1 text-sm">
                BPM range
                <span className="block text-xs text-muted-foreground">
                  Analysed tempos outside it are halved or doubled. Tag values stay as they are.
                </span>
              </label>
              <select
                id="bpm-range"
                value={session.bpmMin ?? ""}
                onChange={(e) =>
                  void setBpmRange(e.target.value === "" ? null : Number(e.target.value))
                }
                className="tabular h-7 shrink-0 rounded-md border border-border bg-background px-1.5 text-sm"
              >
                <option value="">As detected</option>
                {BPM_RANGES.map((min) => (
                  <option key={min} value={min}>
                    {min}–{min * 2 - 1}
                  </option>
                ))}
              </select>
            </Row>
          </Section>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {analysisError && (
            <p className="text-xs text-muted-foreground" title={analysisError}>
              BPM / key analysis is unavailable; tag values are shown.
            </p>
          )}
        </div>
      </div>

      <footer className="flex h-14 shrink-0 items-center justify-end gap-3 border-t border-border bg-panel-header px-4">
        <span className="text-xs text-muted-foreground">
          {destinations.length > 0
            ? `1–0 sorts · ${keyOf("trash")} trashes · ${keyOf("keep")} keeps`
            : `${keyOf("trash")} trashes · ${keyOf("keep")} keeps`}
        </span>
        <Button autoFocus onClick={() => goTo("triage")}>
          <Play data-icon="inline-start" />
          Start
        </Button>
      </footer>
    </main>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-1.5 flex h-7 items-center justify-between px-3">
        <h2 className="text-xs font-medium text-muted-foreground">{title}</h2>
        {action}
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {children}
      </div>
    </section>
  );
}

/** Default when Fixed tempo is switched on for the first time. */
const DEFAULT_TARGET_BPM = 125;

/**
 * Fixed tempo: every track previews at one BPM (within ±16 %); the tempo can still be moved
 * per track in the triage. The field applies on Enter or when it is left.
 */
function FixedTempoRow({ value }: { value: number | null }) {
  // The last value, so switching off and on again brings it back.
  const [last, setLast] = useState(value ?? DEFAULT_TARGET_BPM);
  const [draft, setDraft] = useState<string | null>(null);
  const on = value != null;

  const commit = (text: string) => {
    setDraft(null);
    const v = Number(text.trim().replace(",", "."));
    if (!Number.isFinite(v) || v < 40 || v > 300 || v === value) return;
    setLast(v);
    void setTargetBpm(v);
  };

  return (
    <Row>
      <label htmlFor="fixed-tempo" className="flex-1 text-sm">
        Fixed tempo
        <span className="block text-xs text-muted-foreground">
          Every track previews at this BPM (within ±16%). You can still change it per track.
        </span>
      </label>
      <input
        aria-label="Fixed tempo in BPM"
        inputMode="decimal"
        disabled={!on}
        value={draft ?? String(on ? value : last)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        onBlur={(e) => draft != null && commit(e.currentTarget.value)}
        className="tabular h-7 w-16 shrink-0 rounded-md border border-border bg-background px-1.5 text-right text-sm disabled:opacity-50"
      />
      <span className="text-xs text-muted-foreground">BPM</span>
      <Switch
        id="fixed-tempo"
        checked={on}
        onCheckedChange={(checked) => void setTargetBpm(checked ? last : null)}
      />
    </Row>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex min-h-11 items-center gap-3 px-3 py-2">{children}</div>;
}

function DestinationRow({ destination: d }: { destination: Destination }) {
  return (
    <Row>
      <select
        aria-label={`Key for ${fileName(d.path)}`}
        value={d.hotkey ?? ""}
        onChange={(e) =>
          void setDestinationHotkey(d.id, e.target.value === "" ? null : Number(e.target.value))
        }
        className="tabular h-7 w-12 shrink-0 rounded-md border border-border bg-background px-1.5 text-center text-sm font-semibold"
        title="Number key (taking a key from another folder swaps them)"
      >
        {HOTKEYS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
        <option value="">–</option>
      </select>
      <div className={cn("min-w-0 flex-1", !d.available && "opacity-60")} title={d.path}>
        <div className="truncate text-sm font-medium">{fileName(d.path)}</div>
        <div className="truncate text-xs text-muted-foreground">
          {d.available ? (
            tildify(parentPath(d.path))
          ) : (
            <span className="text-warning">Not available – moved, deleted or drive not connected</span>
          )}
        </div>
      </div>
      {d.count > 0 && (
        <span className="tabular shrink-0 text-xs text-muted-foreground">{d.count}</span>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => void removeDestination(d.id)}
        title="Remove destination (files stay where they are)"
      >
        <X />
      </Button>
    </Row>
  );
}
