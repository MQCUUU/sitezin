import type { HTMLAttributes } from "react";

import { cx } from "./cx";

export type BadgeVariant = "neutral" | "accent" | "success" | "warning" | "danger";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export function Badge({ variant = "neutral", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cx(
        "mc-badge",
        variant !== "neutral" && `mc-badge--${variant}`,
        className
      )}
      {...rest}
    />
  );
}
