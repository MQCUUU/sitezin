import { forwardRef } from "react";

import { cx } from "./cx";
import { Surface } from "./Surface";
import type { SurfaceProps } from "./Surface";

export type CardProps = SurfaceProps;

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, ...rest },
  ref
) {
  return <Surface ref={ref} className={cx("mc-card", className)} {...rest} />;
});
