CREATE TABLE public.post_share_events (
  id uuid PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.posts(id),
  actor_profile_id uuid REFERENCES public.profiles(id),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_share_events_post_id_idempotency_key_unique UNIQUE(post_id,idempotency_key)
);
CREATE INDEX post_share_events_post_created_idx ON public.post_share_events(post_id, created_at DESC);
REVOKE ALL ON TABLE public.post_share_events FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;

CREATE FUNCTION public.record_post_share(target_post_id uuid, command_idempotency_key uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor_id uuid;
  owner_id uuid;
  owner_source public.ip_source;
  current_revision_id uuid;
  active_creator_revision_id uuid;
  did_create boolean := false;
BEGIN
  actor_id := public.social_current_human_profile_id();
  IF actor_id IS NOT NULL THEN
    PERFORM 1
    FROM public.profiles actor
    WHERE actor.id=actor_id AND actor.account_kind='human'
    FOR KEY SHARE OF actor;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'authenticated human required' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT post.author_profile_id INTO owner_id
  FROM public.posts post
  WHERE post.id=target_post_id AND post.state='published'
  FOR SHARE;
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'published post not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT ip.source,ip.current_identity_revision_id,ip.active_creator_revision_id
  INTO owner_source,current_revision_id,active_creator_revision_id
  FROM public.ip_profiles ip
  WHERE ip.profile_id=owner_id AND ip.public_state='published'
  FOR SHARE;
  IF owner_source IS NULL OR current_revision_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.ip_identity_revisions identity
    WHERE identity.id=current_revision_id AND identity.ip_profile_id=owner_id
  ) OR (
    owner_source='creator' AND (
      active_creator_revision_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.creator_revisions creator_revision
        WHERE creator_revision.id=active_creator_revision_id
      )
    )
  ) THEN
    RAISE EXCEPTION 'published post not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.post_share_events(id,post_id,actor_profile_id,idempotency_key)
  VALUES(gen_random_uuid(),target_post_id,actor_id,command_idempotency_key)
  ON CONFLICT ON CONSTRAINT post_share_events_post_id_idempotency_key_unique DO NOTHING
  RETURNING true INTO did_create;
  RETURN COALESCE(did_create,false);
