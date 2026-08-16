"use client";

import {
  useEffect,
  useRef,
} from "react";

import {
  usePathname,
  useSearchParams,
} from "next/navigation";

export const RETURN_POSITION_KEY =
  "mycatalog:return-position-v2";

const PAGE_SCROLL_KEY =
  "mycatalog:page-scroll-v2";

type ReturnPosition = {
  url: string;
  windowY: number;
  mainY: number;
  restoreRequested: boolean;
  savedAt: number;
};

type PageScrollStore = Record<
  string,
  {
    windowY: number;
    mainY: number;
    savedAt: number;
  }
>;

function getCurrentUrl() {
  return (
    window.location.pathname +
    window.location.search
  );
}

function getMain() {
  return document.querySelector(
    "main.main"
  ) as HTMLElement | null;
}

function readReturnPosition():
  | ReturnPosition
  | null {
  try {
    const raw =
      sessionStorage.getItem(
        RETURN_POSITION_KEY
      );

    if (!raw) {
      return null;
    }

    return JSON.parse(
      raw
    ) as ReturnPosition;
  } catch {
    return null;
  }
}

function writeReturnPosition(
  value: ReturnPosition
) {
  try {
    sessionStorage.setItem(
      RETURN_POSITION_KEY,
      JSON.stringify(value)
    );
  } catch {}
}

function readPageScroll():
  PageScrollStore {
  try {
    const raw =
      sessionStorage.getItem(
        PAGE_SCROLL_KEY
      );

    if (!raw) {
      return {};
    }

    return JSON.parse(
      raw
    ) as PageScrollStore;
  } catch {
    return {};
  }
}

function writePageScroll(
  store: PageScrollStore
) {
  try {
    sessionStorage.setItem(
      PAGE_SCROLL_KEY,
      JSON.stringify(store)
    );
  } catch {}
}

