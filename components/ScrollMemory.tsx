"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/*
 * Posição de rolagem por ENTRADA do histórico da aba.
 *
 * - Voltar/avançar (botão do navegador ou o "Voltar" do app) e F5: a página volta
 *   exatamente para onde estava.
 * - Link novo (navegação normal): abre no topo, como sempre.
 *
 * Antes (bug): a restauração usava um MutationObserver no <body> que nunca era
 * desligado — qualquer mudança no DOM depois (imagem, carrossel, aviso, dados
 * chegando) jogava a página de volta para a posição salva, e ainda agendava mais
 * três "pulos". Por isso a rolagem "voltava para um lugar travado".
 *
 * Agora a restauração acontece uma vez por volta: espera o conteúdo ter altura
 * suficiente (até RESTORE_MAX_MS), aplica, reaplica só enquanto a página ainda
 * cresce logo depois e PARA de vez. Qualquer gesto do usuário (rodinha, toque,
 * tecla, clique na barra) cancela na hora.
 *
 * As entradas ficam numa pilha em sessionStorage (por aba): sobrevive ao F5 e
 * distingue a mesma URL aberta duas vezes no histórico.
 */

const STACK_KEY = "mycatalog:history-stack-v3";
const POS_KEY = "mycatalog:history-scroll-v3";
const RESTORE_MAX_MS = 6000;
const SETTLE_MS = 1200;

type Stack = { entries: string[]; index: number };
type Positions = Record<string, number>;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Armazenamento indisponível (modo privado/cheio): só perde a posição salva.
  }
}

/** URL atual no mesmo formato do usePathname + useSearchParams (para comparar com a pilha). */
function currentLocation() {
  const qs = new URLSearchParams(window.location.search).toString();
  return window.location.pathname + (qs ? `?${qs}` : "");
}

function entryKey(stack: Stack) {
  return `${stack.index}:${stack.entries[stack.index] ?? ""}`;
}

/*
 * Voltar/avançar: o roteador do Next re-renderiza dentro do próprio ouvinte de
 * popstate, ANTES de um ouvinte registrado num efeito nosso rodar. Por isso o
 * ouvinte fica no nível do módulo, na fase de CAPTURA (roda antes do ouvinte comum
 * do Next), e só marca QUANDO e PARA ONDE foi a última volta.
 */
let lastPop = { at: 0, url: "" };
let lastReplace = { at: 0, url: "" };
if (typeof window !== "undefined") {
  // Navigation API (Chrome/Edge/Safari/Firefox recentes): `navigate` do tipo "traverse"
  // dispara ANTES de o roteador tratar a volta — é o sinal confiável.
  const navigation = (window as unknown as { navigation?: EventTarget }).navigation;
  navigation?.addEventListener("navigate", (event) => {
    const e = event as Event & { navigationType?: string; destination?: { url?: string } };
    if (!e.destination?.url) return;
    const dest = new URL(e.destination.url);
    const qs = new URLSearchParams(dest.search).toString();
    const destUrl = dest.pathname + (qs ? `?${qs}` : "");
    if (e.navigationType === "traverse") lastPop = { at: Date.now(), url: destUrl };
    // Troca de aba/filtro com router.replace: a entrada do histórico é a MESMA.
    if (e.navigationType === "replace") lastReplace = { at: Date.now(), url: destUrl };
  });
  // Reserva para navegadores sem a Navigation API.
  // capture: na própria janela, ouvintes de captura rodam antes dos comuns (o do Next).
  window.addEventListener(
    "popstate",
    () => {
      lastPop = { at: Date.now(), url: currentLocation() };
    },
    { capture: true }
  );
}

/** Há uma página anterior DENTRO do app nesta aba? (usado pelo "Voltar" do app) */
export function hasInAppHistory(): boolean {
  if (typeof window === "undefined") return false;
  const stack = read<Stack>(STACK_KEY, { entries: [], index: -1 });
  return stack.index > 0 && stack.entries[stack.index] === currentLocation();
}

function scrollY() {
  return Math.max(window.scrollY, document.querySelector<HTMLElement>("main.main")?.scrollTop ?? 0);
}

function scrollToY(y: number) {
  window.scrollTo({ top: y, left: 0, behavior: "instant" as ScrollBehavior });
}

