import { Coffee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const TITLE = "KHole is free – buy me a coffee";

/** "Buy me a coffee" as a quiet header icon, styled like the theme toggle next to it. */
export function SupportButton({ className }: { className?: string }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => void api.openSupport()}
      className={cn("text-muted-foreground hover:bg-transparent hover:text-foreground", className)}
      aria-label={TITLE}
      title={TITLE}
    >
      <Coffee />
    </Button>
  );
}

/** The same as a line of text, for screens with room for it (Start, Summary). */
export function SupportLine({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center justify-center gap-1.5 text-xs text-muted-foreground", className)}>
      <Coffee className="size-3.5" />
      KHole is free.{" "}
      <button
        type="button"
        onClick={() => void api.openSupport()}
        className="underline underline-offset-2 hover:text-foreground"
      >
        Buy me a coffee
      </button>{" "}
      if it saves you time.
    </p>
  );
}
