-- Public post images use a separate R2 namespace and durable operator-owned
-- reservations. Private creator reference keys never enter this pipeline.
CREATE TABLE public.post_media_upload_reservations (
  id uuid PRIMARY KEY,
  operator_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  object_key text NOT NULL UNIQUE CHECK (object_key ~ '^public/posts/[0-9a-f-]+\.(jpg|png|webp)$'),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  declared_size_bytes integer NOT NULL CHECK (declared_size_bytes BETWEEN 1 AND 10485760),
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  width integer CHECK (width BETWEEN 1 AND 16384),
  height integer CHECK (height BETWEEN 1 AND 16384),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((verified_at IS NULL AND width IS NULL AND height IS NULL) OR (verified_at IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL)),
  CHECK (consumed_at IS NULL OR verified_at IS NOT NULL)
);
CREATE INDEX post_media_upload_reservations_active_idx ON public.post_media_upload_reservations(operator_profile_id,created_at) WHERE consumed_at IS NULL;
ALTER TABLE public.post_media_upload_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.post_media_upload_reservations FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;

CREATE FUNCTION public.platform_reserve_post_media(asset_id uuid,asset_content_type text,asset_size_bytes integer,requested_expires_at timestamptz,request_id uuid)
RETURNS TABLE(id uuid,object_key text,content_type text,size_bytes integer,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operator_id uuid; active_count integer; extension text;
BEGIN
  IF request_id IS NULL OR asset_id IS NULL OR asset_content_type NOT IN ('image/jpeg','image/png','image/webp') OR asset_size_bytes NOT BETWEEN 1 AND 10485760 OR requested_expires_at<=clock_timestamp() OR requested_expires_at>clock_timestamp()+interval '10 minutes' THEN RAISE EXCEPTION 'invalid post media reservation' USING ERRCODE='23514'; END IF;
  SELECT p.id INTO operator_id FROM public.profiles p JOIN public.profile_roles pr ON pr.profile_id=p.id WHERE p.account_kind='human' AND p.auth_subject=app.current_auth_subject() AND pr.role='operator' AND pr.revoked_at IS NULL FOR UPDATE OF p,pr;
  IF operator_id IS NULL THEN RAISE EXCEPTION 'active human operator required' USING ERRCODE='42501'; END IF;
  SELECT count(*) INTO active_count FROM public.post_media_upload_reservations r WHERE r.operator_profile_id=operator_id AND r.consumed_at IS NULL AND ((r.verified_at IS NULL AND r.expires_at>clock_timestamp()) OR (r.verified_at IS NOT NULL AND r.created_at>clock_timestamp()-interval '24 hours'));
  IF active_count>=20 THEN RAISE EXCEPTION 'post media reservation quota exceeded' USING ERRCODE='P0001'; END IF;
  extension:=CASE asset_content_type WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' END;
  INSERT INTO public.post_media_upload_reservations(id,operator_profile_id,object_key,content_type,declared_size_bytes,expires_at) VALUES(asset_id,operator_id,format('public/posts/%s.%s',asset_id,extension),asset_content_type,asset_size_bytes,requested_expires_at);
  RETURN QUERY SELECT r.id,r.object_key,r.content_type,r.declared_size_bytes,r.expires_at FROM public.post_media_upload_reservations r WHERE r.id=asset_id;
END $$;

CREATE FUNCTION public.platform_get_post_media_reservation(asset_id uuid)
RETURNS TABLE(id uuid,object_key text,content_type text,size_bytes integer,expires_at timestamptz,verified_at timestamptz,width integer,height integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT r.id,r.object_key,r.content_type,r.declared_size_bytes,r.expires_at,r.verified_at,r.width,r.height FROM public.post_media_upload_reservations r JOIN public.profiles p ON p.id=r.operator_profile_id WHERE r.id=asset_id AND p.auth_subject=app.current_auth_subject() AND r.consumed_at IS NULL
$$;

CREATE FUNCTION public.platform_verify_post_media(asset_id uuid,actual_content_type text,actual_size_bytes integer,asset_width integer,asset_height integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operator_id uuid; verified boolean:=false;
BEGIN
  SELECT p.id INTO operator_id FROM public.profiles p JOIN public.profile_roles pr ON pr.profile_id=p.id WHERE p.account_kind='human' AND p.auth_subject=app.current_auth_subject() AND pr.role='operator' AND pr.revoked_at IS NULL FOR UPDATE OF p,pr;
  IF operator_id IS NULL THEN RAISE EXCEPTION 'active human operator required' USING ERRCODE='42501'; END IF;
  UPDATE public.post_media_upload_reservations r SET verified_at=COALESCE(r.verified_at,clock_timestamp()),width=asset_width,height=asset_height WHERE r.id=asset_id AND r.operator_profile_id=operator_id AND r.consumed_at IS NULL AND r.expires_at>clock_timestamp() AND r.content_type=actual_content_type AND r.declared_size_bytes=actual_size_bytes AND asset_width BETWEEN 1 AND 16384 AND asset_height BETWEEN 1 AND 16384 AND (r.verified_at IS NULL OR (r.width=asset_width AND r.height=asset_height)) RETURNING true INTO verified;
  IF NOT COALESCE(verified,false) THEN RAISE EXCEPTION 'post media metadata mismatch' USING ERRCODE='23514'; END IF;
  RETURN true;
END $$;

CREATE FUNCTION public.platform_publish_post(represented_ip_profile_id uuid,requested_body text,requested_language_code text,request_id uuid,media_reservation_ids uuid[],media_alt_texts text[])
RETURNS TABLE(post_id uuid,body text,language_code text,published_at timestamptz,id uuid,username text,display_name text,bio text,languages text[],like_count bigint,comment_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operator_id uuid;created_post_id uuid:=gen_random_uuid();event_id uuid:=gen_random_uuid();published_time timestamptz:=clock_timestamp();media_count integer:=COALESCE(cardinality(media_reservation_ids),0);locked_count integer;
BEGIN
  IF request_id IS NULL OR requested_body IS NULL OR char_length(requested_body)>5000 OR media_count>4 OR COALESCE(cardinality(media_alt_texts),0)<>media_count OR (requested_body!~'[^[:space:]]' AND media_count=0) OR EXISTS(SELECT 1 FROM unnest(media_alt_texts) alt WHERE alt IS NOT NULL AND char_length(alt)>1000) OR media_count<>COALESCE((SELECT count(DISTINCT media_value.value) FROM unnest(media_reservation_ids) AS media_value(value)),0) THEN RAISE EXCEPTION 'invalid post content' USING ERRCODE='23514'; END IF;
  SELECT p.id INTO operator_id FROM public.profiles p JOIN public.profile_roles pr ON pr.profile_id=p.id WHERE p.account_kind='human' AND p.auth_subject=app.current_auth_subject() AND pr.role='operator' AND pr.revoked_at IS NULL FOR UPDATE OF p, pr;
  IF operator_id IS NULL THEN RAISE EXCEPTION 'active human operator required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.ip_profiles ip JOIN public.ip_identity_revisions r ON r.id=ip.current_identity_revision_id AND r.ip_profile_id=ip.profile_id WHERE ip.profile_id=represented_ip_profile_id AND ip.public_state='published' AND ip.operation_enabled FOR UPDATE OF ip, r;
  IF NOT FOUND THEN RAISE EXCEPTION 'IP not publishable' USING ERRCODE='P0001'; END IF;
  PERFORM 1 FROM public.post_media_upload_reservations r WHERE r.id=ANY(COALESCE(media_reservation_ids,ARRAY[]::uuid[])) ORDER BY r.id FOR UPDATE;
  SELECT count(*) INTO locked_count FROM public.post_media_upload_reservations r WHERE r.id=ANY(COALESCE(media_reservation_ids,ARRAY[]::uuid[])) AND r.operator_profile_id=operator_id AND r.verified_at IS NOT NULL AND r.consumed_at IS NULL AND r.created_at>clock_timestamp()-interval '24 hours';
  IF locked_count<>media_count THEN RAISE EXCEPTION 'post media unavailable' USING ERRCODE='23514'; END IF;
  INSERT INTO public.posts(id,author_profile_id,acting_operator_profile_id,state,source,body,language_code) VALUES(created_post_id,represented_ip_profile_id,operator_id,'draft','admin',requested_body,requested_language_code);
  INSERT INTO public.post_media(id,post_id,position,object_key,alt_text,content_type,width,height) SELECT r.id,created_post_id,item.ordinality,r.object_key,item.alt_text,r.content_type,r.width,r.height FROM unnest(COALESCE(media_reservation_ids,ARRAY[]::uuid[]),COALESCE(media_alt_texts,ARRAY[]::text[])) WITH ORDINALITY item(reservation_id,alt_text,ordinality) JOIN public.post_media_upload_reservations r ON r.id=item.reservation_id ORDER BY item.ordinality;
  UPDATE public.post_media_upload_reservations reservation SET consumed_at=clock_timestamp() WHERE reservation.id=ANY(COALESCE(media_reservation_ids,ARRAY[]::uuid[]));
  UPDATE public.posts SET state='published',published_at=published_time,updated_at=clock_timestamp() WHERE public.posts.id=created_post_id;
  INSERT INTO public.audit_events(id,actor_type,actor_profile_id,action,entity_type,entity_id,request_id,source_app,result,change_summary) VALUES(gen_random_uuid(),'operator',operator_id,'post_published','post',created_post_id,request_id,'admin','succeeded',jsonb_build_object('source','admin','represented_ip_profile_id',represented_ip_profile_id,'media_count',media_count));
  INSERT INTO public.workflow_transitions(id,entity_type,entity_id,previous_state,next_state,actor_profile_id,reason_code,request_id) VALUES(gen_random_uuid(),'post',created_post_id,'draft','published',operator_id,'admin_publish',request_id);
  INSERT INTO public.business_events(id,event_name,schema_version,actor_profile_id,subject_entity_type,subject_entity_id,request_id,environment,properties) VALUES(event_id,'post_published',1,operator_id,'post',created_post_id,request_id,'admin',jsonb_build_object('event_id',event_id,'request_id',request_id,'ip_profile_id',represented_ip_profile_id,'action_source','admin','media_count',media_count));
  INSERT INTO public.analytics_outbox(id,business_event_id,destination,payload_version,payload) VALUES(gen_random_uuid(),event_id,'posthog',1,jsonb_build_object('event_id',event_id,'event_name','post_published','event_version',1,'request_id',request_id,'ip_profile_id',represented_ip_profile_id,'action_source','admin','media_count',media_count));
  RETURN QUERY SELECT p.id,p.body,p.language_code,p.published_at,profile.id,profile.username,identity.display_name,identity.bio,identity.languages,0::bigint,0::bigint FROM public.posts p JOIN public.profiles profile ON profile.id=p.author_profile_id JOIN public.ip_profiles ip ON ip.profile_id=profile.id JOIN public.ip_identity_revisions identity ON identity.id=ip.current_identity_revision_id WHERE p.id=created_post_id;
END $$;

CREATE FUNCTION public.social_public_post_media(target_post_id uuid)
RETURNS TABLE(id uuid,object_key text,alt_text text,content_type text,width integer,height integer,media_position smallint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT m.id,m.object_key,m.alt_text,m.content_type,m.width,m.height,m.position FROM public.post_media m JOIN public.posts p ON p.id=m.post_id JOIN public.ip_profiles ip ON ip.profile_id=p.author_profile_id WHERE m.post_id=target_post_id AND p.state='published' AND ip.public_state='published' ORDER BY m.position
$$;

REVOKE ALL ON FUNCTION public.platform_reserve_post_media(uuid,text,integer,timestamptz,uuid),public.platform_get_post_media_reservation(uuid),public.platform_verify_post_media(uuid,text,integer,integer,integer),public.platform_publish_post(uuid,text,text,uuid,uuid[],text[]),public.social_public_post_media(uuid) FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;
GRANT EXECUTE ON FUNCTION public.platform_reserve_post_media(uuid,text,integer,timestamptz,uuid),public.platform_get_post_media_reservation(uuid),public.platform_verify_post_media(uuid,text,integer,integer,integer),public.platform_publish_post(uuid,text,text,uuid,uuid[],text[]) TO aifans_platform;
GRANT EXECUTE ON FUNCTION public.social_public_post_media(uuid) TO aifans_anon,aifans_authenticated,aifans_platform;
