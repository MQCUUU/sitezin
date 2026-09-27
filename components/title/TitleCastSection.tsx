import Link from "next/link";
import { Building2, UserRound, Users } from "lucide-react";

import { Poster } from "@/components/Poster";

export type TitleCastSectionProps = {
  directors: any[];
  creators: any[];
  cast: any[];
  companies: any[];
};

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
  creators,
  cast,
  companies,
}: TitleCastSectionProps) {
  return (
    <>
      {(directors.length > 0 || creators.length > 0) && (
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

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "12px",
              }}
            >
              {directors.map((person: any) => (
                <Link
                  key={`director-${person.id}`}
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
                      <Poster
                        path={person.profile_path}
                        alt={person.name}
                        sizes="58px"
                        tmdbSize="w185"
                      />
                    </div>
                  ) : (
                    <UserRound size={28} />
                  )}

                  <div>
                    <span className="muted">Diretor</span>

                    <strong style={{ display: "block", marginTop: "3px" }}>
                      {person.name}
                    </strong>
                  </div>
                </Link>
              ))}

              {creators.map((person: any) => (
                <Link
                  key={`creator-${person.id}`}
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
                      <Poster
                        path={person.profile_path}
                        alt={person.name}
                        sizes="58px"
                        tmdbSize="w185"
                      />
                    </div>
                  ) : (
                    <UserRound size={28} />
                  )}

                  <div>
                    <span className="muted">Criador</span>

                    <strong style={{ display: "block", marginTop: "3px" }}>
                      {person.name}
                    </strong>
                  </div>
                </Link>
              ))}
            </div>
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
              {cast.map((person: any) => (
                <Link
                  key={person.id}
                  href={`/person/${person.id}`}
                  className="panel title-cast-card"
                  style={{ overflow: "hidden", padding: 0 }}
                >
                  {person.profile_path ? (
                    <div className="mc-title-cast-card-media">
                      <Poster
                        path={person.profile_path}
                        alt={person.name}
                        sizes="(max-width: 700px) 45vw, 150px"
                        tmdbSize="w185"
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "2 / 3",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Users size={32} />
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

      {cast.length === 0 && directors.length === 0 && creators.length === 0 && (
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
