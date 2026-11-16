import { convertFileSrc } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { Track } from "@/lib/api";
import { isBoolean, isUnitNumber, loadPref, savePref } from "@/lib/prefs";

/**
 * The one audio element of the app. Playback is WebKit's (asset protocol streams the file);
 * the waveform (wavesurfer) attaches to this element instead of owning one.
 */
export const audio = new Audio();
audio.preload = "auto";

interface PlayerState {
  trackId: number | null;
  /** The file loaded for `trackId`. */
  path: string | null;
  playing: boolean;
  /** Seconds; refreshed on `timeupdate` (≈4×/s), enough for the clock. */
  time: number;
  /** Seconds, from the media element once loaded (more exact than the tag). */
  duration: number;
  error: string | null;
  /** Preview tempo change in percent (−16…+16); stays as tracks change, like a pitch fader. */
  tempo: number;
  /** Keep the key when the tempo changes (time-stretch); off = varispeed. */
  keylock: boolean;
  /** Preview volume, 0…1 on the knob (the gain curve is applied in `applyVolume`). */
  volume: number;
}

export const usePlayer = create<PlayerState>(() => ({
  trackId: null,
  path: null,
  playing: false,
  time: 0,
  duration: 0,
  error: null,
  tempo: 0,
  keylock: loadPref("keylock", true, isBoolean),
  volume: loadPref("volume", 1, isUnitNumber),
}));

const set = usePlayer.setState;
let loadToken = 0;

// ── Tempo ───────────────────────────────────────────────────────────────────────────────

export const TEMPO_RANGE = 16;
export const TEMPO_STEP = 0.5;

/** WebKit time-stretches the media element itself; older WebKit only has the prefixed flag. */
function applyTempo(): void {
  const { tempo, keylock } = usePlayer.getState();
  const rate = 1 + tempo / 100;
  const el = audio as HTMLAudioElement & { webkitPreservesPitch?: boolean };
  el.preservesPitch = keylock;
  el.webkitPreservesPitch = keylock;
  // Loading a new source resets `playbackRate` to the default, so set both.
  audio.defaultPlaybackRate = rate;
  audio.playbackRate = rate;
}
applyTempo();

/** Sets the tempo change in percent, clamped to ±16 % and rounded to 0.1 %. */
export function setTempo(percent: number): void {
  const clamped = Math.min(Math.max(percent, -TEMPO_RANGE), TEMPO_RANGE);
  set({ tempo: Math.round(clamped * 10) / 10 });
  applyTempo();
}

export function nudgeTempo(delta: number): void {
  setTempo(usePlayer.getState().tempo + delta);
}

export function resetTempo(): void {
  setTempo(0);
}

export function toggleKeylock(): void {
  const keylock = !usePlayer.getState().keylock;
  set({ keylock });
  savePref("keylock", keylock);
  applyTempo();
}

/** The tempo change (%) that plays a `bpm` track at `target` BPM, within the tempo range. */
export function tempoFor(bpm: number, target: number): number {
  return Math.min(Math.max((target / bpm - 1) * 100, -TEMPO_RANGE), TEMPO_RANGE);
}

/**
 * Typed tempo: "+2.5", "-1,5 %" are percent; a larger number is the BPM to play at
 * (needs the track's BPM). Returns the percent, or null if it can't be read.
 */
export function parseTempo(text: string, bpm: number | null): number | null {
  const cleaned = text.trim().replace(/[%\s]|bpm/gi, "").replace(",", ".").replace("−", "-");
  if (cleaned === "") return null;
  const v = Number(cleaned);
  if (!Number.isFinite(v)) return null;
  if (Math.abs(v) <= TEMPO_RANGE) return v;
  if (bpm != null && v >= 40 && v <= 300) return tempoFor(bpm, v);
  return null;
}

/** "+2.5%", "−1.0%", "0.0%" */
export function formatTempo(percent: number): string {
  const v = Math.abs(percent).toFixed(1);
  return percent > 0 ? `+${v}%` : percent < 0 ? `−${v}%` : `${v}%`;
}

// ── Volume ──────────────────────────────────────────────────────────────────────────────

/** The knob is linear to the eye; loudness is not, so the gain follows a squared curve. */
function applyVolume(): void {
  const v = usePlayer.getState().volume;
  audio.volume = v * v;
}
applyVolume();

/** Sets the preview volume (0…1, clamped, 1 % steps) and remembers it on this Mac. */
export function setVolume(value: number): void {
  const volume = Math.round(Math.min(Math.max(value, 0), 1) * 100) / 100;
  if (volume === usePlayer.getState().volume) return;
  set({ volume });
  applyVolume();
  savePref("volume", volume);
}

audio.addEventListener("play", () => set({ playing: true }));
audio.addEventListener("pause", () => set({ playing: false }));
audio.addEventListener("timeupdate", () => set({ time: audio.currentTime }));
audio.addEventListener("seeking", () => set({ time: audio.currentTime }));
audio.addEventListener("durationchange", () =>
  set({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 }),
);
audio.addEventListener("error", () => {
  if (audio.getAttribute("src")) set({ error: "This file can't be played.", playing: false });
});

export interface LoadOptions {
  autoplay: boolean;
  /** Fraction of the track to start at (session `startAt`). */
  startAt: number;
}

/** Loads a track; the start position is applied once its length is known. */
export function loadTrack(track: Track, { autoplay, startAt }: LoadOptions): void {
  const token = ++loadToken;
  audio.pause();
  audio.src = convertFileSrc(track.path);
  applyTempo();
  set({ trackId: track.id, path: track.path, time: 0, duration: track.duration ?? 0, error: null });

  audio.addEventListener(
    "loadedmetadata",
    () => {
      if (token !== loadToken) return;
      if (startAt > 0 && Number.isFinite(audio.duration)) {
        audio.currentTime = audio.duration * startAt;
      }
      if (autoplay) void audio.play().catch(() => {});
    },
    { once: true },
  );
}

/**
 * The loaded track changed (renamed or moved in Finder, deleted, or its tags rewritten –
 * `force`, as the bytes moved under the same path): carries on from the same spot at its
 * new path, or stops if the file is gone.
 */
export function followTrack(track: Track, force = false): void {
  const { trackId, path, playing } = usePlayer.getState();
  if (track.id !== trackId || (track.path === path && !force)) return;
  if (track.status === "missing") {
    audio.pause();
    set({ path: track.path, error: "The file is gone (moved or deleted in Finder)." });
    return;
  }
  const token = ++loadToken;
  const at = audio.currentTime;
  audio.src = convertFileSrc(track.path);
  applyTempo();
  set({ path: track.path, error: null });
  audio.addEventListener(
    "loadedmetadata",
    () => {
      if (token !== loadToken) return;
      audio.currentTime = at;
      if (playing) void audio.play().catch(() => {});
    },
    { once: true },
  );
}

export function togglePlay(): void {
  if (!audio.getAttribute("src") || usePlayer.getState().error) return;
  if (audio.paused) void audio.play().catch(() => {});
  else audio.pause();
}

export function seekTo(seconds: number): void {
  const d = audio.duration;
  if (!Number.isFinite(d)) return;
  audio.currentTime = Math.min(Math.max(seconds, 0), d);
}

export function seekBy(delta: number): void {
  seekTo(audio.currentTime + delta);
}

export function stop(): void {
  ++loadToken;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  set({ trackId: null, path: null, playing: false, time: 0, duration: 0, error: null });
}
