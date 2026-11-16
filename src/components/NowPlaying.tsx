import {
  ExternalLink,
  FolderSearch,
  Lock,
  LockOpen,
  Minus,
  Pause,
  Play,
  Plus,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Track } from "@/lib/api";
import { formatBpm, formatDuration, stem } from "@/lib/format";
import { START_AT_OPTIONS, Segmented } from "@/components/Segmented";
import { useKeyText } from "@/state/keymap";
import { cn } from "@/lib/utils";
import { Fader, Knob } from "@/components/Controls";
import {
  TEMPO_RANGE,
  TEMPO_STEP,
  formatTempo,
  nudgeTempo,
  parseTempo,
  resetTempo,
  setTempo,
  setVolume,
  toggleKeylock,
  togglePlay,
  usePlayer,
} from "@/state/player";

interface Props {
  track: Track | null;
  startAt: number;
  onStartAtChange: (value: number) => void;
  /** Show the file in Finder (⌘R by default). */
  onReveal: () => void;
  /** Open the "Open in…" menu below the button. */
  onOpenWith: (anchor: HTMLElement) => void;
}

/**
 * The strip under the waveform, laid out like synth modules: transport + what is loaded +
 * clock, preview tempo (fader, ± and keylock), volume knob, Finder / Open in…, start position.
 */
export function NowPlaying({
  track,
  startAt,
  onStartAtChange,
  onReveal,
  onOpenWith,
}: Props) {
  const keyOf = useKeyText();
  const playing = usePlayer((s) => s.playing);
  const time = usePlayer((s) => s.time);
  const duration = usePlayer((s) => s.duration);
  const error = usePlayer((s) => s.error);
  const tempo = usePlayer((s) => s.tempo);
  const keylock = usePlayer((s) => s.keylock);
  const volume = usePlayer((s) => s.volume);

  // With the tempo moved, the BPM it now plays at (one decimal: that is what you match).
  const bpm =
    track?.bpm == null
      ? null
      : tempo === 0
        ? `${formatBpm(track.bpm)} BPM`
        : `${formatBpm(track.bpm)} → ${(track.bpm * (1 + tempo / 100)).toFixed(1)} BPM`;

  const facts = track
    ? [
        bpm,
        track.musicalKey,
        formatDuration(track.duration),
        track.format,
        track.bitrate != null && `${track.bitrate} kbps`,
      ].filter(Boolean)
    : [];

  return (
    <div className="flex h-12 shrink-0 items-stretch border-b border-border bg-card">
      <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!track || !!error}
          title={playing ? "Pause (Space)" : "Play (Space)"}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full border bg-knob-cap transition-colors disabled:opacity-40 [&_svg]:size-3.5",
            playing
              ? "border-brand text-brand"
              : "border-foreground/15 text-foreground hover:border-foreground/30",
          )}
        >
          {playing ? (
            <Pause fill="currentColor" />
          ) : (
            <Play fill="currentColor" className="ml-0.5" />
          )}
        </button>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          {track ? (
            <>
              <div className="flex min-w-0 items-baseline gap-2">
                <span
                  className="truncate text-sm font-semibold"
                  title={track.path}
                >
                  {track.title ?? stem(track.path)}
                </span>
                {track.artist && (
                  <span className="truncate text-sm text-muted-foreground">
                    {track.artist}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "tabular truncate text-xs",
                  error ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {error ?? facts.join(" · ")}
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              Nothing loaded
            </span>
          )}
        </div>

        <span className="tabular shrink-0 text-xs text-muted-foreground">
          {track ? `${formatDuration(time)} / ${formatDuration(duration)}` : ""}
        </span>
      </div>

      <Module label="Tempo">
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Preview tempo"
        >
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => nudgeTempo(-TEMPO_STEP)}
            disabled={tempo <= -TEMPO_RANGE}
            title={`Slower (${keyOf("tempoDown")})`}
          >
            <Minus />
          </Button>
          <Fader
            label="Preview tempo"
            value={tempo}
            min={-TEMPO_RANGE}
            max={TEMPO_RANGE}
            snap={0.4}
            step={0.1}
            onChange={setTempo}
            onReset={resetTempo}
            title={`Preview tempo – drag, scroll to fine-tune, double-click for 0% (${keyOf("tempoReset")})`}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => nudgeTempo(TEMPO_STEP)}
            disabled={tempo >= TEMPO_RANGE}
            title={`Faster (${keyOf("tempoUp")})`}
          >
            <Plus />
          </Button>
          <TempoReadout
            tempo={tempo}
            bpm={track?.bpm ?? null}
            title={`Click to type a tempo (% or BPM) · ${keyOf("tempoReset")} for 0%`}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={toggleKeylock}
            aria-pressed={keylock}
            className={keylock ? "text-orange" : "text-muted-foreground"}
            title={
              keylock
                ? `Keylock on – the key stays when the tempo changes (${keyOf("keylock")})`
                : `Keylock off – the pitch follows the tempo (${keyOf("keylock")})`
            }
          >
            {keylock ? <Lock /> : <LockOpen />}
          </Button>
        </div>
      </Module>

      <Module label="Volume">
        <Knob
          label="Preview volume"
          value={volume}
          onChange={setVolume}
          resetTo={1}
          display={`${Math.round(volume * 100)}%`}
          color="var(--tech-cyan)"
          title={`Preview volume ${Math.round(volume * 100)}% – drag up/down, scroll to fine-tune, double-click for 100%`}
        />
        <span className="tabular w-7 text-right text-xs text-muted-foreground">
          {Math.round(volume * 100)}
        </span>
      </Module>

      <Module label="File">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onReveal}
            disabled={!track || track.status === "missing"}
            title={`Reveal in Finder (${keyOf("reveal")})`}
          >
            <FolderSearch />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => onOpenWith(e.currentTarget)}
            disabled={!track || track.status === "missing"}
            aria-label="Open in…"
            title="Open in… another app"
          >
            <ExternalLink />
          </Button>
        </div>
      </Module>

      <Module label="Start at" title="Where a track starts playing">
        <Segmented
          label="Start playback at"
          value={startAt}
          options={START_AT_OPTIONS}
          onChange={onStartAtChange}
        />
      </Module>
    </div>
  );
}

