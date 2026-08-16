"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  House,
  Library,
  ChartNoAxesCombined,
  Heart,
  Trophy,
  BookOpenText,
  Sparkles,
  CalendarDays,
  Compass,
  Bot,
} from "lucide-react";

/*
 * ==========================================
 * ITENS PRINCIPAIS DA NAVEGAÇÃO
 * ==========================================
 *
 * Perfil, Configurações e Sair NÃO ficam mais
 * aqui.
 *
 * Essas opções agora ficam no AccountMenu,
 * na bolinha do usuário no canto superior
 * direito.
 */

const items = [
  ["/", "Início", House],
  ["/discover", "Descobrir", Compass],
  ["/for-you", "Para você", Sparkles],
  ["/assistant", "Assistente IA", Bot],
  ["/library", "Biblioteca", Library],
  ["/diary", "Diário", BookOpenText],
  ["/calendar", "Calendário", CalendarDays],
  ["/ranking", "Meu Ranking", Trophy],
  ["/stats", "Estatísticas", ChartNoAxesCombined],
  ["/retrospective", "Retrospectiva", Sparkles],
  ["/favorites", "Favoritos", Heart],
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
   */

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }

    return (
      pathname === href ||
      pathname.startsWith(`${href}/`)
    );
  };

  return (
    <>
      {/* ====================================== */}
      {/* SIDEBAR DESKTOP */}
      {/* ====================================== */}

      <aside className="sidebar">

        {/* LOGO */}

        <Link
          href="/"
          className="brand"
          aria-label="Ir para o início"
        >
          My<span>Catalog</span>
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
                className={
                  isActive(href)
                    ? "active"
                    : ""
                }
                aria-current={
                  isActive(href)
                    ? "page"
                    : undefined
                }
              >
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

      </aside>

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
          items[4],  // Biblioteca
          items[5],  // Diário
          items[10], // Favoritos
        ].map(
          ([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              className={
                isActive(href)
                  ? "active"
                  : ""
              }
              aria-current={
                isActive(href)
                  ? "page"
                  : undefined
              }
            >
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
    </>
  );
}