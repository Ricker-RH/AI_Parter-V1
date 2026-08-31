CREATE FUNCTION public.social_viewer_follows(target_profile_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.follows f WHERE f.follower_profile_id=public.social_current_human_profile_id() AND f.followed_profile_id=target_profile_id)
$$;
REVOKE ALL ON FUNCTION public.social_viewer_follows(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_viewer_follows(uuid) TO aifans_authenticated;
