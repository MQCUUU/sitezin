/*
 * Área principal de uma pessoa (TMDB `known_for_department`) em português.
 * Uma tabela só: antes havia três cópias (página, metadata e busca), com
 * traduções diferentes ("Edição" × "Montagem") e a busca mostrava "Directing".
 */
const DEPARTMENT: Record<string, string> = {
  Acting: "Atuação",
  Directing: "Direção",
  Writing: "Roteiro",
  Production: "Produção",
  Creator: "Criação",
  Camera: "Fotografia",
  Editing: "Montagem",
  Sound: "Trilha sonora",
  Art: "Direção de arte",
  "Costume & Make-Up": "Figurino e maquiagem",
  "Visual Effects": "Efeitos visuais",
  Lighting: "Iluminação",
  Crew: "Equipe",
};

/** Tradução da área; sem valor conhecido, devolve `fallback`. */
export function departmentLabel(value?: string | null, fallback = "Cinema e TV"): string {
  if (!value) return fallback;
  return DEPARTMENT[value] ?? fallback;
}

/** Só a tradução conhecida (para a metadata, que omite a área se não souber). */
export function knownDepartment(value?: string | null): string | undefined {
  return value ? DEPARTMENT[value] : undefined;
}
