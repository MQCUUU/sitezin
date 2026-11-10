import { ViewTransition } from "react";

/*
 * Transição entre páginas (React 19.3 <ViewTransition>, View Transitions API).
 *
 * O template remonta a cada troca de rota (não quando só a busca da URL muda,
 * como ?tab=), então `enter`/`exit` disparam só na navegação. `default="none"`:
 * nenhuma outra transição do React anima este bloco.
 *
 * Navegar é coisa de dezenas de vezes por dia: o efeito é só um fade curto do
 * conteúdo (styles em app/globals.css, "Transição entre páginas"). Barra
 * lateral e topo ficam fora do <main> e não se mexem. Sem suporte do
 * navegador, a navegação segue igual, sem animar.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="mc-page" exit="mc-page" default="none">
      {children}
    </ViewTransition>
  );
}
