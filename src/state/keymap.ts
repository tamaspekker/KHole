import { useEffect, useRef } from "react";
import { create } from "zustand";
import { api } from "@/lib/api";
import { useDrag } from "@/state/drag";

/**
 * Central keymap: every shortcut of the app is listed here, and one window listener
 * dispatches them. Screens only say what an action does (`useKeymap`). The user can give
 * every action a key of their own (spec #14, in the `?` overview); the destination keys
 * 1–0 stay numbers, which destination sits on which number is set in Setup.
 */
export type Action =
  | "playPause"
  | "seekBack"
  | "seekForward"
  | "seekBackLong"
  | "seekForwardLong"
  | "tempoDown"
  | "tempoUp"
  | "tempoReset"
  | "keylock"
  | "prevTrack"
  | "nextTrack"
  | "prevFolder"
  | "nextFolder"
  | "toggleSidebar"
  | "search"
  | "keep"
  | "trash"
  /** Sort into the destination whose number key is `arg` (1–9, 0). */
  | "sort"
  | "moveTo"
  | "undo"
  | "reveal"
  | "shortcuts";

/** The actions the user can put on another key (all but the destination numbers). */
export type RemappableAction = Exclude<Action, "sort">;

/** Sections of the shortcut overview (`?`), in display order. */
export const SECTIONS = ["Playback", "Tracks", "Decide", "Folders", "Other"] as const;
export type Section = (typeof SECTIONS)[number];

/** A key with its modifiers. */
export interface Key {
  /** `KeyboardEvent.code` for layout-independent keys (Space), otherwise `key`. */
  code?: string;
  key?: string;
  shift?: boolean;
  /** ⌘ held. */
  meta?: boolean;
}

export interface Binding extends Key {
  /** Passed to the handler (the number of a destination key). */
  arg?: number;
  /** Fire again while the key is held. */
  repeat?: boolean;
  action: Action;
  /** For the shortcut overview (`?`). */
  label: string;
  section: Section;
  /** Key text in the overview instead of the one derived from the binding. */
  display?: string;
  /** Left out of the overview (covered by another row, like 2–0 by "1–0"). */
  hidden?: boolean;
}

export const DEFAULT_KEYMAP: readonly Binding[] = [
  { code: "Space", action: "playPause", label: "Play / pause", section: "Playback" },
  { key: "ArrowLeft", repeat: true, action: "seekBack", label: "Back 15 s", section: "Playback" },
  {
    key: "ArrowRight",
    repeat: true,
    action: "seekForward",
    label: "Forward 15 s",
    section: "Playback",
  },
  {
    key: "ArrowLeft",
    shift: true,
    repeat: true,
    action: "seekBackLong",
    label: "Back 60 s",
    section: "Playback",
  },
  {
    key: "ArrowRight",
    shift: true,
    repeat: true,
    action: "seekForwardLong",
    label: "Forward 60 s",
    section: "Playback",
  },
  // `,` and `.` sit in the same place on most layouts (Hungarian too); no Shift variants,
  // as Shift turns them into other characters on many layouts.
  { key: ",", repeat: true, action: "tempoDown", label: "Tempo −0.5%", section: "Playback" },
  { key: ".", repeat: true, action: "tempoUp", label: "Tempo +0.5%", section: "Playback" },
  { key: "t", action: "tempoReset", label: "Tempo back to 0%", section: "Playback" },
  { key: "k", action: "keylock", label: "Keylock on / off", section: "Playback" },
  {
    key: "ArrowUp",
    repeat: true,
    action: "prevTrack",
    label: "Previous track (no decision)",
    section: "Tracks",
  },
  {
    key: "ArrowDown",
    repeat: true,
    action: "nextTrack",
    label: "Next track (no decision)",
    section: "Tracks",
  },
  {
    key: "ArrowUp",
    shift: true,
    repeat: true,
    action: "prevFolder",
    label: "Previous folder",
    section: "Folders",
  },
  {
    key: "ArrowDown",
    shift: true,
    repeat: true,
    action: "nextFolder",
    label: "Next folder",
    section: "Folders",
  },
  { key: "f", meta: true, action: "search", label: "Search tracks", section: "Folders" },
  { key: "s", action: "toggleSidebar", label: "Show / hide the sidebar", section: "Folders" },
  // `key`, not `code`: on a Hungarian keyboard the 0 sits left of the 1.
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(
    (n): Binding => ({
      key: String(n),
      arg: n,
      action: "sort",
      label: "Sort into that destination, next track",
      section: "Decide",
      display: "1–0",
      hidden: n !== 1,
    }),
  ),
  { key: "m", action: "moveTo", label: "Move to… (find any destination)", section: "Decide" },
  { key: "Enter", action: "keep", label: "Keep where it is, next track", section: "Decide" },
  { key: "Backspace", action: "trash", label: "Move to Trash, next track", section: "Decide" },
  { key: "z", meta: true, action: "undo", label: "Undo", section: "Decide" },
  { key: "r", meta: true, action: "reveal", label: "Reveal in Finder", section: "Other" },
  { key: "?", shift: true, action: "shortcuts", label: "This overview", section: "Other" },
];

