"use client";

import { Search as SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { img } from "@/lib/tmdb";
import Link from "next/link";

export function Search() {
  const router = useRouter();

  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const query = q.trim();

      if (query.length < 2) {
        setResults([]);
        return;
      }

      try {
        setLoading(true);

        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query)}`
        );

        const data = await response.json();

        setResults(
          (data.results || [])
            .filter(
              (item: any) =>
                item.media_type === "movie" ||
                item.media_type === "tv"
            )
            .slice(0, 7)
        );
      } catch (error) {
        console.error(error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [q]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const query = q.trim();

    if (query.length < 2) return;

    setResults([]);

    router.push(
      `/search?q=${encodeURIComponent(query)}`
    );
  }

  return (
    <form
      className="search"
      onSubmit={handleSubmit}
    >
      <SearchIcon size={19} />

      <input
        value={q}
        onChange={(event) =>
          setQ(event.target.value)
        }
        placeholder="Pesquisar filmes e séries..."
      />

      {loading && (
        <span className="search-loading">
          ...
        </span>
      )}

      {results.length > 0 && (
        <div className="results">
          {results.map((item) => (
            <Link
              className="result"
              href={`/title/${item.media_type}/${item.id}`}
              onClick={() => setQ("")}
              key={`${item.media_type}-${item.id}`}
            >
              <img
                src={img(
                  item.poster_path,
                  "w92"
                )}
                alt={
                  item.title ||
                  item.name
                }
              />

              <div>
                <b>
                  {item.title ||
                    item.name}
                </b>

                <div className="muted">
                  {(
                    item.release_date ||
                    item.first_air_date ||
                    ""
                  ).slice(0, 4)}

                  {" · "}

                  {item.media_type === "tv"
                    ? "Série"
                    : "Filme"}
                </div>
              </div>
            </Link>
          ))}

          <button
            type="submit"
            className="search-see-all"
          >
            Ver todos os resultados
          </button>
        </div>
      )}
    </form>
  );
}