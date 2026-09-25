import { forwardRef } from "react";
import type { HTMLAttributes } from "react";

import { cx } from "./cx";

export type SurfaceVariant = "default" | "elevated" | "interactive" | "subtle";

export type SurfaceProps = HTMLAttributes<HTMLDivElement> & {
  variant?: SurfaceVariant;
};

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(
  function Surface({ variant = "default", className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={cx(
          "mc-surface",
          variant !== "default" && `mc-surface--${variant}`,
          variant === "interactive" && "mc-focusable",
          className
        )}
        {...rest}
      />
    );
  }
);
