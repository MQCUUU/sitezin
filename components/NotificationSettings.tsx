"use client";
import { useEffect, useState } from "react";
import { Bell, Loader2, Save } from "lucide-react";
import { useToast } from "@/components/ToastProvider";

/*
 * F1 — a tabela `public.notifications` só aceita `type IN
 * ('new_season','new_episode')` (CHECK constraint). O único produtor
 * de linhas (`app/api/library/sync-seasons/route.ts`) só escreve esses
 * dois tipos. As preferências abaixo NÃO têm como virar uma
 * notificação real hoje:
 *
 * - `new_follower_*`/`follow_request_*`: o follow system (Fase E1)
 *   nunca escreve em `notifications` — só faz join direto com
 *   `public.follows`, sem produzir notificação.
 * - `review_like_*`: não existe NENHUMA feature de curtir review em
 *   lugar nenhum do código — nem tabela, nem rota, nem UI.
 * - `*_email`, incluindo `product_updates_email`: nenhum sender de
 *   e-mail existe no repositório (sem nodemailer/resend/sendgrid).
 *
 * Manter esses toggles visíveis como se funcionassem seria enganoso —
 * decisão de produto da F1 (fechada) foi escondê-los da UI ativa sem
 * apagar as colunas do banco (podem voltar quando as features reais
 * existirem). Só `new_season_site`/`new_episode_site` têm produtor
 * real e continuam visíveis.
 */

export function NotificationSettings() {
  const toast = useToast();
  const [prefs, setPrefs] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/profile/notifications", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .then(setPrefs);
  }, []);

  const toggle = (key: string) => setPrefs((p: any) => ({ ...p, [key]: !p[key] }));

  async function save() {
    setSaving(true);
    const r = await fetch("/api/profile/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    });
    setSaving(false);
    r.ok ? toast.success("Preferências salvas") : toast.error("Não foi possível salvar");
  }

  return (
    <section className="panel notification-settings">
      <div className="settings-panel-head">
        <div className="settings-icon">
          <Bell size={19} />
        </div>
        <div>
          <h2>Notificações</h2>
          <p className="muted">Escolha apenas os avisos que realmente importam.</p>
        </div>
      </div>

      <div className="notification-content-preferences">
        <label className="notification-product">
          <input
            type="checkbox"
            checked={Boolean(prefs.new_season_site)}
            onChange={() => toggle("new_season_site")}
          />
          <span>
            <strong>Novas temporadas</strong>
            <small>Avisar quando uma série curtida ganhar uma nova temporada.</small>
          </span>
        </label>
        <label className="notification-product">
          <input
            type="checkbox"
            checked={Boolean(prefs.new_episode_site)}
            onChange={() => toggle("new_episode_site")}
          />
          <span>
            <strong>Novos episódios</strong>
            <small>Avisar sobre o próximo episódio e sua data de estreia.</small>
          </span>
        </label>
      </div>

      <p className="muted notification-settings-note">
        Notificações de seguidores, curtidas em avaliações e por e-mail ainda não
        existem — chegam em uma fase futura.
      </p>

      <button type="button" className="btn primary" disabled={saving} onClick={save}>
        {saving ? <Loader2 className="spin" size={15} /> : <Save size={15} />} Salvar notificações
      </button>
    </section>
  );
}
