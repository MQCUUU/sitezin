"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  Library,
  ChartNoAxesCombined,
  Heart,
  Settings,
  LogOut,
  Trophy,
  User,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const items = [
  ["/", "Início", House],
  ["/library", "Biblioteca", Library],
  ["/ranking", "Meu Ranking", Trophy],
  ["/stats", "Estatísticas", ChartNoAxesCombined],
  ["/favorites", "Favoritos", Heart],
  ["/profile", "Perfil", User],
  ["/settings", "Configurações", Settings],
] as const;

export function Nav() {
  const p = usePathname();

  const signout = async () => {
    await createClient().auth.signOut();
    location.href = "/";
  };

  return (
    <>
      {/* SIDEBAR DESKTOP */}
      <aside className="sidebar">
        <div className="brand">
          My<span>Catalog</span>
        </div>

        <nav className="nav">
          {items.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              className={
                p === href ? "active" : ""
              }
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>

        <button
          className="btn ghost"
          style={{
            marginTop: 20,
            width: "100%",
            textAlign: "left",
          }}
          onClick={signout}
        >
          <LogOut size={18} />
          Sair
        </button>
      </aside>

      {/* MENU MOBILE */}
      <nav className="mobile-nav">
        {[
          items[0], // Início
          items[1], // Biblioteca
          items[2], // Meu Ranking
          items[4], // Favoritos
          items[5], // Perfil
          items[3], // Estatísticas
        ].map(([href, label, Icon]) => (
          <Link
            key={href}
            href={href}
            className={
              p === href ? "active" : ""
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}