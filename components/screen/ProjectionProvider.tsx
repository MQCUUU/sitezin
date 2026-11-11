"use client";

import "@/styles/features/projection.css";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { createProjectionScheduler } from "@/lib/projection";

import { RoomLight } from "./RoomLight";

type ProjectionValue = {
  /** Backdrop do título sob o ponteiro/foco, ou null (a faixa mostra o padrão da página). */
  target: string | null;
  /** Cor média da imagem em projeção, para o RoomLight. */
  setRoom: (color: string | null) => void;
};

const ProjectionContext = createContext<ProjectionValue | null>(null);

/** null fora de um ProjectionProvider (ex.: página do Título, que não troca de imagem). */
export function useProjectionTarget(): ProjectionValue | null {
  return useContext(ProjectionContext);
}

function saveDataOn() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(connection?.saveData);
}

/**
 * Projeção (Fase 5) — o pôster em foco troca a imagem da faixa e acende o
 * RoomLight. Um único par de ouvintes na raiz (delegação): os cartões só
 * carregam `data-projection="<backdrop_path>"` e não re-renderizam.
 * Só mouse e teclado; toque não troca (rolar a prateleira não pode disparar
 * imagens). Com Economia de dados, a faixa fica no título padrão.
 */
export function ProjectionProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<string | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const schedulerRef = useRef<ReturnType<typeof createProjectionScheduler> | null>(null);

  useEffect(() => {
    if (saveDataOn()) return;
    const scheduler = createProjectionScheduler((path) => setTarget(path));
    schedulerRef.current = scheduler;
    return () => {
      scheduler.cancel();
      schedulerRef.current = null;
    };
  }, []);

  const ask = (el: EventTarget | null) => {
    const card = el instanceof Element ? el.closest<HTMLElement>("[data-projection]") : null;
    schedulerRef.current?.request(card?.dataset.projection || null);
  };

  const value = useMemo(() => ({ target, setRoom }), [target]);

  return (
    <ProjectionContext.Provider value={value}>
      <div
        className="pj-root"
        onPointerOver={(event) => {
          if (event.pointerType === "touch") return;
          ask(event.target);
        }}
        onPointerLeave={() => schedulerRef.current?.request(null)}
        onFocus={(event) => ask(event.target)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) schedulerRef.current?.request(null);
        }}
      >
        <RoomLight color={target ? room : null} />
        {children}
      </div>
    </ProjectionContext.Provider>
  );
}
