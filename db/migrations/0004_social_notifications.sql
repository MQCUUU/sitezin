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
    'new_friend'
  ));
