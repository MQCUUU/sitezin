"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search } from "@/components/Search";
import {
  Heart,
  Plus,
  Trash2,
  Check,
  Loader2,
} from "lucide-react";
import { img } from "@/lib/tmdb";
import Link from "next/link";

type LibraryState = {
  library_id: string;
  favorite: boolean;
};

export default function SearchPage() {
  const searchParams = useSearchParams();

  const query =
    searchParams.get("q")?.trim() || "";

  const [results, setResults] = useState<any[]>(
    []
  );

  const [library, setLibrary] = useState<
    LibraryState[]
  >([]);

  const [loading, setLoading] =
    useState(true);

  const [processing, setProcessing] =
    useState<string | null>(null);

  useEffect(() => {
    if (!query) {
      setResults([]);
      setLoading(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);

        const [searchResponse, libraryResponse] =
          await Promise.all([
            fetch(
              `/api/search?q=${encodeURIComponent(
                query
              )}`
            ),
            fetch("/api/library"),
          ]);

        const searchData =
          await searchResponse.json();

        setResults(
          (searchData.results || []).filter(
            (item: any) =>
              item.media_type === "movie" ||
              item.media_type === "tv"
          )
        );

        if (libraryResponse.ok) {
          const libraryData =
            await libraryResponse.json();

          if (Array.isArray(libraryData)) {
            setLibrary(
              libraryData.map((item: any) => ({
                library_id: String(
                  item.id
                ),
                tmdb_id:
                  item.media?.tmdb_id,
                media_type:
                  item.media?.media_type,
                favorite:
                  Boolean(item.favorite),
              }))
            );
          }
        } else {
          setLibrary([]);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [query]);

  function getLibraryItem(
    item: any
  ) {
    return library.find(
      (entry: any) =>
        Number(entry.tmdb_id) ===
          Number(item.id) &&
        entry.media_type ===
          item.media_type
    );
  }

  async function addToLibrary(
    item: any,
    favorite = false
  ) {
    const key =
      `${item.media_type}-${item.id}`;

    try {
      setProcessing(key);

      const response = await fetch(
        "/api/library",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            media: {
              ...item,
              media_type:
                item.media_type,
              title:
                item.title ||
                item.name,
              original_title:
                item.original_title ||
                item.original_name,
              genres:
                item.genres || [],
            },

            status: "want",

            favorite,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          alert(
            "Você precisa estar logado para adicionar títulos à sua biblioteca."
          );
          return;
        }

        throw new Error(
          data?.error ||
            "Não foi possível adicionar."
        );
      }

      setLibrary((current) => {
        const withoutCurrent =
          current.filter(
            (entry: any) =>
              !(
                Number(entry.tmdb_id) ===
                  Number(item.id) &&
                entry.media_type ===
                  item.media_type
              )
          );

        return [
          ...withoutCurrent,
          {
            library_id: String(
              data.id
            ),
            tmdb_id: item.id,
            media_type:
              item.media_type,
            favorite:
              Boolean(data.favorite),
          },
        ];
      });
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Erro ao adicionar."
      );
    } finally {
      setProcessing(null);
    }
  }

  async function toggleFavorite(
    item: any
  ) {
    const existing =
      getLibraryItem(item);

    if (!existing) {
      await addToLibrary(
        item,
        true
      );
      return;
    }

    const newFavorite =
      !existing.favorite;

    const key =
      `${item.media_type}-${item.id}`;

    try {
      setProcessing(key);

      const response = await fetch(
        "/api/library",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            media: {
              ...item,
              media_type:
                item.media_type,
              title:
                item.title ||
                item.name,
              original_title:
                item.original_title ||
                item.original_name,
            },

            status: "want",

            favorite: newFavorite,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          alert(
            "Você precisa estar logado para favoritar títulos."
          );
          return;
        }

        throw new Error(
          data?.error ||
            "Não foi possível atualizar."
        );
      }

      setLibrary((current) =>
        current.map((entry) =>
          entry.library_id ===
          existing.library_id
            ? {
                ...entry,
                favorite:
                  newFavorite,
              }
            : entry
        )
      );
    } catch (error) {
      console.error(error);
    } finally {
      setProcessing(null);
    }
  }

  async function removeFromLibrary(
    item: any
  ) {
    const existing =
      getLibraryItem(item);

    if (!existing) return;

    const confirmed =
      window.confirm(
        `Remover "${
          item.title ||
          item.name
        }" da sua biblioteca?`
      );

    if (!confirmed) return;

    const key =
      `${item.media_type}-${item.id}`;

    try {
      setProcessing(key);

      const response = await fetch(
        `/api/library?id=${encodeURIComponent(
          existing.library_id
        )}`,
        {
          method: "DELETE",
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Não foi possível remover."
        );
      }

      setLibrary((current) =>
        current.filter(
          (entry) =>
            entry.library_id !==
            existing.library_id
        )
      );
    } catch (error) {
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Erro ao remover."
      );
    } finally {
      setProcessing(null);
    }
  }

  const movies =
    results.filter(
      (item) =>
        item.media_type === "movie"
    );

  const series =
    results.filter(
      (item) =>
        item.media_type === "tv"
    );

  return (
    <>
      <div className="topbar">
        <Search />
      </div>

      <div className="section">
        <div className="eyebrow">
          Pesquisa
        </div>

        <h1>
          Resultados para "{query}"
        </h1>

        {loading ? (
          <div className="empty">
            <Loader2
              className="spin"
              size={24}
            />

            <span>
              Procurando na TMDB...
            </span>
          </div>
        ) : results.length === 0 ? (
          <div className="empty">
            Nenhum filme ou série
            encontrado.
          </div>
        ) : (
          <>
            {movies.length > 0 && (
              <SearchSection
                title="Filmes"
                items={movies}
                getLibraryItem={
                  getLibraryItem
                }
                processing={
                  processing
                }
                onAdd={addToLibrary}
                onFavorite={
                  toggleFavorite
                }
                onRemove={
                  removeFromLibrary
                }
              />
            )}

            {series.length > 0 && (
              <SearchSection
                title="Séries"
                items={series}
                getLibraryItem={
                  getLibraryItem
                }
                processing={
                  processing
                }
                onAdd={addToLibrary}
                onFavorite={
                  toggleFavorite
                }
                onRemove={
                  removeFromLibrary
                }
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

function SearchSection({
  title,
  items,
  getLibraryItem,
  processing,
  onAdd,
  onFavorite,
  onRemove,
}: any) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>
          {title}
        </h2>

        <span className="muted">
          {items.length} resultados
        </span>
      </div>

      <div className="grid">
        {items.map(
          (item: any) => {
            const libraryItem =
              getLibraryItem(item);

            const key =
              `${item.media_type}-${item.id}`;

            const isProcessing =
              processing === key;

            return (
              <div
                className="card"
                key={key}
              >
                <div className="poster">
                  <Link
                    href={`/title/${item.media_type}/${item.id}`}
                  >
                    <img
                      src={img(
                        item.poster_path
                      )}
                      alt={
                        item.title ||
                        item.name
                      }
                    />
                  </Link>

                  <span className="badge">
                    {item.media_type ===
                    "tv"
                      ? "SÉRIE"
                      : "FILME"}
                  </span>

                  <div className="card-actions">
                    <button
                      type="button"
                      className={
                        libraryItem?.favorite
                          ? "card-action active"
                          : "card-action"
                      }
                      title={
                        libraryItem?.favorite
                          ? "Remover dos favoritos"
                          : "Favoritar"
                      }
                      disabled={
                        isProcessing
                      }
                      onClick={() =>
                        onFavorite(
                          item
                        )
                      }
                    >
                      <Heart
                        size={17}
                        fill={
                          libraryItem?.favorite
                            ? "currentColor"
                            : "none"
                        }
                      />
                    </button>

                    {libraryItem ? (
                      <button
                        type="button"
                        className="card-action remove"
                        title="Remover da biblioteca"
                        disabled={
                          isProcessing
                        }
                        onClick={() =>
                          onRemove(
                            item
                          )
                        }
                      >
                        {isProcessing ? (
                          <Loader2
                            size={17}
                            className="spin"
                          />
                        ) : (
                          <Trash2
                            size={17}
                          />
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="card-action add"
                        title="Adicionar à biblioteca"
                        disabled={
                          isProcessing
                        }
                        onClick={() =>
                          onAdd(
                            item
                          )
                        }
                      >
                        {isProcessing ? (
                          <Loader2
                            size={17}
                            className="spin"
                          />
                        ) : (
                          <Plus
                            size={18}
                          />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <Link
                  href={`/title/${item.media_type}/${item.id}`}
                  className="card-title"
                >
                  {item.title ||
                    item.name}
                </Link>

                <div className="card-meta">
                  <span>
                    {(
                      item.release_date ||
                      item.first_air_date ||
                      ""
                    ).slice(0, 4)}
                  </span>

                  {item.vote_average > 0 && (
                    <span className="rating">
                      ★{" "}
                      {Number(
                        item.vote_average
                      ).toFixed(1)}
                    </span>
                  )}

                  {libraryItem && (
                    <span className="in-library">
                      <Check
                        size={13}
                      />
                      Na biblioteca
                    </span>
                  )}
                </div>
              </div>
            );
          }
        )}
      </div>
    </section>
  );
}