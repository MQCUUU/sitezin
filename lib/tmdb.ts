const BASE = "https://api.themoviedb.org/3";

export const img = (path?: string, size = "w500") => {
  return path
    ? `https://image.tmdb.org/t/p/${size}${path}`
    : "/placeholder.svg";
};

async function tmdb(path: string) {
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) {
    throw new Error("TMDB_API_KEY não configurada");
  }

  const separator = path.includes("?") ? "&" : "?";

  const response = await fetch(
    `${BASE}${path}${separator}api_key=${encodeURIComponent(apiKey)}`,
    {
      headers: {
        accept: "application/json",
      },
      next: {
        revalidate: 86400,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TMDB ${response.status}: ${error}`);
  }

  return response.json();
}

export async function searchTMDB(q: string) {
  return tmdb(
    `/search/multi?query=${encodeURIComponent(q)}&include_adult=false&language=${
      process.env.TMDB_LANGUAGE || "pt-BR"
    }`
  );
}

export async function detailsTMDB(
  type: "movie" | "tv",
  id: number
) {
  return tmdb(
    `/${type}/${id}?language=${
      process.env.TMDB_LANGUAGE || "pt-BR"
    }&append_to_response=credits,videos,images`
  );
}
