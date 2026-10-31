-- 0002 — Watchlist automática com prioridade + banner do perfil.
--
-- Watchlist: NÃO é uma lista separada. É a visão dos itens da Biblioteca com
-- status "Quero assistir" (want): marcar "Quero assistir" entra; trocar o status
-- sai — sempre em sincronia, sem cópia de dados. `watchlist_position` guarda só a
-- ORDEM de prioridade escolhida pelo usuário (1 = assistir primeiro). NULL = ainda
-- sem posição (entra no fim da fila, por ordem de chegada).
ALTER TABLE public.library_items ADD COLUMN IF NOT EXISTS watchlist_position integer;

CREATE INDEX IF NOT EXISTS library_items_watchlist_idx
  ON public.library_items (user_id, watchlist_position, added_at)
  WHERE status = 'want';

-- Banner do perfil (imagem no Vercel Blob, como o avatar).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banner_url text;
