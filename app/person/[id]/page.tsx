"use client";


import "@/styles/features/person.css";
import "@/styles/features/screen-kit.css";
import { motion } from "motion/react";
import { mediaTypeLabel } from "@/components/media/MediaBadges";
import { MediaCard, MediaCardImage, MediaCardMeta } from "@/components/media";
import { Poster } from "@/components/Poster";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";

import Link from "next/link";

import {
  Film,
  Loader2,
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
import { ConnectedPosterActions } from "@/components/media/ConnectedPosterActions";

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

  /*
   * Aba e "ver todos" ficam na URL (?tab=acting&ver=filmes,series), trocados com
   * `replace` (não enchem o histórico). Assim, abrir um filme da filmografia e
   * voltar devolve a mesma aba, a lista do mesmo tamanho e — pelo ScrollMemory —
   * a mesma posição de rolagem. Antes ficavam só na memória e voltavam para a
   * Biografia.
   */
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const contentTab: "bio" | "acting" | "other" = tabParam === "acting" || tabParam === "other" ? tabParam : "bio";
  const expanded = new Set((searchParams.get("ver") || "").split(",").filter(Boolean));
  const showAllMovies = expanded.has("filmes");
  const showAllSeries = expanded.has("series");

  const updateQuery = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const setContentTab = (value: "bio" | "acting" | "other") =>
    updateQuery((params) => {
      if (value === "bio") params.delete("tab");
      else params.set("tab", value);
    });
  const toggleExpanded = (key: "filmes" | "series") =>
    updateQuery((params) => {
      const next = new Set(expanded);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (next.size) params.set("ver", [...next].join(","));
      else params.delete("ver");
    });

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

  const actingCredits = useMemo(() => credits.filter((item) => item.credit_kind === "cast" || Boolean(item.character)), [credits]);
  const otherCredits = useMemo(() => credits.filter((item) => item.credit_kind === "crew" && !item.character), [credits]);

  const movies =
    useMemo(
      () =>
        actingCredits.filter(
          (
            item
          ) =>
            item.media_type ===
            "movie"
        ),
      [
        actingCredits,
      ]
    );

  const series =
    useMemo(
      () =>
        actingCredits.filter(
          (
            item
          ) =>
            item.media_type ===
            "tv"
        ),
      [
        actingCredits,
      ]
    );

  const knownFor =
    useMemo(
      () =>
        otherCredits
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
        otherCredits,
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

      {/* Fase 4b: o topo fica sempre à vista; as abas trocam só o conteúdo abaixo. */}
      <section className="sk-hero">
        {backdrop && (
          <div className="sk-hero-backdrop" aria-hidden="true" style={{ backgroundImage: `url(${img(backdrop, "w1280")})` }} />
        )}

        <div className="sk-hero-content">
          <div className="sk-hero-poster">
            {person.profile_path ? (
              <Poster path={person.profile_path} alt={person.name} sizes="(max-width: 700px) 120px, 220px" priority />
            ) : (
              <div className="sk-hero-poster-empty">
                <UserRound size={48} aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="sk-hero-copy">
            <p className="sk-hero-kicker">{translateDepartment(person.known_for_department)}</p>
            <h1>{person.name}</h1>
            {person.also_known_as && person.also_known_as.length > 0 && person.also_known_as[0] !== person.name ? (
              <p className="sk-hero-sub">Também conhecido(a) como {person.also_known_as[0]}</p>
            ) : null}

            <dl className="sk-stats">
              <div>
                <dt>Trabalhos</dt>
                <dd>{credits.length}</dd>
              </div>
              <div>
                <dt>Filmes</dt>
                <dd>{movies.length}</dd>
              </div>
              <div>
                <dt>Séries</dt>
                <dd>{series.length}</dd>
              </div>
              {averageRating !== null && (
                <div>
                  <dt>Média no TMDB</dt>
                  <dd>{averageRating.toFixed(1).replace(".", ",")}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </section>

      <div className="sk-tabs pp-tabs" role="tablist" aria-label="Seções da pessoa">
        {(
          [
            ["bio", "Biografia"],
            ["acting", "Atuação"],
            ["other", "Outros trabalhos"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={contentTab === value}
            className="sk-tab"
            onClick={() => setContentTab(value)}
          >
            {label}
            {contentTab === value && (
              <motion.span
                layoutId="person-tab-indicator"
                className="sk-tab-indicator"
                transition={{ type: "spring", duration: 0.32, bounce: 0 }}
                aria-hidden="true"
              />
            )}
          </button>
        ))}
      </div>

      {contentTab === "bio" && (
        <section className="pp-about">
          <div className="pp-bio">
            <h2>Biografia</h2>
            {person.biography ? (
              <p>{person.biography}</p>
            ) : (
              <p className="pp-muted">O TMDB ainda não tem uma biografia em português para esta pessoa.</p>
            )}
          </div>

          <dl className="pp-facts">
            {person.birthday && (
              <div>
                <dt>Nascimento</dt>
                <dd>{formatDate(person.birthday)}</dd>
              </div>
            )}
            {person.deathday && (
              <div>
                <dt>Falecimento</dt>
                <dd>{formatDate(person.deathday)}</dd>
              </div>
            )}
            {person.place_of_birth && (
              <div>
                <dt>Local de nascimento</dt>
                <dd>{person.place_of_birth}</dd>
              </div>
            )}
            <div>
              <dt>Área principal</dt>
              <dd>{translateDepartment(person.known_for_department)}</dd>
            </div>
            {careerYears && (
              <div>
                <dt>Carreira no catálogo</dt>
                <dd>
                  {careerYears.first} a {careerYears.last}
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {contentTab === "other" && knownFor.length > 0 && (
        <section className="sk-section pp-section">
          <div className="sk-section-head">
            <div>
              <h2>Mais conhecido por</h2>
              <p>Os trabalhos mais populares, em qualquer função.</p>
            </div>
          </div>

          <div className="person-known-grid">
            {knownFor.map((item) => (
              <PersonCreditCard key={`${item.media_type}-${item.id}`} item={item} featured />
            ))}
          </div>
        </section>
      )}

      {contentTab === "acting" && movies.length > 0 && (
        <PersonCreditsSection
          title="Filmes"
          total={movies.length}
          items={visibleMovies}
          expanded={showAllMovies}
          onToggle={() => toggleExpanded("filmes")}
        />
      )}

      {contentTab === "acting" && series.length > 0 && (
        <PersonCreditsSection
          title="Séries"
          total={series.length}
          items={visibleSeries}
          expanded={showAllSeries}
          onToggle={() => toggleExpanded("series")}
        />
      )}

      {contentTab === "acting" && movies.length === 0 && series.length === 0 && (
        <div className="sk-empty">
          <h2>Nenhum trabalho como ator ou atriz</h2>
          <p>Veja a aba Outros trabalhos.</p>
        </div>
      )}
      {contentTab === "other" && knownFor.length === 0 && (
        <div className="sk-empty">
          <h2>Nenhum outro trabalho encontrado</h2>
        </div>
      )}
    </>
  );
}

function PersonCreditsSection({
  title,
  items,
  total,
  expanded,
  onToggle,
}: {
  title: string;
  items: Credit[];
  total: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="sk-section pp-section">
      <div className="sk-section-head">
        <h2>
          {title} <span className="pp-count">{total}</span>
        </h2>
      </div>

      <div className="person-credit-grid">
        {items.map((item) => (
          <PersonCreditCard key={`${item.media_type}-${item.id}`} item={item} />
        ))}
      </div>

      {total > 12 && (
        <div className="person-show-more">
          <button type="button" className="btn" onClick={onToggle}>
            {expanded ? "Mostrar menos" : `Ver todos os ${total}`}
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
        ", "
      ) ||
    item.character ||
    item.job ||
    "";

  const href = `/title/${item.media_type}/${item.id}`;

  const rating = Number(item.vote_average || 0);

  /* Fase 3: mesmo cartão de mídia das grades (MediaCard) — antes era um cartão próprio, com <img> cru. */
  return (
    <MediaCard className={featured ? "person-work-card featured" : "person-work-card"}>
      <MediaCardImage className="mc-pa-host">
        {/* Pôster (atalho decorativo) + botões do pôster FORA do link; o link acessível é o nome. */}
        <Link href={href} tabIndex={-1} aria-hidden="true" className="poster-link">
          {item.poster_path ? (
            <Poster
              path={item.poster_path}
              alt=""
              sizes={featured ? "(max-width:700px) 46vw, 220px" : "(max-width:700px) 46vw, (max-width:1100px) 24vw, 170px"}
            />
          ) : (
            <div className="person-work-poster-empty">
              {item.media_type === "tv" ? <Tv size={26} /> : <Film size={26} />}
            </div>
          )}
        </Link>

        <ConnectedPosterActions
          media={{ tmdbId: Number(item.id), mediaType: item.media_type === "tv" ? "tv" : "movie", title, year, posterPath: item.poster_path ?? null, voteAverage: rating || null }}
        />
      </MediaCardImage>

      <Link href={href} className="card-title">
        {title}
      </Link>

      <MediaCardMeta>
        <span className="mc-media-type-year">{mediaTypeLabel(item.media_type)}{year ? ` ${year}` : ""}</span>
        {rating > 0 && (
          <span className="rating">
            <Star size={12} fill="currentColor" />
            {rating.toFixed(1)}
          </span>
        )}
      </MediaCardMeta>

      {role && <span className="person-work-role">{role}</span>}
    </MediaCard>
  );
}