export function ScrollMemory() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");

  /** Restauração em andamento: não grava posição enquanto isso. */
  const restoringRef = useRef(false);
  const firstRef = useRef(true);

  useEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  }, []);

  useEffect(() => {
    /* ---------- 1. onde estamos na pilha desta aba ---------- */
    const stack = read<Stack>(STACK_KEY, { entries: [], index: -1 });
    const isFirst = firstRef.current;
    firstRef.current = false;
    // Esta mudança de URL veio do voltar/avançar? (marcado pelo ouvinte do módulo)
    const isPop = lastPop.url === url && Date.now() - lastPop.at < 3000;
    if (isPop) lastPop = { at: 0, url: "" };
    let shouldRestore = false;

    if (isFirst) {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const reloadOrTraverse = nav?.type === "reload" || nav?.type === "back_forward";

      if (reloadOrTraverse && stack.entries[stack.index] === url) {
        shouldRestore = true; // F5 ou volta de outro site: mesma entrada
      } else if (reloadOrTraverse && stack.entries[stack.index - 1] === url) {
        stack.index -= 1;
        shouldRestore = true;
      } else if (reloadOrTraverse && stack.entries[stack.index + 1] === url) {
        stack.index += 1;
        shouldRestore = true;
      } else {
        stack.entries = [...stack.entries.slice(0, stack.index + 1), url];
        stack.index = stack.entries.length - 1;
      }
    } else if (isPop) {
      if (stack.entries[stack.index - 1] === url) stack.index -= 1;
      else if (stack.entries[stack.index + 1] === url) stack.index += 1;
      else {
        // Salto de mais de uma entrada: procura a mais próxima com essa URL.
        const back = stack.entries.lastIndexOf(url, Math.max(0, stack.index - 1));
        if (back >= 0) stack.index = back;
        else {
          stack.entries = [...stack.entries.slice(0, stack.index + 1), url];
          stack.index = stack.entries.length - 1;
        }
      }
      shouldRestore = true;
    } else if (stack.entries[stack.index] !== url && lastReplace.url === url && Date.now() - lastReplace.at < 3000) {
      // router.replace (aba/filtro): atualiza a entrada atual, sem criar outra.
      lastReplace = { at: 0, url: "" };
      stack.entries[stack.index] = url;
    } else if (stack.entries[stack.index] !== url) {
      // Navegação normal (link/router.push): nova entrada.
      stack.entries = [...stack.entries.slice(0, stack.index + 1), url].slice(-200);
      stack.index = stack.entries.length - 1;
      const positions = read<Positions>(POS_KEY, {});
      delete positions[entryKey(stack)];
      write(POS_KEY, positions);
    }
    write(STACK_KEY, stack);
    const key = entryKey(stack);

    /* ---------- 2. grava a posição desta entrada enquanto o usuário rola ---------- */
    let frame: number | null = null;
    const save = () => {
      if (restoringRef.current) return;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        // Já saiu desta página (o Next rola ao topo na navegação nova): não grava por cima.
        if (currentLocation() !== url) return;
        const positions = read<Positions>(POS_KEY, {});
        positions[key] = scrollY();
        write(POS_KEY, positions);
      });
    };
    // Grava também no clique (antes de qualquer navegação começar).
    const saveNow = () => {
      if (restoringRef.current || currentLocation() !== url) return;
      const positions = read<Positions>(POS_KEY, {});
      positions[key] = scrollY();
      write(POS_KEY, positions);
    };
    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("pagehide", saveNow);
    document.addEventListener("pointerdown", saveNow, true);

    /* ---------- 3. restauração única (voltar/avançar/F5) ---------- */
    const target = shouldRestore ? read<Positions>(POS_KEY, {})[key] ?? 0 : 0;
    let stopRestore = () => {};

    if (target > 0) {
      restoringRef.current = true;
      const started = Date.now();
      let appliedAt = 0;
      let timer: number | null = null;
      let stopped = false;

      const finish = () => {
        if (stopped) return;
        stopped = true;
        restoringRef.current = false;
        if (timer !== null) window.clearTimeout(timer);
        resize.disconnect();
        for (const type of ["wheel", "touchstart", "keydown", "pointerdown"] as const) window.removeEventListener(type, finish, true);
      };

      const tick = () => {
        if (stopped) return;
        const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const now = Date.now();

        if (max >= target || now - started > RESTORE_MAX_MS) {
          const y = Math.min(target, max);
          if (Math.abs(window.scrollY - y) > 1) scrollToY(y);
          if (!appliedAt) appliedAt = now;
          // Reaplica só por um instante, enquanto a página termina de crescer; depois para.
          if (now - appliedAt > SETTLE_MS || (max >= target && Math.abs(window.scrollY - target) <= 1 && now - appliedAt > 300)) {
            finish();
            return;
          }
        }
        timer = window.setTimeout(tick, 60);
      };

      // Conteúdo que cresce (dados carregando) dispara nova tentativa — sem observar o DOM inteiro.
      const resize = new ResizeObserver(() => tick());
      resize.observe(document.body);
      // O usuário mexeu: a restauração termina na hora e nunca mais puxa a página.
      for (const type of ["wheel", "touchstart", "keydown", "pointerdown"] as const) window.addEventListener(type, finish, { capture: true, passive: true });
      tick();
      stopRestore = finish;
    }

    return () => {
      stopRestore();
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", save);
      window.removeEventListener("pagehide", saveNow);
      document.removeEventListener("pointerdown", saveNow, true);
    };
  }, [url]);

  return null;
}
