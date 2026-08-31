-- Bounded public IP profile projection; draft identity and operator fields stay private.
CREATE FUNCTION public.social_public_ip_profile(target_profile_id uuid)
RETURNS TABLE(
  id uuid,username text,display_name text,bio text,languages text[],
  visual_type public.creator_visual_type,
  creator_id uuid,creator_username text,creator_display_name text,
  follower_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT profile.id,profile.username,identity.display_name,identity.bio,identity.languages,
    CASE WHEN ip.source='creator' THEN creator_revision.visual_type ELSE ip.visual_type END,
    creator.id,creator.username,creator.display_name,
    (SELECT count(*) FROM public.follows f WHERE f.followed_profile_id=profile.id)
  FROM public.profiles profile
  JOIN public.ip_profiles ip ON ip.profile_id=profile.id
  JOIN public.ip_identity_revisions identity
    ON identity.id=ip.current_identity_revision_id AND identity.ip_profile_id=ip.profile_id
  LEFT JOIN public.creator_revisions creator_revision
    ON creator_revision.id=ip.active_creator_revision_id AND ip.source='creator'
  LEFT JOIN public.profiles creator
    ON creator.id=ip.creator_profile_id AND creator.account_kind='human'
  WHERE profile.id=target_profile_id AND profile.account_kind='ip'
    AND ip.public_state='published'
    AND (ip.source<>'creator' OR creator_revision.id IS NOT NULL)
$$;
REVOKE ALL ON FUNCTION public.social_public_ip_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_public_ip_profile(uuid) TO aifans_anon,aifans_authenticated;
