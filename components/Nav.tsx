"use client";


import "@/styles/features/nav.css";
import "@/styles/features/appbar.css";
import Link from "next/link";
import { BrandLogo, BrandMark } from "@/components/brand/BrandMark";
import { usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Suspense, useEffect, useRef, useState } from "react";
import { Search } from "@/components/Search";
import { PickForMeLauncher } from "@/components/PickForMeLauncher";
import { useAuthState } from "@/hooks/useLibraryAuth";
import { useModal } from "@/hooks/useModal";
import { apiFetch } from "@/lib/api-client";
import { RECOMMENDATIONS_SEEN_EVENT } from "@/components/for-you/ForYouViewTabs";
import { navIndicatorTransition, popoverTransition, sheetExitTransition, sheetTransition } from "@/lib/motion";

import {
  Bookmark,
  House,
  Library,
  ChartNoAxesCombined,
  BookOpenText,
  Sparkles,
  CalendarDays,
  Compass,
  Bot,
  List,
  MoreHorizontal,
  ChevronDown,
  X,
} from "lucide-react";

/*
 * ==========================================
 * ITENS DA NAVEGAÇÃO
 * ==========================================
 *
 * 9 destinos de primeiro nível (V2.1-B reduziu de 12; Watchlist entrou depois):
 * - Estatísticas + Meu Ranking + Retrospectiva são "Insights" (um item,
 *   ativo em /insights, /stats, /ranking e /retrospective — ver InsightsSubNav).
 * - "/favorites" redireciona para "/library?favorite=true".
 * - Fase 3: o Assistente IA é destino secundário — aparece no fim da barra
 *   lateral (antes só existia no "Mais" do celular e num atalho do Para você).
 *
 * Perfil, Configurações e Sair ficam no AccountMenu (canto superior direito).
 */

const INSIGHTS_ROUTES = ["/insights", "/stats", "/ranking", "/retrospective"];

const items = [
  ["/", "Início", House],
  ["/discover", "Descobrir", Compass],
  ["/for-you", "Para você", Sparkles],
  ["/library", "Biblioteca", Library],
  ["/diary", "Diário", BookOpenText],
  ["/calendar", "Calendário", CalendarDays],
  ["/insights", "Insights", ChartNoAxesCombined],
  ["/lists", "Listas", List],
  // Watchlist automática: tudo que está como "Quero assistir", em ordem de prioridade.
  ["/watchlist", "Watchlist", Bookmark],
] as const;

/*
 * Fase 1 (P3-10): rotas privadas só são pré-carregadas com sessão confirmada.
 * Para visitante, cada prefetch virava um redirect para /login sem utilidade.
 */
/*
 * Projeção (Fase 3) — barra superior. Prioridade de cada destino na barra do
 * desktop; o que não cabe na largura vai para "Mais" (só CSS, sem medir):
 *   1 sempre na barra, 2 a partir de 1024 px, 3 a partir de 1360 px, 4 só no "Mais".
 */
const BAR_PRIORITY: Record<string, 1 | 2 | 3 | 4> = {
  "/": 1,
  "/discover": 1,
  "/for-you": 2,
  "/library": 1,
  "/diary": 3,
  "/calendar": 3,
  "/insights": 3,
  "/lists": 3,
  "/watchlist": 4,
  "/assistant": 4,
};

const PUBLIC_NAV_ROUTES = new Set<string>(["/", "/discover"]);
const secondaryItems = [
  ["/assistant", "Assistente IA", Bot],
] as const;

/*
 * ==========================================
 * ROTAS SEM NAVEGAÇÃO
 * ==========================================
 *
 * Login, cadastro e recuperação de senha
 * possuem layout próprio.
 */

const authRoutes = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
];

/*
 * Indicações (0010): quantas indicações recebidas ainda não foram vistas. Busca ao
 * montar e a cada troca de rota; zera quando "Dos amigos" avisa que abriu.
 */
