import { CalendarDays, Clock3, Play } from "lucide-react";

/*
 * ============================================================
 * ARQUIVO NOVO — app/title/[type]/[id]/TitleAbout.tsx
 *
 * SERVER COMPONENT (sem "use client").
 *
 * O QUE É
 *   O bloco <div className="title-info-main"> que hoje está nas
 *   linhas 1510–1621 do TitleView.tsx: cabeçalho "Sobre",
 *   sinopse, gêneros e os cards de fatos.
 *
 * POR QUE ELE PODE SAIR DAQUELE ARQUIVO
 *   Porque lê SÓ `details`. Não toca em libraryItem, status,
 *   favorite, rating nem em nenhum outro estado do cliente.
 *   Foi a checagem que fiz antes de propor este estágio — e a
 *   razão de ele ser viável.
 *
 * O QUE ISTO ENTREGA
 *   A sinopse é o texto que o Google usa para entender a
 *   página. Hoje ela só existe depois do JavaScript rodar.
 *   Passa a estar no HTML entregue pelo servidor.
 *
 * NOTA SOBRE OS GÊNEROS
 *   Uso `genre.name` quando é objeto e o valor direto quando é
 *   texto — o mesmo tratamento do arquivo original. Se ainda
 *   aparecer JSON cru em algum título, é aquela questão dos
 *   dados na tabela `media`, não deste componente.
 * ============================================================
 */

function nomeDoGenero(genre: any): string {
  if (!genre) return "";
  if (typeof genre === "object") return genre.name || "";

  const texto = String(genre).trim();

  /* Terceiro caso: string contendo JSON. */
  if (texto.startsWith("{") && texto.includes('"name"')) {
    try {
      return JSON.parse(texto).name || texto;
    } catch {
      return texto;
    }
  }

  return texto;
}

export function TitleAbout({
  details,
  type,
}: {
  details: any;
  type: string;
}) {
  const runtime = details.runtime || null;

  const generos = (details.genres || [])
    .map((g: any) => ({ nome: nomeDoGenero(g), id: g?.id ?? g }))
    .filter((g: any) => g.nome);

  return (
    <div className="title-info-main">
      <div className="title-section-heading">
        <span>Sobre</span>
        <h2>{type === "tv" ? "Sobre a série" : "Sobre o filme"}</h2>
      </div>

      <p className="title-overview">
        {details.overview || "Sem sinopse disponível."}
      </p>

      {generos.length > 0 && (
        <div className="title-genres">
          {generos.map((g: any) => (
            <span key={g.id}>{g.nome}</span>
          ))}
        </div>
      )}

      <div className="title-facts">
        <div className="title-fact">
          <CalendarDays size={18} />
          <div>
            <span>Lançamento</span>
            <strong>
              {(
                details.first_air_date ||
                details.release_date ||
                "—"
              )
                .split("-")
                .reverse()
                .join("/")}
            </strong>
          </div>
        </div>

        {runtime && (
          <div className="title-fact">
            <Clock3 size={18} />
            <div>
              <span>Duração</span>
              <strong>
                {Math.floor(runtime / 60) > 0
                  ? `${Math.floor(runtime / 60)}h ${runtime % 60}min`
                  : `${runtime}min`}
              </strong>
            </div>
          </div>
        )}

        {type === "tv" && (
          <div className="title-fact">
            <Play size={18} />
            <div>
              <span>Conteúdo</span>
              <strong>
                {details.number_of_seasons || 0}{" "}
                {details.number_of_seasons === 1
                  ? "temporada"
                  : "temporadas"}
                {" · "}
                {details.number_of_episodes || 0} episódios
              </strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
