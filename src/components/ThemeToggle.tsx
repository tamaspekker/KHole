import { Button } from "@/components/ui/button";
import { toggleTheme, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * A slim crescent: a 9 px circle with a 7.6 px circle
 * cut out of its top right; the two arcs meet where the circles intersect.
 */
function CrescentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M10.25 3.17A9 9 0 1 0 20.83 13.75A7.6 7.6 0 0 1 10.25 3.17Z" />
    </svg>
  );
}

/**
 * Light / dark switch for the screen headers. Not a pressed-state button (that would draw
 * a box around it): the moon is simply brighter while the app is dark.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const dark = useTheme((s) => s.dark);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggleTheme}
      className={cn(
        "hover:bg-transparent",
        dark ? "text-foreground/85 hover:text-foreground" : "text-muted-foreground hover:text-foreground",
        className,
      )}
      aria-label={dark ? "Switch to light appearance" : "Switch to dark appearance"}
      title={dark ? "Switch to light appearance" : "Switch to dark appearance"}
    >
      <CrescentIcon />
    </Button>
  );
}
