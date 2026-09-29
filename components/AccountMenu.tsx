"use client";

import { fetchProfileMe, invalidateProfileMe } from "@/lib/profile-me";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import Link from "next/link";

import {
  ChevronDown,
  LogIn,
  LogOut,
  Settings,
  List,
  User,
  UserPlus,
} from "lucide-react";

import { authClient } from "@/lib/auth/client";
import { Popover } from "@/components/ui/Popover";

type AccountUser = {
  id:
    string;
  email?:
    string;
  user_metadata?:
    Record<
      string,
      any
    >;
};

interface UserMetadata {
  display_name?: string;
  full_name?: string;
  name?: string;
  avatar_url?: string;
  picture?: string;
}

interface AccountMenuState {
  user: AccountUser | null;
  ready: boolean;
  open: boolean;
}

interface AuthSession {
  user: AccountUser | null;
}

interface AuthSubscription {
  subscription: {
    unsubscribe(): void;
  };
}

function displayName(
  user: AccountUser
): string {
  return (
    user.user_metadata
      ?.display_name ||
    user.user_metadata
      ?.full_name ||
    user.user_metadata
      ?.name ||
    user.email
      ?.split(
        "@"
      )[0] ||
    "Usuário"
  );
}

function initials(
  user: AccountUser
): string {
  const name =
    displayName(
      user
    );

  const parts =
    name
      .trim()
      .split(
        /\s+/
      )
      .filter(
        Boolean
      );

  if (
    parts.length >=
    2
  ) {
    return (
      parts[0][0] +
      parts[
        parts.length -
        1
      ][0]
    ).toUpperCase();
  }

  return name
    .slice(
      0,
      2
    )
    .toUpperCase();
}

