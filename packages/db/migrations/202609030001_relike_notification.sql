-- Preserve the historical post-like notification when a human unlikes and
-- later likes the same public post again. The relationship and event rows are
-- fresh facts; the recipient notification remains unique by the deployed
-- notifications_post_like_once_idx partial index.
CREATE OR REPLACE FUNCTION public.like_post(target_post_id uuid, request_id uuid)
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
      VALUES(gen_random_uuid(),owner_id,actor_id,'post_like',target_post_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN COALESCE(did_create, false);
END $$;

REVOKE ALL ON FUNCTION public.like_post(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.like_post(uuid,uuid) TO aifans_authenticated;
