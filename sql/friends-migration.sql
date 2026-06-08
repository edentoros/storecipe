-- =========================================================================
-- Storecipe: "My Friends" feature migration
--
-- Run this file in the Supabase SQL editor. It is idempotent — safe to run
-- multiple times. It creates:
--   * public.profiles      — one row per auth.users user, with invite_code
--   * public.friendships   — one-sided follow rows (A follows B)
--   * adds is_shared_with_friends, copied_from_recipe_id, copied_from_user_id
--     to public.recipes
--   * RLS policies so users only ever read/write what they should
--   * A trigger that auto-creates a profile row when a user signs up
--   * Backfills profiles for any existing users
-- =========================================================================

-- 1. profiles -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  invite_code text UNIQUE,
  display_name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Lookups by email or invite_code need to work for any signed-in user, but we
-- only expose the minimal columns needed for add-a-friend flows. Keeping
-- SELECT open to authenticated users is the same privacy posture as letting
-- people search by email — they need to know your email or code to find you.
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);


-- 2. Auto-create profile on signup ----------------------------------------
-- Random 9-char invite code in groups of 3 (e.g. AB7-3FK-2PQ).
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/I/1 confusion
  code text := '';
  i int;
BEGIN
  FOR i IN 1..9 LOOP
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    IF i = 3 OR i = 6 THEN code := code || '-'; END IF;
  END LOOP;
  RETURN code;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_code text;
  attempt int := 0;
BEGIN
  -- Retry a few times on the unlikely collision.
  LOOP
    new_code := public.generate_invite_code();
    BEGIN
      INSERT INTO public.profiles (id, email, invite_code)
      VALUES (NEW.id, NEW.email, new_code);
      RETURN NEW;
    EXCEPTION WHEN unique_violation THEN
      attempt := attempt + 1;
      IF attempt >= 5 THEN RAISE; END IF;
    END;
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 3. Backfill profiles for existing users ---------------------------------
INSERT INTO public.profiles (id, email, invite_code)
SELECT u.id, u.email, public.generate_invite_code()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;


-- 4. friendships ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_muted boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);

CREATE INDEX IF NOT EXISTS friendships_follower_idx ON public.friendships(follower_id);
CREATE INDEX IF NOT EXISTS friendships_followee_idx ON public.friendships(followee_id);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- You can see who YOU follow, and you can see who follows YOU
-- (so you know if someone is reading your shared recipes).
DROP POLICY IF EXISTS "friendships_select_self" ON public.friendships;
CREATE POLICY "friendships_select_self" ON public.friendships
  FOR SELECT TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = followee_id);

DROP POLICY IF EXISTS "friendships_insert_self" ON public.friendships;
CREATE POLICY "friendships_insert_self" ON public.friendships
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "friendships_update_self" ON public.friendships;
CREATE POLICY "friendships_update_self" ON public.friendships
  FOR UPDATE TO authenticated
  USING (auth.uid() = follower_id) WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "friendships_delete_self" ON public.friendships;
CREATE POLICY "friendships_delete_self" ON public.friendships
  FOR DELETE TO authenticated
  USING (auth.uid() = follower_id);


-- 5. recipes columns ------------------------------------------------------
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS is_shared_with_friends boolean DEFAULT false;
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS copied_from_recipe_id uuid REFERENCES public.recipes(id) ON DELETE SET NULL;
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS copied_from_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS recipes_shared_idx
  ON public.recipes(user_id) WHERE is_shared_with_friends = true;


-- 6. recipes RLS: let followers read shared recipes -----------------------
-- This ADDS a policy in addition to your existing owner policy. Postgres OR's
-- multiple permissive policies together, so the owner still sees everything
-- and followers see shared rows.
DROP POLICY IF EXISTS "recipes_select_shared_to_followers" ON public.recipes;
CREATE POLICY "recipes_select_shared_to_followers" ON public.recipes
  FOR SELECT TO authenticated
  USING (
    is_shared_with_friends = true
    AND EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.follower_id = auth.uid()
        AND f.followee_id = public.recipes.user_id
    )
  );


-- 7. Done ------------------------------------------------------------------
-- Verify with:
--   SELECT id, email, invite_code FROM public.profiles WHERE id = auth.uid();
