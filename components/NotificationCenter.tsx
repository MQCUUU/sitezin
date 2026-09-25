"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CalendarClock, Check, CheckCheck, Tv2 } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { Popover } from "@/components/ui/Popover";
import { authClient } from "@/lib/auth/client";

type Notice = {
  id: string;
  type: "new_season" | "new_episode";
  title: string;
  message: string;
  href?: string;
  release_at?: string;
  release_precision: "date" | "datetime";
  read_at?: string;
  created_at: string;
};

const when = (notice: Notice) =>
  notice.release_at
    ? new Intl.DateTimeFormat(
        "pt-BR",
        notice.release_precision === "datetime"
          ? { dateStyle: "medium", timeStyle: "short" }
          : { dateStyle: "long", timeZone: "UTC" }
      ).format(new Date(notice.release_at)) +
      (notice.release_precision === "date" ? " · horário ainda não divulgado" : "")
    : "Data ainda não divulgada";

export function NotificationCenter() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
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
          description: `${latest.message} · ${when(latest)}`,
          actionLabel: "Ver",
          onAction: () => setOpen(true),
          duration: 10000,
        });
      }
    } catch {
      setReady(true);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void load(true);

    // Polling inteligente: a cada 20 segundos enquanto a aba estiver visível e online
    const interval = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine && !cancelled) {
        void load(true);
      }
    }, 20 * 1000);

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
  }, []);

  useEffect(() => {
    const refresh = () => void load(true);
    window.addEventListener("mycatalog:notifications-updated", refresh);
    return () => window.removeEventListener("mycatalog:notifications-updated", refresh);
  }, []);

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

  if (!ready || sessionPending) return <div className="notification-center-slot" />;

  /*
   * A API sempre retorna 401 para visitantes anônimos (GET /api/notifications
   * exige sessão) — mostrar o sino vazio para quem nunca vai ter notificação
   * era UI morta e a causa raiz da colisão com os botões de Entrar/Criar
   * conta no topo (BUG-A2.5-01).
   */
  if (!session?.user?.id) return null;

  return (
    <div className="notification-center" ref={ref}>
      <button
        className={`notification-bell mc-focusable ${open ? "active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={`Notificações${unread ? `, ${unread} não lidas` : ""}`}
        aria-expanded={open}
      >
        <Bell size={19} />
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
                <CheckCheck size={15} /> Marcar todas
              </button>
            )}
          </header>

          <div className="notification-list">
            {items.map((item) => (
              <article className={item.read_at ? "" : "unread"} key={item.id}>
                <span>
                  {item.type === "new_season" ? (
                    <Tv2 size={17} />
                  ) : (
                    <CalendarClock size={17} />
                  )}
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
                    <Check size={15} />
                  </button>
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
