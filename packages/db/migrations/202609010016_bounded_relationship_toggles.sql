-- Complete the bounded relationship command surface. Hidden and missing targets
-- deliberately share P0002 so callers cannot distinguish publication state.
CREATE FUNCTION public.unfollow_profile(target_profile_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; did_delete boolean := false;
BEGIN
  actor_id := public.social_current_human_profile_id();
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ip_profiles ip
    JOIN public.ip_identity_revisions revision
      ON revision.id = ip.current_identity_revision_id AND revision.ip_profile_id = ip.profile_id
    WHERE ip.profile_id = target_profile_id AND ip.public_state = 'published'
  ) THEN RAISE EXCEPTION 'public IP not found' USING ERRCODE = 'P0002'; END IF;
  DELETE FROM public.follows
  WHERE follower_profile_id = actor_id AND followed_profile_id = target_profile_id
  RETURNING true INTO did_delete;
  RETURN COALESCE(did_delete, false);
END $$;

CREATE FUNCTION public.unlike_post(target_post_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; did_delete boolean := false;
BEGIN
  actor_id := public.social_current_human_profile_id();
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_published_post(target_post_id) THEN
    RAISE EXCEPTION 'published post not found' USING ERRCODE = 'P0002';
  END IF;
  DELETE FROM public.post_likes
  WHERE profile_id = actor_id AND post_id = target_post_id
  RETURNING true INTO did_delete;
  RETURN COALESCE(did_delete, false);
END $$;

CREATE FUNCTION public.bookmark_post(target_post_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; did_create boolean := false;
BEGIN
  actor_id := public.social_current_human_profile_id();
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_published_post(target_post_id) THEN
    RAISE EXCEPTION 'published post not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.bookmarks(post_id, profile_id)
  VALUES(target_post_id, actor_id) ON CONFLICT DO NOTHING RETURNING true INTO did_create;
  RETURN COALESCE(did_create, false);
END $$;

CREATE FUNCTION public.unbookmark_post(target_post_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; did_delete boolean := false;
BEGIN
  actor_id := public.social_current_human_profile_id();
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_published_post(target_post_id) THEN
    RAISE EXCEPTION 'published post not found' USING ERRCODE = 'P0002';
  END IF;
  DELETE FROM public.bookmarks
  WHERE profile_id = actor_id AND post_id = target_post_id
  RETURNING true INTO did_delete;
  RETURN COALESCE(did_delete, false);
END $$;

REVOKE ALL ON FUNCTION public.unfollow_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unlike_post(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bookmark_post(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unbookmark_post(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unfollow_profile(uuid), public.unlike_post(uuid), public.bookmark_post(uuid), public.unbookmark_post(uuid) TO aifans_authenticated;

REVOKE INSERT, DELETE ON public.follows FROM aifans_authenticated;
REVOKE INSERT, DELETE ON public.post_likes FROM aifans_authenticated;
REVOKE INSERT, DELETE ON public.bookmarks FROM aifans_authenticated;
