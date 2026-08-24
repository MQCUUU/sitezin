"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { Camera, Loader2, Trash2, Upload } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { useConfirm } from "@/components/ConfirmProvider";

async function squareAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível processar a imagem.");
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    512,
    512,
  );
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Imagem inválida.")),
      "image/webp",
      0.86,
    ),
  );
}

async function readResult(response: Response): Promise<any> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível salvar a foto.");
  return data;
}

export function AvatarSettings() {
  const toast = useToast();
  const confirmAction = useConfirm();
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/profile/showcase", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : {})
      .then((data: any) => setUrl(data.profile?.avatar_url || ""));
  }, []);

  function notifyUpdated(avatarUrl: string) {
    window.dispatchEvent(new CustomEvent("mycatalog:account-updated", {
      detail: { avatar_url: avatarUrl || null },
    }));
    window.dispatchEvent(new CustomEvent("mycatalog:profile-updated", {
      detail: { closeEditor: false },
    }));
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return toast.error("Escolha uma imagem JPG, PNG ou WebP.");
    }
    if (file.size > 5 * 1024 * 1024) {
      return toast.error("A imagem deve ter no máximo 5 MB.");
    }

    setSaving(true);
    try {
      const blob = await squareAvatar(file);
      const formData = new FormData();
      formData.append("avatar", blob, "avatar.webp");
      const data = await readResult(await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      }));
      setUrl(data.avatar_url);
      notifyUpdated(data.avatar_url);
      toast.success("Foto de perfil atualizada");
    } catch (error: any) {
      toast.error("Não foi possível enviar a foto", { description: error?.message });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!(await confirmAction({
      title: "Remover foto?",
      description: "Sua foto de perfil atual será removida.",
      confirmLabel: "Remover foto",
    }))) return;

    setSaving(true);
    try {
      await readResult(await fetch("/api/profile/avatar", { method: "DELETE" }));
      setUrl("");
      notifyUpdated("");
      toast.success("Foto removida");
    } catch (error: any) {
      toast.error("Não foi possível remover", { description: error?.message });
    } finally {
      setSaving(false);
    }
  }

  return <section className="panel avatar-upload">
    <div className="avatar-upload-preview">
      {url ? <img src={url} alt="Sua foto de perfil" /> : <Camera size={28} />}
    </div>
    <div className="avatar-upload-copy">
      <strong>Foto de perfil</strong>
      <p>O MyCatalog recorta e redimensiona automaticamente para 512 × 512, sem deformar.</p>
      <div>
        <label className="btn primary">
          {saving ? <Loader2 className="spin" size={15} /> : <Upload size={15} />}
          Escolher imagem
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={saving} onChange={upload} />
        </label>
        {url && <button className="btn" disabled={saving} onClick={remove}>
          <Trash2 size={15} /> Remover
        </button>}
      </div>
      <small>JPG, PNG ou WebP · máximo de 5 MB</small>
    </div>
  </section>;
}
