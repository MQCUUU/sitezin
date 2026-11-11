"use client";

import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { decimal, periodWhen, periodChange, summaryFicha, summaryHeadline } from "@/lib/insights/clean";
import type { InsightsPayload } from "@/lib/insights/types";

/*
 * Fase 7 — Insights clean. Uma frase grande e poucos blocos; o que ninguém
 * olhava saiu. Cores: âmbar só no que é seu (sua média, sua nota, o atual).
 */

type Data = InsightsPayload;

/** Os 1–2 insights de maior prioridade, em texto puro. */
export function headlineInsights(data: Data) {
  return data.insights.filter((i) => i.priority <= 2).slice(0, 2);
}

export function Opening({ data }: { data: Data }) {
  const { cur, prev } = data.summary;
  const { period, today } = data.meta;
  const ficha = summaryFicha(cur);
  const change = periodChange(cur, prev, period, today);
  const lines = headlineInsights(data);

  return (
    <section aria-label="Resumo do período">
      <h1 className="ix-title">
        <span className="mc-visually-hidden">Insights: </span>
        {summaryHeadline(cur, period, today)}
      </h1>
      <p className="ix-ficha">
        {ficha}
        {cur.avgRating !== null ? (
          <>
            {ficha ? ", " : ""}
            <strong className="ix-mine">sua média {decimal(cur.avgRating)}</strong>
          </>
        ) : null}
      </p>
      {change ? <p className="ix-change">{change}</p> : null}
      {lines.length ? <p className="ix-lines">{lines.map((i) => i.message).join(" ")}</p> : null}
    </section>
  );
}

export function EmptyOpening({ data, onPeriod }: { data: Data; onPeriod: (period: string) => void }) {
  const { period, today, historyTotal } = data.meta;

  if (historyTotal === 0) {
    return (
      <section aria-label="Resumo do período">
        <h1 className="ix-title">
          <span className="mc-visually-hidden">Insights: </span>Seus insights começam aqui
        </h1>
        <p className="ix-ficha">Marque o que você assistiu e dê notas. Aqui aparece quanto, quando e do que você gosta.</p>
        <div className="ix-actions">
          <Link href="/discover" className="btn primary">
            Descobrir títulos
          </Link>
          <Link href="/library" className="btn">
            Abrir biblioteca
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Resumo do período">
      <h1 className="ix-title">
        <span className="mc-visually-hidden">Insights: </span>Nada assistido {periodWhen(period, today)}
      </h1>
      <p className="ix-ficha">Seu histórico está em outro período.</p>
      <div className="ix-actions">
        {period !== "12m" ? (
          <Button variant="primary" type="button" onClick={() => onPeriod("12m")}>
            Ver últimos 12 meses
          </Button>
        ) : null}
        <Button type="button" onClick={() => onPeriod("all")}>
          Ver todo o histórico
        </Button>
      </div>
    </section>
  );
}
