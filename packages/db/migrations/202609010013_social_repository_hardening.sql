-- Forward-only hardening for public social projections and authenticated commands.

-- A published row is actionable only while its IP author and current identity are public.
CREATE OR REPLACE FUNCTION public.is_published_post(target_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.posts p
    JOIN public.ip_profiles ip ON ip.profile_id = p.author_profile_id
    JOIN public.ip_identity_revisions revision
      ON revision.id = ip.current_identity_revision_id
      AND revision.ip_profile_id = ip.profile_id
    WHERE p.id = target_id
      AND p.state = 'published'
      AND ip.public_state = 'published'
  )
$$;

CREATE OR REPLACE FUNCTION public.social_public_comments(
  target_post_id uuid,
  after_created_at timestamptz,
  after_id uuid,
  page_limit integer
)
RETURNS TABLE(
  id uuid,
  post_id uuid,
  parent_comment_id uuid,
  author_id uuid,
  author_kind public.account_kind,
  username text,
  display_name text,
  body text,
  state public.comment_state,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.id, c.post_id, c.parent_comment_id, author.id, author.account_kind,
    author.username,
    CASE WHEN author.account_kind = 'ip' THEN author_revision.display_name ELSE author.display_name END,
    CASE WHEN c.state = 'deleted' THEN NULL ELSE c.body END,
    c.state, c.created_at
  FROM public.comments c
  JOIN public.posts post ON post.id = c.post_id
  JOIN public.ip_profiles post_ip ON post_ip.profile_id = post.author_profile_id
  JOIN public.ip_identity_revisions post_revision
    ON post_revision.id = post_ip.current_identity_revision_id
    AND post_revision.ip_profile_id = post_ip.profile_id
  JOIN public.profiles author ON author.id = c.author_profile_id
  LEFT JOIN public.ip_profiles author_ip
    ON author_ip.profile_id = author.id AND author_ip.public_state = 'published'
  LEFT JOIN public.ip_identity_revisions author_revision
    ON author_revision.id = author_ip.current_identity_revision_id
    AND author_revision.ip_profile_id = author_ip.profile_id
  WHERE c.post_id = target_post_id
    AND post.state = 'published'
    AND post_ip.public_state = 'published'
    AND (author.account_kind = 'human' OR author_revision.id IS NOT NULL)
    AND (
      after_id IS NULL
      OR (c.created_at, c.id) > (
        SELECT anchor.created_at, anchor.id
        FROM public.comments anchor
        WHERE anchor.id = after_id AND anchor.post_id = target_post_id
      )
    )
  ORDER BY c.created_at, c.id
  LIMIT LEAST(GREATEST(page_limit, 1), 51)
$$;

-- Authenticated callers supply only the business target and request correlation.
-- Actor, event/outbox/notification IDs, and the fixed API environment are server-owned.
CREATE FUNCTION public.follow_profile(target_profile_id uuid, request_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; did_create boolean := false; event_id uuid;
BEGIN
  actor_id := public.social_current_human_profile_id();
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ip_profiles ip
    JOIN public.ip_identity_revisions revision
      ON revision.id = ip.current_identity_revision_id AND revision.ip_profile_id = ip.profile_id
    WHERE ip.profile_id = target_profile_id AND ip.public_state = 'published'
  ) THEN RAISE EXCEPTION 'public IP not found' USING ERRCODE = 'P0002'; END IF;

  INSERT INTO public.follows(follower_profile_id, followed_profile_id)
  VALUES(actor_id, target_profile_id) ON CONFLICT DO NOTHING RETURNING true INTO did_create;
  IF did_create THEN
    event_id := gen_random_uuid();
    INSERT INTO public.business_events(id,event_name,schema_version,actor_profile_id,subject_entity_type,subject_entity_id,request_id,environment,properties)
    VALUES(event_id,'follow_created',1,actor_id,'profile',target_profile_id,request_id,'api',jsonb_build_object('event_id',event_id,'profile_id',target_profile_id,'request_id',request_id));
    INSERT INTO public.analytics_outbox(id,business_event_id,destination,payload_version,payload)
    VALUES(gen_random_uuid(),event_id,'posthog',1,jsonb_build_object('event_id',event_id,'event_name','follow_created','event_version',1,'profile_id',target_profile_id,'request_id',request_id));
    IF target_profile_id <> actor_id THEN
      INSERT INTO public.notifications(id,recipient_profile_id,actor_profile_id,kind)
      VALUES(gen_random_uuid(),target_profile_id,actor_id,'follow');
    END IF;
  END IF;
  RETURN COALESCE(did_create, false);
END $$;

CREATE FUNCTION public.like_post(target_post_id uuid, request_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; owner_id uuid; did_create boolean := false; event_id uuid;
BEGIN
  actor_id := public.social_current_human_profile_id();
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE = '42501'; END IF;
  SELECT p.author_profile_id INTO owner_id FROM public.posts p
  WHERE p.id = target_post_id AND public.is_published_post(p.id);
  IF owner_id IS NULL THEN RAISE EXCEPTION 'published post not found' USING ERRCODE = 'P0002'; END IF;

  INSERT INTO public.post_likes(post_id, profile_id)
  VALUES(target_post_id, actor_id) ON CONFLICT DO NOTHING RETURNING true INTO did_create;
  IF did_create THEN
    event_id := gen_random_uuid();
    INSERT INTO public.business_events(id,event_name,schema_version,actor_profile_id,subject_entity_type,subject_entity_id,request_id,environment,properties)
    VALUES(event_id,'post_liked',1,actor_id,'post',target_post_id,request_id,'api',jsonb_build_object('event_id',event_id,'request_id',request_id));
    INSERT INTO public.analytics_outbox(id,business_event_id,destination,payload_version,payload)
    VALUES(gen_random_uuid(),event_id,'posthog',1,jsonb_build_object('event_id',event_id,'event_name','post_liked','event_version',1,'request_id',request_id));
    IF owner_id <> actor_id THEN
      INSERT INTO public.notifications(id,recipient_profile_id,actor_profile_id,kind,post_id)
      VALUES(gen_random_uuid(),owner_id,actor_id,'post_like',target_post_id);
    END IF;
  END IF;
  RETURN COALESCE(did_create, false);
END $$;

CREATE FUNCTION public.create_human_comment(
  target_post_id uuid,
  parent_id uuid,
  comment_body text,
  request_id uuid
)
RETURNS TABLE(id uuid, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; owner_id uuid; event_id uuid;
BEGIN
  actor_id := public.social_current_human_profile_id();
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE = '42501'; END IF;
  SELECT p.author_profile_id INTO owner_id FROM public.posts p
  WHERE p.id = target_post_id AND public.is_published_post(p.id);
  IF owner_id IS NULL THEN RAISE EXCEPTION 'published post not found' USING ERRCODE = 'P0002'; END IF;

  id := gen_random_uuid();
  INSERT INTO public.comments(id,post_id,parent_comment_id,author_profile_id,source,body)
  VALUES(id,target_post_id,parent_id,actor_id,'human',comment_body)
  RETURNING comments.created_at INTO created_at;

  event_id := gen_random_uuid();
  INSERT INTO public.business_events(id,event_name,schema_version,actor_profile_id,subject_entity_type,subject_entity_id,request_id,environment,properties)
  VALUES(event_id,'comment_created',1,actor_id,'comment',id,request_id,'api',jsonb_build_object('event_id',event_id,'request_id',request_id));
  INSERT INTO public.analytics_outbox(id,business_event_id,destination,payload_version,payload)
  VALUES(gen_random_uuid(),event_id,'posthog',1,jsonb_build_object('event_id',event_id,'event_name','comment_created','event_version',1,'request_id',request_id));
  IF owner_id <> actor_id THEN
    INSERT INTO public.notifications(id,recipient_profile_id,actor_profile_id,kind,post_id,comment_id)
    VALUES(gen_random_uuid(),owner_id,actor_id,CASE WHEN parent_id IS NULL THEN 'comment'::public.notification_kind ELSE 'reply'::public.notification_kind END,target_post_id,id);
  END IF;
  RETURN NEXT;
END $$;

REVOKE EXECUTE ON FUNCTION public.follow_profile(uuid,uuid,uuid,text) FROM aifans_authenticated;
REVOKE EXECUTE ON FUNCTION public.like_post(uuid,uuid,uuid,text) FROM aifans_authenticated;
REVOKE EXECUTE ON FUNCTION public.create_human_comment(uuid,uuid,uuid,text,uuid,uuid,text) FROM aifans_authenticated;

REVOKE ALL ON FUNCTION public.follow_profile(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.like_post(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_human_comment(uuid,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.follow_profile(uuid,uuid) TO aifans_authenticated;
GRANT EXECUTE ON FUNCTION public.like_post(uuid,uuid) TO aifans_authenticated;
GRANT EXECUTE ON FUNCTION public.create_human_comment(uuid,uuid,text,uuid) TO aifans_authenticated;
