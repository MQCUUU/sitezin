-- Separates what a user shares with friends while keeping current privacy choices.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ratings_visibility text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reviews_visibility text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS watched_titles_visibility text;

UPDATE public.profiles
SET ratings_visibility = COALESCE(ratings_visibility, activity_visibility, 'profile'),
    reviews_visibility = COALESCE(reviews_visibility, activity_visibility, 'profile'),
    watched_titles_visibility = COALESCE(watched_titles_visibility, activity_visibility, 'profile')
WHERE ratings_visibility IS NULL OR reviews_visibility IS NULL OR watched_titles_visibility IS NULL;

ALTER TABLE public.profiles ALTER COLUMN ratings_visibility SET DEFAULT 'profile';
ALTER TABLE public.profiles ALTER COLUMN ratings_visibility SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN reviews_visibility SET DEFAULT 'profile';
ALTER TABLE public.profiles ALTER COLUMN reviews_visibility SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN watched_titles_visibility SET DEFAULT 'profile';
ALTER TABLE public.profiles ALTER COLUMN watched_titles_visibility SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_ratings_visibility_check
    CHECK (ratings_visibility IN ('profile', 'followers', 'private'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_reviews_visibility_check
    CHECK (reviews_visibility IN ('profile', 'followers', 'private'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_watched_titles_visibility_check
    CHECK (watched_titles_visibility IN ('profile', 'followers', 'private'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Reverse accepted-follow lookup for mutual-friend and common-friend queries.
CREATE INDEX IF NOT EXISTS follows_accepted_reverse_idx
  ON public.follows (following_id, follower_id)
  WHERE status = 'accepted';

CREATE INDEX IF NOT EXISTS library_items_rated_user_media_idx
  ON public.library_items (user_id, media_id)
  WHERE personal_rating IS NOT NULL;
