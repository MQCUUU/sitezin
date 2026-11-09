import "@/styles/features/discover.css";
import "@/styles/features/screen-kit.css";
import { useRef } from "react";

import type { DiscoverSort } from "@/lib/discover/params";

/*
 * V2.9 — UM controle de ordenação (antes: atalhos + "Ordenar por" faziam a mesma
 * coisa). Grupo de rádio acessível: setas movem a seleção; no celular os rótulos
 * encurtam. A linha abaixo explica o critério ativo — por que estes resultados.
 */
const OPTIONS: { value: DiscoverSort; label: string; short: string; hint: string }[] = [
  { value: "popular", label: "Mais populares", short: "Populares", hint: "Ordenado pela popularidade no TMDB." },
  {
    value: "rating",
    label: "Mais bem avaliados",
    short: "Bem avaliados",
    hint: "Nota do TMDB, só entre títulos com pelo menos 500 avaliações.",
  },
  {
    value: "newest",
    label: "Mais recentes",
    short: "Recentes",
    hint: "Já lançados, do mais novo para o mais antigo (com pelo menos 10 avaliações).",
  },
];

export function DiscoverSortControl({ value, onChange }: { value: DiscoverSort; onChange: (sort: DiscoverSort) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const active = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;

    if (!delta) return;
    event.preventDefault();

    const next = (index + delta + OPTIONS.length) % OPTIONS.length;

    onChange(OPTIONS[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div className="dc-sort">
      <div className="sk-chips" role="radiogroup" aria-label="Ordenar por" aria-describedby="discover-sort-hint">
        {OPTIONS.map((option, index) => {
          const checked = option.value === active.value;

          return (
            <button
              key={option.value}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              className="sk-chip"
              aria-label={option.label}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <span className="dc-sort-full">{option.label}</span>
              <span className="dc-sort-short" aria-hidden="true">
                {option.short}
              </span>
            </button>
          );
        })}
      </div>
      <p id="discover-sort-hint" className="sk-hint">
        {active.hint}
      </p>
    </div>
  );
}