export function ScrollMemory() {
  const pathname =
    usePathname();

  const searchParams =
    useSearchParams();

  const restoringRef =
    useRef(false);

  const currentUrl =
    pathname +
    (
      searchParams.toString()
        ? `?${searchParams.toString()}`
        : ""
    );

  /*
   * ==========================================
   * RESTAURAÇÃO NATIVA MANUAL
   * ==========================================
   */

  useEffect(() => {
    if (
      "scrollRestoration" in
      window.history
    ) {
      window.history.scrollRestoration =
        "manual";
    }
  }, []);

  /*
   * ==========================================
   * SALVAR SCROLL DA PÁGINA ATUAL
   * ==========================================
   *
   * Isso é o que faz o F5 voltar
   * exatamente para o mesmo lugar.
   */

  useEffect(() => {
    const main =
      getMain();

    let frame:
      number | null =
      null;

    function saveCurrentPage() {
      if (
        restoringRef.current
      ) {
        return;
      }

      if (
        frame !== null
      ) {
        cancelAnimationFrame(
          frame
        );
      }

      frame =
        requestAnimationFrame(
          () => {
            const store =
              readPageScroll();

            store[currentUrl] = {
              windowY:
                window.scrollY,

              mainY:
                main?.scrollTop ||
                0,

              savedAt:
                Date.now(),
            };

            writePageScroll(
              store
            );
          }
        );
    }

    window.addEventListener(
      "scroll",
      saveCurrentPage,
      {
        passive: true,
      }
    );

    main?.addEventListener(
      "scroll",
      saveCurrentPage,
      {
        passive: true,
      }
    );

    window.addEventListener(
      "pagehide",
      saveCurrentPage
    );

    document.addEventListener(
      "pointerdown",
      saveCurrentPage,
      true
    );

    return () => {
      if (
        !restoringRef.current
      ) {
        const store =
          readPageScroll();

        store[currentUrl] = {
          windowY:
            window.scrollY,

          mainY:
            main?.scrollTop ||
            0,

          savedAt:
            Date.now(),
        };

        writePageScroll(
          store
        );
      }

      window.removeEventListener(
        "scroll",
        saveCurrentPage
      );

      main?.removeEventListener(
        "scroll",
        saveCurrentPage
      );

      window.removeEventListener(
        "pagehide",
        saveCurrentPage
      );

      document.removeEventListener(
        "pointerdown",
        saveCurrentPage,
        true
      );

      if (
        frame !== null
      ) {
        cancelAnimationFrame(
          frame
        );
      }
    };
  }, [
    currentUrl,
  ]);

  /*
   * ==========================================
   * SALVAR ORIGEM ANTES DE ABRIR /title/
   * ==========================================
   */

  useEffect(() => {
    function saveOrigin(
      event: PointerEvent
    ) {
      const target =
        event.target as
          | HTMLElement
          | null;

      if (!target) {
        return;
      }

      const anchor =
        target.closest(
          "a"
        ) as
          | HTMLAnchorElement
          | null;

      if (!anchor) {
        return;
      }

      let destination: URL;

      try {
        destination =
          new URL(
            anchor.href,
            window.location.origin
          );
      } catch {
        return;
      }

      if (
        destination.origin !==
        window.location.origin
      ) {
        return;
      }

      if (
        !destination.pathname.startsWith(
          "/title/"
        )
      ) {
        return;
      }

      if (
        window.location.pathname.startsWith(
          "/title/"
        )
      ) {
        return;
      }

      const main =
        getMain();

      writeReturnPosition({
        url:
          getCurrentUrl(),

        windowY:
          window.scrollY,

        mainY:
          main?.scrollTop ||
          0,

        restoreRequested:
          false,

        savedAt:
          Date.now(),
      });
    }

    document.addEventListener(
      "pointerdown",
      saveOrigin,
      true
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        saveOrigin,
        true
      );
    };
  }, []);

  /*
   * ==========================================
   * FUNÇÃO DE RESTAURAÇÃO
   * ==========================================
   */

  useEffect(() => {
    const returnPosition =
      readReturnPosition();

    const pageStore =
      readPageScroll();

    const pagePosition =
      pageStore[currentUrl];

    /*
     * PRIORIDADE 1:
     * retorno pelo SmartBackButton.
     *
     * PRIORIDADE 2:
     * restauração normal da própria página,
     * usada principalmente no F5.
     */

    let targetWindow = 0;
    let targetMain = 0;
    let isReturnRestore =
      false;

    if (
      returnPosition &&
      returnPosition.restoreRequested &&
      returnPosition.url ===
        currentUrl
    ) {
      targetWindow =
        Math.max(
          0,
          returnPosition.windowY ||
            0
        );

      targetMain =
        Math.max(
          0,
          returnPosition.mainY ||
            0
        );

      isReturnRestore =
        true;
    } else if (
      pagePosition
    ) {
      targetWindow =
        Math.max(
          0,
          pagePosition.windowY ||
            0
        );

      targetMain =
        Math.max(
          0,
          pagePosition.mainY ||
            0
        );
    }

    if (
      targetWindow <= 0 &&
      targetMain <= 0
    ) {
      return;
    }

    restoringRef.current =
      true;

    let cancelled =
      false;

    const start =
      Date.now();

    const maxWait =
      20000;

    function restore() {
      if (
        cancelled
      ) {
        return;
      }

      const main =
        getMain();

      const windowMax =
        Math.max(
          0,
          document.documentElement
            .scrollHeight -
            window.innerHeight
        );

      const mainMax =
        main
          ? Math.max(
              0,
              main.scrollHeight -
                main.clientHeight
            )
          : 0;

      const windowReady =
        targetWindow === 0 ||
        windowMax >=
          targetWindow;

      const mainReady =
        targetMain === 0 ||
        mainMax >=
          targetMain;

      if (
        windowReady &&
        mainReady
      ) {
        if (
          targetWindow > 0
        ) {
          window.scrollTo({
            top:
              targetWindow,

            left: 0,

            behavior:
              "instant",
          });
        }

        if (
          main &&
          targetMain > 0
        ) {
          main.scrollTop =
            targetMain;
        }

        /*
         * Repetimos porque páginas como
         * /calendar podem mudar de altura
         * logo depois do primeiro render.
         */

        const delays =
          [
            80,
            250,
            600,
          ];

        delays.forEach(
          (
            delay
          ) => {
            window.setTimeout(
              () => {
                if (
                  cancelled
                ) {
                  return;
                }

                if (
                  targetWindow > 0
                ) {
                  window.scrollTo({
                    top:
                      targetWindow,

                    left: 0,

                    behavior:
                      "instant",
                  });
                }

                if (
                  main &&
                  targetMain > 0
                ) {
                  main.scrollTop =
                    targetMain;
                }
              },
              delay
            );
          }
        );

        window.setTimeout(
          () => {
            if (
              cancelled
            ) {
              return;
            }

            /*
             * Se foi retorno do botão Voltar,
             * marca a restauração como consumida.
             */

            if (
              isReturnRestore &&
              returnPosition
            ) {
              writeReturnPosition({
                ...returnPosition,

                restoreRequested:
                  false,
              });
            }

            restoringRef.current =
              false;
          },
          700
        );

        return;
      }

      if (
        Date.now() -
          start <
        maxWait
      ) {
        window.setTimeout(
          restore,
          80
        );
      } else {
        restoringRef.current =
          false;
      }
    }

    const observer =
      new MutationObserver(
        restore
      );

    observer.observe(
      document.body,
      {
        childList: true,
        subtree: true,
      }
    );

    const initial =
      window.setTimeout(
        restore,
        30
      );

    return () => {
      cancelled =
        true;

      observer.disconnect();

      clearTimeout(
        initial
      );

      restoringRef.current =
        false;
    };
  }, [
    currentUrl,
  ]);

  return null;
}