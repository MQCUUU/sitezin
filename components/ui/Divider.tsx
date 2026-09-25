import { cx } from "./cx";

export type DividerProps = {
  orientation?: "horizontal" | "vertical";
  strong?: boolean;
  className?: string;
};

export function Divider({
  orientation = "horizontal",
  strong,
  className,
}: DividerProps) {
  return (
    <hr
      className={cx(
        "mc-divider",
        orientation === "vertical" && "mc-divider--vertical",
        strong && "mc-divider--strong",
        className
      )}
    />
  );
}
