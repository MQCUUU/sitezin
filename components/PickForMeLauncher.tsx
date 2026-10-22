"use client";

/*
 * Fase 4 (P2-06) — botão "Escolha pra mim" leve.
 *
 * O PickForMe tem ~3.800 linhas e entrava no JS inicial de várias páginas
 * (inclusive do login, por chunk compartilhado). Aqui só o botão é carregado;
 * o módulo grande é baixado ao passar o ponteiro/focar (pré-carga) ou no
 * clique, e então fica montado (fechado) — o resultado sorteado continua lá
 * ao reabrir, como antes. Enquanto o módulo chega, o botão mostra que está
 * carregando.
 */
import dynamic from "next/dynamic";
import { useState } from "react";
import { Loader2, Shuffle } from "lucide-react";

import type { PickInherit } from "@/components/PickForMe";

const loadPickForMe = () => import("@/components/PickForMe");

const PickForMe = dynamic(() => loadPickForMe().then((module) => module.PickForMe), { ssr: false });

export function PickForMeLauncher({ inherit }: { inherit?: PickInherit } = {}) {
  const [openRequest, setOpenRequest] = useState(0);
  const [ready, setReady] = useState(false);
  const loading = openRequest > 0 && !ready;

  return (
    <>
      <button
        type="button"
        className="btn pick-trigger"
        aria-busy={loading || undefined}
        onPointerEnter={() => void loadPickForMe()}
        onFocus={() => void loadPickForMe()}
        onClick={() => setOpenRequest((count) => count + 1)}
      >
        {loading ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Shuffle size={16} aria-hidden="true" />}
        Escolha pra mim
      </button>

      {openRequest > 0 && (
        <PickForMe inherit={inherit} hideTrigger openRequest={openRequest} onMounted={() => setReady(true)} />
      )}
    </>
  );
}