function useUnseenRecommendations(authState: string, pathname: string) {
  const [unseen, setUnseen] = useState(0);
  useEffect(() => {
    if (authState !== "authenticated") {
      setUnseen(0);
      return;
    }
    let alive = true;
    apiFetch<{ unseen: number }>("/api/recommendations/summary", { cache: "no-store" })
      .then((data) => alive && setUnseen(Number(data.unseen) || 0))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [authState, pathname]);
  useEffect(() => {
    const clear = () => setUnseen(0);
    window.addEventListener(RECOMMENDATIONS_SEEN_EVENT, clear);
    return () => window.removeEventListener(RECOMMENDATIONS_SEEN_EVENT, clear);
  }, []);
  return unseen;
}

function countLabel(label: string, count: number) {
  return count ? `${label}, ${count} ${count === 1 ? "indicação nova" : "indicações novas"}` : undefined;
}

export function Nav() {
  const pathname = usePathname();
  const authState = useAuthState();
  const unseen = useUnseenRecommendations(authState, pathname);
  const countFor = (href: string) => (href === "/for-you" ? unseen : 0);
  const prefetchFor = (href: string) =>
    PUBLIC_NAV_ROUTES.has(href) || authState === "authenticated" ? undefined : false;
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [pathname]);

  // Fase 7: Escape, laço do Tab, foco inicial/devolução e trava de rolagem (useModal → lib/modal-a11y).
  const moreSheetRef = useModal(moreOpen, () => setMoreOpen(false));

  // Barra superior: menu "Mais" do desktop (fecha com Esc, clique fora e troca de página).
  const [barMoreOpen, setBarMoreOpen] = useState(false);
  const barMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!barMoreOpen) return;
    const onDown = (event: PointerEvent) => {
      if (!barMoreRef.current?.contains(event.target as Node)) setBarMoreOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setBarMoreOpen(false);
      barMoreRef.current?.querySelector("button")?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [barMoreOpen]);

  // Ao rolar, a barra ganha o fio de baixo (o estado só muda ao cruzar o limite).
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    // Estado inicial no próximo quadro (a página pode abrir já rolada, ex.: voltar).
    const frame = requestAnimationFrame(onScroll);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  /*
   * ==========================================
   * ESCONDER NAV NAS TELAS DE AUTENTICAÇÃO
   * ==========================================
   */

  const isAuthPage = authRoutes.some(
    (route) =>
      pathname === route ||
      pathname.startsWith(`${route}/`)
  );

  if (isAuthPage) {
    return null;
  }

  /*
   * ==========================================
   * VERIFICAR ITEM ATIVO
   * ==========================================
   *
   * Isso também funciona caso futuramente
   * existam páginas internas, por exemplo:
   *
   * /library/123
   * /diary/alguma-coisa
   *
   * "/insights" é especial: fica ativo em 4 rotas (a própria e as 3
   * que agrupa), então não usa o pathMatches genérico.
   */

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }

    if (href === "/insights") {
      return INSIGHTS_ROUTES.some(
        (route) => pathname === route || pathname.startsWith(`${route}/`)
      );
    }

    return (
      pathname === href ||
      pathname.startsWith(`${href}/`)
    );
  };

  // Página atual mora no "Mais" (Diário, Calendário…): o indicador da barra inferior fica nele.
  const moreActive = [items[4], items[5], items[6], items[7], items[8], ...secondaryItems].some(([href]) => isActive(href));

  // Barra superior: prioridade 1–3 na barra; 2–4 também no "Mais" (o CSS mostra só o que saiu da barra).
  const allItems = [...items, ...secondaryItems];
  const barItems = allItems.filter(([href]) => BAR_PRIORITY[href] <= 3);
  const moreItems = allItems.filter(([href]) => BAR_PRIORITY[href] >= 2);
  const currentHref = allItems.find(([href]) => isActive(href))?.[0];
  const currentPriority = currentHref ? BAR_PRIORITY[currentHref] : null;

  return (
    <>
      {/* ====================================== */}
      {/* BARRA SUPERIOR (Projeção, Fase 3) */}
      {/* ====================================== */}

      <header className="mc-appbar" data-scrolled={scrolled ? "" : undefined}>
        <Link href="/" className="mc-appbar-brand mc-focusable" aria-label="MyCatalog — página inicial">
          <BrandLogo size={22} className="mc-appbar-logo" />
          <BrandMark size={22} className="mc-appbar-symbol" />
        </Link>

        <nav className="mc-appbar-nav" aria-label="Navegação principal">
          {barItems.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              prefetch={prefetchFor(href)}
              data-priority={BAR_PRIORITY[href]}
              className={"mc-appbar-link mc-focusable" + (isActive(href) ? " active" : "")}
              aria-current={isActive(href) ? "page" : undefined}
              aria-label={countLabel(label, countFor(href))}
            >
              {isActive(href) && (
                <motion.span
                  layoutId="mc-nav-indicator"
                  className="mc-appbar-indicator"
                  transition={navIndicatorTransition}
                  aria-hidden="true"
                />
              )}
              <span>{label}</span>
              {countFor(href) ? <span className="mc-appbar-count" aria-hidden="true">{countFor(href)}</span> : null}
            </Link>
          ))}

          <div className="mc-appbar-more" ref={barMoreRef}>
            <button
              type="button"
              className={"mc-appbar-link mc-focusable" + (barMoreOpen ? " open" : "")}
              data-current={currentPriority ?? undefined}
              aria-expanded={barMoreOpen}
              aria-controls="mc-appbar-more-list"
              onClick={() => setBarMoreOpen((open) => !open)}
            >
              <span>Mais</span>
              <ChevronDown size={15} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <AnimatePresence>
              {barMoreOpen && (
                <motion.ul
                  id="mc-appbar-more-list"
                  className="mc-appbar-more-list"
                  initial={{ opacity: 0, scale: 0.97, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.12 } }}
                  transition={popoverTransition}
                >
                  {moreItems.map(([href, label, Icon]) => (
                    <li key={href} data-priority={BAR_PRIORITY[href]}>
                      <Link
                        href={href}
                        prefetch={prefetchFor(href)}
                        className={"mc-focusable" + (isActive(href) ? " active" : "")}
                        aria-current={isActive(href) ? "page" : undefined}
                        onClick={() => setBarMoreOpen(false)}
                        aria-label={countLabel(label, countFor(href))}
                      >
                        <Icon size={17} strokeWidth={2} aria-hidden="true" />
                        <span>{label}</span>
                        {countFor(href) ? <span className="mc-appbar-count" aria-hidden="true">{countFor(href)}</span> : null}
                      </Link>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        </nav>

        <div className="mc-appbar-search">
          <Suspense fallback={<Search />}>
            <RouteSearch />
          </Suspense>
        </div>

        {/* No Descobrir o "Escolha pra mim" da própria página herda os filtros escolhidos: um só botão por tela. */}
        {pathname === "/discover" ? null : <PickForMeLauncher iconOnly className="mc-appbar-pick" />}
      </header>

      {/* ====================================== */}
      {/* MENU MOBILE */}
      {/* ====================================== */}

      <nav
        className="mobile-nav"
        aria-label="Navegação mobile"
      >
        {[
          items[0],  // Início
          items[1],  // Descobrir
          items[3],  // Biblioteca
          items[2],  // Para você
        ].map(
          ([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              prefetch={prefetchFor(href)}
              className={
                "mc-focusable " +
                (isActive(href)
                  ? "active"
                  : "")
              }
              aria-current={
                isActive(href)
                  ? "page"
                  : undefined
              }
              aria-label={countLabel(label, countFor(href))}
            >
              {isActive(href) && (
                <motion.span
                  layoutId="mc-mobile-nav-indicator"
                  className="mobile-nav-indicator"
                  transition={navIndicatorTransition}
                  aria-hidden="true"
                />
              )}
              <Icon
                size={18}
                strokeWidth={2}
              />

              <span>
                {label}
              </span>
              {countFor(href) ? <span className="mc-appbar-count mobile-nav-count" aria-hidden="true">{countFor(href)}</span> : null}
            </Link>
          )
        )}
        <button className={`mc-focusable ${moreOpen || moreActive ? "active" : ""}`} onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen} aria-label="Abrir mais páginas">
          {moreActive && (
            <motion.span
              layoutId="mc-mobile-nav-indicator"
              className="mobile-nav-indicator"
              transition={navIndicatorTransition}
              aria-hidden="true"
            />
          )}
          <MoreHorizontal size={18} strokeWidth={2} /><span>Mais</span>
        </button>
      </nav>
      {/* Fase 3: a folha sobe de onde está o botão "Mais" e desce ao fechar (antes aparecia/sumia de uma vez). */}
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            key="more"
            className="mobile-more-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: sheetExitTransition }}
            transition={sheetTransition}
            onMouseDown={(event) => event.target === event.currentTarget && setMoreOpen(false)}
          >
            <motion.section
              ref={moreSheetRef as React.RefObject<HTMLElement>}
              className="mobile-more-sheet"
              aria-label="Mais páginas"
              role="dialog"
              aria-modal="true"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%", transition: sheetExitTransition }}
              transition={sheetTransition}
            >
              <header><strong>Todas as páginas</strong><button className="mc-focusable" onClick={() => setMoreOpen(false)} aria-label="Fechar"><X size={20} /></button></header>
              <div>
                {[items[4], items[5], items[6], items[7], items[8]].map(([href, label, Icon]) => <Link key={href} href={href} prefetch={prefetchFor(href)} className={`mc-focusable ${isActive(href) ? "active" : ""}`} aria-current={isActive(href) ? "page" : undefined}><Icon size={20} /><span>{label}</span></Link>)}
                {secondaryItems.map(([href, label, Icon]) => <Link key={href} href={href} prefetch={prefetchFor(href)} className={`mc-focusable mobile-more-secondary ${isActive(href) ? "active" : ""}`} aria-current={isActive(href) ? "page" : undefined}><Icon size={20} /><span>{label}</span></Link>)}
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Busca global da barra. Em /search o campo vem com o termo da URL (?q=), para poder ser refinado. */
function RouteSearch() {
  const pathname = usePathname();
  const params = useSearchParams();
  const query = pathname === "/search" ? params.get("q") ?? "" : undefined;

  return <Search syncedQuery={query} />;
}
