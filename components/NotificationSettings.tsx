"use client";


import "@/styles/features/settings.css";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { useEffect, useState } from "react";
import { Bell, Loader2, Save } from "lucide-react";

import { useToast } from "@/components/ToastProvider";
import { Button } from "@/components/ui/Button";

type Prefs = {
  new_season_site: boolean;
  new_episode_site: boolean;
  new_follower_site: boolean;
  follow_request_site: boolean;
  new_follower_email: boolean;
  follow_request_email: boolean;
  review_like_site: boolean;
  review_like_email: boolean;
  review_comment_site: boolean;
  recommendation_site: boolean;
  product_updates_email: boolean;
};

const keyOf = (prefs: Prefs | null) => (prefs ? `${prefs.new_season_site}|${prefs.new_episode_site}|${prefs.new_follower_site}|${prefs.follow_request_site}|${prefs.review_like_site}|${prefs.review_comment_site}|${prefs.recommendation_site}` : "");

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
      const next = {
        new_season_site: data.new_season_site !== false,
        new_episode_site: data.new_episode_site !== false,
        new_follower_site: data.new_follower_site !== false,
        follow_request_site: data.follow_request_site !== false,
        new_follower_email: data.new_follower_email === true,
        follow_request_email: data.follow_request_email === true,
        review_like_site: data.review_like_site !== false,
        review_like_email: data.review_like_email === true,
        review_comment_site: data.review_comment_site !== false,
        recommendation_site: data.recommendation_site !== false,
        product_updates_email: data.product_updates_email === true,
      };

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
          <Bell size={18} aria-hidden="true" />
        </div>
        <div>
          <h2 id="notification-settings-title">Notificações</h2>
          <p className="muted">Avisos no sino sobre suas conexões e as séries que você curtiu.</p>
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
          <Button type="button" onClick={() => void load()}>
            Tentar de novo
          </Button>
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
              <input type="checkbox" checked={prefs.follow_request_site} onChange={() => toggle("follow_request_site")} />
              <span>
                <strong>Solicitações para seguir</strong>
                <small>Quando alguém pedir para seguir seu perfil.</small>
              </span>
            </label>
            <label className="notification-product">
              <input type="checkbox" checked={prefs.new_follower_site} onChange={() => toggle("new_follower_site")} />
              <span>
                <strong>Novos seguidores e amizades</strong>
                <small>Quando alguém começar a seguir você, aceitar sua solicitação ou vocês se tornarem amigos.</small>
              </span>
            </label>
            <label className="notification-product">
              <input type="checkbox" checked={prefs.review_like_site} onChange={() => toggle("review_like_site")} />
              <span>
                <strong>Curtidas nas suas avaliações</strong>
                <small>Quando alguém curtir uma nota ou resenha sua. Várias curtidas viram um aviso só.</small>
              </span>
            </label>
            <label className="notification-product">
              <input type="checkbox" checked={prefs.review_comment_site} onChange={() => toggle("review_comment_site")} />
              <span>
                <strong>Comentários nas suas avaliações</strong>
                <small>Quando alguém comentar uma nota ou resenha sua.</small>
              </span>
            </label>
            <label className="notification-product">
              <input type="checkbox" checked={prefs.recommendation_site} onChange={() => toggle("recommendation_site")} />
              <span>
                <strong>Indicações de amigos e o que acharam</strong>
                <small>Quando um amigo te indicar um título e quando quem recebeu sua indicação assistir.</small>
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

          <p className="muted notification-settings-note">Notificações sociais aparecem no sino. Notificações por e-mail ainda não estão disponíveis.</p>

          <div className="set-save-row">
            <Button variant="primary" type="button" disabled={saving || !dirty} onClick={save}>
              {saving ? <Loader2 className="spin" size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}{" "}
              Salvar notificações
            </Button>
            <span className="muted" role="status" aria-live="polite">
              {dirty ? "Alterações não salvas." : ""}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
