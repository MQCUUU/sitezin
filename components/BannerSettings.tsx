"use client";

import "@/styles/features/profile.css";
import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { useState, type ChangeEvent } from "react";

import { useToast } from "@/components/ToastProvider";
import { apiFetch, errorMessage } from "@/lib/api-client";

/*
 * Banner do perfil (imagem larga no topo do perfil público). Mesmo jeito do editor
 * de foto (AvatarSettings): envia na hora, mostra a prévia e permite remover.
 * Recomendado: imagem larga (ex.: 1500×500); WebP, JPEG ou PNG até 8 MB.
 */
export function BannerSettings({ current, onChange }: { current: string | null; onChange: (url: string | null) => void }) {
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(current);
  const [saving, setSaving] = useState(false);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Imagem grande demais", { description: "O banner pode ter até 8 MB." });
      return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      form.append("banner", file);
      const data = await apiFetch<{ banner_url: string }>("/api/profile/banner", { method: "POST", body: form, timeout: 30000 });
      setUrl(data.banner_url);
      onChange(data.banner_url);
      toast.success("Banner atualizado");
    } catch (error) {
      toast.error("Não foi possível salvar o banner", { description: errorMessage(error, "Tente outra imagem.") });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await apiFetch("/api/profile/banner", { method: "DELETE" });
      setUrl(null);
      onChange(null);
      toast.success("Banner removido");
    } catch (error) {
      toast.error("Não foi possível remover o banner", { description: errorMessage(error, "Tente novamente.") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel banner-upload">
      <div className="banner-upload-preview" aria-hidden="true">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" />
        ) : (
          <span>
            <ImageIcon size={22} />
          </span>
        )}
      </div>
      <div className="banner-upload-copy">
        <strong>Banner do perfil</strong>
        <p className="muted">Uma imagem larga no topo do seu perfil (sugestão: 1500×500). WebP, JPEG ou PNG, até 8 MB.</p>
        <div className="banner-upload-actions">
          <label className="btn primary">
            {saving ? <Loader2 className="spin" size={16} /> : <Upload size={16} />}
            {url ? "Trocar banner" : "Enviar banner"}
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={saving} onChange={upload} />
          </label>
          {url ? (
            <button type="button" className="btn" disabled={saving} onClick={remove}>
              <Trash2 size={16} /> Remover
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
