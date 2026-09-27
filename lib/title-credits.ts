/*
 * Contrato interno (sanitizado) de créditos de título.
 *
 * Compartilhado por SSR (lib/title-details.ts), a rota espelho
 * (app/api/tmdb/[type]/[id]/route.ts) e a UI (TitleView,
 * TitleCastSection) — as três camadas devem enxergar exatamente os
 * mesmos campos para cast/crew/created_by.
 *
 * Não modela o payload cru do TMDB inteiro, só os campos que
 * sanitizeTitleDetails já produz e a UI já consome (C4.1). Ampliar
 * esse contrato (outros cargos de crew, aggregate_credits, dedupe) é
 * decisão de fase posterior, não deste módulo.
 */

export type PersonCredit = {
  id: number;
  name: string;
  profile_path: string | null;
};

export type CastCredit = PersonCredit & {
  character: string | null;
  order: number | null;
};

export type CrewCredit = PersonCredit & {
  department: string | null;
  job: string | null;
};

export type TitleCreditsData = {
  cast: CastCredit[];
  crew: CrewCredit[];
};