export function AccountMenu(): React.ReactElement {
  const { data: session, isPending } = authClient.useSession();
  const [profileMeta, setProfileMeta] = useState<{
    username?: string;
    avatar_url?: string;
    display_name?: string;
  }>({});
  const [open, setOpen] = useState(false);
  const [brokenAvatar, setBrokenAvatar] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  /*
   * authClient.useSession() pode já ter a sessão resolvida no primeiro
   * render do cliente (isPending=false) enquanto o SSR — sem acesso
   * síncrono ao mesmo estado — só produz o placeholder de loading. Isso
   * causa hydration mismatch em toda navegação. `mounted` força o
   * primeiro render do cliente a bater com o do servidor (sempre
   * loading); só depois do efeito (pós-hidratação) é que a sessão real
   * pode substituir o placeholder.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const ready = mounted && !isPending;

  const sessionUserId = session?.user?.id;

  // Troca de usuário na mesma aba (sessão expirou e outra conta entrou):
  // nunca reaproveitar o perfil em cache do usuário anterior.
  const previousUserId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (previousUserId.current && previousUserId.current !== sessionUserId) {
      invalidateProfileMe();
    }
    previousUserId.current = sessionUserId;

    if (!sessionUserId) {
      setProfileMeta({});
      return;
    }

    let active = true;
    const cacheKey = `mycatalog:account-meta:v1:${sessionUserId}`;

    /*
     * Higiene entre contas no mesmo navegador: caches locais de OUTROS
     * usuários (avatar/nome no localStorage; Para você/Home no
     * sessionStorage) são removidos assim que esta conta é a ativa. As
     * chaves já incluem o usuário, então nunca seriam lidas — isto só evita
     * que dados pessoais alheios fiquem guardados.
     */
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("mycatalog:account-meta:v1:") && key !== cacheKey) localStorage.removeItem(key);
      }

      const email = session?.user?.email;

      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith("mycatalog:foryou:v1:") && !key.startsWith(`mycatalog:foryou:v1:${sessionUserId}:`)) {
          sessionStorage.removeItem(key);
        }

        if (key.startsWith("mycatalog:home:") && email && !key.endsWith(`:${email}`)) {
          sessionStorage.removeItem(key);
        }
      }
    } catch {
      /* ignore */
    }

    /*
     * Pinta o último avatar/nome conhecido JÁ na hidratação (depois do
     * `mounted`, então sem mismatch) e revalida em seguida — evita o
     * "iniciais → foto" a cada carregamento completo. Só dados de exibição
     * do próprio usuário; a fonte da verdade continua sendo o perfil.
     */
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
      if (cached && typeof cached === "object") {
        setProfileMeta((prev) => ({
          username: cached.username || prev.username,
          avatar_url: cached.avatar_url || prev.avatar_url,
          display_name: cached.display_name || prev.display_name,
        }));
      }
    } catch {
      /* cache é só otimização */
    }

    fetchProfileMe()
      .then((d) => {
        if (!active || !d?.authenticated) return;

        const next = {
          username: d.username || "",
          avatar_url: d.avatar_url || "",
          display_name: d.display_name || "",
        };

        setProfileMeta(next);

        try {
          localStorage.setItem(cacheKey, JSON.stringify(next));
        } catch {
          /* storage indisponível */
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [sessionUserId]);

  useEffect(() => {
    function refreshAccount(event: Event): void {
      const custom = event as CustomEvent<{
        avatar_url?: string | null;
        display_name?: string | null;
        username?: string | null;
      }>;
      if (custom.detail) {
        try {
          const key = `mycatalog:account-meta:v1:${session?.user?.id}`;
          const cached = JSON.parse(localStorage.getItem(key) || "{}");
          localStorage.setItem(
            key,
            JSON.stringify({
              ...cached,
              ...(custom.detail.avatar_url !== undefined ? { avatar_url: custom.detail.avatar_url || "" } : {}),
              ...(custom.detail.display_name !== undefined ? { display_name: custom.detail.display_name || "" } : {}),
              ...(custom.detail.username !== undefined ? { username: custom.detail.username || "" } : {}),
            })
          );
        } catch {
          /* cache é só otimização */
        }

        setProfileMeta((prev) => ({
          ...prev,
          ...(custom.detail.avatar_url !== undefined
            ? { avatar_url: custom.detail.avatar_url || "" }
            : {}),
          ...(custom.detail.display_name !== undefined
            ? { display_name: custom.detail.display_name || "" }
            : {}),
          ...(custom.detail.username !== undefined
            ? { username: custom.detail.username || "" }
            : {}),
        }));
      }
    }

    window.addEventListener("mycatalog:account-updated", refreshAccount);
    return () =>
      window.removeEventListener("mycatalog:account-updated", refreshAccount);
  }, [session?.user?.id]);

  const user: AccountUser | null = session?.user
    ? {
        id: session.user.id,
        email: session.user.email,
        user_metadata: {
          display_name: profileMeta.display_name || session.user.name,
          name: session.user.name,
          avatar_url:
            profileMeta.avatar_url ||
            (session.user as any).image ||
            "",
          username: profileMeta.username,
        },
      }
    : null;

  async function signOut(): Promise<void> {
    try {
      if (session?.user?.id) {
        localStorage.removeItem(`mycatalog:account-meta:v1:${session.user.id}`);
      }

      // Caches de sessão da aba (Home / Para você) nunca sobrevivem ao logout.
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith("mycatalog:home:") || key.startsWith("mycatalog:foryou:")) {
          sessionStorage.removeItem(key);
        }
      }
    } catch {
      /* ignore */
    }

    try {
      await authClient.signOut();
    } catch {
      // ignore
    }

    location.href = "/login";
  }

  if (
    !ready
  ) {
    return (
      <div className="account-slot account-slot-loading" />
    );
  }

  if (
    !user
  ) {
    return (
      <div className="account-auth-actions">
        <Link
          href="/login"
          className="btn account-login-button"
        >
          <LogIn
            size={15}
          />

          Entrar
        </Link>

        <Link
          href="/signup"
          className="btn primary account-signup-button"
        >
          <UserPlus
            size={15}
          />

          Criar conta
        </Link>
      </div>
    );
  }

  const rawAvatar: string =
    user.user_metadata
      ?.avatar_url ||
    user.user_metadata
      ?.picture ||
    "";

  // Imagem quebrada nunca aparece: cai nas iniciais.
  const avatar: string = rawAvatar && rawAvatar !== brokenAvatar ? rawAvatar : "";

  return (
    <div
      className="account-menu"
      ref={
        ref
      }
    >
      <button
        type="button"
        className={
          "account-avatar-button mc-focusable " +
          (
            open
              ? "active"
              : ""
          )
        }
        aria-expanded={
          open
        }
        aria-label="Abrir menu da conta"
        onClick={() =>
          setOpen(
            (
              value
            ) =>
              !value
          )
        }
      >
        <span className="account-avatar">
          {avatar ? (
            <img decoding="async"
              src={
                avatar
              }
              alt=""
              onError={() => setBrokenAvatar(avatar)}
            />
          ) : (
            <span>
              {initials(
                user
              )}
            </span>
          )}
        </span>

        <ChevronDown
          size={13}
        />
      </button>

      <Popover open={open} onClose={() => setOpen(false)} containerRef={ref} className="account-dropdown">
          <div className="account-dropdown-user">
            <span className="account-avatar large">
              {avatar ? (
                <img decoding="async"
                  src={
                    avatar
                  }
                  alt=""
                  onError={() => setBrokenAvatar(avatar)}
                />
              ) : (
                <span>
                  {initials(
                    user
                  )}
                </span>
              )}
            </span>

            <div>
              <strong>
                {displayName(
                  user
                )}
              </strong>

              <span>
                {
                  user.email
                }
              </span>
            </div>
          </div>

          <div className="account-dropdown-divider" />

          <Link
            className="mc-focusable"
            href={user.user_metadata?.username ? `/u/${user.user_metadata.username}` : "/profile"}
            onClick={() =>
              setOpen(
                false
              )
            }
          >
            <User
              size={16}
            />

            Meu perfil
          </Link>

          <Link
            className="mc-focusable"
            href="/settings"
            onClick={() =>
              setOpen(
                false
              )
            }
          >
            <Settings
              size={16}
            />

            Configurações
          </Link>

          <Link
            className="mc-focusable"
            href={user.user_metadata?.username ? `/u/${user.user_metadata.username}?tab=lists` : "/profile"}
            onClick={() =>
              setOpen(
                false
              )
            }
          >
            <List
              size={16}
            />

            Listas
          </Link>

          <div className="account-dropdown-divider" />

          <button
            type="button"
            className="account-signout mc-focusable"
            onClick={
              signOut
            }
          >
            <LogOut
              size={16}
            />

            Sair
          </button>
      </Popover>
    </div>
  );
}
