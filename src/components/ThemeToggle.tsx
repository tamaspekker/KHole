import { Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleTheme, useTheme } from "@/lib/theme";

/** Light / dark switch for the screen headers: a moon, filled while the app is dark. */
export function ThemeToggle({ className }: { className?: string }) {
  const dark = useTheme((s) => s.dark);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggleTheme}
      className={className}
      aria-label="Dark appearance"
      aria-pressed={dark}
      title={dark ? "Switch to light appearance" : "Switch to dark appearance"}
    >
      <Moon fill={dark ? "currentColor" : "none"} />
    </Button>
  );
}
