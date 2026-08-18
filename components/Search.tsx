"use client";

import {
  Search as SearchIcon,
  Star,
  Film,
  Tv,
  Loader2,
  Sparkles,
  UserRound,
  Drama,
  Layers3,
  ArrowRight,
  Users,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  img,
} from "@/lib/tmdb";

import Link from "next/link";

type MediaResult = {
  kind:
    "media";

  id: number;

  media_type:
    | "movie"
    | "tv";

  title?: string;
  name?: string;

  poster_path?:
    | string
    | null;

  release_date?: string;
  first_air_date?: string;

  vote_average?: number;
  overview?: string;
  reason?: string;
};

type PersonResult = {
  kind:
    "person";

  id:
    number;

  name:
    string;

  profile_path?:
    | string
    | null;

  known_for_department?:
    string;

  href:
    string;
};

type CharacterResult = {
  kind:
    "character";

  name:
    string;

  matched:
    string;

  count:
    number;

  poster_path?:
    | string
    | null;

  href:
    string;
};

type CollectionResult = {
  kind:
    "collection";

  id:
    number;

  name:
    string;

  poster_path?:
    | string
    | null;

  href:
    string;
};

type UserResult = { kind: "user"; id: string; name: string; username: string; avatar_url?: string | null; href: string };

type SearchSuggestion =
  | MediaResult
  | PersonResult
  | CharacterResult
  | CollectionResult
  | UserResult;

type SuggestResponse = {
  query?:
    string;

  suggestions?:
    SearchSuggestion[];
};

