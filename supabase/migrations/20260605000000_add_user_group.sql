ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS user_group TEXT NOT NULL DEFAULT 'champion'
  CHECK (user_group IN ('champion', 'partner'));

COMMENT ON COLUMN public.users.user_group IS
  'champion = 과제 추적 대상 | partner = 과제 불필요. admin 여부는 auth.users.user_metadata.is_admin 에서 파생.';