END $$;
REVOKE ALL ON FUNCTION public.record_post_share(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_post_share(uuid,uuid) TO aifans_anon,aifans_authenticated;

-- Keep every command that locks a post and IP profile on the same post -> IP
-- order. Preserve the platform command's signature, authorization, business
-- writes, return shape, and deterministic UUID ordering for its two IP rows.
CREATE OR REPLACE FUNCTION public.platform_publish_ip_comment(
  target_post_id uuid,
  represented_ip_profile_id uuid,
  requested_body text,
  requested_parent_comment_id uuid,
  request_id uuid
)
RETURNS TABLE(
  comment_id uuid, post_id uuid, parent_comment_id uuid, body text, created_at timestamptz,
  id uuid, username text, display_name text, bio text, languages text[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  operator_id uuid;
  target_author_profile_id uuid;
  target_post_state public.post_state;
  created_comment_id uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid();
  created_time timestamptz := clock_timestamp();
  parent_parent_id uuid;
BEGIN
  IF request_id IS NULL THEN RAISE EXCEPTION 'request id required' USING ERRCODE='23502'; END IF;
  SELECT p.id INTO operator_id
  FROM public.profiles p JOIN public.profile_roles pr ON pr.profile_id=p.id
  WHERE p.account_kind='human' AND p.auth_subject=app.current_auth_subject()
    AND pr.role='operator' AND pr.revoked_at IS NULL
  FOR UPDATE OF p, pr;
  IF operator_id IS NULL THEN RAISE EXCEPTION 'active human operator required' USING ERRCODE='42501'; END IF;

  -- Lock the post first for the global order, but retain the existing error
  -- precedence by validating the represented IP before rejecting saved state.
  SELECT target.author_profile_id,target.state
  INTO target_author_profile_id,target_post_state
  FROM public.posts target
  WHERE target.id=target_post_id
  FOR UPDATE OF target;
  IF target_author_profile_id IS NULL THEN
    RAISE EXCEPTION 'published post not found' USING ERRCODE='P0002';
  END IF;

  PERFORM 1
  FROM public.ip_profiles ip
  JOIN public.ip_identity_revisions r
    ON r.id=ip.current_identity_revision_id AND r.ip_profile_id=ip.profile_id
  WHERE ip.profile_id IN (target_author_profile_id, represented_ip_profile_id)
  ORDER BY ip.profile_id
  FOR UPDATE OF ip, r;

  IF NOT EXISTS (
    SELECT 1 FROM public.ip_profiles ip
    WHERE ip.profile_id=target_author_profile_id AND ip.public_state='published'
  ) THEN RAISE EXCEPTION 'published post not found' USING ERRCODE='P0002'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ip_profiles ip
    WHERE ip.profile_id=represented_ip_profile_id AND ip.public_state='published' AND ip.operation_enabled
  ) THEN RAISE EXCEPTION 'IP not publishable' USING ERRCODE='P0001'; END IF;
  IF target_post_state<>'published' THEN
    RAISE EXCEPTION 'published post not found' USING ERRCODE='P0002';
  END IF;

  IF requested_parent_comment_id IS NOT NULL THEN
    SELECT parent.parent_comment_id INTO parent_parent_id
    FROM public.comments parent
    WHERE parent.id=requested_parent_comment_id AND parent.post_id=target_post_id AND parent.state='published'
    FOR UPDATE OF parent;
    IF NOT FOUND OR parent_parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'invalid comment thread' USING ERRCODE='23514';
    END IF;
  END IF;

  INSERT INTO public.comments(id,post_id,parent_comment_id,author_profile_id,acting_operator_profile_id,source,body,state,created_at)
  VALUES(created_comment_id,target_post_id,requested_parent_comment_id,represented_ip_profile_id,operator_id,'admin',requested_body,'published',created_time);

  INSERT INTO public.audit_events(id,actor_type,actor_profile_id,action,entity_type,entity_id,request_id,source_app,result,change_summary)
  VALUES(gen_random_uuid(),'operator',operator_id,'ip_comment_published','comment',created_comment_id,request_id,'admin','succeeded',jsonb_build_object('source','admin','represented_ip_profile_id',represented_ip_profile_id));
  INSERT INTO public.workflow_transitions(id,entity_type,entity_id,previous_state,next_state,actor_profile_id,reason_code,request_id)
  VALUES(gen_random_uuid(),'comment',created_comment_id,NULL,'published',operator_id,'admin_publish',request_id);
  INSERT INTO public.business_events(id,event_name,schema_version,actor_profile_id,subject_entity_type,subject_entity_id,request_id,environment,properties)
  VALUES(event_id,'ip_comment_published',1,operator_id,'comment',created_comment_id,request_id,'admin',jsonb_build_object('event_id',event_id,'request_id',request_id,'ip_profile_id',represented_ip_profile_id,'post_id',target_post_id,'action_source','admin'));
  INSERT INTO public.analytics_outbox(id,business_event_id,destination,payload_version,payload)
  VALUES(gen_random_uuid(),event_id,'posthog',1,jsonb_build_object('event_id',event_id,'event_name','ip_comment_published','event_version',1,'request_id',request_id,'ip_profile_id',represented_ip_profile_id,'post_id',target_post_id,'action_source','admin'));

  RETURN QUERY
  SELECT c.id,c.post_id,c.parent_comment_id,c.body,c.created_at,profile.id,profile.username,r.display_name,r.bio,r.languages
  FROM public.comments c
  JOIN public.profiles profile ON profile.id=c.author_profile_id
  JOIN public.ip_profiles ip ON ip.profile_id=profile.id
  JOIN public.ip_identity_revisions r ON r.id=ip.current_identity_revision_id
  WHERE c.id=created_comment_id;
END
$$;
REVOKE ALL ON FUNCTION public.platform_publish_ip_comment(uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_publish_ip_comment(uuid,uuid,text,uuid,uuid) TO aifans_platform;

DROP FUNCTION public.social_public_search_posts(text,timestamptz,uuid,integer);
DROP FUNCTION public.social_post_metrics(uuid,uuid,text);
CREATE FUNCTION public.social_post_metrics(target_post_id uuid,target_author_id uuid,requested_locale text)
RETURNS TABLE(score numeric,like_count integer,comment_count integer,bookmark_count integer,share_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    (round(extract(epoch FROM post.published_at) / 3600, 6)
      + ip.feed_weight
      + CASE WHEN EXISTS (SELECT 1 FROM public.follows follow WHERE follow.follower_profile_id=public.social_current_human_profile_id() AND follow.followed_profile_id=post.author_profile_id) THEN 100 ELSE 0 END
      + CASE WHEN requested_locale IS NOT NULL AND post.language_code=requested_locale THEN 10 ELSE 0 END
      + 2 * (SELECT count(*) FROM public.post_likes post_like WHERE post_like.post_id=post.id)
      + 3 * (SELECT count(*) FROM public.comments comment WHERE comment.post_id=post.id AND comment.state='published'))::numeric,
    (SELECT count(*) FROM public.post_likes post_like WHERE post_like.post_id=post.id)::integer,
    (SELECT count(*) FROM public.comments comment WHERE comment.post_id=post.id AND comment.state='published')::integer,
    (SELECT count(*) FROM public.bookmarks bookmark WHERE bookmark.post_id=post.id)::integer,
    (SELECT count(*) FROM public.post_share_events share_event WHERE share_event.post_id=post.id)::integer
  FROM public.posts post
  JOIN public.ip_profiles ip ON ip.profile_id=post.author_profile_id
  JOIN public.ip_identity_revisions revision ON revision.id=ip.current_identity_revision_id AND revision.ip_profile_id=ip.profile_id
  WHERE post.id=target_post_id AND post.author_profile_id=target_author_id AND post.state='published' AND ip.public_state='published'
$$;
REVOKE ALL ON FUNCTION public.social_post_metrics(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_post_metrics(uuid,uuid,text) TO aifans_anon,aifans_authenticated;

CREATE FUNCTION public.social_public_search_posts(search_query text,after_published_at timestamptz,after_id uuid,page_limit integer)
RETURNS TABLE(
  post_id uuid,author_profile_id uuid,body text,language_code text,published_at timestamptz,
  id uuid,username text,display_name text,bio text,languages text[],visual_type public.creator_visual_type,
  creator_id uuid,creator_username text,creator_display_name text,
  like_count integer,comment_count integer,bookmark_count integer,share_count integer,
  viewer_has_liked boolean,viewer_has_bookmarked boolean,viewer_follows_author boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH escaped AS (
    SELECT replace(replace(replace(coalesce(search_query,''),chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_') AS q
  )
  SELECT p.post_id,p.author_profile_id,p.body,p.language_code,p.published_at,
    p.id,p.username,p.display_name,p.bio,p.languages,p.visual_type,
    p.creator_id,p.creator_username,p.creator_display_name,
    metrics.like_count,metrics.comment_count,metrics.bookmark_count,metrics.share_count,
    flags.viewer_has_liked,flags.viewer_has_bookmarked,flags.viewer_follows_author
  FROM public.social_public_posts() p
  CROSS JOIN escaped
  CROSS JOIN LATERAL public.social_viewer_flags(p.post_id,p.id) flags
  CROSS JOIN LATERAL public.social_post_metrics(p.post_id,p.id,NULL::text) metrics
  WHERE (p.body ILIKE '%'||escaped.q||'%' ESCAPE chr(92)
    OR p.username ILIKE '%'||escaped.q||'%' ESCAPE chr(92)
    OR p.display_name ILIKE '%'||escaped.q||'%' ESCAPE chr(92))
    AND (after_id IS NULL OR (p.published_at,p.post_id)<(after_published_at,after_id))
  ORDER BY p.published_at DESC,p.post_id DESC
  LIMIT LEAST(GREATEST(page_limit,1),51)
$$;
REVOKE ALL ON FUNCTION public.social_public_search_posts(text,timestamptz,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_public_search_posts(text,timestamptz,uuid,integer) TO aifans_anon,aifans_authenticated;
