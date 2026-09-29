import { PosterSkeleton } from "@/components/AsyncState";

/*
 * V2.2-A — antes: só o texto "Carregando biblioteca...". Agora a mesma grade
 * (com o mesmo tamanho aproximado dos cards) que a tela vai ocupar, então o
 * conteúdo não "pula" quando chega.
 */
export default function LibraryLoading() {
  return (
    <div className="section" role="status" aria-live="polite" aria-label="Carregando biblioteca">
      <div className="mc-skeleton mc-skeleton-heading" />
      <div className="mc-skeleton mc-skeleton-copy" />
      <div style={{ marginTop: 20 }}>
        <PosterSkeleton count={12} />
      </div>
    </div>
  );
}
