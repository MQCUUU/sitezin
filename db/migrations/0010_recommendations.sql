-- 0010 — Indicações para amigos.
--
-- Uma indicação é um título que alguém manda para um amigo, com bilhete opcional.
-- O estado de quem recebe não fica guardado: sai do library_items dela para o
-- mesmo media_id. Excluir a conta apaga as indicações enviadas e recebidas.
-- recommendation_site e os tipos de aviso já entraram na 0009.

CREATE TABLE IF NOT EXISTS public.recommendations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  media_id integer NOT NULL REFERENCES public.media(id),
  note text CHECK (note IS NULL OR char_length(note) <= 140),
  dismissed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE (sender_id, recipient_id, media_id),
  CHECK (sender_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS recommendations_recipient_created_idx ON public.recommendations (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS recommendations_sender_created_idx ON public.recommendations (sender_id, created_at DESC);

ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notification_preferences ADD COLUMN IF NOT EXISTS recommendation_site boolean DEFAULT true NOT NULL;
