-- Forward-only hardening for creator request detail and private upload reservations.
-- Upload reservations make the eight-reference bound durable across API instances.

CREATE TABLE public.creator_asset_upload_intents (
  id uuid PRIMARY KEY,
  draft_id uuid NOT NULL REFERENCES public.creator_drafts(id) ON DELETE CASCADE,
  creator_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  declared_size_bytes integer NOT NULL CHECK (declared_size_bytes BETWEEN 1 AND 10485760),
  expires_at timestamptz NOT NULL,
  registered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, draft_id),
  FOREIGN KEY (draft_id, creator_profile_id) REFERENCES public.creator_drafts(id, creator_profile_id)
);

CREATE INDEX creator_asset_upload_intents_active_draft_idx
  ON public.creator_asset_upload_intents(draft_id, expires_at)
  WHERE registered_at IS NULL;

ALTER TABLE public.creator_asset_upload_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.creator_asset_upload_intents FROM PUBLIC, aifans_anon, aifans_authenticated, aifans_platform;

CREATE FUNCTION app.creator_upload_intent_json(target_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', i.id,
    'draftId', i.draft_id,
    'contentType', i.content_type,
    'sizeBytes', i.declared_size_bytes,
    'expiresAt', app.creator_iso(i.expires_at)
  )
  FROM public.creator_asset_upload_intents i
  WHERE i.id = target_id
$$;

CREATE FUNCTION public.creator_reserve_reference_upload(
  target_draft_id uuid,
  asset_id uuid,
  asset_content_type text,
  declared_size_bytes integer,
  requested_expires_at timestamptz
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; occupied_count integer;
BEGIN
  actor_id := app.creator_current_human_id();
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.creator_drafts d
    WHERE d.id=target_draft_id AND d.creator_profile_id=actor_id AND d.state='draft' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'editable creator draft not found' USING ERRCODE='P0002'; END IF;
  IF asset_id IS NULL OR asset_content_type NOT IN ('image/jpeg','image/png','image/webp')
    OR declared_size_bytes NOT BETWEEN 1 AND 10485760
    OR requested_expires_at <= clock_timestamp()
    OR requested_expires_at > clock_timestamp() + interval '10 minutes'
  THEN RAISE EXCEPTION 'invalid upload reservation' USING ERRCODE='23514'; END IF;

  DELETE FROM public.creator_asset_upload_intents i
    WHERE i.draft_id=target_draft_id AND i.registered_at IS NULL AND i.expires_at <= clock_timestamp();
  SELECT
    (SELECT count(*) FROM public.creator_reference_assets a WHERE a.draft_id=target_draft_id)
    + (SELECT count(*) FROM public.creator_asset_upload_intents i
       WHERE i.draft_id=target_draft_id AND i.registered_at IS NULL AND i.expires_at > clock_timestamp())
    INTO occupied_count;
  IF occupied_count >= 8 THEN RAISE EXCEPTION 'reference asset limit exceeded' USING ERRCODE='P0001'; END IF;

  INSERT INTO public.creator_asset_upload_intents(id,draft_id,creator_profile_id,content_type,declared_size_bytes,expires_at)
  VALUES(asset_id,target_draft_id,actor_id,asset_content_type,declared_size_bytes,requested_expires_at);
  RETURN app.creator_upload_intent_json(asset_id);
END
$$;

CREATE FUNCTION public.creator_get_reference_upload(target_draft_id uuid, asset_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app.creator_upload_intent_json(i.id)
  FROM public.creator_asset_upload_intents i
  WHERE i.id=asset_id AND i.draft_id=target_draft_id
    AND i.creator_profile_id=app.creator_current_human_id()
    AND i.registered_at IS NULL AND i.expires_at > clock_timestamp()
$$;

CREATE FUNCTION public.creator_register_reserved_reference(
  target_draft_id uuid,
  asset_id uuid,
  asset_content_type text,
  actual_size_bytes integer,
  asset_width integer,
  asset_height integer
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; created boolean := false; next_role public.creator_reference_role; asset_count integer; asset_extension text;
BEGIN
  actor_id:=app.creator_current_human_id();
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.creator_drafts d
    WHERE d.id=target_draft_id AND d.creator_profile_id=actor_id AND d.state='draft' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'editable creator draft not found' USING ERRCODE='P0002'; END IF;
  PERFORM 1 FROM public.creator_asset_upload_intents i
    WHERE i.id=asset_id AND i.draft_id=target_draft_id AND i.creator_profile_id=actor_id
      AND i.registered_at IS NULL AND i.expires_at > clock_timestamp()
      AND i.content_type=asset_content_type AND i.declared_size_bytes=actual_size_bytes
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'upload reservation not found or metadata mismatch' USING ERRCODE='23514'; END IF;
  SELECT count(*) INTO asset_count FROM public.creator_reference_assets a WHERE a.draft_id=target_draft_id;
  IF asset_count >= 8 THEN RAISE EXCEPTION 'reference asset limit exceeded' USING ERRCODE='P0001'; END IF;
  asset_extension:=CASE asset_content_type WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' ELSE NULL END;
  IF asset_width NOT BETWEEN 1 AND 16384 OR asset_height NOT BETWEEN 1 AND 16384
  THEN RAISE EXCEPTION 'invalid reference asset' USING ERRCODE='23514'; END IF;
  next_role := (ARRAY['avatar','cover','portrait','full_body','supporting_1','supporting_2','supporting_3','supporting_4']::public.creator_reference_role[])[asset_count+1];
  INSERT INTO public.creator_reference_assets(id,draft_id,creator_profile_id,object_key,content_type,width,height,draft_role)
  VALUES(asset_id,target_draft_id,actor_id,format('private/creator/%s/%s/%s.%s',actor_id,target_draft_id,asset_id,asset_extension),asset_content_type,asset_width,asset_height,next_role)
  RETURNING true INTO created;
  UPDATE public.creator_asset_upload_intents SET registered_at=clock_timestamp() WHERE id=asset_id;
  RETURN COALESCE(created,false);
END
$$;

CREATE FUNCTION public.creator_get_request(target_request_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app.creator_request_json(r.id)
  FROM public.creator_ip_requests r
  WHERE r.id=target_request_id AND r.creator_profile_id=app.creator_current_human_id()
$$;

REVOKE ALL ON FUNCTION app.creator_upload_intent_json(uuid) FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;
REVOKE ALL ON FUNCTION public.creator_reserve_reference_upload(uuid,uuid,text,integer,timestamptz),public.creator_get_reference_upload(uuid,uuid),public.creator_register_reserved_reference(uuid,uuid,text,integer,integer,integer),public.creator_get_request(uuid),public.creator_register_reference(uuid,uuid,text,integer,integer) FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;
GRANT EXECUTE ON FUNCTION public.creator_reserve_reference_upload(uuid,uuid,text,integer,timestamptz),public.creator_get_reference_upload(uuid,uuid),public.creator_register_reserved_reference(uuid,uuid,text,integer,integer,integer),public.creator_get_request(uuid) TO aifans_authenticated;
