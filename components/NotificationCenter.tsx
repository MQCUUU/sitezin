"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CalendarClock, Check, CheckCheck, Tv2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";

type Notice = { id: string; type: "new_season" | "new_episode"; title: string; message: string; href?: string; release_at?: string; release_precision: "date" | "datetime"; read_at?: string; created_at: string };
const when = (notice: Notice) => notice.release_at ? new Intl.DateTimeFormat("pt-BR", notice.release_precision === "datetime" ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "long", timeZone: "UTC" }).format(new Date(notice.release_at)) + (notice.release_precision === "date" ? " · horário ainda não divulgado" : "") : "Data ainda não divulgada";

export function NotificationCenter() {
  const [items, setItems] = useState<Notice[]>([]); const [unread, setUnread] = useState(0); const [open, setOpen] = useState(false); const [ready, setReady] = useState(false);
  const ref = useRef<HTMLDivElement>(null); const toast = useToast();
  async function load(showToast = false) {
    const response = await fetch("/api/notifications", { cache: "no-store" });
    if (!response.ok) { setReady(true); return; }
    const result = await response.json(); const next: Notice[] = result.notifications || []; setItems(next); setUnread(Number(result.unread || 0)); setReady(true);
    const latest = next.find(item => !item.read_at);
    if (showToast && latest && !sessionStorage.getItem(`mycatalog:notice:${latest.id}`)) {
      sessionStorage.setItem(`mycatalog:notice:${latest.id}`, "1");
      toast.info(latest.title, { description: `${latest.message} · ${when(latest)}`, actionLabel: "Ver", onAction: () => setOpen(true), duration: 10000 });
    }
  }
  useEffect(() => {
    const s = createClient(); let channel: ReturnType<typeof s.channel> | null = null; let cancelled = false;
    s.auth.getUser().then((result: any) => { if (cancelled || !result.data.user) { setReady(true); return; } void load(true); channel = s.channel(`notifications:${result.data.user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${result.data.user.id}` }, () => void load(true)).subscribe(); });
    return () => { cancelled = true; if (channel) void s.removeChannel(channel); };
  }, []);
  useEffect(() => { const refresh = () => void load(true); window.addEventListener("mycatalog:notifications-updated", refresh); return () => window.removeEventListener("mycatalog:notifications-updated", refresh); }, []);
  useEffect(() => { if (!open) return; const close = (event: MouseEvent) => { if (event.target instanceof Node && !ref.current?.contains(event.target)) setOpen(false); }; document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, [open]);
  async function read(id?: string) { const targetWasUnread = id ? items.some(item => item.id === id && !item.read_at) : unread > 0; await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? { id } : { all: true }) }); setItems(current => current.map(item => !id || item.id === id ? { ...item, read_at: new Date().toISOString() } : item)); setUnread(current => id ? Math.max(0, current - (targetWasUnread ? 1 : 0)) : 0); }
  if (!ready) return <div className="notification-center-slot" />;
  return <div className="notification-center" ref={ref}><button className={`notification-bell ${open ? "active" : ""}`} onClick={() => setOpen(value => !value)} aria-label={`Notificações${unread ? `, ${unread} não lidas` : ""}`} aria-expanded={open}><Bell size={19}/>{unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}</button>{open && <section className="notification-dropdown"><header><div><strong>Notificações</strong><small>{unread ? `${unread} não lida${unread === 1 ? "" : "s"}` : "Tudo em dia"}</small></div>{unread > 0 && <button onClick={() => read()}><CheckCheck size={15}/> Marcar todas</button>}</header><div className="notification-list">{items.map(item => <article className={item.read_at ? "" : "unread"} key={item.id}><span>{item.type === "new_season" ? <Tv2 size={17}/> : <CalendarClock size={17}/>}</span><Link href={item.href || "#"} onClick={() => { setOpen(false); if (!item.read_at) void read(item.id); }}><strong>{item.title}</strong><p>{item.message}</p><small>{when(item)}</small></Link>{!item.read_at && <button onClick={() => read(item.id)} aria-label="Marcar como lida"><Check size={15}/></button>}</article>)}{!items.length && <div className="notification-empty"><Bell size={24}/><strong>Nenhuma novidade</strong><small>As estreias das suas séries curtidas aparecerão aqui.</small></div>}</div><Link className="notification-settings-link" href="/settings?tab=notifications" onClick={() => setOpen(false)}>Configurar notificações</Link></section>}</div>;
}
