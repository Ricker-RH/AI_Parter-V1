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
  WITH visible_candidates AS MATERIALIZED (
    SELECT followed.profile_id,followed.created_at
    FROM public.follows follow
    JOIN public.profiles profile ON profile.id=follow.followed_profile_id
      AND profile.account_kind='ip'
    JOIN public.ip_profiles followed ON followed.profile_id=profile.id
      AND followed.public_state='published'
    JOIN public.ip_identity_revisions identity
      ON identity.id=followed.current_identity_revision_id
      AND identity.ip_profile_id=followed.profile_id
    LEFT JOIN public.creator_revisions creator_revision
      ON creator_revision.id=followed.active_creator_revision_id
      AND followed.source='creator'
    WHERE follow.follower_profile_id=public.social_current_human_profile_id()
      AND (followed.source<>'creator' OR creator_revision.id IS NOT NULL)
      AND (after_profile_id IS NULL
        OR (followed.created_at,followed.profile_id)<(after_profile_created_at,after_profile_id))
    ORDER BY followed.created_at DESC,followed.profile_id DESC
    LIMIT LEAST(GREATEST(COALESCE(page_limit,1),1),51)
  )
  SELECT profile.id,profile.username,profile.display_name,profile.bio,profile.languages,
    profile.visual_type,profile.creator_id,profile.creator_username,profile.creator_display_name,
    profile.follower_count,
    to_char(candidate.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  FROM visible_candidates candidate
  CROSS JOIN LATERAL public.social_public_ip_profile(candidate.profile_id) profile
  ORDER BY candidate.created_at DESC,candidate.profile_id DESC
$$;

REVOKE ALL ON FUNCTION public.social_followed_ip_profiles(timestamptz,uuid,integer)
  FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;
GRANT EXECUTE ON FUNCTION public.social_followed_ip_profiles(timestamptz,uuid,integer)
  TO aifans_authenticated;