/**
 * The tempo percent; a click turns it into a field: "+2.5" or "-1,5" is percent, "128" the
 * BPM to play at. Enter or leaving it applies, Esc cancels, nonsense is ignored.
 */
function TempoReadout({
  tempo,
  bpm,
  title,
}: {
  tempo: number;
  bpm: number | null;
  title: string;
}) {
  const [editing, setEditing] = useState(false);
  const done = useRef(false);
  const finish = (text: string | null) => {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    if (text == null) return;
    const value = parseTempo(text, bpm);
    if (value != null) setTempo(value);
  };
  const box = "tabular h-5 w-12 rounded-sm text-center text-xs";

  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={tempo === 0 ? "" : tempo.toFixed(1)}
        placeholder={bpm != null ? "% / BPM" : "%"}
        spellCheck={false}
        aria-label="Tempo in percent, or the BPM to play at"
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") finish(e.currentTarget.value);
          else if (e.key === "Escape") finish(null);
        }}
        onBlur={(e) => finish(e.currentTarget.value)}
        className={cn(
          box,
          "border border-input bg-background text-foreground outline-none placeholder:text-muted-foreground/60",
        )}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        done.current = false;
        setEditing(true);
      }}
      className={cn(
        box,
        "hover:bg-muted",
        tempo === 0 ? "text-muted-foreground" : "font-medium text-tech-green",
      )}
      title={title}
    >
      {formatTempo(tempo)}
    </button>
  );
}

/** One section of the strip, captioned like a synth module. */
function Module({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-2 border-l border-border px-3"
      title={title}
    >
      <span className="panel-label">{label}</span>
      {children}
    </div>
  );
}
