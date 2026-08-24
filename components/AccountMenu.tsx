"use client";

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

import {
  createClient,
} from "@/lib/supabase/client";

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
  const [
    user,
    setUser,
  ] =
    useState<
      AccountUser |
      null
    >(null);

  const [
    ready,
    setReady,
  ] =
    useState(
      false
    );

  const [
    open,
    setOpen,
  ] =
    useState(
      false
    );

  const ref =
    useRef<
      HTMLDivElement |
      null
    >(
      null
    );

  useEffect(() => {
    const s =
      createClient();

    let mounted =
      true;

    s.auth
      .getUser()
      .then(
        ({
          data,
        }: {
          data: {
            user: AccountUser | null;
          };
        }) => {
          if (
            mounted
          ) {
            setUser(
              data.user as
                | AccountUser
                | null
            );

            setReady(
              true
            );
          }
        }
      );

    const {
      data:
        subscription,
    } =
      s.auth.onAuthStateChange(
        (
          _: any,
          session: any
        ) => {
          setUser(
            session
              ?.user as
              | AccountUser
              | null
          );

          setReady(
            true
          );
        }
      );

    return () => {
      mounted =
        false;

      subscription
        .subscription
        .unsubscribe();
    };
  }, []);

  useEffect(() => {
    function refreshAccount(event: Event): void {
      const avatarUrl = (event as CustomEvent<{ avatar_url?: string | null }>).detail?.avatar_url;
      if (avatarUrl !== undefined) {
        setUser((current) => current ? {
          ...current,
          user_metadata: { ...current.user_metadata, avatar_url: avatarUrl },
        } : current);
        return;
      }

      createClient().auth.getUser().then(({ data }: { data: { user: AccountUser | null } }) => {
        setUser(data.user as AccountUser | null);
      });
    }

    window.addEventListener("mycatalog:account-updated", refreshAccount);
    return () => window.removeEventListener("mycatalog:account-updated", refreshAccount);
  }, []);

  useEffect(() => {
    if (
      !open
    ) {
      return;
    }

    function outside(
      event: MouseEvent
    ): void {
      const target =
        event.target;

      if (
        target instanceof Node &&
        !ref.current
          ?.contains(
            target
          )
      ) {
        setOpen(
          false
        );
      }
    }

    function keydown(
      event: KeyboardEvent
    ): void {
      if (
        event.key ===
        "Escape"
      ) {
        setOpen(
          false
        );
      }
    }

    document.addEventListener(
      "mousedown",
      outside
    );

    document.addEventListener(
      "keydown",
      keydown
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        outside
      );

      document.removeEventListener(
        "keydown",
        keydown
      );
    };
  }, [
    open,
  ]);

  async function signOut(): Promise<void> {
    await createClient()
      .auth
      .signOut();

    location.href =
      "/login";
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

  const avatar: string =
    user.user_metadata
      ?.avatar_url ||
    user.user_metadata
      ?.picture ||
    "";

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
          "account-avatar-button " +
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
            <img loading="lazy" decoding="async"
              src={
                avatar
              }
              alt=""
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

      {open && (
        <div className="account-dropdown">
          <div className="account-dropdown-user">
            <span className="account-avatar large">
              {avatar ? (
                <img loading="lazy" decoding="async"
                  src={
                    avatar
                  }
                  alt=""
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
            className="account-signout"
            onClick={
              signOut
            }
          >
            <LogOut
              size={16}
            />

            Sair
          </button>
        </div>
      )}
    </div>
  );
}
