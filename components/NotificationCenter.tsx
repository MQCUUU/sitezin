"use client";

import "@/styles/features/account-menu.css";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CalendarClock, Check, CheckCheck, Tv2, UserPlus, UsersRound } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { Popover } from "@/components/ui/Popover";
import { authClient } from "@/lib/auth/client";

type Notice = {
  id: string;
  type: "new_season" | "new_episode" | "follow_request" | "new_follower" | "follow_accepted" | "new_friend";
  title: string;
  message: string;
  href?: string;
  release_at?: string;
  release_precision: "date" | "datetime";
  read_at?: string;
  created_at: string;
  actor_id?: string | null;
  actor_username?: string | null;
  relationship_status?: "pending" | "accepted" | null;
  follow_back_status?: "pending" | "accepted" | null;
};

const when = (notice: Notice) =>
  notice.type === "follow_request" || notice.type === "new_follower" || notice.type === "follow_accepted" || notice.type === "new_friend"
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(notice.created_at))
    : notice.release_at
    ? new Intl.DateTimeFormat(
        "pt-BR",
        notice.release_precision === "datetime"
          ? { dateStyle: "medium", timeStyle: "short" }
          : { dateStyle: "long", timeZone: "UTC" }
      ).format(new Date(notice.release_at)) +
      (notice.release_precision === "date" ? ", horário ainda não divulgado" : "")
    : "Data ainda não divulgada";

