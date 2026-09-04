-- Read HUMAN avatars from current profiles so historical activity stays synchronized.
-- Preserve visibility, tombstone, ordering and grant behavior from existing projections.
DROP FUNCTION IF EXISTS public.social_public_comment_context(uuid,uuid);
DROP FUNCTION public.social_public_comment_threads(uuid,timestamptz,uuid,integer);

CREATE FUNCTION public.social_public_comment_threads(target_post_id uuid,after_root_created_at timestamptz,after_root_id uuid,root_limit integer)
RETURNS TABLE(
 id uuid,post_id uuid,root_comment_id uuid,parent_comment_id uuid,author_id uuid,author_kind public.account_kind,
 username text,display_name text,body text,state public.comment_state,created_at timestamptz,
 like_count integer,reply_count integer,bookmark_count integer,share_count integer,
 viewer_has_liked boolean,viewer_has_bookmarked boolean,root_created_at text,root_ordinal integer,avatar_object_key text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH selected_roots AS MATERIALIZED (
   SELECT root.id,root.created_at,row_number() OVER(ORDER BY root.created_at DESC,root.id DESC)::integer AS ordinal
   FROM public.comments root
   JOIN public.posts post ON post.id=root.post_id AND post.state='published'
   JOIN public.ip_profiles post_ip ON post_ip.profile_id=post.author_profile_id AND post_ip.public_state='published'
   JOIN public.ip_identity_revisions post_revision ON post_revision.id=post_ip.current_identity_revision_id AND post_revision.ip_profile_id=post_ip.profile_id
   WHERE root.post_id=target_post_id AND root.parent_comment_id IS NULL AND public.social_comment_author_is_public(post.author_profile_id)
     AND (public.social_comment_is_public(root.id) OR EXISTS(SELECT 1 FROM public.comments child WHERE child.root_comment_id=root.id AND child.id<>root.id AND public.social_comment_is_public(child.id)))
     AND (after_root_id IS NULL OR (root.created_at,root.id)<(after_root_created_at,after_root_id))
   ORDER BY root.created_at DESC,root.id DESC LIMIT LEAST(GREATEST(COALESCE(root_limit,1),1),51)
 )
 SELECT c.id,c.post_id,c.root_comment_id,c.parent_comment_id,
   CASE WHEN NOT public.social_comment_is_public(c.id) THEN NULL ELSE p.id END,
   CASE WHEN NOT public.social_comment_is_public(c.id) THEN NULL ELSE p.account_kind END,
   CASE WHEN NOT public.social_comment_is_public(c.id) THEN NULL ELSE p.username END,
   CASE WHEN NOT public.social_comment_is_public(c.id) THEN NULL ELSE COALESCE(ir.display_name,p.display_name) END,
   CASE WHEN public.social_comment_is_public(c.id) THEN c.body ELSE NULL END,
   CASE WHEN public.social_comment_is_public(c.id) THEN c.state ELSE 'deleted'::public.comment_state END,c.created_at,
   CASE WHEN public.social_comment_is_public(c.id) THEN (SELECT count(*) FROM public.comment_likes l WHERE l.comment_id=c.id)::integer ELSE 0 END,
   CASE WHEN public.social_comment_is_public(c.id) THEN (SELECT count(*) FROM public.comments r WHERE r.parent_comment_id=c.id AND public.social_comment_is_public(r.id))::integer ELSE 0 END,
   CASE WHEN public.social_comment_is_public(c.id) THEN (SELECT count(*) FROM public.comment_bookmarks b WHERE b.comment_id=c.id)::integer ELSE 0 END,
   CASE WHEN public.social_comment_is_public(c.id) THEN (SELECT count(*) FROM public.comment_share_events s WHERE s.comment_id=c.id)::integer ELSE 0 END,
   CASE WHEN public.social_comment_is_public(c.id) AND public.social_current_human_profile_id() IS NOT NULL THEN EXISTS(SELECT 1 FROM public.comment_likes l WHERE l.comment_id=c.id AND l.profile_id=public.social_current_human_profile_id()) ELSE false END,
   CASE WHEN public.social_comment_is_public(c.id) AND public.social_current_human_profile_id() IS NOT NULL THEN EXISTS(SELECT 1 FROM public.comment_bookmarks b WHERE b.comment_id=c.id AND b.profile_id=public.social_current_human_profile_id()) ELSE false END,
   to_char(roots.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),roots.ordinal,
   CASE WHEN public.social_comment_is_public(c.id) AND p.account_kind='human' THEN p.avatar_object_key END
 FROM selected_roots roots JOIN public.comments c ON c.root_comment_id=roots.id
 JOIN public.profiles p ON p.id=c.author_profile_id
 LEFT JOIN public.ip_profiles ip ON ip.profile_id=p.id AND ip.public_state='published'
 LEFT JOIN public.ip_identity_revisions ir ON ir.id=ip.current_identity_revision_id
 WHERE public.social_comment_is_public(c.id) OR (c.id=roots.id AND EXISTS(SELECT 1 FROM public.comments child WHERE child.root_comment_id=roots.id AND child.id<>roots.id AND public.social_comment_is_public(child.id)))
 ORDER BY roots.created_at DESC,roots.id DESC,CASE WHEN c.id=roots.id THEN 0 ELSE 1 END,c.created_at,c.id
$$;

CREATE FUNCTION public.social_public_comment_context(target_post_id uuid,target_comment_id uuid)
RETURNS TABLE(
 id uuid,post_id uuid,root_comment_id uuid,parent_comment_id uuid,author_id uuid,author_kind public.account_kind,
 username text,display_name text,body text,state public.comment_state,created_at timestamptz,
 like_count integer,reply_count integer,bookmark_count integer,share_count integer,
 viewer_has_liked boolean,viewer_has_bookmarked boolean,root_created_at text,root_ordinal integer,avatar_object_key text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH target AS MATERIALIZED (
   SELECT comment.root_comment_id
   FROM public.comments comment
   WHERE comment.id=target_comment_id AND comment.post_id=target_post_id AND public.social_comment_is_public(comment.id)
 ), predecessor AS MATERIALIZED (
   SELECT root.created_at,root.id
   FROM public.comments root
   WHERE root.post_id=target_post_id AND root.parent_comment_id IS NULL
     AND (public.social_comment_is_public(root.id) OR EXISTS(SELECT 1 FROM public.comments child WHERE child.root_comment_id=root.id AND child.id<>root.id AND public.social_comment_is_public(child.id)))
     AND (root.created_at,root.id)>(SELECT selected.created_at,selected.id FROM public.comments selected JOIN target ON target.root_comment_id=selected.id)
   ORDER BY root.created_at,root.id LIMIT 1
 )
 SELECT thread.* FROM target
 CROSS JOIN LATERAL public.social_public_comment_threads(target_post_id,(SELECT created_at FROM predecessor),(SELECT id FROM predecessor),1) thread
 WHERE thread.root_comment_id=target.root_comment_id
$$;

REVOKE ALL ON FUNCTION public.social_public_comment_threads(uuid,timestamptz,uuid,integer),public.social_public_comment_context(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_public_comment_threads(uuid,timestamptz,uuid,integer),public.social_public_comment_context(uuid,uuid) TO aifans_anon,aifans_authenticated;

DROP FUNCTION public.social_my_notifications(uuid,integer);
CREATE FUNCTION public.social_my_notifications(after_id uuid, page_limit integer)
RETURNS TABLE(
  id uuid,kind public.notification_kind,post_id uuid,comment_id uuid,created_at timestamptz,read_at timestamptz,
  actor_id uuid,actor_kind public.account_kind,username text,display_name text,bio text,languages text[],
  visual_type public.creator_visual_type,creator_id uuid,creator_username text,creator_display_name text,avatar_object_key text
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
    creator.id,creator.username,creator.display_name,
    CASE WHEN actor.account_kind='human' THEN actor.avatar_object_key END
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
