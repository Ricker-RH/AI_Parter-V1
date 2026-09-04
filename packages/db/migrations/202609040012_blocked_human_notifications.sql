-- Filter blocked actors before pagination while retaining historical records.
CREATE OR REPLACE FUNCTION public.social_my_notifications(after_id uuid, page_limit integer)
RETURNS TABLE(
  id uuid,kind public.notification_kind,post_id uuid,comment_id uuid,created_at timestamptz,read_at timestamptz,
  actor_id uuid,actor_kind public.account_kind,username text,display_name text,bio text,languages text[],
  visual_type public.creator_visual_type,creator_id uuid,creator_username text,creator_display_name text,avatar_object_key text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH me AS (SELECT public.social_current_human_profile_id() AS id),
  anchor AS (SELECT n.created_at,n.id FROM public.notifications n,me WHERE n.id=after_id AND n.recipient_profile_id=me.id)
  SELECT n.id,n.kind,n.post_id,n.comment_id,n.created_at,n.read_at,
    CASE WHEN actor.account_kind='human' OR identity.id IS NOT NULL THEN actor.id END,
    CASE WHEN actor.account_kind='human' OR identity.id IS NOT NULL THEN actor.account_kind END,
    CASE WHEN actor.account_kind='human' OR identity.id IS NOT NULL THEN actor.username END,
    CASE WHEN actor.account_kind='ip' THEN identity.display_name ELSE actor.display_name END,
    CASE WHEN actor.account_kind='ip' THEN identity.bio END,
    CASE WHEN actor.account_kind='ip' THEN identity.languages ELSE ARRAY[]::text[] END,
    CASE WHEN actor.account_kind='ip' THEN CASE WHEN ip.source='creator' THEN creator_revision.visual_type ELSE ip.visual_type END END,
    creator.id,creator.username,creator.display_name,
    CASE WHEN actor.account_kind='human' THEN actor.avatar_object_key END
  FROM public.notifications n
  JOIN me ON n.recipient_profile_id=me.id
  LEFT JOIN public.profiles actor ON actor.id=n.actor_profile_id
  LEFT JOIN public.ip_profiles ip ON ip.profile_id=actor.id AND ip.public_state='published'
  LEFT JOIN public.ip_identity_revisions identity ON identity.id=ip.current_identity_revision_id AND identity.ip_profile_id=ip.profile_id
  LEFT JOIN public.creator_revisions creator_revision ON creator_revision.id=ip.active_creator_revision_id AND ip.source='creator'
  LEFT JOIN public.profiles creator ON creator.id=ip.creator_profile_id AND creator.account_kind='human'
  WHERE (after_id IS NULL OR (n.created_at,n.id)<(SELECT anchor.created_at,anchor.id FROM anchor))
    AND NOT EXISTS(SELECT 1 FROM public.human_blocks b WHERE
      (b.blocker_profile_id=me.id AND b.blocked_profile_id=n.actor_profile_id) OR
      (b.blocker_profile_id=n.actor_profile_id AND b.blocked_profile_id=me.id))
  ORDER BY n.created_at DESC,n.id DESC
  LIMIT LEAST(GREATEST(page_limit,1),51)
$$;
REVOKE ALL ON FUNCTION public.social_my_notifications(uuid,integer) FROM PUBLIC,aifans_anon;
GRANT EXECUTE ON FUNCTION public.social_my_notifications(uuid,integer) TO aifans_authenticated;
