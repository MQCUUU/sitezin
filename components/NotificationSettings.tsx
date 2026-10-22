"use client";

import { apiFetch, errorMessage } from "@/lib/api-client";
import { useEffect, useState } from "react";
import { Bell, Loader2, Save } from "lucide-react";

import { useToast } from "@/components/ToastProvider";

/*
 * F1 — a tabela `public.notifications` só aceita `type IN
 * ('new_season','new_episode')` (CHECK constraint). O único produtor
 * de linhas (`app/api/library/sync-seasons/route.ts`, regras em
 * lib/notifications/series.ts) só escreve esses dois tipos, e só para
 * séries CURTIDAS. Preferências sem produtor real (follow por e-mail,
 * curtidas em review, e-mails) continuam fora da UI — as colunas ficam no
 * banco para quando as features existirem.
 *
 * V3.3: estado de carregamento/erro (antes, falha no GET mostrava tudo
 * desmarcado como se fosse a preferência salva), "alterações não salvas"
 * e feedback específico.
 */

type Prefs = { new_season_site: boolean; new_episode_site: boolean };

const keyOf = (prefs: Prefs | null) => (prefs ? `${prefs.new_season_site}|${prefs.new_episode_site}` : "");

export function NotificationSettings() {
  const toast = useToast();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saved, setSaved] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);

  async function load() {
    setStatus("loading");

    try {
      const data = await apiFetch("/api/profile/notifications", { cache: "no-store" });
      const next = { new_season_site: data.new_season_site !== false, new_episode_site: data.new_episode_site !== false };

      setPrefs(next);
      setSaved(keyOf(next));
      setStatus("ready");
    } catch (error) {
      console.warn("[NotificationSettings]", errorMessage(error));
      setStatus("error");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const dirty = status === "ready" && keyOf(prefs) !== saved;
  const toggle = (key: keyof Prefs) => setPrefs((current) => (current ? { ...current, [key]: !current[key] } : current));

  async function save() {
    if (!prefs) return;

    setSaving(true);

    try {
      await apiFetch("/api/profile/notifications", { method: "PUT", json: prefs });

      setSaved(keyOf(prefs));
      toast.success("Preferências de notificações salvas.");
    } catch (error) {
      toast.error("Não foi possível salvar as notificações", { description: `${errorMessage(error, "")} Nada foi alterado.`.trim() });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel notification-settings" aria-labelledby="notification-settings-title">
      <div className="settings-panel-head">
        <div className="settings-icon">
          <Bell size={19} aria-hidden="true" />
        </div>
        <div>
          <h2 id="notification-settings-title">Notificações</h2>
          <p className="muted">Avisos no sino do MyCatalog sobre as séries que você curtiu.</p>
        </div>
      </div>

      {status === "loading" && (
        <p className="muted" role="status">
          <Loader2 className="spin" size={14} aria-hidden="true" /> Carregando preferências…
        </p>
      )}

      {status === "error" && (
        <div className="set-inline-error" role="alert">
          <span>Não foi possível carregar suas preferências.</span>
          <button type="button" className="btn" onClick={() => void load()}>
            Tentar de novo
          </button>
        </div>
      )}

      {status === "ready" && prefs && (
        <>
          <fieldset className="notification-content-preferences">
            <legend className="mc-visually-hidden">Avisos no site</legend>
            <label className="notification-product">
              <input
                type="checkbox"
                checked={prefs.new_season_site}
                onChange={() => toggle("new_season_site")}
              />
              <span>
                <strong>Novas temporadas</strong>
                <small>Quando uma série curtida tiver uma temporada nova anunciada ou estreando.</small>
              </span>
            </label>
            <label className="notification-product">
              <input
                type="checkbox"
                checked={prefs.new_episode_site}
                onChange={() => toggle("new_episode_site")}
              />
              <span>
                <strong>Próximos episódios</strong>
                <small>O próximo episódio de uma série curtida e a data de estreia dele.</small>
              </span>
            </label>
          </fieldset>

          <p className="muted notification-settings-note">
            Pedidos para seguir aparecem como aviso rápido enquanto o site está aberto. Notificações
            de curtidas e por e-mail ainda não existem.
          </p>

          <div className="set-save-row">
            <button type="button" className="btn primary" disabled={saving || !dirty} onClick={save}>
              {saving ? <Loader2 className="spin" size={15} aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}{" "}
              Salvar notificações
            </button>
            <span className="muted" role="status" aria-live="polite">
              {dirty ? "Alterações não salvas." : ""}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
