/**
 * Conceptual icon size scale for lucide-react, used by newly authored or
 * migrated shell components. Existing per-context sizes elsewhere in the
 * app are left as-is — this is not retrofitted app-wide in this phase.
 */
export const ICON_SIZE = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 22,
} as const;

export type IconSizeToken = keyof typeof ICON_SIZE;