const REMAPPABLE = new Set<Action>(
  DEFAULT_KEYMAP.filter((b) => b.action !== "sort").map((b) => b.action),
);

export function isRemappable(action: Action): action is RemappableAction {
  return REMAPPABLE.has(action);
}

// ── Key text ────────────────────────────────────────────────────────────────────────────

const KEY_TEXT: Record<string, string> = {
  Space: "Space",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Enter: "Enter",
  Backspace: "Backspace",
  Delete: "⌦",
  Home: "Home",
  End: "End",
  PageUp: "Page Up",
  PageDown: "Page Down",
};

/** The keys of a binding as shown to the user, e.g. ["⇧", "←"]. */
export function keyCaps(b: Key & { display?: string }): string[] {
  if (b.display) return [b.display];
  const name = b.code ?? b.key ?? "";
  const main = KEY_TEXT[name] ?? name.toUpperCase();
  // A shifted symbol ("?") already says Shift.
  const showShift = b.shift && !(name.length === 1 && name.toLowerCase() === name.toUpperCase());
  return [...(b.meta ? ["⌘"] : []), ...(showShift ? ["⇧"] : []), main];
}

/** One string for running text: "⌘Z", "⇧←", "Backspace". */
export function keyText(b: Key | undefined): string {
  return b ? keyCaps(b).join("") : "–";
}

const sameKey = (a: Key, b: Key) =>
  (a.code ?? null) === (b.code ?? null) &&
  (a.key ?? null) === (b.key ?? null) &&
  !!a.shift === !!b.shift &&
  !!a.meta === !!b.meta;

// ── The user's keys ─────────────────────────────────────────────────────────────────────

/** The user's keys for the actions they changed; the rest use the default. */
export type Overrides = Partial<Record<RemappableAction, Key>>;

interface KeysState {
  overrides: Overrides;
  /** The keymap in effect: defaults with the overrides applied. */
  bindings: readonly Binding[];
}

function apply(overrides: Overrides): Binding[] {
  return DEFAULT_KEYMAP.map((b) => {
    const k = isRemappable(b.action) ? overrides[b.action] : undefined;
    return k ? { ...b, code: k.code, key: k.key, shift: k.shift, meta: k.meta } : b;
  });
}

export const useKeys = create<KeysState>(() => ({
  overrides: {},
  bindings: DEFAULT_KEYMAP,
}));

function isKey(v: unknown): v is Key {
  if (typeof v !== "object" || v == null) return false;
  const k = v as Record<string, unknown>;
  const str = (x: unknown) => x === undefined || typeof x === "string";
  const bool = (x: unknown) => x === undefined || typeof x === "boolean";
  return (
    str(k.code) && str(k.key) && bool(k.shift) && bool(k.meta) && (k.code != null || k.key != null)
  );
}

/** Reads the saved keys; anything invalid, unknown or now reserved is dropped. */
export function parseOverrides(json: string | null): Overrides {
  if (!json) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return {};
  }
  if (typeof raw !== "object" || raw == null) return {};
  const out: Overrides = {};
  const used: Key[] = [];
  for (const [action, key] of Object.entries(raw)) {
    const valid =
      isRemappable(action as Action) && isKey(key) && !reserved(key) && !used.some((u) => sameKey(u, key));
    if (!valid) continue;
    out[action as RemappableAction] = {
      ...(key.code ? { code: key.code } : { key: key.key }),
      ...(key.shift ? { shift: true } : {}),
      ...(key.meta ? { meta: true } : {}),
    };
    used.push(key);
  }
  // Two actions must never share a key: an override that collides with another action's
  // default is dropped too.
  const bindings = apply(out);
  for (const action of Object.keys(out) as RemappableAction[]) {
    const mine = bindings.find((b) => b.action === action)!;
    if (bindings.some((b) => b.action !== action && sameKey(b, mine))) delete out[action];
  }
  return out;
}

/** Loads the saved keys from the DB (once at start). */
export async function loadKeys(): Promise<void> {
  try {
    setOverrides(parseOverrides(await api.getSetting("keymap")));
  } catch {
    // Defaults then.
  }
}

function setOverrides(overrides: Overrides): void {
  useKeys.setState({ overrides, bindings: apply(overrides) });
}

function save(overrides: Overrides): Promise<void> {
  const empty = Object.keys(overrides).length === 0;
  return api.setSetting("keymap", empty ? null : JSON.stringify(overrides)).then(() => {});
}

export function bindingOf(action: Action, bindings = useKeys.getState().bindings): Binding | undefined {
  return bindings.find((b) => b.action === action);
}

