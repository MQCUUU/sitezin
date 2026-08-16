"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useParams,
} from "next/navigation";

import Link from "next/link";

import {
  BriefcaseBusiness,
  Cake,
  CalendarDays,
  Clapperboard,
  Film,
  Loader2,
  MapPin,
  Sparkles,
  Star,
  Tv,
  UserRound,
} from "lucide-react";

import {
  Search,
} from "@/components/Search";

import {
  SmartBackButton,
} from "@/components/SmartBackButton";

import {
  img,
} from "@/lib/tmdb";

type Person = {
  id: number;
  name: string;
  profile_path:
    | string
    | null;
  known_for_department?:
    string;
  biography?:
    string;
  birthday?:
    string |
    null;
  deathday?:
    string |
    null;
  place_of_birth?:
    string |
    null;
  also_known_as?:
    string[];
  homepage?:
    string |
    null;
  popularity?:
    number;
};

type Credit = {
  id: number;
  media_type:
    | "movie"
    | "tv";
  title?: string;
  name?: string;
  poster_path?:
    | string
    | null;
  backdrop_path?:
    | string
    | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  character?: string;
  job?: string;
  department?: string;
  roles?: string[];
  [key: string]: any;
};

async function safeJson(
  response:
    Response
) {
  const type =
    response.headers.get(
      "content-type"
    ) ||
    "";

  if (
    !type.includes(
      "application/json"
    )
  ) {
    throw new Error(
      `A rota não retornou JSON (${response.status}).`
    );
  }

  return response.json();
}

