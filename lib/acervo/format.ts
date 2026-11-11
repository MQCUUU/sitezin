/** Cópia de formatRuntime (lib/home/home.ts): import de valor com extensão .ts quebra o typecheck. */
function formatRuntime(minutes: number | null | undefined) {
  const m = Number(minutes);

  if (!Number.isFinite(m) || m <= 0) return null;

  const h = Math.floor(m / 60);
  const rest = Math.round(m % 60);

  return h ? (rest ? `${h}h ${String(rest).padStart(2, "0")}min` : `${h}h`) : `${rest} min`;
}

const n = (value: number) => value.toLocaleString("pt-BR");

/** "214 títulos, cerca de 312 horas" — só a contagem quando não há minutos. */
export function formatCountAndHours(count: number, minutes: number): string {
  const base = `${n(count)} ${count === 1 ? "título" : "títulos"}`;

  if (!Number.isFinite(minutes) || minutes <= 0) return base;
  if (minutes < 60) return `${base}, menos de 1 hora`;

  const hours = Math.round(minutes / 60);

  return `${base}, cerca de ${n(hours)} ${hours === 1 ? "hora" : "horas"}`;
}

/** "3 filmes, 7h 37min, média 8,0" */
export function collectionFicha(movies: number, runtimeMinutes: number | null, average: number | null): string {
  const parts = [`${n(movies)} ${movies === 1 ? "filme" : "filmes"}`];
  const runtime = formatRuntime(runtimeMinutes);

  if (runtime) parts.push(runtime);
  if (typeof average === "number" && average > 0) parts.push(`média ${average.toFixed(1).replace(".", ",")}`);

  return parts.join(", ");
}

export type DecadeGroup<T> = { decade: number | null; label: string; items: T[] };

/** Agrupa por década (decrescente); itens sem ano vão por último em "Sem data". */
export function groupByDecade<T>(items: T[], year: (item: T) => string): DecadeGroup<T>[] {
  const byDecade = new Map<number, T[]>();
  const undated: T[] = [];

  for (const item of items) {
    const y = Number.parseInt(year(item), 10);

    if (!Number.isFinite(y)) {
      undated.push(item);
      continue;
    }

    const decade = Math.floor(y / 10) * 10;

    byDecade.set(decade, [...(byDecade.get(decade) ?? []), item]);
  }

  const groups: DecadeGroup<T>[] = [...byDecade.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([decade, list]) => ({ decade, label: `Anos ${decade}`, items: list }));

  if (undated.length) groups.push({ decade: null, label: "Sem data", items: undated });

  return groups;
}
