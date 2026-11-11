"use client";

import { useEffect, useRef, useState } from "react";

/*
 * Player do trailer com anel de foco visível pelo teclado.
 *
 * O iframe do YouTube é de outra origem: quando o foco entra nele, o Chrome não
 * aplica :focus nem :focus-visible ao elemento, então CSS sozinho não mostra
 * nada. Aqui: se a janela perde o foco para este iframe logo depois de um Tab,
 * o contêiner ganha `data-focus-visible` (anel em title-detail.css). Pelo mouse
 * não acende — mesmo critério do :focus-visible.
 */
const TAB_WINDOW_MS = 1000;

/** `autoplay`: o player abriu por um clique na capa (TitleTrailer) e já começa a tocar. */
export function TrailerFrame({ videoKey, title, autoplay = false }: { videoKey: string; title: string; autoplay?: boolean }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const lastTabAt = useRef(0);
  const [focusVisible, setFocusVisible] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Tab") lastTabAt.current = Date.now();
    }

    function onWindowBlur() {
      // O activeElement só aponta para o iframe depois que o blur termina.
      setTimeout(() => {
        const viaKeyboard = Date.now() - lastTabAt.current < TAB_WINDOW_MS;
        setFocusVisible(viaKeyboard && document.activeElement === frameRef.current);
      }, 0);
    }

    function onFocusBack() {
      setFocusVisible(false);
    }

    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onFocusBack);
    document.addEventListener("focusin", onFocusBack);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onFocusBack);
      document.removeEventListener("focusin", onFocusBack);
    };
  }, []);

  return (
    <div className="mc-trailer-frame" data-focus-visible={focusVisible || undefined}>
      <iframe
        ref={frameRef}
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoKey)}${autoplay ? "?autoplay=1" : ""}`}
        title={title}
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}
