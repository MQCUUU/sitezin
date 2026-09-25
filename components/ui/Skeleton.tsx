import type { HTMLAttributes } from "react";

import { cx } from "./cx";

export type SkeletonProps = HTMLAttributes<HTMLSpanElement> & {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
};

export function Skeleton({
  width,
  height,
  radius,
  className,
  style,
  ...rest
}: SkeletonProps) {
  return (
    <span
      className={cx("mc-ui-skeleton", className)}
      style={{
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
      aria-hidden="true"
      {...rest}
    />
  );
}