/** Why a key cannot be used for an action, or null if it can. */
export function reserved(k: Key): string | null {
  const name = k.code ?? k.key ?? "";
  if (name === "Escape") return "Esc closes dialogs and cancels a drag.";
  if (name === "Tab") return "Tab moves between controls.";
  if (!k.meta && /^[0-9]$/.test(name)) return "1–0 are the destination keys (set in Setup).";
  if (k.meta && ["q", "w", "h", "m", ",", "c", "v", "x", "a", "o"].includes(name))
    return `⌘${name.toUpperCase()} belongs to macOS.`;
  return null;
}

export interface Assigned {
  /** The action that had this key and now has the old key of the changed one. */
  swappedWith: RemappableAction | null;
}

/**
 * Puts `action` on `key`. If another action had that key, the two swap, so no action is
 * ever left without a key. Throws with the reason if the key is reserved.
 */
export async function assignKey(action: RemappableAction, key: Key): Promise<Assigned> {
  const why = reserved(key);
  if (why) throw new Error(why);
  const { overrides, bindings } = useKeys.getState();
  const mine = bindingOf(action, bindings)!;
  const other = bindings.find((b) => b.action !== action && sameKey(b, key));
  if (other && !isRemappable(other.action)) throw new Error("That key is taken.");
  const next: Overrides = { ...overrides, [action]: key };
  if (other && isRemappable(other.action)) {
    next[other.action] = { code: mine.code, key: mine.key, shift: mine.shift, meta: mine.meta };
  }
  // A key back on its default is not an override.
  for (const a of Object.keys(next) as RemappableAction[]) {
    if (sameKey(next[a]!, bindingOf(a, DEFAULT_KEYMAP)!)) delete next[a];
  }
  setOverrides(next);
  await save(next);
  return { swappedWith: other && isRemappable(other.action) ? other.action : null };
}

/** All keys back to the defaults. */
export async function resetKeys(): Promise<void> {
  setOverrides({});
  await save({});
}

/** The key a keydown means, for recording a new shortcut; null for a lone modifier. */
export function keyFromEvent(e: KeyboardEvent): Key | null | "unsupported" {
  if (["Shift", "Meta", "Control", "Alt", "CapsLock", "Fn"].includes(e.key)) return null;
  if (e.ctrlKey || e.altKey) return "unsupported";
  const k: Key =
    e.code === "Space"
      ? { code: "Space" }
      : { key: e.key.length === 1 ? e.key.toLowerCase() : e.key };
  if (e.shiftKey) k.shift = true;
  if (e.metaKey) k.meta = true;
  return k;
}

/** The text of each action's key, re-rendering when the user changes them. */
export function useKeyText(): (action: Action) => string {
  const bindings = useKeys((s) => s.bindings);
  return (action) => keyText(bindingOf(action, bindings));
}

/** A native menu accelerator ("CmdOrCtrl+R") for an action's key, if it can be written. */
export function accelerator(action: Action): string | undefined {
  const b = bindingOf(action);
  if (!b) return undefined;
  const name = b.code ?? b.key ?? "";
  const named = /^(Arrow(Up|Down|Left|Right)|Enter|Backspace|Delete|Space|Home|End|PageUp|PageDown)$/;
  const main =
    name.length === 1 ? name.toUpperCase() : named.test(name) ? name.replace(/^Arrow/, "") : null;
  if (!main) return undefined;
  return [...(b.meta ? ["CmdOrCtrl"] : []), ...(b.shift ? ["Shift"] : []), main].join("+");
}

// ── Dispatch ────────────────────────────────────────────────────────────────────────────

export const SEEK_SHORT = 15;
export const SEEK_LONG = 60;

export type Handlers = Partial<Record<Action, (arg?: number) => void>>;

/** Keys typed into a dialog (Move to…, the overview) belong to it, not to the triage. */
function inDialog(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[role="dialog"]') != null;
}

function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return (
    target instanceof HTMLInputElement &&
    !["checkbox", "radio", "button", "range"].includes(target.type)
  );
}

export function match(e: KeyboardEvent, bindings = useKeys.getState().bindings): Binding | undefined {
  if (e.ctrlKey || e.altKey || e.isComposing) return undefined;
  return bindings.find(
    (b) =>
      (b.code ? b.code === e.code : b.key === e.key.toLowerCase() || b.key === e.key) &&
      !!b.shift === e.shiftKey &&
      !!b.meta === e.metaKey &&
      // Only seeking and stepping repeat while held; a held decision key does not decide
      // the next track too.
      (b.repeat || !e.repeat),
  );
}

/**
 * Installs the handlers of the current screen. Keys are taken in the capture phase so a
 * focused button or switch does not also react to Space or the arrows; text fields keep
 * their keys.
 */
export function useKeymap(handlers: Handlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTextInput(e.target) || inDialog(e.target)) return;
      // A track is being dragged: Esc cancels the drag, nothing else acts meanwhile.
      if (useDrag.getState().track) return;
      const binding = match(e);
      const run = binding && ref.current[binding.action];
      if (!run) return;
      e.preventDefault();
      e.stopPropagation();
      run(binding.arg);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);
}
