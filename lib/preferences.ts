export const PREFERENCES_KEY = "mycatalog.preferences.v1";

export type ThemePreference = "dark" | "light" | "oled";
export type DensityPreference = "comfortable" | "compact";
export type RadiusPreference = "rounded" | "soft" | "square";
export type MotionPreference = "full" | "reduced";

export type DefaultSortPreference =
  | "added"
  | "updated"
  | "rating"
  | "tmdb"
  | "az";

export type AppearancePreferences = {
  theme: ThemePreference;
  accent: string;
  density: DensityPreference;
  radius: RadiusPreference;
  motion: MotionPreference;
  defaultSort: DefaultSortPreference;
};

export const DEFAULT_PREFERENCES: AppearancePreferences = {
  theme: "dark",
  accent: "#8b5cf6",
  density: "comfortable",
  radius: "rounded",
  motion: "full",
  defaultSort: "added",
};

export const ACCENT_OPTIONS = [
  { name: "Violeta", value: "#8b5cf6" },
  { name: "Azul", value: "#3b82f6" },
  { name: "Ciano", value: "#06b6d4" },
  { name: "Verde", value: "#22c55e" },
  { name: "Rosa", value: "#ec4899" },
  { name: "Laranja", value: "#f97316" },
] as const;

export function readPreferences(): AppearancePreferences {
  if (typeof window === "undefined") {
    return DEFAULT_PREFERENCES;
  }

  try {
    const saved = localStorage.getItem(PREFERENCES_KEY);

    if (!saved) {
      return DEFAULT_PREFERENCES;
    }

    return {
      ...DEFAULT_PREFERENCES,
      ...JSON.parse(saved),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(
  preferences: AppearancePreferences
) {
  if (typeof window === "undefined") return;

  localStorage.setItem(
    PREFERENCES_KEY,
    JSON.stringify(preferences)
  );

  applyPreferences(preferences);

  window.dispatchEvent(
    new CustomEvent("mycatalog-preferences-updated")
  );
}

export function applyPreferences(
  preferences: AppearancePreferences
) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;

  root.dataset.theme = preferences.theme;
  root.dataset.density = preferences.density;
  root.dataset.radius = preferences.radius;
  root.dataset.motion = preferences.motion;

  root.style.setProperty(
    "--accent",
    preferences.accent
  );

  root.style.setProperty(
    "--accent2",
    preferences.accent
  );
}