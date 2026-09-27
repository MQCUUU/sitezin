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

/*
 * Créditos editoriais suportados (C4.3) — a Title page não é uma ficha
 * técnica exaustiva, só os papéis com peso editorial: direção e roteiro.
 * `sanitizeTitleDetails` já filtra `crew` para só esses jobs; este módulo
 * só sabe reagrupá-los, não decide o que entra no payload sanitizado.
 */
const DIRECTION_JOB = "Director";
const WRITING_JOBS = new Set(["Writer", "Screenplay", "Story"]);

export type EditorialCrew = {
  direction: CrewCredit[];
  writing: CrewCredit[];
};

/**
 * Agrupa créditos de crew já sanitizados em Direção e Roteiro.
 *
 * Dedupe é por pessoa (`id`) DENTRO de cada grupo — a mesma pessoa com
 * Writer + Screenplay aparece uma vez em `writing`, mantendo a primeira
 * ocorrência. Nunca deduplica ENTRE grupos: quem é Director e Writer no
 * mesmo título aparece uma vez em `direction` e uma vez em `writing`,
 * porque são papéis diferentes. Preserva a ordem de `crew` em cada grupo;
 * não ordena por nome/popularidade/id.
 */
export function groupEditorialCrew(crew: CrewCredit[]): EditorialCrew {
  const direction: CrewCredit[] = [];
  const writing: CrewCredit[] = [];
  const seenDirection = new Set<number>();
  const seenWriting = new Set<number>();

  for (const person of crew) {
    if (person.job === DIRECTION_JOB) {
      if (!seenDirection.has(person.id)) {
        seenDirection.add(person.id);
        direction.push(person);
      }
    } else if (person.job && WRITING_JOBS.has(person.job)) {
      if (!seenWriting.has(person.id)) {
        seenWriting.add(person.id);
        writing.push(person);
      }
    }
  }

  return { direction, writing };
}