export function Search() {
  const [searchTab, setSearchTab] = useState<"all" | "movies" | "actors" | "users">("all");
  const router =
    useRouter();

  const [
    q,
    setQ,
  ] =
    useState("");

  useEffect(() => {
    if (q.trim().startsWith("@")) {
      setSearchTab("users");
    }
  }, [q]);

  const [
    results,
    setResults,
  ] =
    useState<
      SearchSuggestion[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    focused,
    setFocused,
  ] =
    useState(false);

  const [
    activeIndex,
    setActiveIndex,
  ] =
    useState(
      -1
    );

  const requestRef =
    useRef<
      AbortController |
      null
    >(null);

  const blurTimerRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > |
      null
    >(null);

  const suggestionCacheRef = useRef(
    new Map<string, { expiresAt: number; suggestions: SearchSuggestion[] }>(),
  );

  /*
   * ==========================================
   * BUSCA UNIVERSAL INSTANTÂNEA
   * ==========================================
   *
   * A barra NÃO chama IA.
   *
   * /api/search/suggest combina:
   *
   * - títulos;
   * - pessoas;
   * - sobrenomes;
   * - typos;
   * - personagens indexados;
   * - coleções / franquias.
   *
   * A IA continua sendo responsabilidade
   * apenas da página /search, se necessário.
   */
  useEffect(() => {
    const timer =
      setTimeout(
        async () => {
          const query =
            q.trim();

          if (
            query.length <
            2
          ) {
            requestRef.current
              ?.abort();

            setResults(
              []
            );

            setLoading(
              false
            );

            setActiveIndex(
              -1
            );

            return;
          }

          /*
           * Cancela a busca anterior de verdade.
           *
           * Ex.:
           * n -> no -> nol -> nolan
           */
          requestRef.current
            ?.abort();

          const cacheKey = query
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
          const memoryCached = suggestionCacheRef.current.get(cacheKey);

          if (memoryCached && memoryCached.expiresAt > Date.now()) {
            setResults(memoryCached.suggestions);
            setLoading(false);
            setActiveIndex(-1);
            return;
          }

          try {
            const stored = sessionStorage.getItem(`mycatalog:suggest:v1:${cacheKey}`);
            if (stored) {
              const cached = JSON.parse(stored);
              if (cached.expiresAt > Date.now() && Array.isArray(cached.suggestions)) {
                suggestionCacheRef.current.set(cacheKey, cached);
                setResults(cached.suggestions);
                setLoading(false);
                setActiveIndex(-1);
                return;
              }
              sessionStorage.removeItem(`mycatalog:suggest:v1:${cacheKey}`);
            }
          } catch {
            // A busca continua normalmente quando o storage está indisponível.
          }

          const controller =
            new AbortController();

          requestRef.current =
            controller;

          try {
            setLoading(
              true
            );

            const response =
              await fetch(
                `/api/search/suggest?q=${encodeURIComponent(
                  query
                )}`,
                {
                  signal:
                    controller.signal,
                }
              );

            if (
              !response.ok
            ) {
              setResults(
                []
              );

              return;
            }

            const data:
              SuggestResponse =
              await response.json();

            const normalized =
              Array.isArray(
                data.suggestions
              )
                ? data.suggestions
                : [];

            const suggestions = normalized.slice(0, 10);
            const cached = { expiresAt: Date.now() + 15 * 60 * 1000, suggestions };
            suggestionCacheRef.current.set(cacheKey, cached);
            try {
              sessionStorage.setItem(
                `mycatalog:suggest:v1:${cacheKey}`,
                JSON.stringify(cached),
              );
            } catch {
              // Cache local é opcional.
            }
            setResults(suggestions);

            setActiveIndex(
              -1
            );
          } catch (
            error
          ) {
            if (
              error instanceof
                DOMException &&
              error.name ===
                "AbortError"
            ) {
              return;
            }

            console.error(
              "Erro na busca universal:",
              error
            );

            setResults(
              []
            );
          } finally {
            if (
              requestRef.current ===
              controller
            ) {
              setLoading(
                false
              );

              requestRef.current =
                null;
            }
          }
        },
        260
      );

    return () => {
      clearTimeout(
        timer
      );

      requestRef.current
        ?.abort();
    };
  }, [
    q,
  ]);

  const mediaResults =
    useMemo(
      () =>
        results.filter(
          (
            item
          ): item is MediaResult =>
            item.kind ===
            "media"
        ),
      [
        results,
      ]
    );

  const userResults = useMemo(() => ["movies","actors"].includes(searchTab) ? [] : results.filter((item): item is UserResult => item.kind === "user"), [results, searchTab]);

  const personResults =
    useMemo(
      () =>
        results.filter(
          (
            item
          ): item is PersonResult =>
            item.kind ===
            "person"
        ),
      [
        results,
      ]
    );

  const characterResults =
    useMemo(
      () =>
        results.filter(
          (
            item
          ): item is CharacterResult =>
            item.kind ===
            "character"
        ),
      [
        results,
      ]
    );

  const collectionResults =
    useMemo(
      () =>
        results.filter(
          (
            item
          ): item is CollectionResult =>
            item.kind ===
            "collection"
        ),
      [
        results,
      ]
    );

  function clearSearch() {
    setSearchTab("all");
    setQ(
      ""
    );

    setResults(
      []
    );

    setFocused(
      false
    );

    setActiveIndex(
      -1
    );
  }

  function handleSubmit(
    event:
      React.FormEvent
  ) {
    event.preventDefault();

    const query =
      q.trim();

    if (
      query.length <
      2
    ) {
      return;
    }

    /*
     * Se o usuário selecionou algo com
     * ↑ / ↓, Enter abre a sugestão.
     */
    if (
      activeIndex >=
        0 &&
      results[
        activeIndex
      ]
    ) {
      const item =
        results[
          activeIndex
        ];

      clearSearch();

      router.push(
        getHref(
          item
        )
      );

      return;
    }

    setResults(
      []
    );

    setFocused(
      false
    );

    /*
     * A página /search decide se precisa
     * de IA. A barra nunca decide isso.
     */
    router.push(
      `/search?q=${encodeURIComponent(
        query
      )}`
    );
  }

  function getTitle(
    item:
      MediaResult
  ) {
    return (
      item.title ||
      item.name ||
      "Sem título"
    );
  }

  function getYear(
    item:
      MediaResult
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

  function getHref(
    item:
      SearchSuggestion
  ) {
    if (
      item.kind ===
      "media"
    ) {
      return `/title/${item.media_type}/${item.id}`;
    }

    return item.href;
  }

  function handleKeyDown(
    event:
      React.KeyboardEvent<
        HTMLInputElement
      >
  ) {
    if (
      event.key ===
        "ArrowDown" &&
      results.length >
        0
    ) {
      event.preventDefault();

      setActiveIndex(
        (
          current
        ) =>
          Math.min(
            results.length -
              1,
            current +
              1
          )
      );

      return;
    }

    if (
      event.key ===
        "ArrowUp" &&
      results.length >
        0
    ) {
      event.preventDefault();

      setActiveIndex(
        (
          current
        ) =>
          Math.max(
            -1,
            current -
              1
          )
      );

      return;
    }

    if (
      event.key ===
      "Escape"
    ) {
      setFocused(
        false
      );

      setActiveIndex(
        -1
      );
    }
  }

  function resultClass(
    item:
      SearchSuggestion
  ) {
    const index =
      results.indexOf(
        item
      );

    return [
      "result",
      index ===
      activeIndex
        ? "active"
        : "",
    ]
      .filter(
        Boolean
      )
      .join(
        " "
      );
  }

  return (
    <form
      className="search"
      onSubmit={
        handleSubmit
      }
      onFocus={() => {
        if (
          blurTimerRef.current
        ) {
          clearTimeout(
            blurTimerRef.current
          );
        }

        setFocused(
          true
        );
      }}
      onBlur={() => {
        blurTimerRef.current =
          setTimeout(
            () => {
              setFocused(
                false
              );
            },
            150
          );
      }}
    >
      <SearchIcon
        size={19}
      />

      <input
        value={
          q
        }
        onChange={(
          event
        ) =>
          setQ(
            event
              .target
              .value
          )
        }
        onKeyDown={
          handleKeyDown
        }
        placeholder="Filme, série, ator ou @usuário..."
        aria-label="Pesquisa universal"
        autoComplete="off"
      />

      {loading && (
        <Loader2
          size={17}
          className="search-loading"
          style={{
            animation:
              "spin 1s linear infinite",
          }}
        />
      )}

      {focused &&
        q.trim()
            .length >=
          2 &&
        !loading &&
        results.length ===
          0 && (
          <div className="results">
            <button
              type="submit"
              className="search-smart-empty"
            >
              <span className="search-smart-empty-icon">
                <Sparkles
                  size={16}
                />
              </span>

              <span>
                <strong>
                  Buscar “{
                    q.trim()
                  }”
                </strong>

                <small>
                  Procurar por título, pessoa, personagem, franquia e busca avançada.
                </small>
              </span>
            </button>
          </div>
        )}

      {focused &&
        results.length >
          0 && (
          <div className="results universal-search-results">
            <div className="search-result-tabs" role="tablist"><button type="button" className={searchTab === "all" ? "active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => setSearchTab("all")}>Todos</button><button type="button" className={searchTab === "movies" ? "active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => setSearchTab("movies")}>Filmes</button><button type="button" className={searchTab === "actors" ? "active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => setSearchTab("actors")}>Atores</button><button type="button" className={searchTab === "users" ? "active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => setSearchTab("users")}>Usuários</button></div>
            {userResults.length > 0 && <><div className="search-group-label"><Users size={12} /> Usuários</div>{userResults.map((item) => <Link className={resultClass(item)} href={item.href} onClick={clearSearch} key={`user-${item.id}`}><div className="search-result-poster search-result-person">{item.avatar_url ? <img src={item.avatar_url} alt={item.name} /> : <div className="search-result-poster-empty"><UserRound size={20} /></div>}</div><div className="search-result-info"><b>{item.name}</b><div className="muted">@{item.username} · Ver perfil</div></div><ArrowRight size={14} /></Link>)}</>}

            {(searchTab === "all" || searchTab === "actors") && characterResults.length >
              0 && (
              <>
                <div className="search-group-label">
                  <Drama
                    size={12}
                  />

                  Personagem
                </div>

                {characterResults.map(
                  (
                    item
                  ) => (
                    <Link
                      className={
                        resultClass(
                          item
                        )
                      }
                      href={
                        item.href
                      }
                      onClick={
                        clearSearch
                      }
                      key={`character-${item.name}-${item.matched}`}
                    >
                      <div className="search-result-poster search-result-person">
                        {item.poster_path ? (
                          <img loading="lazy" decoding="async"
                            src={img(
                              item.poster_path,
                              "w92"
                            )}
                            alt={
                              item.name
                            }
                          />
                        ) : (
                          <div className="search-result-poster-empty">
                            <Drama
                              size={20}
                            />
                          </div>
                        )}
                      </div>

                      <div className="search-result-info">
                        <b>
                          {
                            item.name
                          }
                        </b>

                        <div className="muted">
                          {item.count}{" "}
                          {item.count ===
                          1
                            ? "título encontrado"
                            : "títulos encontrados"}

                          {" · "}

                          Personagem
                        </div>
                      </div>

                      <ArrowRight
                        size={14}
                      />
                    </Link>
                  )
                )}
              </>
            )}

            {(searchTab === "all" || searchTab === "actors") && personResults.length >
              0 && (
              <>
                <div className="search-group-label">
                  <UserRound
                    size={12}
                  />

                  Pessoas
                </div>

                {personResults.map(
                  (
                    item
                  ) => (
                    <Link
                      className={
                        resultClass(
                          item
                        )
                      }
                      href={
                        item.href
                      }
                      onClick={
                        clearSearch
                      }
                      key={`person-${item.id}`}
                    >
                      <div className="search-result-poster search-result-person">
                        {item.profile_path ? (
                          <img loading="lazy" decoding="async"
                            src={img(
                              item.profile_path,
                              "w92"
                            )}
                            alt={
                              item.name
                            }
                          />
                        ) : (
                          <div className="search-result-poster-empty">
                            <UserRound
                              size={20}
                            />
                          </div>
                        )}
                      </div>

                      <div className="search-result-info">
                        <b>
                          {
                            item.name
                          }
                        </b>

                        <div className="muted">
                          {item.known_for_department ||
                            "Cinema e TV"}

                          {" · "}

                          Ver trabalhos
                        </div>
                      </div>

                      <ArrowRight
                        size={14}
                      />
                    </Link>
                  )
                )}
              </>
            )}

            {(searchTab === "all" || searchTab === "movies") && collectionResults.length >
              0 && (
              <>
                <div className="search-group-label">
                  <Layers3
                    size={12}
                  />

                  Franquias
                </div>

                {collectionResults.map(
                  (
                    item
                  ) => (
                    <Link
                      className={
                        resultClass(
                          item
                        )
                      }
                      href={
                        item.href
                      }
                      onClick={
                        clearSearch
                      }
                      key={`collection-${item.id}`}
                    >
                      <div className="search-result-poster">
                        {item.poster_path ? (
                          <img loading="lazy" decoding="async"
                            src={img(
                              item.poster_path,
                              "w92"
                            )}
                            alt={
                              item.name
                            }
                          />
                        ) : (
                          <div className="search-result-poster-empty">
                            <Layers3
                              size={20}
                            />
                          </div>
                        )}
                      </div>

                      <div className="search-result-info">
                        <b>
                          {
                            item.name
                          }
                        </b>

                        <div className="muted">
                          Coleção / franquia
                        </div>
                      </div>

                      <ArrowRight
                        size={14}
                      />
                    </Link>
                  )
                )}
              </>
            )}

            {(searchTab === "all" || searchTab === "movies") && mediaResults.length >
              0 && (
              <>
                <div className="search-group-label">
                  <Film
                    size={12}
                  />

                  Títulos
                </div>

                {mediaResults.map(
                  (
                    item
                  ) => {
                    const title =
                      getTitle(
                        item
                      );

                    const year =
                      getYear(
                        item
                      );

                    const isMovie =
                      item.media_type ===
                      "movie";

                    return (
                      <Link
                        className={
                          resultClass(
                            item
                          )
                        }
                        href={`/title/${item.media_type}/${item.id}`}
                        onClick={
                          clearSearch
                        }
                        key={`${item.media_type}-${item.id}`}
                      >
                        <div className="search-result-poster">
                          {item.poster_path ? (
                            <img loading="lazy" decoding="async"
                              src={img(
                                item.poster_path,
                                "w92"
                              )}
                              alt={
                                title
                              }
                            />
                          ) : (
                            <div className="search-result-poster-empty">
                              {isMovie ? (
                                <Film
                                  size={20}
                                />
                              ) : (
                                <Tv
                                  size={20}
                                />
                              )}
                            </div>
                          )}
                        </div>

                        <div className="search-result-info">
                          <b>
                            {
                              title
                            }
                          </b>

                          <div className="muted">
                            {year ||
                              "Ano desconhecido"}

                            {
                              " · "
                            }

                              {isMovie
                                ? "Filme"
                                : "Série"}

                              {item.reason ? ` · ${item.reason}` : ""}

                            {typeof item.vote_average ===
                              "number" &&
                              item.vote_average >
                                0 && (
                                <>
                                  {
                                    " · "
                                  }

                                  <Star
                                    size={11}
                                    fill="currentColor"
                                  />

                                  {
                                    " "
                                  }

                                  {item.vote_average.toFixed(
                                    1
                                  )}
                                </>
                              )}
                          </div>
                        </div>
                      </Link>
                    );
                  }
                )}
              </>
            )}

            <button
              type="submit"
              className="search-see-all"
            >
              Ver todos os resultados para “{
                q.trim()
              }”
            </button>
          </div>
        )}
    </form>
  );
}