function formatDate(
  value?:
    string |
    null
) {
  if (!value) {
    return "";
  }

  const [
    year,
    month,
    day,
  ] =
    value.split("-");

  if (
    !year ||
    !month ||
    !day
  ) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

function getYear(
  item:
    Credit
) {
  return (
    item.release_date ||
    item.first_air_date ||
    ""
  ).slice(
    0,
    4
  );
}

function getTitle(
  item:
    Credit
) {
  return (
    item.title ||
    item.name ||
    "Sem título"
  );
}

function translateDepartment(
  value?:
    string
) {
  const map:
    Record<
      string,
      string
    > = {
      Acting:
        "Atuação",
      Directing:
        "Direção",
      Writing:
        "Roteiro",
      Production:
        "Produção",
      Camera:
        "Fotografia",
      Editing:
        "Edição",
      Sound:
        "Som",
      Art:
        "Arte",
      Crew:
        "Equipe",
    };

  return (
    map[
      value ||
      ""
    ] ||
    value ||
    "Cinema e TV"
  );
}

export default function PersonPage() {
  const params =
    useParams<{
      id:
        string;
    }>();

  const [
    person,
    setPerson,
  ] =
    useState<
      Person |
      null
    >(null);

  const [
    credits,
    setCredits,
  ] =
    useState<
      Credit[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    showAllMovies,
    setShowAllMovies,
  ] =
    useState(false);

  const [
    showAllSeries,
    setShowAllSeries,
  ] =
    useState(false);

  useEffect(() => {
    let cancelled =
      false;

    async function load() {
      if (
        !params.id
      ) {
        return;
      }

      try {
        setLoading(
          true
        );

        setError(
          ""
        );

        const response =
          await fetch(
            `/api/person/${params.id}/credits`
          );

        const data =
          await safeJson(
            response
          );

        if (
          !response.ok ||
          data?.error
        ) {
          throw new Error(
            data?.error ||
              "Não foi possível carregar a pessoa."
          );
        }

        if (
          cancelled
        ) {
          return;
        }

        setPerson(
          data.person ||
            null
        );

        setCredits(
          Array.isArray(
            data.results
          )
            ? data.results
            : []
        );
      } catch (
        error
      ) {
        if (
          !cancelled
        ) {
          setError(
            error instanceof Error
              ? error.message
              : "Erro ao carregar pessoa."
          );
        }
      } finally {
        if (
          !cancelled
        ) {
          setLoading(
            false
          );
        }
      }
    }

    load();

    return () => {
      cancelled =
        true;
    };
  }, [
    params.id,
  ]);

  const movies =
    useMemo(
      () =>
        credits.filter(
          (
            item
          ) =>
            item.media_type ===
            "movie"
        ),
      [
        credits,
      ]
    );

  const series =
    useMemo(
      () =>
        credits.filter(
          (
            item
          ) =>
            item.media_type ===
            "tv"
        ),
      [
        credits,
      ]
    );

  const knownFor =
    useMemo(
      () =>
        credits
          .filter(
            (
              item
            ) =>
              item.poster_path
          )
          .slice(
            0,
            8
          ),
      [
        credits,
      ]
    );

  const backdrop =
    useMemo(
      () =>
        credits.find(
          (
            item
          ) =>
            item.backdrop_path
        )?.backdrop_path ||
        null,
      [
        credits,
      ]
    );

  const careerYears =
    useMemo(
      () => {
        const years =
          credits
            .map(
              getYear
            )
            .filter(
              Boolean
            )
            .map(
              Number
            )
            .filter(
              (
                value
              ) =>
                Number.isFinite(
                  value
                ) &&
                value >
                  1800
            );

        if (
          years.length ===
          0
        ) {
          return null;
        }

        return {
          first:
            Math.min(
              ...years
            ),
          last:
            Math.max(
              ...years
            ),
        };
      },
      [
        credits,
      ]
    );

  const averageRating =
    useMemo(
      () => {
        const ratings =
          credits
            .filter(
              (
                item
              ) =>
                Number(
                  item.vote_count ||
                    0
                ) >=
                50
            )
            .map(
              (
                item
              ) =>
                Number(
                  item.vote_average ||
                    0
                )
            )
            .filter(
              (
                value
              ) =>
                value >
                0
            );

        if (
          ratings.length ===
          0
        ) {
          return null;
        }

        return (
          ratings.reduce(
            (
              total,
              value
            ) =>
              total +
              value,
            0
          ) /
          ratings.length
        );
      },
      [
        credits,
      ]
    );

  if (
    loading
  ) {
    return (
      <>
        <div className="topbar">
          <Search />
        </div>

        <div className="empty">
          <Loader2
            size={24}
            className="spin"
          />
          Carregando pessoa...
        </div>
      </>
    );
  }

  if (
    error ||
    !person
  ) {
    return (
      <>
        <div className="topbar">
          <Search />
        </div>

        <div className="empty">
          {error ||
            "Pessoa não encontrada."}
        </div>
      </>
    );
  }

  const visibleMovies =
    showAllMovies
      ? movies
      : movies.slice(
          0,
          12
        );

  const visibleSeries =
    showAllSeries
      ? series
      : series.slice(
          0,
          12
        );

  return (
    <>
      <div className="topbar">
        <Search />
      </div>

      <div className="title-back-wrap">
        <SmartBackButton />
      </div>

      {/* ======================================
          HERO
          ====================================== */}

      <section className="person-hero">
        {backdrop && (
          <div
            className="person-hero-backdrop"
            style={{
              backgroundImage:
                `url(${img(
                  backdrop,
                  "w1280"
                )})`,
            }}
          />
        )}

        <div className="person-hero-overlay" />

        <div className="person-hero-content">
          <div className="person-portrait-wrap">
            {person.profile_path ? (
              <img loading="lazy" decoding="async"
                src={img(
                  person.profile_path,
                  "w500"
                )}
                alt={
                  person.name
                }
                className="person-portrait"
              />
            ) : (
              <div className="person-portrait person-portrait-empty">
                <UserRound
                  size={56}
                />
              </div>
            )}
          </div>

          <div className="person-hero-copy">
            <div className="person-kicker">
              <Sparkles
                size={15}
              />

              {translateDepartment(
                person.known_for_department
              )}
            </div>

            <h1>
              {
                person.name
              }
            </h1>

            {person.also_known_as &&
              person.also_known_as.length >
                0 && (
              <p className="person-alias">
                Também conhecido(a) como{" "}
                {
                  person.also_known_as[
                    0
                  ]
                }
              </p>
            )}

            <div className="person-hero-stats">
              <div>
                <strong>
                  {
                    credits.length
                  }
                </strong>

                <span>
                  Trabalhos
                </span>
              </div>

              <div>
                <strong>
                  {
                    movies.length
                  }
                </strong>

                <span>
                  Filmes
                </span>
              </div>

              <div>
                <strong>
                  {
                    series.length
                  }
                </strong>

                <span>
                  Séries
                </span>
              </div>

              {averageRating !==
                null && (
                <div>
                  <strong>
                    {averageRating.toFixed(
                      1
                    )}
                  </strong>

                  <span>
                    Média TMDB
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ======================================
          SOBRE + FICHA
          ====================================== */}

      <section className="section person-about-grid">
        <div className="panel person-biography-panel">
          <div className="person-section-heading">
            <div>
              <span>
                Sobre
              </span>

              <h2>
                Biografia
              </h2>
            </div>
          </div>

          {person.biography ? (
            <p>
              {
                person.biography
              }
            </p>
          ) : (
            <div className="person-no-biography">
              <UserRound
                size={24}
              />

              <span>
                O TMDB ainda não possui uma biografia em português para esta pessoa.
              </span>
            </div>
          )}
        </div>

        <aside className="panel person-info-panel">
          <div className="person-section-heading">
            <div>
              <span>
                Perfil
              </span>

              <h2>
                Informações
              </h2>
            </div>
          </div>

          <div className="person-info-list">
            {person.birthday && (
              <div className="person-info-row">
                <Cake
                  size={17}
                />

                <div>
                  <span>
                    Nascimento
                  </span>

                  <strong>
                    {formatDate(
                      person.birthday
                    )}
                  </strong>
                </div>
              </div>
            )}

            {person.deathday && (
              <div className="person-info-row">
                <CalendarDays
                  size={17}
                />

                <div>
                  <span>
                    Falecimento
                  </span>

                  <strong>
                    {formatDate(
                      person.deathday
                    )}
                  </strong>
                </div>
              </div>
            )}

            {person.place_of_birth && (
              <div className="person-info-row">
                <MapPin
                  size={17}
                />

                <div>
                  <span>
                    Local
                  </span>

                  <strong>
                    {
                      person.place_of_birth
                    }
                  </strong>
                </div>
              </div>
            )}

            <div className="person-info-row">
              <BriefcaseBusiness
                size={17}
              />

              <div>
                <span>
                  Área principal
                </span>

                <strong>
                  {translateDepartment(
                    person.known_for_department
                  )}
                </strong>
              </div>
            </div>

            {careerYears && (
              <div className="person-info-row">
                <Clapperboard
                  size={17}
                />

                <div>
                  <span>
                    Carreira no catálogo
                  </span>

                  <strong>
                    {careerYears.first}
                    {" — "}
                    {careerYears.last}
                  </strong>
                </div>
              </div>
            )}
          </div>
        </aside>
      </section>

      {/* ======================================
          MAIS CONHECIDO
          ====================================== */}

      {knownFor.length >
        0 && (
        <section className="section">
          <div className="person-section-heading person-section-heading-row">
            <div>
              <span>
                Destaques
              </span>

              <h2>
                Mais conhecido por
              </h2>
            </div>

            <span className="muted">
              Trabalhos mais populares
            </span>
          </div>

          <div className="person-known-grid">
            {knownFor.map(
              (
                item
              ) => (
                <PersonCreditCard
                  key={`${item.media_type}-${item.id}`}
                  item={
                    item
                  }
                  featured
                />
              )
            )}
          </div>
        </section>
      )}

      {/* ======================================
          FILMES
          ====================================== */}

      {movies.length >
        0 && (
        <PersonCreditsSection
          title="Filmes"
          subtitle={`${movies.length} trabalhos no cinema`}
          items={
            visibleMovies
          }
          total={
            movies.length
          }
          icon="movie"
          expanded={
            showAllMovies
          }
          onToggle={() =>
            setShowAllMovies(
              (
                value
              ) =>
                !value
            )
          }
        />
      )}

      {/* ======================================
          SÉRIES
          ====================================== */}

      {series.length >
        0 && (
        <PersonCreditsSection
          title="Séries"
          subtitle={`${series.length} trabalhos em televisão`}
          items={
            visibleSeries
          }
          total={
            series.length
          }
          icon="tv"
          expanded={
            showAllSeries
          }
          onToggle={() =>
            setShowAllSeries(
              (
                value
              ) =>
                !value
            )
          }
        />
      )}
    </>
  );
}

function PersonCreditsSection({
  title,
  subtitle,
  items,
  total,
  icon,
  expanded,
  onToggle,
}: {
  title:
    string;
  subtitle:
    string;
  items:
    Credit[];
  total:
    number;
  icon:
    "movie" |
    "tv";
  expanded:
    boolean;
  onToggle:
    () =>
      void;
}) {
  return (
    <section className="section">
      <div className="person-section-heading person-section-heading-row">
        <div className="person-credit-heading">
          <div className="person-credit-heading-icon">
            {icon ===
            "movie" ? (
              <Film
                size={18}
              />
            ) : (
              <Tv
                size={18}
              />
            )}
          </div>

          <div>
            <span>
              Filmografia
            </span>

            <h2>
              {
                title
              }
            </h2>

            <small>
              {
                subtitle
              }
            </small>
          </div>
        </div>
      </div>

      <div className="person-credit-grid">
        {items.map(
          (
            item
          ) => (
            <PersonCreditCard
              key={`${item.media_type}-${item.id}`}
              item={
                item
              }
            />
          )
        )}
      </div>

      {total >
        12 && (
        <div className="person-show-more">
          <button
            type="button"
            className="btn"
            onClick={
              onToggle
            }
          >
            {expanded
              ? "Mostrar menos"
              : `Ver todos (${total})`}
          </button>
        </div>
      )}
    </section>
  );
}

function PersonCreditCard({
  item,
  featured =
    false,
}: {
  item:
    Credit;
  featured?:
    boolean;
}) {
  const title =
    getTitle(
      item
    );

  const year =
    getYear(
      item
    );

  const role =
    (
      item.roles ||
      []
    )
      .filter(
        Boolean
      )
      .slice(
        0,
        2
      )
      .join(
        " · "
      ) ||
    item.character ||
    item.job ||
    "";

  return (
    <Link
      href={`/title/${item.media_type}/${item.id}`}
      className={
        featured
          ? "person-work-card featured"
          : "person-work-card"
      }
    >
      <div className="person-work-poster">
        {item.poster_path ? (
          <img
            src={img(
              item.poster_path
            )}
            alt={
              title
            }
            loading="lazy"
          />
        ) : (
          <div className="person-work-poster-empty">
            {item.media_type ===
            "tv" ? (
              <Tv
                size={26}
              />
            ) : (
              <Film
                size={26}
              />
            )}
          </div>
        )}

        <span className="badge">
          {item.media_type ===
          "tv"
            ? "SÉRIE"
            : "FILME"}
        </span>
      </div>

      <div className="person-work-body">
        <strong>
          {
            title
          }
        </strong>

        <div className="person-work-meta">
          <span>
            {year ||
              "—"}
          </span>

          {Number(
            item.vote_average ||
              0
          ) >
            0 && (
            <span className="rating">
              <Star
                size={11}
                fill="currentColor"
              />

              {Number(
                item.vote_average
              ).toFixed(
                1
              )}
            </span>
          )}
        </div>

        {role && (
          <span className="person-work-role">
            {
              role
            }
          </span>
        )}
      </div>
    </Link>
  );
}