/*
 * V2.2-A (gate) — versão global da Library para caches de sessão.
 *
 * O cache de "Para você" (e o de pintura rápida da Home) contém estado
 * pessoal (salvo/status/favorito/nota). Sem invalidação, uma mudança feita em
 * OUTRA página (ou dentro da própria tela) deixava esse estado errado por até
 * 10 minutos.
 *
 * Mecanismo (sem polling, sem infraestrutura): um contador em sessionStorage
 * que sobe a cada mutação BEM-SUCEDIDA de dados que alimentam esses caches
 * (`LibraryMutationWatcher` observa as respostas do `fetch` — as mutações
 * estão espalhadas por ~20 arquivos e não passam por um cliente único). Cada
 * entrada de cache guarda a versão vista quando a requisição COMEÇOU; ao ler,
 * só vale se a versão atual for a mesma (corrida segura: mutação durante um
 * fetch em voo invalida o resultado desse fetch).
 */
const VERSION_KEY = "mycatalog:library-version";

export function getLibraryVersion(): number {
  try {
    return Number(sessionStorage.getItem(VERSION_KEY) || "0") || 0;
  } catch {
    return 0;
  }
}

export function bumpLibraryVersion(): void {
  try {
    sessionStorage.setItem(VERSION_KEY, String(getLibraryVersion() + 1));

    // Libera espaço: entradas antigas já não valeriam mesmo.
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith("mycatalog:foryou:")) sessionStorage.removeItem(key);
    }
  } catch {
    /* storage indisponível: sem cache, sem problema */
  }
}

/*
 * Endpoints que escrevem em `library_items` / `user_hidden_titles`
 * (auditado: library, library/[id], episodes, watch-history(+[id]), import,
 * import/letterboxd, not-interested, account/hidden-titles). `library/state`
 * é POST só de LEITURA e `library/sync-seasons` tem evento próprio.
 */
const MUTATING_PATH =
  /^\/api\/(library(?!\/state|\/sync-seasons)(\/|$)|watch-history|episodes|not-interested|account\/hidden-titles|account\/import)/;

export function isLibraryMutation(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = (
    init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
  ).toUpperCase();

  if (method === "GET" || method === "HEAD") return false;

  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;

  try {
    const url = new URL(raw, window.location.origin);

    return url.origin === window.location.origin && MUTATING_PATH.test(url.pathname);
  } catch {
    return false;
  }
}
