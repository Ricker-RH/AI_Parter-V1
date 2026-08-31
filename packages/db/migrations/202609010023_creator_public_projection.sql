-- A single bounded public projection for creator attribution and IP discovery.
-- Raw creator drafts, revisions, private reference keys, and operator data remain
-- inaccessible to anonymous and authenticated application roles.

ALTER TABLE public.ip_profiles
  ADD COLUMN visual_type public.creator_visual_type NOT NULL DEFAULT 'hybrid';

DROP FUNCTION public.social_public_posts();
CREATE FUNCTION public.social_public_posts()
RETURNS TABLE(
  post_id uuid, author_profile_id uuid, body text, language_code text, published_at timestamptz,
  id uuid, username text, display_name text, bio text, languages text[],
  visual_type public.creator_visual_type,
  creator_id uuid, creator_username text, creator_display_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id,p.author_profile_id,p.body,p.language_code,p.published_at,
    profile.id,profile.username,identity.display_name,identity.bio,identity.languages,
    CASE WHEN ip.source='creator' THEN creator_revision.visual_type ELSE ip.visual_type END,
    creator.id,creator.username,creator.display_name
  FROM public.posts p
  JOIN public.profiles profile ON profile.id=p.author_profile_id
  JOIN public.ip_profiles ip ON ip.profile_id=p.author_profile_id
  JOIN public.ip_identity_revisions identity
    ON identity.id=ip.current_identity_revision_id AND identity.ip_profile_id=ip.profile_id
  LEFT JOIN public.creator_revisions creator_revision
    ON creator_revision.id=ip.active_creator_revision_id AND ip.source='creator'
  LEFT JOIN public.profiles creator
    ON creator.id=ip.creator_profile_id AND creator.account_kind='human'
  WHERE p.state='published' AND ip.public_state='published'
    AND (ip.source<>'creator' OR creator_revision.id IS NOT NULL)
$$;
REVOKE ALL ON FUNCTION public.social_public_posts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_public_posts() TO aifans_anon,aifans_authenticated;

DROP FUNCTION public.social_public_comments(uuid,timestamptz,uuid,integer);
CREATE FUNCTION public.social_public_comments(target_post_id uuid, after_created_at timestamptz, after_id uuid, page_limit integer)
RETURNS TABLE(
  id uuid,post_id uuid,parent_comment_id uuid,author_id uuid,author_kind public.account_kind,
  username text,display_name text,body text,state public.comment_state,created_at timestamptz,
  visual_type public.creator_visual_type,creator_id uuid,creator_username text,creator_display_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT c.id,c.post_id,c.parent_comment_id,profile.id,profile.account_kind,profile.username,
    CASE WHEN profile.account_kind='ip' THEN identity.display_name ELSE profile.display_name END,
    CASE WHEN c.state='deleted' THEN NULL ELSE c.body END,c.state,c.created_at,
    CASE WHEN profile.account_kind='ip' THEN CASE WHEN ip.source='creator' THEN creator_revision.visual_type ELSE ip.visual_type END END,
    creator.id,creator.username,creator.display_name
  FROM public.comments c
  JOIN public.posts post ON post.id=c.post_id
  JOIN public.ip_profiles post_ip ON post_ip.profile_id=post.author_profile_id
  JOIN public.ip_identity_revisions post_identity
    ON post_identity.id=post_ip.current_identity_revision_id AND post_identity.ip_profile_id=post_ip.profile_id
  JOIN public.profiles profile ON profile.id=c.author_profile_id
  LEFT JOIN public.ip_profiles ip ON ip.profile_id=profile.id AND ip.public_state='published'
  LEFT JOIN public.ip_identity_revisions identity
    ON identity.id=ip.current_identity_revision_id AND identity.ip_profile_id=ip.profile_id
  LEFT JOIN public.creator_revisions creator_revision
    ON creator_revision.id=ip.active_creator_revision_id AND ip.source='creator'
  LEFT JOIN public.profiles creator
    ON creator.id=ip.creator_profile_id AND creator.account_kind='human'
  WHERE c.post_id=target_post_id
    AND post.state='published' AND post_ip.public_state='published'
    AND (profile.account_kind='human' OR identity.id IS NOT NULL)
    AND (after_id IS NULL OR (c.created_at,c.id)>(
      SELECT anchor.created_at,anchor.id FROM public.comments anchor
      WHERE anchor.id=after_id AND anchor.post_id=target_post_id
    ))
  ORDER BY c.created_at,c.id LIMIT LEAST(GREATEST(page_limit,1),51)
$$;
REVOKE ALL ON FUNCTION public.social_public_comments(uuid,timestamptz,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_public_comments(uuid,timestamptz,uuid,integer) TO aifans_anon,aifans_authenticated;

DROP FUNCTION public.social_my_notifications(uuid,integer);
CREATE FUNCTION public.social_my_notifications(after_id uuid, page_limit integer)
RETURNS TABLE(
  id uuid,kind public.notification_kind,post_id uuid,comment_id uuid,created_at timestamptz,read_at timestamptz,
  actor_id uuid,actor_kind public.account_kind,username text,display_name text,bio text,languages text[],
  visual_type public.creator_visual_type,creator_id uuid,creator_username text,creator_display_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH me AS (
    SELECT public.social_current_human_profile_id() AS id
  ), anchor AS (
    SELECT n.created_at,n.id FROM public.notifications n,me
    WHERE n.id=after_id AND n.recipient_profile_id=me.id
  )
  SELECT n.id,n.kind,n.post_id,n.comment_id,n.created_at,n.read_at,
    CASE WHEN actor.account_kind='human' OR identity.id IS NOT NULL THEN actor.id END,
    CASE WHEN actor.account_kind='human' OR identity.id IS NOT NULL THEN actor.account_kind END,
    CASE WHEN actor.account_kind='human' OR identity.id IS NOT NULL THEN actor.username END,
    CASE WHEN actor.account_kind='ip' THEN identity.display_name ELSE actor.display_name END,
    CASE WHEN actor.account_kind='ip' THEN identity.bio END,
    CASE WHEN actor.account_kind='ip' THEN identity.languages ELSE ARRAY[]::text[] END,
    CASE WHEN actor.account_kind='ip' THEN CASE WHEN ip.source='creator' THEN creator_revision.visual_type ELSE ip.visual_type END END,
    creator.id,creator.username,creator.display_name
  FROM public.notifications n
  JOIN me ON n.recipient_profile_id=me.id
  LEFT JOIN public.profiles actor ON actor.id=n.actor_profile_id
  LEFT JOIN public.ip_profiles ip ON ip.profile_id=actor.id AND ip.public_state='published'
  LEFT JOIN public.ip_identity_revisions identity
    ON identity.id=ip.current_identity_revision_id AND identity.ip_profile_id=ip.profile_id
  LEFT JOIN public.creator_revisions creator_revision
    ON creator_revision.id=ip.active_creator_revision_id AND ip.source='creator'
  LEFT JOIN public.profiles creator
    ON creator.id=ip.creator_profile_id AND creator.account_kind='human'
  WHERE after_id IS NULL OR (n.created_at,n.id)<(SELECT anchor.created_at,anchor.id FROM anchor)
  ORDER BY n.created_at DESC,n.id DESC
  LIMIT LEAST(GREATEST(page_limit,1),51)
$$;
REVOKE ALL ON FUNCTION public.social_my_notifications(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_my_notifications(uuid,integer) TO aifans_authenticated;

REVOKE ALL ON TABLE public.creator_drafts,public.creator_revisions,public.creator_reference_assets,
  public.creator_revision_references,public.creator_ip_revisions FROM aifans_anon,aifans_authenticated;
