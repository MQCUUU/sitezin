"use client";

import { useEffect, useState } from "react";
import {
  Film,
  Tv,
  Heart,
  Star,
  Camera,
  Save,
  User,
  Check,
  Play,
  Clock,
  Library,
  BarChart3,
  Sparkles,
  Trophy,
  Lock,
  Award,
  CalendarDays,
  Target,
  Clapperboard,
  RefreshCw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ProfileStats = {
  movies: number;
  series: number;
  favorites: number;
  averageRating: number | null;
  total: number;
  watched: number;
  watching: number;
  want: number;
};

type Preferences = {
  favoriteType: string;
  favoriteTypeDescription: string;
  mainStatus: string;
  mainStatusDescription: string;
  ratingStyle: string;
  ratingDescription: string;
};

type AchievementCategory =
  | "all"
  | "library"
  | "movies"
  | "series"
  | "ratings"
  | "genres"
  | "time"
  | "special";

type Achievement = {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: Exclude<AchievementCategory, "all">;
  unlocked: boolean;
  progress: number;
  target: number;
};

type Genre =
  | string
  | {
      id?: number;
      name?: string;
    };

type LibraryEntry = {
  id?: string | number;
  status?: string;
  favorite?: boolean;
  personal_rating?: number | null;
  review?: string | null;
  watched_at?: string | null;
  rewatch_count?: number;

  media?: {
    id?: string;
    tmdb_id?: number;
    media_type?: "movie" | "tv";
    title?: string;
    original_title?: string | null;
    genres?: Genre[];
    release_date?: string | null;
    first_air_date?: string | null;
    runtime?: number | null;
    episodes_count?: number | null;
    seasons_count?: number | null;
  };
};

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);

  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [stats, setStats] = useState<ProfileStats>({
    movies: 0,
    series: 0,
    favorites: 0,
    averageRating: null,
    total: 0,
    watched: 0,
    watching: 0,
    want: 0,
  });

  const [preferences, setPreferences] =
    useState<Preferences>({
      favoriteType: "Ainda não definido",
      favoriteTypeDescription:
        "Adicione alguns títulos para descobrir sua preferência.",
      mainStatus: "Ainda não definido",
      mainStatusDescription:
        "Suas preferências aparecerão conforme você usar o catálogo.",
      ratingStyle: "Ainda não definido",
      ratingDescription:
        "Avalie alguns títulos para descobrir seu estilo de avaliação.",
    });

  const [achievements, setAchievements] =
    useState<Achievement[]>([]);

  const [achievementFilter, setAchievementFilter] =
    useState<AchievementCategory>("all");

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      try {
        const supabase = createClient();

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.href = "/login";
          return;
        }

        setUser(user);

        setName(
          user.user_metadata?.name ||
            user.user_metadata?.full_name ||
            ""
        );

        setAvatar(
          user.user_metadata?.avatar_url || ""
        );

        /*
         * =====================================================
         * CARREGAR BIBLIOTECA
         * =====================================================
         */

        const response = await fetch(
          "/api/library",
          {
            cache: "no-store",
          }
        );

        if (!response.ok) {
          throw new Error(
            "Não foi possível carregar a biblioteca."
          );
        }

        const data = await response.json();

        const library: LibraryEntry[] =
          Array.isArray(data) ? data : [];

        /*
         * =====================================================
         * ESTATÍSTICAS
         * =====================================================
         */

        const movies = library.filter(
          (item) =>
            item.media?.media_type === "movie"
        ).length;

        const series = library.filter(
          (item) =>
            item.media?.media_type === "tv"
        ).length;

        const favorites = library.filter(
          (item) =>
            item.favorite === true
        ).length;

        const watched = library.filter(
          (item) =>
            item.status === "watched"
        ).length;

        const watching = library.filter(
          (item) =>
            item.status === "watching"
        ).length;

        const want = library.filter(
          (item) =>
            item.status === "want"
        ).length;

        /*
         * =====================================================
         * NOTAS
         * =====================================================
         */

        const ratings = library
          .map((item) => {
            if (
              item.personal_rating === null ||
              item.personal_rating === undefined
            ) {
              return null;
            }

            const value = Number(
              item.personal_rating
            );

            return Number.isFinite(value)
              ? value
              : null;
          })
          .filter(
            (
              value
            ): value is number =>
              value !== null
          );

        let averageRating: number | null =
          null;

        if (ratings.length > 0) {
          const totalRating =
            ratings.reduce(
              (sum, value) =>
                sum + value,
              0
            );

          averageRating = Number(
            (
              totalRating /
              ratings.length
            ).toFixed(1)
          );
        }

        setStats({
          movies,
          series,
          favorites,
          averageRating,
          total: library.length,
          watched,
          watching,
          want,
        });

        /*
         * =====================================================
         * PREFERÊNCIAS
         * =====================================================
         */

        let favoriteType =
          "Ainda não definido";

        let favoriteTypeDescription =
          "Adicione alguns títulos para descobrir sua preferência.";

        if (library.length > 0) {
          if (movies > series) {
            favoriteType = "Filmes";

            favoriteTypeDescription =
              `Você tem ${movies} filmes contra ${series} séries na biblioteca.`;
          } else if (series > movies) {
            favoriteType = "Séries";

            favoriteTypeDescription =
              `Você tem ${series} séries contra ${movies} filmes na biblioteca.`;
          } else {
            favoriteType = "Equilibrado";

            favoriteTypeDescription =
              "Sua biblioteca está dividida igualmente entre filmes e séries.";
          }
        }

        let mainStatus =
          "Ainda não definido";

        let mainStatusDescription =
          "Suas preferências aparecerão conforme você usar o catálogo.";

        if (library.length > 0) {
          const statusValues = [
            {
              name: "Assistidos",
              value: watched,
              description:
                "Você costuma manter muitos títulos já assistidos na biblioteca.",
            },
            {
              name: "Assistindo",
              value: watching,
              description:
                "Você tem vários títulos em andamento no momento.",
            },
            {
              name: "Quero assistir",
              value: want,
              description:
                "Você mantém uma lista de títulos para assistir futuramente.",
            },
          ];

          const highestStatus =
            statusValues.reduce(
              (previous, current) =>
                current.value >
                previous.value
                  ? current
                  : previous
            );

          if (highestStatus.value > 0) {
            mainStatus =
              highestStatus.name;

            mainStatusDescription =
              highestStatus.description;
          }
        }

        let ratingStyle =
          "Ainda não definido";

        let ratingDescription =
          "Avalie alguns títulos para descobrir seu estilo de avaliação.";

        if (averageRating !== null) {
          if (averageRating >= 8.5) {
            ratingStyle =
              "Muito positivo";

            ratingDescription =
              `Sua média é ${averageRating.toFixed(
                1
              )}. Você costuma dar notas altas aos títulos que assiste.`;
          } else if (averageRating >= 7) {
            ratingStyle =
              "Positivo";

            ratingDescription =
              `Sua média é ${averageRating.toFixed(
                1
              )}. Você tende a avaliar os títulos de forma positiva.`;
          } else if (averageRating >= 5) {
            ratingStyle =
              "Exigente";

            ratingDescription =
              `Sua média é ${averageRating.toFixed(
                1
              )}. Você costuma distribuir suas notas de forma mais equilibrada.`;
          } else {
            ratingStyle =
              "Muito exigente";

            ratingDescription =
              `Sua média é ${averageRating.toFixed(
                1
              )}. Você é bastante criterioso ao avaliar.`;
          }
        }

        setPreferences({
          favoriteType,
          favoriteTypeDescription,
          mainStatus,
          mainStatusDescription,
          ratingStyle,
          ratingDescription,
        });

        /*
         * =====================================================
         * DADOS DAS CONQUISTAS
         * =====================================================
         */

        const watchedItems =
          library.filter(
            (item) =>
              item.status === "watched"
          );

        const ratedItems =
          library.filter(
            (item) =>
              item.personal_rating !==
                null &&
              item.personal_rating !==
                undefined
          );

        const tenRatings =
          library.filter((item) => {
            const rating =
              Number(
                item.personal_rating
              );

            return (
              Number.isFinite(rating) &&
              rating >= 9
            );
          }).length;

        const lowRatings =
          library.filter((item) => {
            const rating =
              Number(
                item.personal_rating
              );

            return (
              item.personal_rating !==
                null &&
              item.personal_rating !==
                undefined &&
              Number.isFinite(rating) &&
              rating <= 5
            );
          }).length;

        const perfectRatings =
          library.filter((item) => {
            const rating =
              Number(
                item.personal_rating
              );

            return (
              Number.isFinite(rating) &&
              rating === 10
            );
          }).length;

        /*
         * =====================================================
         * GÊNEROS
         *
         * Aceita tanto:
         *
         * ["Drama", "Romance"]
         *
         * quanto:
         *
         * [{ id: 18, name: "Drama" }]
         * =====================================================
         */

        function getGenreNames(
          item: LibraryEntry
        ): string[] {
          const genres =
            item.media?.genres || [];

          return genres
            .map((genre) => {
              if (
                typeof genre ===
                "string"
              ) {
                return genre;
              }

              return genre.name || "";
            })
            .map((genre) =>
              genre.trim()
            )
            .filter(Boolean);
        }

        const genreCounts =
          new Map<string, number>();

        library.forEach((item) => {
          const genres =
            getGenreNames(item);

          genres.forEach((genre) => {
            const key =
              genre.toLowerCase();

            genreCounts.set(
              key,
              (genreCounts.get(key) ||
                0) + 1
            );
          });
        });

        const uniqueGenres =
          genreCounts.size;

        function genreAmount(
          words: string[]
        ) {
          return library.filter(
            (item) => {
              const genres =
                getGenreNames(item);

              return genres.some(
                (genre) =>
                  words.some(
                    (word) =>
                      genre
                        .toLowerCase()
                        .includes(
                          word.toLowerCase()
                        )
                  )
              );
            }
          ).length;
        }

        const action = genreAmount([
          "ação",
          "action",
        ]);

        const comedy = genreAmount([
          "comédia",
          "comedy",
        ]);

        const romance = genreAmount([
          "romance",
        ]);

        const horror = genreAmount([
          "terror",
          "horror",
        ]);

        const drama = genreAmount([
          "drama",
        ]);

        const scienceFiction =
          genreAmount([
            "ficção científica",
            "science fiction",
            "sci-fi",
          ]);

        const fantasy = genreAmount([
          "fantasia",
          "fantasy",
        ]);

        const thriller = genreAmount([
          "thriller",
          "suspense",
        ]);

        const animation = genreAmount([
          "animação",
          "animation",
        ]);

        /*
         * =====================================================
         * DÉCADAS
         * =====================================================
         */

        function getYear(
          item: LibraryEntry
        ): number | null {
          const date =
            item.media
              ?.release_date ||
            item.media
              ?.first_air_date ||
            "";

          const year =
            Number(
              date.slice(0, 4)
            );

          return Number.isFinite(year) &&
            year > 0
            ? year
            : null;
        }

        function countYears(
          min: number,
          max: number
        ) {
          return library.filter(
            (item) => {
              const year =
                getYear(item);

              return (
                year !== null &&
                year >= min &&
                year <= max
              );
            }
          ).length;
        }

        const eighties =
          countYears(1980, 1989);

        const nineties =
          countYears(1990, 1999);

        const twoThousands =
          countYears(2000, 2009);

        const twentyTens =
          countYears(2010, 2019);

        const twentyTwenties =
          countYears(2020, 2029);

        const decades =
          new Set(
            library
              .map((item) => {
                const year =
                  getYear(item);

                return year !== null
                  ? Math.floor(
                      year / 10
                    )
                  : null;
              })
              .filter(
                (
                  value
                ): value is number =>
                  value !== null
              )
          ).size;

        /*
         * =====================================================
         * TEMPO
         * =====================================================
         */

        const totalMinutes =
          library.reduce(
            (total, item) => {
              if (
                item.media
                  ?.media_type ===
                "tv"
              ) {
                const runtime =
                  Number(
                    item.media
                      ?.runtime || 0
                  );

                const episodes =
                  Number(
                    item.media
                      ?.episodes_count ||
                      0
                  );

                return (
                  total +
                  runtime * episodes
                );
              }

              return (
                total +
                Number(
                  item.media
                    ?.runtime || 0
                )
              );
            },
            0
          );

        const totalHours =
          Math.floor(
            totalMinutes / 60
          );

        /*
         * =====================================================
         * REASSISTÊNCIAS
         * =====================================================
         */

        const rewatchCount =
          library.reduce(
            (total, item) =>
              total +
              Math.max(
                Number(
                  item.rewatch_count || 0
                ),
                item.status === "rewatched"
                  ? 1
                  : 0
              ),
            0
          );

        /*
         * =====================================================
         * CONQUISTAS
         * =====================================================
         */

        const achievementList: Achievement[] =
          [];

        function add(
          id: string,
          title: string,
          description: string,
          icon: string,
          category: Exclude<
            AchievementCategory,
            "all"
          >,
          progress: number,
          target: number
        ) {
          const safeProgress =
            Number.isFinite(progress)
              ? Math.max(
                  0,
                  progress
                )
              : 0;

          const safeTarget =
            Math.max(1, target);

          achievementList.push({
            id,
            title,
            description,
            icon,
            category,
            progress: Math.min(
              safeProgress,
              safeTarget
            ),
            target: safeTarget,
            unlocked:
              safeProgress >=
              safeTarget,
          });
        }

        /*
         * =====================================================
         * BIBLIOTECA
         * =====================================================
         */

        [
          [1, "Primeiro passo"],
          [5, "Começando a coleção"],
          [10, "Colecionador"],
          [25, "Grande catálogo"],
          [50, "Biblioteca respeitável"],
          [100, "Mestre do catálogo"],
          [250, "Enciclopédia"],
          [500, "Lenda do MyCatalog"],
        ].forEach(
          ([target, title]) =>
            add(
              `library-${target}`,
              title as string,
              `Tenha ${target} títulos na biblioteca.`,
              "library",
              "library",
              library.length,
              target as number
            )
        );

        /*
         * =====================================================
         * FILMES
         * =====================================================
         */

        [
          [1, "Primeiro filme"],
          [5, "Amante do cinema"],
          [10, "Cinéfilo"],
          [25, "Colecionador de filmes"],
          [50, "Maratonista de cinema"],
          [100, "Mestre do cinema"],
          [250, "Historiador do cinema"],
        ].forEach(
          ([target, title]) =>
            add(
              `movies-${target}`,
              title as string,
              `Tenha ${target} filmes na biblioteca.`,
              "film",
              "movies",
              movies,
              target as number
            )
        );

        /*
         * =====================================================
         * SÉRIES
         * =====================================================
         */

        [
          [1, "Primeira série"],
          [5, "Começando nas séries"],
          [10, "Viciado em séries"],
          [25, "Maratonista de séries"],
          [50, "Especialista em séries"],
          [100, "Mestre das séries"],
        ].forEach(
          ([target, title]) =>
            add(
              `series-${target}`,
              title as string,
              `Tenha ${target} séries na biblioteca.`,
              "tv",
              "series",
              series,
              target as number
            )
        );

        /*
         * =====================================================
         * ASSISTIDOS
         * =====================================================
         */

        [
          [1, "Primeiro assistido"],
          [5, "Já comecei"],
          [10, "Maratonista"],
          [25, "Espectador dedicado"],
          [50, "Maratonista profissional"],
          [100, "Veterano"],
          [250, "Lenda das maratonas"],
        ].forEach(
          ([target, title]) =>
            add(
              `watched-${target}`,
              title as string,
              `Tenha ${target} títulos assistidos.`,
              "check",
              "library",
              watched,
              target as number
            )
        );

        /*
         * =====================================================
         * NOTAS
         * =====================================================
         */

        [
          [
            1,
            "Primeira avaliação",
            "Dê sua primeira nota.",
          ],
          [
            10,
            "Crítico iniciante",
            "Avalie 10 títulos.",
          ],
          [
            25,
            "Crítico frequente",
            "Avalie 25 títulos.",
          ],
          [
            50,
            "Crítico profissional",
            "Avalie 50 títulos.",
          ],
          [
            100,
            "Crítico lendário",
            "Avalie 100 títulos.",
          ],
        ].forEach(
          ([
            target,
            title,
            description,
          ]) =>
            add(
              `ratings-${target}`,
              title as string,
              description as string,
              "star",
              "ratings",
              ratedItems.length,
              target as number
            )
        );

        add(
          "perfect-one",
          "Nota máxima",
          "Dê sua primeira nota 10.",
          "star",
          "ratings",
          perfectRatings,
          1
        );

        add(
          "perfect-five",
          "Perfeccionista",
          "Dê nota 10 para 5 títulos.",
          "award",
          "ratings",
          perfectRatings,
          5
        );

        add(
          "high-ten",
          "Exigente",
          "Dê notas 9 ou 10 para 10 títulos.",
          "target",
          "ratings",
          tenRatings,
          10
        );

        add(
          "low-ten",
          "Sem dó",
          "Dê notas 5 ou menores para 10 títulos.",
          "target",
          "ratings",
          lowRatings,
          10
        );

        add(
          "rating-eight",
          "Nota consistente",
          "Tenha média pessoal igual ou superior a 8.",
          "star",
          "ratings",
          averageRating !== null &&
          averageRating >= 8
            ? 1
            : 0,
          1
        );

        /*
         * =====================================================
         * FAVORITOS
         * =====================================================
         */

        [
          [1, "Primeiro favorito"],
          [5, "Colecionador de favoritos"],
          [10, "Coração grande"],
          [25, "Favoritos seletos"],
          [50, "Galeria dos favoritos"],
        ].forEach(
          ([target, title]) =>
            add(
              `favorites-${target}`,
              title as string,
              `Tenha ${target} títulos favoritos.`,
              "heart",
              "library",
              favorites,
              target as number
            )
        );

        /*
         * =====================================================
         * GÊNEROS
         * =====================================================
         */

        [
          [5, "Explorador de gêneros"],
          [10, "Eclético"],
          [15, "Sem preconceito"],
          [20, "Mestre dos gêneros"],
        ].forEach(
          ([target, title]) =>
            add(
              `genres-${target}`,
              title as string,
              `Tenha títulos de ${target} gêneros diferentes.`,
              "sparkles",
              "genres",
              uniqueGenres,
              target as number
            )
        );

        const genreAchievements = [
          [
            "action",
            "Adrenalina",
            "Assista 10 títulos de ação.",
            action,
            10,
          ],
          [
            "comedy",
            "Rindo sozinho",
            "Assista 10 comédias.",
            comedy,
            10,
          ],
          [
            "romance",
            "Coração mole",
            "Assista 10 romances.",
            romance,
            10,
          ],
          [
            "horror",
            "Sem medo",
            "Assista 10 títulos de terror.",
            horror,
            10,
          ],
          [
            "drama",
            "Dramático",
            "Assista 10 dramas.",
            drama,
            10,
          ],
          [
            "scifi",
            "Além da realidade",
            "Assista 10 títulos de ficção científica.",
            scienceFiction,
            10,
          ],
          [
            "fantasy",
            "Mundo mágico",
            "Assista 10 títulos de fantasia.",
            fantasy,
            10,
          ],
          [
            "thriller",
            "Tensão máxima",
            "Assista 10 thrillers ou suspenses.",
            thriller,
            10,
          ],
          [
            "animation",
            "Animado",
            "Assista 10 animações.",
            animation,
            10,
          ],
        ];

        genreAchievements.forEach(
          ([
            id,
            title,
            description,
            progress,
            target,
          ]) =>
            add(
              `genre-${id}`,
              title as string,
              description as string,
              "film",
              "genres",
              progress as number,
              target as number
            )
        );

        /*
         * =====================================================
         * DÉCADAS
         * =====================================================
         */

        [
          [
            "80s",
            "Viagem aos anos 80",
            "Assista 5 títulos dos anos 80.",
            eighties,
            5,
          ],
          [
            "90s",
            "Nostalgia dos anos 90",
            "Assista 10 títulos dos anos 90.",
            nineties,
            10,
          ],
          [
            "2000",
            "Filho dos anos 2000",
            "Assista 10 títulos dos anos 2000.",
            twoThousands,
            10,
          ],
          [
            "2010",
            "Era moderna",
            "Assista 25 títulos dos anos 2010.",
            twentyTens,
            25,
          ],
          [
            "2020",
            "Nova geração",
            "Assista 25 títulos dos anos 2020.",
            twentyTwenties,
            25,
          ],
        ].forEach(
          ([
            id,
            title,
            description,
            progress,
            target,
          ]) =>
            add(
              `decade-${id}`,
              title as string,
              description as string,
              "calendar",
              "special",
              progress as number,
              target as number
            )
        );

        add(
          "five-decades",
          "Viajante do tempo",
          "Assista títulos de 5 décadas diferentes.",
          "calendar",
          "special",
          decades,
          5
        );

        /*
         * =====================================================
         * TEMPO
         * =====================================================
         */

        [
          [10, "Primeiras horas"],
          [50, "Maratona"],
          [100, "100 horas"],
          [500, "Meio milhar"],
          [1000, "Minha vida é uma série"],
        ].forEach(
          ([target, title]) =>
            add(
              `hours-${target}`,
              title as string,
              `Acumule ${target} horas de conteúdo.`,
              "clock",
              "time",
              totalHours,
              target as number
            )
        );

        /*
         * =====================================================
         * REASSISTIDAS
         * =====================================================
         */

        [
          [1, "De novo!"],
          [5, "Não enjoa"],
          [10, "Clássicos pessoais"],
          [25, "Eu já vi isso..."],
        ].forEach(
          ([target, title]) =>
            add(
              `rewatch-${target}`,
              title as string,
              `Reassista ${target} título(s).`,
              "refresh",
              "special",
              rewatchCount,
              target as number
            )
        );

        /*
         * =====================================================
         * ESPECIAIS
         * =====================================================
         */

        const usedStatuses =
          new Set(
            library
              .map(
                (item) =>
                  item.status
              )
              .filter(Boolean)
          );

        add(
          "all-status",
          "Organizado",
          "Tenha pelo menos um título em cada status.",
          "library",
          "special",
          usedStatuses.size,
          5
        );

        add(
          "balanced",
          "Equilíbrio perfeito",
          "Tenha a mesma quantidade de filmes e séries.",
          "sparkles",
          "special",
          movies === series &&
          library.length > 0
            ? 1
            : 0,
          1
        );

        const favoriteRated =
          library.filter(
            (item) =>
              item.favorite === true &&
              Number(
                item.personal_rating
              ) >= 8
          ).length;

        add(
          "favorite-rated",
          "Favoritos de qualidade",
          "Tenha 10 favoritos com nota 8 ou superior.",
          "heart",
          "special",
          favoriteRated,
          10
        );

        const watchedMovies =
          watchedItems.filter(
            (item) =>
              item.media?.media_type ===
              "movie"
          ).length;

        const watchedSeries =
          watchedItems.filter(
            (item) =>
              item.media?.media_type ===
              "tv"
          ).length;

        add(
          "movie-watched",
          "Cinéfilo de verdade",
          "Assista 25 filmes.",
          "clapperboard",
          "movies",
          watchedMovies,
          25
        );

        add(
          "series-watched",
          "Maratonista de séries",
          "Assista 25 séries.",
          "tv",
          "series",
          watchedSeries,
          25
        );

        /*
         * =====================================================
         * SALVAR CONQUISTAS NO ESTADO
         * =====================================================
         */

        setAchievements(
          achievementList
        );
      } catch (error) {
        console.error(
          "Erro ao carregar perfil:",
          error
        );
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, []);

  /*
   * =========================================================
   * SALVAR PERFIL
   * =========================================================
   */

  async function saveProfile() {
    if (!user || saving) {
      return;
    }

    try {
      setSaving(true);

      const supabase =
        createClient();

      const {
        data,
        error,
      } =
        await supabase.auth.updateUser({
          data: {
            name: name.trim(),
            avatar_url:
              avatar.trim(),
          },
        });

      if (error) {
        throw error;
      }

      setUser(data.user);
      setEditing(false);
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o perfil."
      );
    } finally {
      setSaving(false);
    }
  }

  function cancelEditing() {
    setEditing(false);

    setName(
      user?.user_metadata?.name ||
        user?.user_metadata
          ?.full_name ||
        ""
    );

    setAvatar(
      user?.user_metadata
        ?.avatar_url || ""
    );
  }

  /*
   * =========================================================
   * ÍCONES
   * =========================================================
   */

  function getAchievementIcon(
    icon: string,
    unlocked: boolean
  ) {
    const size = 21;

    const style = {
      opacity: unlocked
        ? 1
        : 0.45,
    };

    const icons: Record<
      string,
      React.ReactNode
    > = {
      film: (
        <Film
          size={size}
          style={style}
        />
      ),

      library: (
        <Library
          size={size}
          style={style}
        />
      ),

      trophy: (
        <Trophy
          size={size}
          style={style}
        />
      ),

      sparkles: (
        <Sparkles
          size={size}
          style={style}
        />
      ),

      check: (
        <Check
          size={size}
          style={style}
        />
      ),

      play: (
        <Play
          size={size}
          style={style}
        />
      ),

      star: (
        <Star
          size={size}
          style={style}
        />
      ),

      heart: (
        <Heart
          size={size}
          style={style}
        />
      ),

      tv: (
        <Tv
          size={size}
          style={style}
        />
      ),

      award: (
        <Award
          size={size}
          style={style}
        />
      ),

      target: (
        <Target
          size={size}
          style={style}
        />
      ),

      calendar: (
        <CalendarDays
          size={size}
          style={style}
        />
      ),

      clock: (
        <Clock
          size={size}
          style={style}
        />
      ),

      refresh: (
        <RefreshCw
          size={size}
          style={style}
        />
      ),

      clapperboard: (
        <Clapperboard
          size={size}
          style={style}
        />
      ),
    };

    return (
      icons[icon] || (
        <Trophy
          size={size}
          style={style}
        />
      )
    );
  }

  /*
   * =========================================================
   * LOADING
   * =========================================================
   */

  if (loading) {
    return (
      <div>
        <div className="topbar">
          <div>
            <div className="eyebrow">
              Meu perfil
            </div>

            <h1
              style={{
                margin:
                  "6px 0 0",
              }}
            >
              Meu perfil
            </h1>
          </div>
        </div>

        <div className="empty">
          Carregando seu perfil...
        </div>
      </div>
    );
  }

  /*
   * =========================================================
   * DADOS VISUAIS
   * =========================================================
   */

  const email =
    user?.email || "Usuário";

  const displayName =
    name.trim() || "Meu perfil";

  const avatarLetter =
    displayName
      .charAt(0)
      .toUpperCase();

  const progress =
    stats.total > 0
      ? Math.round(
          (stats.watched /
            stats.total) *
            100
        )
      : 0;

  const unlockedAchievements =
    achievements.filter(
      (achievement) =>
        achievement.unlocked
    ).length;

  const achievementPercentage =
    achievements.length > 0
      ? Math.round(
          (unlockedAchievements /
            achievements.length) *
            100
        )
      : 0;

  const filteredAchievements =
    achievementFilter === "all"
      ? achievements
      : achievements.filter(
          (achievement) =>
            achievement.category ===
            achievementFilter
        );

  /*
   * =========================================================
   * RENDER
   * =========================================================
   */

  return (
    <div>
      {/* CABEÇALHO */}

      <div className="topbar">
        <div>
          <div className="eyebrow">
            Meu perfil
          </div>

          <h1
            style={{
              margin:
                "6px 0 0",
            }}
          >
            Meu perfil
          </h1>

          <p className="muted">
            Sua atividade e suas
            preferências.
          </p>
        </div>
      </div>

      {/* PERFIL */}

      <section className="profile-card panel">
        <div className="profile-avatar-wrapper">
          {avatar ? (
            <img loading="lazy" decoding="async"
              src={avatar}
              alt={displayName}
              className="profile-avatar-image"
              onError={() =>
                setAvatar("")
              }
            />
          ) : (
            <div className="profile-avatar">
              {name ? (
                avatarLetter
              ) : (
                <User size={42} />
              )}
            </div>
          )}
        </div>

        <div className="profile-info">
          {editing ? (
            <div className="profile-edit">
              <label>
                Nome

                <input
                  value={name}
                  onChange={(
                    event
                  ) =>
                    setName(
                      event.target
                        .value
                    )
                  }
                  placeholder="Seu nome"
                />
              </label>

              <label>
                URL do avatar

                <input
                  value={avatar}
                  onChange={(
                    event
                  ) =>
                    setAvatar(
                      event.target
                        .value
                    )
                  }
                  placeholder="https://..."
                />
              </label>
            </div>
          ) : (
            <>
              <h2>
                {displayName}
              </h2>

              <p className="muted">
                {email}
              </p>

              <p className="muted">
                No MyCatalog desde{" "}
                {user?.created_at
                  ? new Date(
                      user.created_at
                    ).toLocaleDateString(
                      "pt-BR"
                    )
                  : "—"}
              </p>
            </>
          )}
        </div>

        <div className="profile-actions">
          {editing ? (
            <>
              <button
                className="btn primary"
                onClick={
                  saveProfile
                }
                disabled={saving}
              >
                <Save size={16} />

                {saving
                  ? "Salvando..."
                  : "Salvar"}
              </button>

              <button
                className="btn"
                onClick={
                  cancelEditing
                }
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              className="btn"
              onClick={() =>
                setEditing(true)
              }
            >
              <Camera size={16} />
              Editar perfil
            </button>
          )}
        </div>
      </section>

      {/* RESUMO */}

      <section className="section">
        <div className="section-head">
          <h2>Resumo</h2>
        </div>

        <div className="profile-stats">
          <div className="profile-stat">
            <Film size={20} />

            <span>Filmes</span>

            <strong>
              {stats.movies}
            </strong>
          </div>

          <div className="profile-stat">
            <Tv size={20} />

            <span>Séries</span>

            <strong>
              {stats.series}
            </strong>
          </div>

          <div className="profile-stat">
            <Heart size={20} />

            <span>
              Favoritos
            </span>

            <strong>
              {stats.favorites}
            </strong>
          </div>

          <div className="profile-stat">
            <Star size={20} />

            <span>
              Média das notas
            </span>

            <strong>
              {stats.averageRating !==
              null
                ? stats.averageRating.toFixed(
                    1
                  )
                : "—"}
            </strong>
          </div>
        </div>
      </section>

      {/* ESTATÍSTICAS */}

      <section className="section">
        <div className="section-head">
          <h2>
            Estatísticas pessoais
          </h2>
        </div>

        <div className="profile-stats">
          <div className="profile-stat">
            <Library size={20} />

            <span>
              Total na biblioteca
            </span>

            <strong>
              {stats.total}
            </strong>
          </div>

          <div className="profile-stat">
            <Check size={20} />

            <span>Assistidos</span>

            <strong>
              {stats.watched}
            </strong>
          </div>

          <div className="profile-stat">
            <Play size={20} />

            <span>Assistindo</span>

            <strong>
              {stats.watching}
            </strong>
          </div>

          <div className="profile-stat">
            <Clock size={20} />

            <span>
              Quero assistir
            </span>

            <strong>
              {stats.want}
            </strong>
          </div>
        </div>
      </section>

      {/* PROGRESSO */}

      <section className="section">
        <div className="section-head">
          <h2>
            Progresso da biblioteca
          </h2>

          <strong>
            {progress}%
          </strong>
        </div>

        <div
          style={{
            width: "100%",
            height: "10px",
            borderRadius:
              "999px",
            background:
              "rgba(255,255,255,.08)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              borderRadius:
                "999px",
              background:
                "var(--accent)",
              transition:
                "width .3s ease",
            }}
          />
        </div>

        <p className="muted">
          {stats.watched} de{" "}
          {stats.total} títulos
          assistidos
        </p>
      </section>

      {/* PREFERÊNCIAS */}

      <section className="section">
        <div className="section-head">
          <div>
            <h2>
              Suas preferências
            </h2>

            <p
              className="muted"
              style={{
                marginTop:
                  "4px",
              }}
            >
              Descobertas
              automaticamente
              com base na sua
              biblioteca.
            </p>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "12px",
          }}
        >
          <div
            className="panel"
            style={{
              padding: "18px",
            }}
          >
            <div
              style={{
                display:
                  "flex",
                alignItems:
                  "center",
                gap: "10px",
                marginBottom:
                  "12px",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height:
                    "36px",
                  borderRadius:
                    "10px",
                  display:
                    "flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "center",
                  background:
                    "rgba(255,255,255,.06)",
                  color:
                    "var(--accent)",
                }}
              >
                {preferences.favoriteType ===
                "Séries" ? (
                  <Tv size={19} />
                ) : (
                  <Film size={19} />
                )}
              </div>

              <span
                className="muted"
                style={{
                  fontSize:
                    "13px",
                }}
              >
                Tipo favorito
              </span>
            </div>

            <strong
              style={{
                display:
                  "block",
                fontSize:
                  "20px",
                marginBottom:
                  "6px",
              }}
            >
              {
                preferences.favoriteType
              }
            </strong>

            <p
              className="muted"
              style={{
                margin: 0,
                fontSize:
                  "13px",
                lineHeight:
                  1.5,
              }}
            >
              {
                preferences.favoriteTypeDescription
              }
            </p>
          </div>

          <div
            className="panel"
            style={{
              padding: "18px",
            }}
          >
            <div
              style={{
                display:
                  "flex",
                alignItems:
                  "center",
                gap: "10px",
                marginBottom:
                  "12px",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height:
                    "36px",
                  borderRadius:
                    "10px",
                  display:
                    "flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "center",
                  background:
                    "rgba(255,255,255,.06)",
                  color:
                    "var(--accent)",
                }}
              >
                <BarChart3
                  size={19}
                />
              </div>

              <span
                className="muted"
                style={{
                  fontSize:
                    "13px",
                }}
              >
                Seu status mais
                comum
              </span>
            </div>

            <strong
              style={{
                display:
                  "block",
                fontSize:
                  "20px",
                marginBottom:
                  "6px",
              }}
            >
              {
                preferences.mainStatus
              }
            </strong>

            <p
              className="muted"
              style={{
                margin: 0,
                fontSize:
                  "13px",
                lineHeight:
                  1.5,
              }}
            >
              {
                preferences.mainStatusDescription
              }
            </p>
          </div>

          <div
            className="panel"
            style={{
              padding: "18px",
            }}
          >
            <div
              style={{
                display:
                  "flex",
                alignItems:
                  "center",
                gap: "10px",
                marginBottom:
                  "12px",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height:
                    "36px",
                  borderRadius:
                    "10px",
                  display:
                    "flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "center",
                  background:
                    "rgba(255,255,255,.06)",
                  color:
                    "var(--accent)",
                }}
              >
                <Star size={19} />
              </div>

              <span
                className="muted"
                style={{
                  fontSize:
                    "13px",
                }}
              >
                Seu estilo de
                avaliação
              </span>
            </div>

            <strong
              style={{
                display:
                  "block",
                fontSize:
                  "20px",
                marginBottom:
                  "6px",
              }}
            >
              {
                preferences.ratingStyle
              }
            </strong>

            <p
              className="muted"
              style={{
                margin: 0,
                fontSize:
                  "13px",
                lineHeight:
                  1.5,
              }}
            >
              {
                preferences.ratingDescription
              }
            </p>
          </div>
        </div>

        <div
          className="panel"
          style={{
            marginTop:
              "12px",
            padding:
              "18px",
            display:
              "flex",
            alignItems:
              "center",
            gap: "14px",
          }}
        >
          <div
            style={{
              width: "42px",
              height:
                "42px",
              minWidth:
                "42px",
              borderRadius:
                "12px",
              display:
                "flex",
              alignItems:
                "center",
              justifyContent:
                "center",
              background:
                "rgba(255,255,255,.06)",
              color:
                "var(--accent)",
            }}
          >
            <Sparkles
              size={21}
            />
          </div>

          <div>
            <strong>
              Perfil de
              espectador
            </strong>

            <p
              className="muted"
              style={{
                margin:
                  "4px 0 0",
                fontSize:
                  "13px",
              }}
            >
              {stats.total ===
              0
                ? "Comece adicionando filmes e séries para o MyCatalog conhecer melhor seus gostos."
                : stats.movies ===
                  stats.series
                ? "Você tem um gosto equilibrado entre filmes e séries."
                : stats.movies >
                  stats.series
                ? "Seu catálogo mostra uma preferência maior por filmes."
                : "Seu catálogo mostra uma preferência maior por séries."}
            </p>
          </div>
        </div>
      </section>

      {/* CONQUISTAS */}

      <section className="section">
        <div className="section-head">
          <div>
            <h2>
              Conquistas
            </h2>

            <p
              className="muted"
              style={{
                marginTop:
                  "4px",
              }}
            >
              Complete objetivos
              e desbloqueie
              novas conquistas.
            </p>
          </div>

          <strong>
            {unlockedAchievements}/
            {achievements.length}
          </strong>
        </div>

        {/* PROGRESSO */}

        <div
          className="panel"
          style={{
            padding:
              "18px",
            marginBottom:
              "14px",
          }}
        >
          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              alignItems:
                "center",
              gap: "12px",
              marginBottom:
                "10px",
            }}
          >
            <div
              style={{
                display:
                  "flex",
                alignItems:
                  "center",
                gap: "10px",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height:
                    "40px",
                  borderRadius:
                    "11px",
                  display:
                    "flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "center",
                  background:
                    "rgba(255,255,255,.06)",
                  color:
                    "var(--accent)",
                }}
              >
                <Trophy
                  size={21}
                />
              </div>

              <div>
                <strong>
                  Progresso das
                  conquistas
                </strong>

                <p
                  className="muted"
                  style={{
                    margin:
                      "3px 0 0",
                    fontSize:
                      "12px",
                  }}
                >
                  {
                    unlockedAchievements
                  }{" "}
                  de{" "}
                  {
                    achievements.length
                  }{" "}
                  desbloqueadas
                </p>
              </div>
            </div>

            <strong>
              {
                achievementPercentage
              }
              %
            </strong>
          </div>

          <div
            style={{
              width:
                "100%",
              height:
                "9px",
              borderRadius:
                "999px",
              background:
                "rgba(255,255,255,.08)",
              overflow:
                "hidden",
            }}
          >
            <div
              style={{
                width: `${achievementPercentage}%`,
                height:
                  "100%",
                borderRadius:
                  "999px",
                background:
                  "var(--accent)",
                transition:
                  "width .35s ease",
              }}
            />
          </div>
        </div>

        {/* FILTROS */}

        <div
          className="filters"
          style={{
            marginBottom:
              "16px",
          }}
        >
          {[
            ["all", "Todas"],
            [
              "library",
              "Biblioteca",
            ],
            [
              "movies",
              "Filmes",
            ],
            [
              "series",
              "Séries",
            ],
            [
              "ratings",
              "Notas",
            ],
            [
              "genres",
              "Gêneros",
            ],
            [
              "time",
              "Tempo",
            ],
            [
              "special",
              "Especiais",
            ],
          ].map(
            ([value, label]) => (
              <button
                key={value}
                className={
                  "chip " +
                  (achievementFilter ===
                  value
                    ? "active"
                    : "")
                }
                onClick={() =>
                  setAchievementFilter(
                    value as AchievementCategory
                  )
                }
              >
                {label}
              </button>
            )
          )}
        </div>

        {/* GRID */}

        <div
          style={{
            display:
              "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "12px",
          }}
        >
          {filteredAchievements.map(
            (achievement) => {
              const percentage =
                achievement.target >
                0
                  ? Math.round(
                      (achievement.progress /
                        achievement.target) *
                        100
                    )
                  : 0;

              return (
                <div
                  key={
                    achievement.id
                  }
                  className="panel"
                  style={{
                    padding:
                      "18px",
                    position:
                      "relative",
                    overflow:
                      "hidden",
                    opacity:
                      achievement.unlocked
                        ? 1
                        : 0.72,
                    transition:
                      "transform .2s ease, border-color .2s ease",
                  }}
                >
                  <div
                    style={{
                      display:
                        "flex",
                      alignItems:
                        "flex-start",
                      gap: "13px",
                    }}
                  >
                    <div
                      style={{
                        width:
                          "44px",
                        height:
                          "44px",
                        minWidth:
                          "44px",
                        borderRadius:
                          "12px",
                        display:
                          "flex",
                        alignItems:
                          "center",
                        justifyContent:
                          "center",
                        background:
                          achievement.unlocked
                            ? "rgba(255,255,255,.08)"
                            : "rgba(255,255,255,.04)",
                        color:
                          achievement.unlocked
                            ? "var(--accent)"
                            : "var(--muted)",
                      }}
                    >
                      {achievement.unlocked ? (
                        getAchievementIcon(
                          achievement.icon,
                          true
                        )
                      ) : (
                        <Lock
                          size={19}
                        />
                      )}
                    </div>

                    <div
                      style={{
                        minWidth:
                          0,
                        flex: 1,
                      }}
                    >
                      <strong
                        style={{
                          display:
                            "block",
                          fontSize:
                            "16px",
                          marginBottom:
                            "5px",
                        }}
                      >
                        {
                          achievement.title
                        }
                      </strong>

                      <p
                        className="muted"
                        style={{
                          margin:
                            0,
                          fontSize:
                            "13px",
                          lineHeight:
                            1.5,
                        }}
                      >
                        {
                          achievement.description
                        }
                      </p>
                    </div>
                  </div>

                  {!achievement.unlocked && (
                    <div
                      style={{
                        marginTop:
                          "15px",
                      }}
                    >
                      <div
                        style={{
                          display:
                            "flex",
                          justifyContent:
                            "space-between",
                          alignItems:
                            "center",
                          marginBottom:
                            "6px",
                          fontSize:
                            "11px",
                        }}
                      >
                        <span className="muted">
                          Progresso
                        </span>

                        <strong>
                          {
                            achievement.progress
                          }
                          /
                          {
                            achievement.target
                          }
                        </strong>
                      </div>

                      <div
                        style={{
                          width:
                            "100%",
                          height:
                            "7px",
                          borderRadius:
                            "999px",
                          background:
                            "rgba(255,255,255,.07)",
                          overflow:
                            "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${percentage}%`,
                            height:
                              "100%",
                            borderRadius:
                              "999px",
                            background:
                              "var(--accent)",
                            transition:
                              "width .3s ease",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {achievement.unlocked && (
                    <div
                      style={{
                        display:
                          "inline-flex",
                        alignItems:
                          "center",
                        gap: "5px",
                        marginTop:
                          "14px",
                        fontSize:
                          "12px",
                        color:
                          "var(--accent)",
                      }}
                    >
                      <Check
                        size={14}
                      />

                      Desbloqueada
                    </div>
                  )}
                </div>
              );
            }
          )}
        </div>

        {filteredAchievements.length ===
          0 && (
          <div className="empty">
            Nenhuma conquista
            encontrada.
          </div>
        )}
      </section>
    </div>
  );
}
