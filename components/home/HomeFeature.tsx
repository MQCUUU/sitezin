"use client";

import "@/styles/features/home-screen.css";
import Link from "next/link";

import { TitleBand } from "@/components/title/hero/TitleBand";
import type { HeroBar } from "@/lib/home/home";

/**
 * Fase 4 — destaque do Início (direção "Tela 2.39:1"): a faixa panorâmica do
 * título em foco, o nome grande e uma frase do que fazer agora. Uma ação
 * clara; a secundária é discreta. Sem moldura, brilho que segue o ponteiro
 * nem painel lateral (o próximo da agenda está em "Nesta semana").
 *
 * `lead` vem do antigo rótulo em caixa alta ("CONTINUE DE ONDE PAROU") e vira
 * o começo da frase ("Continue de onde parou.").
 */
export function HomeFeature({
  lead,
  title,
  description,
  href,
  action,
  backdropPath,
  meta,
  bar,
  secondary,
}: {
  lead: string;
  title: string;
  description: string;
  href: string;
  action: string;
  backdropPath: string | null;
  meta?: string | null;
  bar?: HeroBar | null;
  secondary?: { href: string; label: string } | null;
}) {
  const sentence = [sentenceCase(lead), description].filter(Boolean).join(" ");

  return (
    <section className="hm-feature" aria-labelledby="hm-feature-title">
      {backdropPath ? <TitleBand path={backdropPath} /> : null}

      <div className="hm-feature-body">
        <div className="hm-feature-copy">
          <h1 id="hm-feature-title" className="hm-feature-title">{title}</h1>
          {sentence ? <p className="hm-feature-text">{sentence}</p> : null}
        </div>

        <div className="hm-feature-side">
          {meta ? (
            <div className="hm-progress">
              <span className="hm-progress-label">{meta}</span>
              {bar ? (
                <span
                  className="hm-progress-track"
                  role="progressbar"
                  aria-label="Episódios exibidos assistidos"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={bar.percent}
                  aria-valuetext={bar.label}
                >
                  <span className="hm-progress-fill" style={{ transform: `scaleX(${bar.percent / 100})` }} />
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="hm-feature-actions">
            <Link href={href} className="btn primary hm-action">
              {action}
            </Link>
            {secondary ? (
              <Link href={secondary.href} className="btn hm-action hm-action--quiet">
                {secondary.label}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/** "CONTINUE DE ONDE PAROU" → "Continue de onde parou." */
function sentenceCase(text: string) {
  const clean = text.trim();
  if (!clean) return "";
  const lower = clean.toLocaleLowerCase("pt-BR");
  const body = lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
  return /[.!?]$/.test(body) ? body : `${body}.`;
}
