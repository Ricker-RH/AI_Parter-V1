-- Resolve cursor anchors inside PostgreSQL so JavaScript's millisecond Date
-- precision cannot discard the database's microseconds.
CREATE FUNCTION public.social_public_post_anchor(target_post_id uuid, cursor_published_at timestamptz)
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.published_at
  FROM public.posts p
  JOIN public.ip_profiles ip ON ip.profile_id = p.author_profile_id
  JOIN public.ip_identity_revisions r
    ON r.id = ip.current_identity_revision_id AND r.ip_profile_id = ip.profile_id
  WHERE p.id = target_post_id
    AND p.state = 'published'
    AND ip.public_state = 'published'
    AND p.published_at >= cursor_published_at
    AND p.published_at < cursor_published_at + interval '1 millisecond'
$$;

CREATE FUNCTION public.social_my_notifications(after_id uuid, page_limit integer)
RETURNS TABLE(
  id uuid,
  kind public.notification_kind,
  post_id uuid,
  comment_id uuid,
  created_at timestamptz,
  read_at timestamptz,
  actor_id uuid,
  actor_kind public.account_kind,
  username text,
  display_name text,
  bio text,
  languages text[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH me AS (
    SELECT public.social_current_human_profile_id() AS id
  ), anchor AS (
    SELECT n.created_at, n.id
    FROM public.notifications n, me
    WHERE n.id = after_id AND n.recipient_profile_id = me.id
  )
  SELECT n.id, n.kind, n.post_id, n.comment_id, n.created_at, n.read_at,
    CASE WHEN actor.account_kind = 'human' OR revision.id IS NOT NULL THEN actor.id END,
    CASE WHEN actor.account_kind = 'human' OR revision.id IS NOT NULL THEN actor.account_kind END,
    CASE WHEN actor.account_kind = 'human' OR revision.id IS NOT NULL THEN actor.username END,
    CASE WHEN actor.account_kind = 'ip' THEN revision.display_name ELSE actor.display_name END,
    CASE WHEN actor.account_kind = 'ip' THEN revision.bio ELSE NULL END,
    CASE WHEN actor.account_kind = 'ip' THEN revision.languages ELSE ARRAY[]::text[] END
  FROM public.notifications n
  JOIN me ON n.recipient_profile_id = me.id
  LEFT JOIN public.profiles actor ON actor.id = n.actor_profile_id
  LEFT JOIN public.ip_profiles ip
    ON ip.profile_id = actor.id AND ip.public_state = 'published'
  LEFT JOIN public.ip_identity_revisions revision
    ON revision.id = ip.current_identity_revision_id AND revision.ip_profile_id = ip.profile_id
  WHERE after_id IS NULL OR (n.created_at, n.id) < (SELECT anchor.created_at, anchor.id FROM anchor)
  ORDER BY n.created_at DESC, n.id DESC
  LIMIT LEAST(GREATEST(page_limit, 1), 51)
$$;

REVOKE ALL ON FUNCTION public.social_public_post_anchor(uuid,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.social_my_notifications(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_public_post_anchor(uuid,timestamptz) TO aifans_anon, aifans_authenticated;
GRANT EXECUTE ON FUNCTION public.social_my_notifications(uuid,integer) TO aifans_authenticated;
