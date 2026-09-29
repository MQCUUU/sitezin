"use client";

import { useRef, useState } from "react";
import { Download, ImageIcon, Share2 } from "lucide-react";
import {
  drawRetrospectiveCard,
  retrospectiveCardAlt,
  retrospectiveFileName,
  type RetrospectiveCardData,
} from "@/lib/retrospective-card";

/*
 * V2.1-E — "Gerar card" / "Compartilhar" / "Baixar".
 * Tudo local (Canvas 2D). Nada é enviado ao servidor nem publicado: o
 * card só sai do navegador quando o próprio usuário baixa ou compartilha.
 */
export function RetrospectiveShare({ data }: { data: RetrospectiveCardData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [generatedFor, setGeneratedFor] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const generated = generatedFor === data.year;

  function generate() {
    const canvas = canvasRef.current;

    if (!canvas) return;

    try {
      const accent =
        getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#8b5cf6";
      drawRetrospectiveCard(canvas, data, /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#8b5cf6");
      setGeneratedFor(data.year);
      setMessage("Card gerado.");
    } catch {
      setMessage("Não foi possível gerar o card neste navegador.");
    }
  }

  function toBlob(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const canvas = canvasRef.current;

      if (!canvas) return resolve(null);

      canvas.toBlob(resolve, "image/png");
    });
  }

  function download(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = retrospectiveFileName(data.year);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function onDownload() {
    const blob = await toBlob();

    if (!blob) return setMessage("Não foi possível exportar a imagem.");

    download(blob);
    setMessage("Download iniciado.");
  }

  async function onShare() {
    const blob = await toBlob();

    if (!blob) return setMessage("Não foi possível exportar a imagem.");

    const file = new File([blob], retrospectiveFileName(data.year), { type: "image/png" });

    // Web Share com arquivo só quando o navegador suporta; senão, baixa.
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `Minha retrospectiva ${data.year}` });
        return setMessage("Compartilhado.");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    download(blob);
    setMessage("Seu navegador não compartilha arquivos: a imagem foi baixada.");
  }

  return (
    <section className="section retrospective-share" aria-labelledby="retrospective-share-title">
      <div className="title-section-heading">
        <span>Compartilhar</span>
        <h2 id="retrospective-share-title">Card do seu {data.year}</h2>
      </div>
      <p className="muted">
        Gera uma imagem 1080×1350 no seu navegador com os números acima. Nada é publicado: só você decide se baixa
        ou compartilha.
      </p>

      <div className="retrospective-share-actions">
        <button type="button" className="btn primary" onClick={generate}>
          <ImageIcon size={15} />
          Gerar card
        </button>
        <button type="button" className="btn" onClick={onShare} disabled={!generated}>
          <Share2 size={15} />
          Compartilhar
        </button>
        <button type="button" className="btn" onClick={onDownload} disabled={!generated}>
          <Download size={15} />
          Baixar
        </button>
      </div>

      <p className="muted" role="status" aria-live="polite">
        {message}
      </p>

      <canvas
        ref={canvasRef}
        className="retrospective-share-canvas"
        hidden={!generated}
        role="img"
        aria-label={generated ? retrospectiveCardAlt(data) : undefined}
        width={1080}
        height={1350}
      />
    </section>
  );
}
