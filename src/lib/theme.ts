import { getCurrentWindow } from "@tauri-apps/api/window";
import { create } from "zustand";
import { loadPref, savePref } from "@/lib/prefs";

/**
 * Light / dark appearance. Follows the system until the moon button picks one; the choice
 * is remembered on this Mac. shadcn/ui switches on the `.dark` class of <html>.
 *
 * The window's title bar is transparent (tauri.conf.json), so it shows the window's
 * background colour: set to the app's chrome colour, the traffic-light bar and the app's
 * own header read as one surface, as in a native macOS app.
 */

export type ThemeChoice = "system" | "light" | "dark";

/** The title bar / header colour of each appearance (macOS window chrome). */
const CHROME = { dark: "#1e1e1e", light: "#f6f6f6" } as const;

const isChoice = (v: unknown): v is ThemeChoice => v === "system" || v === "light" || v === "dark";

interface ThemeState {
  choice: ThemeChoice;
  /** What is shown now. */
  dark: boolean;
}

const media = window.matchMedia("(prefers-color-scheme: dark)");

export const useTheme = create<ThemeState>(() => {
  const choice = loadPref<ThemeChoice>("theme", "system", isChoice);
  return { choice, dark: choice === "system" ? media.matches : choice === "dark" };
});

/** Fired after the appearance changed, for canvases that read colours once (waveform). */
export const THEME_EVENT = "khole-theme";

function apply(): void {
  const { choice, dark } = useTheme.getState();
  document.documentElement.classList.toggle("dark", dark);
  window.dispatchEvent(new Event(THEME_EVENT));
  const win = getCurrentWindow();
  // Native appearance (title text, traffic lights, menus); null follows the system.
  win.setTheme(choice === "system" ? null : choice).catch(() => {});
  win.setBackgroundColor(dark ? CHROME.dark : CHROME.light).catch(() => {});
}

export function initTheme(): void {
  apply();
  media.addEventListener("change", () => {
    if (useTheme.getState().choice !== "system") return;
    useTheme.setState({ dark: media.matches });
    apply();
  });
}

/** The moon button: switches to the other appearance and remembers it. */
export function toggleTheme(): void {
  const dark = !useTheme.getState().dark;
  // Picking what the system shows anyway means "follow the system" again.
  const choice: ThemeChoice = dark === media.matches ? "system" : dark ? "dark" : "light";
  useTheme.setState({ choice, dark });
  savePref("theme", choice);
  apply();
}
