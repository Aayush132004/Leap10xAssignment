import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-[2px_3px_2px_4px] border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors placeholder:text-ink-200",
          "focus-visible:outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
