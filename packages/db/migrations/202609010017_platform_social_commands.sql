-- A server-only capability role. Deployment login roles may be granted this
-- NOLOGIN role, but the role itself cannot connect and never bypasses RLS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aifans_platform') THEN
    CREATE ROLE aifans_platform NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

GRANT aifans_platform TO CURRENT_USER;
GRANT USAGE ON SCHEMA public, app TO aifans_platform;

CREATE FUNCTION public.platform_create_ip(
  requested_username text,
  requested_display_name text,
  requested_bio text,
  requested_languages text[],
  request_id uuid
)
RETURNS TABLE(id uuid, username text, display_name text, bio text, languages text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  operator_id uuid;
  ip_id uuid := gen_random_uuid();
  revision_id uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid();
BEGIN
  IF request_id IS NULL THEN RAISE EXCEPTION 'request id required' USING ERRCODE='23502'; END IF;
  SELECT p.id INTO operator_id
  FROM public.profiles p
  JOIN public.profile_roles pr ON pr.profile_id = p.id
  WHERE p.account_kind = 'human'
    AND p.auth_subject = app.current_auth_subject()
    AND pr.role = 'operator'
    AND pr.revoked_at IS NULL;
  IF operator_id IS NULL THEN
    RAISE EXCEPTION 'active human operator required' USING ERRCODE = '42501';
  END IF;
  IF requested_languages IS NULL OR EXISTS (
    SELECT 1 FROM unnest(requested_languages) language
    WHERE language NOT IN ('en', 'zh-CN')
  ) THEN
    RAISE EXCEPTION 'invalid IP languages' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.profiles(id,account_kind,username,display_name,bio)
  VALUES(ip_id,'ip',requested_username,requested_display_name,requested_bio);
  INSERT INTO public.ip_profiles(profile_id,source,public_state,operation_enabled)
  VALUES(ip_id,'platform','draft',false);
  INSERT INTO public.ip_identity_revisions(
    id,ip_profile_id,version,display_name,bio,languages,created_by_profile_id
  ) VALUES(
    revision_id,ip_id,1,requested_display_name,requested_bio,requested_languages,operator_id
  );
  UPDATE public.ip_profiles
  SET current_identity_revision_id=revision_id,public_state='published',operation_enabled=true,updated_at=clock_timestamp()
  WHERE profile_id=ip_id;

  INSERT INTO public.audit_events(id,actor_type,actor_profile_id,action,entity_type,entity_id,request_id,source_app,result,change_summary)
  VALUES(gen_random_uuid(),'operator',operator_id,'ip_created','ip_profile',ip_id,request_id,'admin','succeeded',jsonb_build_object('source','admin','represented_ip_profile_id',ip_id));
  INSERT INTO public.workflow_transitions(id,entity_type,entity_id,previous_state,next_state,actor_profile_id,reason_code,request_id)
  VALUES(gen_random_uuid(),'ip_profile',ip_id,'draft','published',operator_id,'platform_create',request_id);
  INSERT INTO public.business_events(id,event_name,schema_version,actor_profile_id,subject_entity_type,subject_entity_id,request_id,environment,properties)
  VALUES(event_id,'ip_created',1,operator_id,'ip_profile',ip_id,request_id,'admin',jsonb_build_object('event_id',event_id,'request_id',request_id,'ip_profile_id',ip_id,'action_source','admin'));
  INSERT INTO public.analytics_outbox(id,business_event_id,destination,payload_version,payload)
  VALUES(gen_random_uuid(),event_id,'posthog',1,jsonb_build_object('event_id',event_id,'event_name','ip_created','event_version',1,'request_id',request_id,'ip_profile_id',ip_id,'action_source','admin'));

  RETURN QUERY SELECT ip_id,requested_username,requested_display_name,requested_bio,requested_languages;
END
$$;

CREATE FUNCTION public.platform_publish_post(
  represented_ip_profile_id uuid,
  requested_body text,
  requested_language_code text,
  request_id uuid
)
RETURNS TABLE(
  post_id uuid, body text, language_code text, published_at timestamptz,
  id uuid, username text, display_name text, bio text, languages text[],
  like_count bigint, comment_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  operator_id uuid;
  created_post_id uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid();
  published_time timestamptz := clock_timestamp();
BEGIN
  IF request_id IS NULL THEN RAISE EXCEPTION 'request id required' USING ERRCODE='23502'; END IF;
  IF requested_body IS NULL OR requested_body !~ '[^[:space:]]' THEN
    RAISE EXCEPTION 'nonblank post body required' USING ERRCODE='23514';
  END IF;
  SELECT p.id INTO operator_id
  FROM public.profiles p JOIN public.profile_roles pr ON pr.profile_id=p.id
  WHERE p.account_kind='human' AND p.auth_subject=app.current_auth_subject()
    AND pr.role='operator' AND pr.revoked_at IS NULL;
  IF operator_id IS NULL THEN RAISE EXCEPTION 'active human operator required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ip_profiles ip
    JOIN public.ip_identity_revisions r ON r.id=ip.current_identity_revision_id AND r.ip_profile_id=ip.profile_id
    WHERE ip.profile_id=represented_ip_profile_id AND ip.public_state='published' AND ip.operation_enabled
  ) THEN RAISE EXCEPTION 'IP not publishable' USING ERRCODE='P0001'; END IF;

  INSERT INTO public.posts(id,author_profile_id,acting_operator_profile_id,state,source,body,language_code)
  VALUES(created_post_id,represented_ip_profile_id,operator_id,'draft','admin',requested_body,requested_language_code);
  UPDATE public.posts SET state='published',published_at=published_time,updated_at=clock_timestamp()
  WHERE public.posts.id=created_post_id;

  INSERT INTO public.audit_events(id,actor_type,actor_profile_id,action,entity_type,entity_id,request_id,source_app,result,change_summary)
  VALUES(gen_random_uuid(),'operator',operator_id,'post_published','post',created_post_id,request_id,'admin','succeeded',jsonb_build_object('source','admin','represented_ip_profile_id',represented_ip_profile_id));
  INSERT INTO public.workflow_transitions(id,entity_type,entity_id,previous_state,next_state,actor_profile_id,reason_code,request_id)
  VALUES(gen_random_uuid(),'post',created_post_id,'draft','published',operator_id,'admin_publish',request_id);
  INSERT INTO public.business_events(id,event_name,schema_version,actor_profile_id,subject_entity_type,subject_entity_id,request_id,environment,properties)
  VALUES(event_id,'post_published',1,operator_id,'post',created_post_id,request_id,'admin',jsonb_build_object('event_id',event_id,'request_id',request_id,'ip_profile_id',represented_ip_profile_id,'action_source','admin'));
  INSERT INTO public.analytics_outbox(id,business_event_id,destination,payload_version,payload)
  VALUES(gen_random_uuid(),event_id,'posthog',1,jsonb_build_object('event_id',event_id,'event_name','post_published','event_version',1,'request_id',request_id,'ip_profile_id',represented_ip_profile_id,'action_source','admin'));

  RETURN QUERY
  SELECT p.id,p.body,p.language_code,p.published_at,profile.id,profile.username,r.display_name,r.bio,r.languages,0::bigint,0::bigint
  FROM public.posts p
  JOIN public.profiles profile ON profile.id=p.author_profile_id
  JOIN public.ip_profiles ip ON ip.profile_id=profile.id
  JOIN public.ip_identity_revisions r ON r.id=ip.current_identity_revision_id
  WHERE p.id=created_post_id;
END
$$;

CREATE FUNCTION public.platform_publish_ip_comment(
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  operator_id uuid;
  created_comment_id uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid();
  created_time timestamptz := clock_timestamp();
  parent_parent_id uuid;
BEGIN
  IF request_id IS NULL THEN RAISE EXCEPTION 'request id required' USING ERRCODE='23502'; END IF;
  SELECT p.id INTO operator_id
  FROM public.profiles p JOIN public.profile_roles pr ON pr.profile_id=p.id
  WHERE p.account_kind='human' AND p.auth_subject=app.current_auth_subject()
    AND pr.role='operator' AND pr.revoked_at IS NULL;
  IF operator_id IS NULL THEN RAISE EXCEPTION 'active human operator required' USING ERRCODE='42501'; END IF;
  IF NOT public.is_published_post(target_post_id) THEN
    RAISE EXCEPTION 'published post not found' USING ERRCODE='P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ip_profiles ip
    JOIN public.ip_identity_revisions r ON r.id=ip.current_identity_revision_id AND r.ip_profile_id=ip.profile_id
    WHERE ip.profile_id=represented_ip_profile_id AND ip.public_state='published' AND ip.operation_enabled
  ) THEN RAISE EXCEPTION 'IP not publishable' USING ERRCODE='P0001'; END IF;
  IF requested_parent_comment_id IS NOT NULL THEN
    SELECT c.parent_comment_id INTO parent_parent_id
    FROM public.comments c
    WHERE c.id=requested_parent_comment_id AND c.post_id=target_post_id AND c.state='published';
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

REVOKE ALL ON FUNCTION public.platform_create_ip(text,text,text,text[],uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_publish_post(uuid,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_publish_ip_comment(uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_create_ip(text,text,text,text[],uuid) TO aifans_platform;
GRANT EXECUTE ON FUNCTION public.platform_publish_post(uuid,text,text,uuid) TO aifans_platform;
GRANT EXECUTE ON FUNCTION public.platform_publish_ip_comment(uuid,uuid,text,uuid,uuid) TO aifans_platform;

REVOKE ALL ON TABLE public.profiles, public.ip_profiles, public.ip_identity_revisions,
  public.posts, public.post_media, public.comments, public.profile_roles,
  public.audit_events, public.business_events, public.workflow_transitions,
  public.analytics_outbox FROM aifans_platform;
