-- 0011 — Respostas e curtidas em comentários de avaliações.
--
-- Um nível de resposta: parent_id aponta para o comentário de cima (sempre um
-- comentário de primeiro nível); responder a uma resposta fica no mesmo nível e
-- guarda em reply_to_user_id a quem se respondeu ("Respondendo a @fulano").
-- Comentário com respostas, quando apagado, vira "Comentário apagado" (deleted_at)
-- e as respostas ficam. Só acrescenta: nada existente é removido.

ALTER TABLE public.review_comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.review_comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reply_to_user_id uuid REFERENCES neon_auth."user"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS review_comments_parent_idx
  ON public.review_comments (parent_id, created_at) WHERE parent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.review_comment_likes (
  comment_id uuid NOT NULL REFERENCES public.review_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS review_comment_likes_user_idx ON public.review_comment_likes (user_id);

ALTER TABLE public.review_comment_likes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'new_season',
    'new_episode',
    'follow_request',
    'new_follower',
    'follow_accepted',
    'new_friend',
    'review_like',
    'review_comment',
    'recommendation_received',
    'recommendation_result',
    'review_comment_reply',
    'review_comment_like'
  ));
