import Link from "next/link";
import { Building2, UserRound, Users } from "lucide-react";

import { Poster } from "@/components/Poster";
import type { CastCredit, CrewCredit, PersonCredit } from "./types";

export type TitleCastSectionProps = {
  directors: CrewCredit[];
  writers: CrewCredit[];
  creators: PersonCredit[];
  cast: CastCredit[];
  companies: any[];
};

/**
 * Card de pessoa da área de produção (Direção/Roteiro/Criador) —
 * reaproveitado pelos três grupos, que só diferem em label e na lista de
 * pessoas (C4.3). Não é usado pelo card de elenco (title-cast-card),
 * que tem composição própria e não é alterado aqui.
 */
function ProductionPersonLink({ person, keyPrefix }: { person: PersonCredit; keyPrefix: string }) {
  return (
    <Link
      key={`${keyPrefix}-${person.id}`}
      href={`/person/${person.id}`}
      className="panel title-person-link"
      style={{
        padding: "14px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
      }}
    >
      {person.profile_path ? (
        <div className="mc-title-cast-avatar">
          {/* Nome é texto visível ao lado, dentro do mesmo link — a foto
              é decorativa para não duplicar o nome no accessible name. */}
          <Poster path={person.profile_path} alt="" sizes="58px" tmdbSize="w185" />
        </div>
      ) : (
        <UserRound size={28} aria-hidden="true" />
      )}

      <strong>{person.name}</strong>
    </Link>
  );
}

function ProductionCreditGroup({
  label,
  people,
  keyPrefix,
}: {
  label: string;
  people: PersonCredit[];
  keyPrefix: string;
}) {
  if (people.length === 0) return null;

  return (
    <div className="title-crew-group">
      <span className="title-crew-group-label">{label}</span>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "12px",
        }}
      >
        {people.map((person) => (
          <ProductionPersonLink key={`${keyPrefix}-${person.id}`} person={person} keyPrefix={keyPrefix} />
        ))}
      </div>
    </div>
  );
}

/**
 * Conteúdo inteiro da aba "cast": diretor/criadores, elenco principal e
 * produtoras, cada um em seu próprio painel ARIA (title-tabpanel-cast-1/2/3),
 * mais o estado vazio (cast-4) quando não há elenco/diretores/criadores —
 * companies pode coexistir com o vazio, exatamente como antes da C1.2.
 * Os ids e a ordem relativa dos painéis são os mesmos que
 * getContentTabPanelIds (components/title/content-tabs.ts) espera.
 */
export function TitleCastSection({
  directors,
  writers,
  creators,
  cast,
  companies,
}: TitleCastSectionProps) {
  return (
    <>
      {(directors.length > 0 || writers.length > 0 || creators.length > 0) && (
        <div
          role="tabpanel"
          id="title-tabpanel-cast-1"
          aria-labelledby="title-tab-cast"
        >
          <section className="section mc-title-section">
            <div className="title-section-heading">
              <span>Produção</span>

              <h2>Quem está por trás</h2>
            </div>

            <ProductionCreditGroup label="Direção" people={directors} keyPrefix="director" />

            <ProductionCreditGroup label="Roteiro" people={writers} keyPrefix="writer" />

            <ProductionCreditGroup
              label={creators.length > 1 ? "Criadores" : "Criador"}
              people={creators}
              keyPrefix="creator"
            />
          </section>
        </div>
      )}

      {cast.length > 0 && (
        <div
          role="tabpanel"
          id="title-tabpanel-cast-2"
          aria-labelledby="title-tab-cast"
        >
          <section className="section mc-title-section">
            <div className="title-section-heading">
              <span>Elenco</span>

              <h2>Principais atores</h2>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                gap: "14px",
              }}
            >
              {cast.map((person) => (
                <Link
                  key={person.id}
                  href={`/person/${person.id}`}
                  className="panel title-cast-card"
                  style={{ overflow: "hidden", padding: 0 }}
                >
                  {person.profile_path ? (
                    <div className="mc-title-cast-card-media">
                      {/* Nome já é texto visível logo abaixo, dentro do
                          mesmo link — a foto é decorativa aqui para não
                          duplicar o nome no accessible name do card. */}
                      <Poster
                        path={person.profile_path}
                        alt=""
                        sizes="(max-width: 700px) 45vw, 150px"
                        tmdbSize="w185"
                      />
                    </div>
                  ) : (
                    <div className="mc-title-cast-card-media mc-title-cast-card-fallback">
                      <Users size={32} aria-hidden="true" />
                    </div>
                  )}

                  <div style={{ padding: "11px" }}>
                    <strong style={{ display: "block", fontSize: "14px" }}>
                      {person.name}
                    </strong>

                    <span className="title-person-open-hint">Ver perfil</span>

                    {person.character && (
                      <span
                        className="muted"
                        style={{
                          display: "block",
                          marginTop: "4px",
                          fontSize: "12px",
                        }}
                      >
                        {person.character}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}

      {companies.length > 0 && (
        <div
          role="tabpanel"
          id="title-tabpanel-cast-3"
          aria-labelledby="title-tab-cast"
        >
          <section className="section mc-title-section">
            <div className="title-section-heading">
              <span>Produção</span>

              <h2>Produtoras</h2>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              {companies.map((company: any) => (
                <div
                  key={company.id}
                  className="panel"
                  style={{
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: "9px",
                  }}
                >
                  <Building2 size={17} />

                  <span>{company.name}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {cast.length === 0 && directors.length === 0 && writers.length === 0 && creators.length === 0 && (
        <div
          role="tabpanel"
          id="title-tabpanel-cast-4"
          aria-labelledby="title-tab-cast"
        >
          <div className="mc-title-section">
            <div className="mc-title-empty-state">
              Nenhuma informação de elenco ou equipe disponível.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
