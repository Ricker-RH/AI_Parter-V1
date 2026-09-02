-- Owner-scoped followed-IP projection. Materializing the viewer's relationship
-- set prevents this query from driving over every public IP profile.
CREATE FUNCTION public.social_followed_ip_profiles(
  after_profile_created_at timestamptz,
  after_profile_id uuid,
  page_limit integer
)
RETURNS TABLE(
  id uuid,username text,display_name text,bio text,languages text[],
  visual_type public.creator_visual_type,
  creator_id uuid,creator_username text,creator_display_name text,
  follower_count bigint,profile_created_at text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH owned_follows AS MATERIALIZED (
    SELECT follow.followed_profile_id
    FROM public.follows follow
    WHERE follow.follower_profile_id=public.social_current_human_profile_id()
  )
  SELECT profile.id,profile.username,profile.display_name,profile.bio,profile.languages,
    profile.visual_type,profile.creator_id,profile.creator_username,profile.creator_display_name,
    profile.follower_count,
    to_char(followed.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  FROM owned_follows owned
  JOIN public.ip_profiles followed ON followed.profile_id=owned.followed_profile_id
  CROSS JOIN LATERAL public.social_public_ip_profile(owned.followed_profile_id) profile
  WHERE after_profile_id IS NULL
    OR (followed.created_at,followed.profile_id)<(after_profile_created_at,after_profile_id)
  ORDER BY followed.created_at DESC,followed.profile_id DESC
  LIMIT LEAST(GREATEST(COALESCE(page_limit,1),1),51)
$$;

REVOKE ALL ON FUNCTION public.social_followed_ip_profiles(timestamptz,uuid,integer)
  FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;
GRANT EXECUTE ON FUNCTION public.social_followed_ip_profiles(timestamptz,uuid,integer)
  TO aifans_authenticated;
