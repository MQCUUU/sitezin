-- 0009 — Curtidas e comentários em avaliações.
--
-- Uma avaliação é um library_items com nota ou resenha; o id dela é library_items.id.
-- Remover o item da biblioteca apaga curtidas e comentários (cascata), coerente com
-- "remover apaga histórico". Excluir a conta apaga o que a pessoa curtiu e comentou.
-- Os tipos de aviso de indicação já entram no CHECK aqui para a 0010 não refazê-lo.

CREATE TABLE IF NOT EXISTS public.review_likes (
  library_item_id uuid NOT NULL REFERENCES public.library_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (library_item_id, user_id)
);

CREATE INDEX IF NOT EXISTS review_likes_user_idx ON public.review_likes (user_id);

ALTER TABLE public.review_likes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.review_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  library_item_id uuid NOT NULL REFERENCES public.library_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS review_comments_item_created_idx ON public.review_comments (library_item_id, created_at);
CREATE INDEX IF NOT EXISTS review_comments_user_idx ON public.review_comments (user_id);

ALTER TABLE public.review_comments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS review_comment_site boolean DEFAULT true NOT NULL;
ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS recommendation_site boolean DEFAULT true NOT NULL;

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
    'recommendation_result'
  ));