export function NotificationCenter() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const toast = useToast();

  async function load(showToast = false) {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) {
        setReady(true);
        return;
      }
      const result = await response.json();
      const next: Notice[] = result.notifications || [];
      setItems(next);
      setUnread(Number(result.unread || 0));
      setReady(true);

      const latest = next.find((item) => !item.read_at);
      if (
        showToast &&
        latest &&
        !sessionStorage.getItem(`mycatalog:notice:${latest.id}`)
      ) {
        sessionStorage.setItem(`mycatalog:notice:${latest.id}`, "1");
        toast.info(latest.title, {
          description: `${latest.message}, ${when(latest)}`,
          actionLabel: "Ver",
          onAction: () => setOpen(true),
          duration: 10000,
        });
      }
    } catch {
      setReady(true);
    }
  }

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    // V3.4: visitante não tem notificações — nada de requisição (antes: 401 a cada 60 s).
    if (sessionPending || !userId) return;

    let cancelled = false;
    void load(true);

    // V3.3: a cada 60 s (antes 20 s) com a aba visível e online. As notificações só
    // mudam quando o sync de séries roda (no máximo a cada 30 min) e esta aba já é
    // avisada na hora pelo evento "mycatalog:notifications-updated".
    const interval = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine && !cancelled) {
        void load(true);
      }
    }, 60 * 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && navigator.onLine && !cancelled) {
        void load(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, sessionPending]);

  useEffect(() => {
    if (!userId) return;

    const refresh = () => void load(true);
    window.addEventListener("mycatalog:notifications-updated", refresh);
    return () => window.removeEventListener("mycatalog:notifications-updated", refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function read(id?: string) {
    const targetWasUnread = id
      ? items.some((item) => item.id === id && !item.read_at)
      : unread > 0;

    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : { all: true }),
    });

    setItems((current) =>
      current.map((item) =>
        !id || item.id === id
          ? { ...item, read_at: new Date().toISOString() }
          : item
      )
    );
    setUnread((current) =>
      id ? Math.max(0, current - (targetWasUnread ? 1 : 0)) : 0
    );
  }

  async function acceptFollowRequest(item: Notice) {
    if (!item.actor_id) return;
    setBusyActionId(item.id);
    try {
      const response = await fetch("/api/follows", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ follower_id: item.actor_id, action: "accept" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível aceitar a solicitação.");

      await read(item.id);
      setItems((current) => current.map((notice) => notice.id === item.id
        ? { ...notice, relationship_status: "accepted" }
        : notice));
      toast.success("Solicitação aceita", { description: `@${item.actor_username || "esta pessoa"} agora segue você. Você pode seguir de volta.` });
      void load(false);
      window.dispatchEvent(new Event("mycatalog:follows-updated"));
    } catch (error) {
      toast.error("Não foi possível aceitar a solicitação", { description: error instanceof Error ? error.message : "Tente novamente." });
    } finally {
      setBusyActionId(null);
    }
  }

  async function followBack(item: Notice) {
    if (!item.actor_id) return;
    setBusyActionId(item.id);
    try {
      const undoing = item.follow_back_status === "accepted" || item.follow_back_status === "pending";
      const response = await fetch("/api/follows", {
        method: undoing ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(undoing
          ? { user_id: item.actor_id, mode: item.follow_back_status === "pending" ? "cancel" : "unfollow" }
          : { target_id: item.actor_id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível atualizar o seguimento.");

      await read(item.id);
      setItems((current) => current.map((notice) => notice.id === item.id
        ? { ...notice, follow_back_status: undoing ? null : result.status === "accepted" ? "accepted" : "pending" }
        : notice));
      toast.success(undoing
        ? item.follow_back_status === "pending" ? "Solicitação cancelada" : "Você deixou de seguir"
        : result.status === "accepted" ? "Agora vocês são amigos" : "Solicitação enviada", {
        description: undoing
          ? item.follow_back_status === "pending" ? "Seu pedido de seguir foi retirado." : `Você deixou de seguir @${item.actor_username || "esta pessoa"}.`
          : result.status === "accepted" ? `Você também segue @${item.actor_username || "esta pessoa"}.` : `Seu pedido para seguir @${item.actor_username || "esta pessoa"} foi enviado.`,
      });
      void load(false);
      window.dispatchEvent(new Event("mycatalog:follows-updated"));
    } catch (error) {
      toast.error("Não foi possível seguir de volta", { description: error instanceof Error ? error.message : "Tente novamente." });
    } finally {
      setBusyActionId(null);
    }
  }

  if (sessionPending) return <div className="notification-center-slot" />;

  /*
   * A API sempre retorna 401 para visitantes anônimos (GET /api/notifications
   * exige sessão) — mostrar o sino vazio para quem nunca vai ter notificação
   * era UI morta e a causa raiz da colisão com os botões de Entrar/Criar
   * conta no topo (BUG-A2.5-01).
   */
  if (!session?.user?.id) return null;
  if (!ready) return <div className="notification-center-slot" />;

  return (
    <div className="notification-center" ref={ref}>
      <button
        className={`notification-bell mc-focusable ${open ? "active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={`Notificações${unread ? `, ${unread} não lidas` : ""}`}
        aria-expanded={open}
      >
        <Bell size={18} />
        {unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}
      </button>

      <Popover
        open={open}
        onClose={() => setOpen(false)}
        containerRef={ref}
        className="notification-dropdown"
        role="region"
        aria-label="Notificações"
      >
          <header>
            <div>
              <strong>Notificações</strong>
              <small>
                {unread
                  ? `${unread} não lida${unread === 1 ? "" : "s"}`
                  : "Tudo em dia"}
              </small>
            </div>
            {unread > 0 && (
              <button className="mc-focusable" onClick={() => read()}>
                <CheckCheck size={16} /> Marcar todas
              </button>
            )}
          </header>

          <div className="notification-list">
            {items.map((item) => (
              <article className={item.read_at ? "" : "unread"} key={item.id}>
                <span>
                  {item.type === "new_season" ? <Tv2 size={18} />
                    : item.type === "new_episode" ? <CalendarClock size={18} />
                    : item.type === "new_friend" ? <UsersRound size={18} />
                    : <UserPlus size={18} />}
                </span>
                <Link
                  className="mc-focusable"
                  href={item.href || "#"}
                  onClick={() => {
                    setOpen(false);
                    if (!item.read_at) void read(item.id);
                  }}
                >
                  <strong>{item.title}</strong>
                  <p>{item.message}</p>
                  <small>{when(item)}</small>
                </Link>
                {!item.read_at && (
                  <button
                    className="mc-focusable"
                    onClick={() => read(item.id)}
                    aria-label="Marcar como lida"
                  >
                    <Check size={16} />
                  </button>
                )}
                {item.type === "follow_request" && item.relationship_status === "pending" && (
                  <div className="notification-actions">
                    <button type="button" className="notification-action primary mc-focusable" disabled={busyActionId === item.id} onClick={() => void acceptFollowRequest(item)}>
                      <Check size={14} /> Aceitar
                    </button>
                  </div>
                )}
                {["follow_request", "new_follower", "new_friend"].includes(item.type) && item.relationship_status === "accepted" && (
                  <div className="notification-actions">
                    <button type="button" className={`notification-action ${item.follow_back_status ? "" : "primary"} mc-focusable`} disabled={busyActionId === item.id} onClick={() => void followBack(item)}>
                      {item.follow_back_status === "accepted" ? <><Check size={14} /> Seguindo de volta</>
                        : item.follow_back_status === "pending" ? <><Check size={14} /> Solicitação enviada</>
                        : <><UserPlus size={14} /> Seguir de volta</>}
                    </button>
                  </div>
                )}
              </article>
            ))}

            {!items.length && (
              <div className="notification-empty">
                <Bell size={24} />
                <strong>Nenhuma novidade</strong>
                <small>
                  As estreias das suas séries curtidas aparecerão aqui.
                </small>
              </div>
            )}
          </div>

          <Link
            className="notification-settings-link mc-focusable"
            href="/settings?tab=notifications"
            onClick={() => setOpen(false)}
          >
            Configurar notificações
          </Link>
      </Popover>
    </div>
  );
}
