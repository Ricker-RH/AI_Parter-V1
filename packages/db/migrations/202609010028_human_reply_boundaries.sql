-- Harden the already-deployed human comment command. Replies notify the
-- published top-level parent author, never the post owner by accident.
CREATE OR REPLACE FUNCTION public.create_human_comment(
  target_post_id uuid,
  parent_id uuid,
  comment_body text,
  request_id uuid
)
RETURNS TABLE(id uuid, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_id uuid; owner_id uuid; recipient_id uuid; event_id uuid;
BEGIN
  actor_id := public.social_current_human_profile_id();
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
  SELECT p.author_profile_id INTO owner_id FROM public.posts p
  WHERE p.id=target_post_id AND public.is_published_post(p.id);
  IF owner_id IS NULL THEN RAISE EXCEPTION 'published post not found' USING ERRCODE='P0002'; END IF;

  recipient_id := owner_id;
  IF parent_id IS NOT NULL THEN
    SELECT c.author_profile_id INTO recipient_id FROM public.comments c
    WHERE c.id=parent_id AND c.post_id=target_post_id
      AND c.parent_comment_id IS NULL AND c.state='published'
    FOR UPDATE;
    IF recipient_id IS NULL THEN RAISE EXCEPTION 'invalid reply parent' USING ERRCODE='P0001'; END IF;
  END IF;

  id := gen_random_uuid();
  INSERT INTO public.comments(id,post_id,parent_comment_id,author_profile_id,source,body)
  VALUES(id,target_post_id,parent_id,actor_id,'human',comment_body)
  RETURNING comments.created_at INTO created_at;
  event_id := gen_random_uuid();
  INSERT INTO public.business_events(id,event_name,schema_version,actor_profile_id,subject_entity_type,subject_entity_id,request_id,environment,properties)
  VALUES(event_id,'comment_created',1,actor_id,'comment',id,request_id,'api',jsonb_build_object('event_id',event_id,'request_id',request_id));
  INSERT INTO public.analytics_outbox(id,business_event_id,destination,payload_version,payload)
  VALUES(gen_random_uuid(),event_id,'posthog',1,jsonb_build_object('event_id',event_id,'event_name','comment_created','event_version',1,'request_id',request_id));
  IF recipient_id<>actor_id THEN
    INSERT INTO public.notifications(id,recipient_profile_id,actor_profile_id,kind,post_id,comment_id)
    VALUES(gen_random_uuid(),recipient_id,actor_id,CASE WHEN parent_id IS NULL THEN 'comment'::public.notification_kind ELSE 'reply'::public.notification_kind END,target_post_id,id);
  END IF;
  RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.create_human_comment(uuid,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_human_comment(uuid,uuid,text,uuid) TO aifans_authenticated;
