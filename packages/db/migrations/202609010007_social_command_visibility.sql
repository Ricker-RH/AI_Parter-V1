CREATE OR REPLACE FUNCTION public.follow_profile(target_profile_id uuid, event_id uuid, request_id uuid, environment text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; did_create boolean := false; event_row uuid;
BEGIN
 actor_id:=public.social_current_human_profile_id(); IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
 IF environment !~ '[^[:space:]]' OR NOT EXISTS (SELECT 1 FROM public.ip_profiles ip JOIN public.ip_identity_revisions r ON r.id=ip.current_identity_revision_id AND r.ip_profile_id=ip.profile_id WHERE ip.profile_id=target_profile_id AND ip.public_state='published') THEN RAISE EXCEPTION 'public IP not found' USING ERRCODE='P0002'; END IF;
 INSERT INTO public.follows(follower_profile_id,followed_profile_id) VALUES(actor_id,target_profile_id) ON CONFLICT DO NOTHING RETURNING true INTO did_create;
 IF did_create THEN
  INSERT INTO public.business_events(id,event_name,schema_version,actor_profile_id,subject_entity_type,subject_entity_id,request_id,environment,properties) VALUES(event_id,'follow_created',1,actor_id,'profile',target_profile_id,request_id,environment,jsonb_build_object('event_id',event_id,'profile_id',target_profile_id,'request_id',request_id)) RETURNING id INTO event_row;
  INSERT INTO public.analytics_outbox(id,business_event_id,destination,payload_version,payload) VALUES(gen_random_uuid(),event_row,'posthog',1,jsonb_build_object('event_id',event_id,'event_name','follow_created','event_version',1,'profile_id',target_profile_id,'request_id',request_id));
  IF target_profile_id<>actor_id THEN INSERT INTO public.notifications(id,recipient_profile_id,actor_profile_id,kind) VALUES(gen_random_uuid(),target_profile_id,actor_id,'follow'); END IF;
 END IF; RETURN COALESCE(did_create,false);
END $$;

CREATE OR REPLACE FUNCTION public.create_human_comment(comment_id uuid, target_post_id uuid, parent_id uuid, comment_body text, event_id uuid, request_id uuid, environment text)
RETURNS TABLE(id uuid, created_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; owner_id uuid; event_row uuid;
BEGIN
 actor_id:=public.social_current_human_profile_id(); IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
 IF environment !~ '[^[:space:]]' OR NOT EXISTS (SELECT 1 FROM public.posts p JOIN public.ip_profiles ip ON ip.profile_id=p.author_profile_id JOIN public.ip_identity_revisions r ON r.id=ip.current_identity_revision_id AND r.ip_profile_id=ip.profile_id WHERE p.id=target_post_id AND p.state='published' AND ip.public_state='published') THEN RAISE EXCEPTION 'published post not found' USING ERRCODE='P0002'; END IF;
 INSERT INTO public.comments(id,post_id,parent_comment_id,author_profile_id,source,body) VALUES(comment_id,target_post_id,parent_id,actor_id,'human',comment_body) RETURNING comments.created_at INTO created_at; id:=comment_id;
 SELECT author_profile_id INTO owner_id FROM public.posts WHERE posts.id=target_post_id;
 INSERT INTO public.business_events(id,event_name,schema_version,actor_profile_id,subject_entity_type,subject_entity_id,request_id,environment,properties) VALUES(event_id,'comment_created',1,actor_id,'comment',comment_id,request_id,environment,jsonb_build_object('event_id',event_id,'request_id',request_id)) RETURNING business_events.id INTO event_row;
 INSERT INTO public.analytics_outbox(id,business_event_id,destination,payload_version,payload) VALUES(gen_random_uuid(),event_row,'posthog',1,jsonb_build_object('event_id',event_id,'event_name','comment_created','event_version',1,'request_id',request_id));
 IF owner_id<>actor_id THEN INSERT INTO public.notifications(id,recipient_profile_id,actor_profile_id,kind,post_id,comment_id) VALUES(gen_random_uuid(),owner_id,actor_id,CASE WHEN parent_id IS NULL THEN 'comment'::public.notification_kind ELSE 'reply'::public.notification_kind END,target_post_id,comment_id); END IF;
 RETURN NEXT;
END $$;
