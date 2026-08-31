-- Safe viewer-only projection: relationship rows remain private under RLS.
CREATE FUNCTION public.social_viewer_flags(target_post_id uuid, target_author_id uuid)
RETURNS TABLE(viewer_has_liked boolean, viewer_has_bookmarked boolean, viewer_follows_author boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.post_likes l WHERE l.post_id = target_post_id AND l.profile_id = public.social_current_human_profile_id()),
    EXISTS (SELECT 1 FROM public.bookmarks b WHERE b.post_id = target_post_id AND b.profile_id = public.social_current_human_profile_id()),
    EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_profile_id = public.social_current_human_profile_id() AND f.followed_profile_id = target_author_id)
$$;
REVOKE ALL ON FUNCTION public.social_viewer_flags(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_viewer_flags(uuid,uuid) TO aifans_anon, aifans_authenticated;
