import { cx } from "./cx";

export type SpinnerProps = {
  className?: string;
  "aria-label"?: string;
};

export function Spinner({
  className,
  "aria-label": ariaLabel = "Carregando",
}: SpinnerProps) {
  return (
    <span
      className={cx("mc-spinner", className)}
      role="status"
      aria-label={ariaLabel}
    />
  );
}
