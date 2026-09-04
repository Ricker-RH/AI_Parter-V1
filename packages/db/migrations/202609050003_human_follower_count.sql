-- Keep the follower aggregate behind a definer function so public profile reads
-- do not need direct access to the RLS-protected follows table.
CREATE FUNCTION public.human_follower_count(target_profile_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT count(*)::bigint FROM public.follows WHERE followed_profile_id=target_profile_id
$$;
REVOKE ALL ON FUNCTION public.human_follower_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.human_follower_count(uuid) TO aifans_anon,aifans_authenticated;
