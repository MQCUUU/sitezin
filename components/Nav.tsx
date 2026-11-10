"use client";


import "@/styles/features/nav.css";
import Link from "next/link";
import { BrandLogo, BrandMark } from "@/components/brand/BrandMark";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useAuthState } from "@/hooks/useLibraryAuth";
import { useModal } from "@/hooks/useModal";
import { navIndicatorTransition, sheetExitTransition, sheetTransition } from "@/lib/motion";

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

export function Nav() {
  const pathname = usePathname();
  const authState = useAuthState();
  const prefetchFor = (href: string) =>
    PUBLIC_NAV_ROUTES.has(href) || authState === "authenticated" ? undefined : false;
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [pathname]);

  // Fase 7: Escape, laço do Tab, foco inicial/devolução e trava de rolagem (useModal → lib/modal-a11y).
  const moreSheetRef = useModal(moreOpen, () => setMoreOpen(false));

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

  return (
    <>
      {/* ====================================== */}
      {/* SIDEBAR DESKTOP */}
      {/* ====================================== */}

      <aside className="sidebar">

        {/* LOGO */}

        <Link
          href="/"
          className="brand mc-focusable"
          aria-label="MyCatalog — página inicial"
        >
          <BrandLogo size={24} />
        </Link>

        {/* NAVEGAÇÃO */}

        <nav
          className="nav"
          aria-label="Navegação principal"
        >
          {items.map(
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
              >
                {isActive(href) && (
                  <motion.span
                    layoutId="mc-nav-indicator"
                    className="nav-indicator"
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
              </Link>
            )
          )}
        </nav>

        <nav className="nav nav-secondary" aria-label="Outras páginas">
          {secondaryItems.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              prefetch={prefetchFor(href)}
              className={"mc-focusable " + (isActive(href) ? "active" : "")}
              aria-current={isActive(href) ? "page" : undefined}
            >
              {isActive(href) && (
                <motion.span
                  layoutId="mc-nav-indicator"
                  className="nav-indicator"
                  transition={navIndicatorTransition}
                  aria-hidden="true"
                />
              )}
              <Icon size={18} strokeWidth={2} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

      </aside>

      {/* V3.5: no mobile a sidebar some — o símbolo (sem o nome, por espaço) leva ao início. */}
      <Link href="/" className="mobile-brand mc-focusable" aria-label="MyCatalog — página inicial">
        <BrandMark size={22} />
      </Link>

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
