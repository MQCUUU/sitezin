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
  Target,
  Sparkles,
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

        const response = await fetch("/api/library");

        if (response.ok) {
          const data = await response.json();

          const library = Array.isArray(data)
            ? data
            : [];

          const movies = library.filter(
            (item: any) =>
              item.media?.media_type === "movie"
          ).length;

          const series = library.filter(
            (item: any) =>
              item.media?.media_type === "tv"
          ).length;

          const favorites = library.filter(
            (item: any) =>
              item.favorite === true
          ).length;

          const watched = library.filter(
            (item: any) =>
              item.status === "watched"
          ).length;

          const watching = library.filter(
            (item: any) =>
              item.status === "watching"
          ).length;

          const want = library.filter(
            (item: any) =>
              item.status === "want"
          ).length;

          const ratings = library
            .map((item: any) => {
              if (
                item.personal_rating === null ||
                item.personal_rating === undefined
              ) {
                return null;
              }

              const value = Number(
                item.personal_rating
              );

              return Number.isNaN(value)
                ? null
                : value;
            })
            .filter(
              (
                value: number | null
              ): value is number =>
                value !== null
            );

          let averageRating: number | null = null;

          if (ratings.length > 0) {
            const totalRating = ratings.reduce(
              (sum, value) => sum + value,
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
           * ============================
           * PREFERÊNCIAS AUTOMÁTICAS
           * ============================
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
        }
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

  async function saveProfile() {
    if (!user || saving) return;

    try {
      setSaving(true);

      const supabase = createClient();

      const { data, error } =
        await supabase.auth.updateUser({
          data: {
            name: name.trim(),
            avatar_url: avatar.trim(),
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
        user?.user_metadata?.full_name ||
        ""
    );

    setAvatar(
      user?.user_metadata?.avatar_url ||
        ""
    );
  }

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
                margin: "6px 0 0",
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
              margin: "6px 0 0",
            }}
          >
            Meu perfil
          </h1>

          <p className="muted">
            Sua atividade e suas preferências.
          </p>
        </div>
      </div>

      {/* PERFIL */}

      <section className="profile-card panel">
        <div className="profile-avatar-wrapper">
          {avatar ? (
            <img
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
                  onChange={(event) =>
                    setName(
                      event.target.value
                    )
                  }
                  placeholder="Seu nome"
                />
              </label>

              <label>
                URL do avatar

                <input
                  value={avatar}
                  onChange={(event) =>
                    setAvatar(
                      event.target.value
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
                onClick={saveProfile}
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

            <span>
              Filmes
            </span>

            <strong>
              {stats.movies}
            </strong>
          </div>

          <div className="profile-stat">
            <Tv size={20} />

            <span>
              Séries
            </span>

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

      {/* ESTATÍSTICAS PESSOAIS */}

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

            <span>
              Assistidos
            </span>

            <strong>
              {stats.watched}
            </strong>
          </div>

          <div className="profile-stat">
            <Play size={20} />

            <span>
              Assistindo
            </span>

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
            borderRadius: "999px",
            background:
              "rgba(255,255,255,.08)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              borderRadius: "999px",
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
                marginTop: "4px",
              }}
            >
              Descobertas automaticamente
              com base na sua biblioteca.
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
          {/* TIPO FAVORITO */}

          <div
            className="panel"
            style={{
              padding: "18px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "12px",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
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
                  fontSize: "13px",
                }}
              >
                Tipo favorito
              </span>
            </div>

            <strong
              style={{
                display: "block",
                fontSize: "20px",
                marginBottom: "6px",
              }}
            >
              {preferences.favoriteType}
            </strong>

            <p
              className="muted"
              style={{
                margin: 0,
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              {
                preferences.favoriteTypeDescription
              }
            </p>
          </div>

          {/* STATUS PREDOMINANTE */}

          <div
            className="panel"
            style={{
              padding: "18px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "12px",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background:
                    "rgba(255,255,255,.06)",
                  color:
                    "var(--accent)",
                }}
              >
                <BarChart3 size={19} />
              </div>

              <span
                className="muted"
                style={{
                  fontSize: "13px",
                }}
              >
                Seu status mais comum
              </span>
            </div>

            <strong
              style={{
                display: "block",
                fontSize: "20px",
                marginBottom: "6px",
              }}
            >
              {preferences.mainStatus}
            </strong>

            <p
              className="muted"
              style={{
                margin: 0,
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              {
                preferences.mainStatusDescription
              }
            </p>
          </div>

          {/* ESTILO DE AVALIAÇÃO */}

          <div
            className="panel"
            style={{
              padding: "18px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "12px",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
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
                  fontSize: "13px",
                }}
              >
                Seu estilo de avaliação
              </span>
            </div>

            <strong
              style={{
                display: "block",
                fontSize: "20px",
                marginBottom: "6px",
              }}
            >
              {preferences.ratingStyle}
            </strong>

            <p
              className="muted"
              style={{
                margin: 0,
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              {
                preferences.ratingDescription
              }
            </p>
          </div>
        </div>

        {/* RESUMO DA PREFERÊNCIA */}

        <div
          className="panel"
          style={{
            marginTop: "12px",
            padding: "18px",
            display: "flex",
            alignItems: "center",
            gap: "14px",
          }}
        >
          <div
            style={{
              width: "42px",
              height: "42px",
              minWidth: "42px",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background:
                "rgba(255,255,255,.06)",
              color:
                "var(--accent)",
            }}
          >
            <Sparkles size={21} />
          </div>

          <div>
            <strong>
              Perfil de espectador
            </strong>

            <p
              className="muted"
              style={{
                margin: "4px 0 0",
                fontSize: "13px",
              }}
            >
              {stats.total === 0
                ? "Comece adicionando filmes e séries para o MyCatalog conhecer melhor seus gostos."
                : stats.movies === stats.series
                ? "Você tem um gosto equilibrado entre filmes e séries."
                : stats.movies > stats.series
                ? "Seu catálogo mostra uma preferência maior por filmes."
                : "Seu catálogo mostra uma preferência maior por séries."}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}