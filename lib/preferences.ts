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

const THEMES: ThemePreference[] = ["dark", "light", "oled"];
const DENSITIES: DensityPreference[] = ["comfortable", "compact"];
const RADII: RadiusPreference[] = ["rounded", "soft", "square"];
const MOTIONS: MotionPreference[] = ["full", "reduced"];
const SORTS: DefaultSortPreference[] = ["added", "updated", "rating", "tmdb", "az"];

const pick = <T extends string>(list: T[], value: unknown, fallback: T): T => (list.includes(value as T) ? (value as T) : fallback);

/** Só valores conhecidos (o que vem do servidor ou do localStorage nunca é aplicado cru). */
export function sanitizePreferences(input: unknown): AppearancePreferences {
  const value = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const accent = typeof value.accent === "string" && /^#[0-9a-f]{6}$/i.test(value.accent) ? value.accent.toLowerCase() : DEFAULT_PREFERENCES.accent;

  return {
    theme: pick(THEMES, value.theme, DEFAULT_PREFERENCES.theme),
    accent,
    density: pick(DENSITIES, value.density, DEFAULT_PREFERENCES.density),
    radius: pick(RADII, value.radius, DEFAULT_PREFERENCES.radius),
    motion: pick(MOTIONS, value.motion, DEFAULT_PREFERENCES.motion),
    defaultSort: pick(SORTS, value.defaultSort, DEFAULT_PREFERENCES.defaultSort),
  };
}

export function readPreferences(): AppearancePreferences {
  if (typeof window === "undefined") {
    return DEFAULT_PREFERENCES;
  }

  try {
    const saved = localStorage.getItem(PREFERENCES_KEY);

    if (!saved) {
      return DEFAULT_PREFERENCES;
    }

    return sanitizePreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(saved) });
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function storeLocally(preferences: AppearancePreferences) {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // armazenamento indisponível: vale só nesta aba
  }

  applyPreferences(preferences);
  window.dispatchEvent(new CustomEvent("mycatalog-preferences-updated"));
}

let accountTimer: number | undefined;

/**
 * Salva na CONTA (valem em qualquer navegador/aparelho). Agrupa cliques em
 * sequência; sem sessão (401) ou sem rede, fica só no navegador.
 */
export function saveToAccount(preferences: AppearancePreferences) {
  if (typeof window === "undefined") return;

  window.clearTimeout(accountTimer);
  accountTimer = window.setTimeout(() => {
    fetch("/api/profile/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appearance: preferences }),
      keepalive: true,
    }).catch(() => {});
  }, 400);
}

export function savePreferences(
  preferences: AppearancePreferences
) {
  if (typeof window === "undefined") return;

  const clean = sanitizePreferences(preferences);

  storeLocally(clean);
  saveToAccount(clean);
}

/** Aplica o que veio da conta (sem reenviar). */
export function applyAccountPreferences(preferences: unknown) {
  if (typeof window === "undefined") return;

  storeLocally(sanitizePreferences(preferences));
}

/* V3.3 — contraste (WCAG) do destaque. */
const LIGHT_BG = "#f5f6f8";

function rgbOf(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function luminance(rgb: number[]) {
  const [r, g, b] = rgb.map((value) => {
    const x = value / 255;

    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string) {
  const [x, y] = [luminance(rgbOf(a)), luminance(rgbOf(b))].sort((p, q) => q - p);

  return (x + 0.05) / (y + 0.05);
}

/**
 * Escurece o destaque (mesmo matiz) só o necessário para ler como texto
 * (≥ 4.5:1) sobre o fundo claro. Ciano/Verde/Laranja puros ficavam ~2:1 no
 * tema Claro (eyebrows, links e botões ilegíveis). No Escuro/OLED não muda.
 */
export function readableAccent(accent: string, background = LIGHT_BG, minimum = 4.5) {
  const base = rgbOf(accent);
  let factor = 0;
  let current = accent;

  while (contrastRatio(current, background) < minimum && factor < 0.9) {
    factor += 0.02;
    current = `#${base.map((value) => Math.round(value * (1 - factor)).toString(16).padStart(2, "0")).join("")}`;
  }

  return current;
}

export function applyPreferences(
  preferences: AppearancePreferences
) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const accent = preferences.theme === "light" ? readableAccent(preferences.accent) : preferences.accent;

  root.dataset.theme = preferences.theme;
  root.dataset.density = preferences.density;
  root.dataset.radius = preferences.radius;
  root.dataset.motion = preferences.motion;

  root.style.setProperty(
    "--accent",
    accent
  );

  root.style.setProperty(
    "--accent2",
    accent
  );

  // Texto SOBRE o destaque (botão primário): branco ou quase-preto, o que ler melhor.
  root.style.setProperty("--on-accent", onAccent(accent));
}

export function onAccent(accent: string) {
  return contrastRatio(accent, "#ffffff") >= contrastRatio(accent, "#0b0d12") ? "#ffffff" : "#0b0d12";
}