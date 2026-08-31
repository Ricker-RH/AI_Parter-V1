-- Creator-owned drafts, immutable submitted identities, and platform-only decisions.
-- All mutations cross bounded SECURITY DEFINER functions that derive the actor
-- from request.jwt.claims. Raw workflow tables remain unavailable to app roles.
-- This is forward-only: repair a deployed schema with a later migration rather
-- than dropping immutable creator history or authorization acceptance records.

CREATE TYPE public.creator_visual_type AS ENUM ('realistic', 'anime', 'hybrid');
CREATE TYPE public.creator_draft_state AS ENUM ('draft', 'submitted');
CREATE TYPE public.creator_submission_state AS ENUM ('pending_review', 'approved', 'rejected');
CREATE TYPE public.creator_reference_role AS ENUM (
  'avatar', 'cover', 'portrait', 'full_body',
  'supporting_1', 'supporting_2', 'supporting_3', 'supporting_4'
);
CREATE TYPE public.creator_request_kind AS ENUM ('change', 'unpublish', 'deletion');
CREATE TYPE public.creator_request_state AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.creator_decision_value AS ENUM ('approve', 'reject');

ALTER TABLE public.ip_profiles ADD COLUMN creator_deleted_at timestamptz;

CREATE TABLE public.creator_quotas (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id),
  ip_quota integer NOT NULL CHECK (ip_quota BETWEEN 0 AND 100),
  updated_by_profile_id uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.creator_drafts (
  id uuid PRIMARY KEY,
  creator_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  target_ip_profile_id uuid REFERENCES public.ip_profiles(profile_id),
  state public.creator_draft_state NOT NULL DEFAULT 'draft',
  username text NOT NULL CHECK (username ~ '^[a-z0-9_]{3,30}$'),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80 AND display_name ~ '[^[:space:]]'),
  short_description text NOT NULL CHECK (char_length(short_description) <= 500),
  language_codes text[] NOT NULL CHECK (cardinality(language_codes) BETWEEN 1 AND 20),
  content_themes text[] NOT NULL CHECK (cardinality(content_themes) BETWEEN 1 AND 12),
  personality text NOT NULL CHECK (char_length(personality) BETWEEN 1 AND 1000 AND personality ~ '[^[:space:]]'),
  background text NOT NULL CHECK (char_length(background) BETWEEN 1 AND 2000 AND background ~ '[^[:space:]]'),
  world text NOT NULL CHECK (char_length(world) BETWEEN 1 AND 2000 AND world ~ '[^[:space:]]'),
  values_text text NOT NULL CHECK (char_length(values_text) BETWEEN 1 AND 1000 AND values_text ~ '[^[:space:]]'),
  tone text NOT NULL CHECK (char_length(tone) BETWEEN 1 AND 500 AND tone ~ '[^[:space:]]'),
  interests text[] NOT NULL CHECK (cardinality(interests) BETWEEN 0 AND 20),
  boundaries text NOT NULL CHECK (char_length(boundaries) BETWEEN 1 AND 1000 AND boundaries ~ '[^[:space:]]'),
  relationship_style text NOT NULL CHECK (char_length(relationship_style) BETWEEN 1 AND 1000 AND relationship_style ~ '[^[:space:]]'),
  visual_type public.creator_visual_type NOT NULL,
  appearance text NOT NULL CHECK (char_length(appearance) BETWEEN 1 AND 2000 AND appearance ~ '[^[:space:]]'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, creator_profile_id)
);

CREATE TABLE public.creator_reference_assets (
  id uuid PRIMARY KEY,
  draft_id uuid NOT NULL REFERENCES public.creator_drafts(id) ON DELETE CASCADE,
  creator_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  object_key text NOT NULL CHECK (char_length(object_key) BETWEEN 1 AND 512),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  width integer NOT NULL CHECK (width BETWEEN 1 AND 16384),
  height integer NOT NULL CHECK (height BETWEEN 1 AND 16384),
  draft_role public.creator_reference_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (draft_id, draft_role),
  UNIQUE (id, draft_id)
);

CREATE TABLE public.creator_revisions (
  id uuid PRIMARY KEY,
  draft_id uuid NOT NULL,
  creator_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  version integer NOT NULL CHECK (version > 0),
  username text NOT NULL CHECK (username ~ '^[a-z0-9_]{3,30}$'),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80 AND display_name ~ '[^[:space:]]'),
  short_description text NOT NULL CHECK (char_length(short_description) <= 500),
  language_codes text[] NOT NULL CHECK (cardinality(language_codes) BETWEEN 1 AND 20),
  content_themes text[] NOT NULL CHECK (cardinality(content_themes) BETWEEN 1 AND 12),
  personality text NOT NULL,
  background text NOT NULL,
  world text NOT NULL,
  values_text text NOT NULL,
  tone text NOT NULL,
  interests text[] NOT NULL,
  boundaries text NOT NULL,
  relationship_style text NOT NULL,
  visual_type public.creator_visual_type NOT NULL,
  appearance text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (draft_id, version),
  UNIQUE (id, creator_profile_id),
  UNIQUE (id, draft_id),
  UNIQUE (id, draft_id, creator_profile_id),
  FOREIGN KEY (draft_id, creator_profile_id) REFERENCES public.creator_drafts(id, creator_profile_id)
);

ALTER TABLE public.ip_profiles
  ADD COLUMN active_creator_revision_id uuid,
  ADD CONSTRAINT ip_profiles_profile_creator_key UNIQUE (profile_id, creator_profile_id);

CREATE TABLE public.creator_revision_references (
  revision_id uuid NOT NULL REFERENCES public.creator_revisions(id),
  asset_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  role public.creator_reference_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (revision_id, role),
  UNIQUE (revision_id, asset_id),
  FOREIGN KEY (revision_id, draft_id) REFERENCES public.creator_revisions(id, draft_id),
  FOREIGN KEY (asset_id, draft_id) REFERENCES public.creator_reference_assets(id, draft_id)
);

CREATE TABLE public.creator_ip_revisions (
  ip_profile_id uuid NOT NULL REFERENCES public.ip_profiles(profile_id),
  revision_id uuid NOT NULL UNIQUE REFERENCES public.creator_revisions(id),
  creator_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (ip_profile_id, revision_id),
  FOREIGN KEY (ip_profile_id, creator_profile_id) REFERENCES public.ip_profiles(profile_id, creator_profile_id),
  FOREIGN KEY (revision_id, creator_profile_id) REFERENCES public.creator_revisions(id, creator_profile_id)
);

ALTER TABLE public.ip_profiles
  ADD CONSTRAINT ip_profiles_active_creator_revision_fk
    FOREIGN KEY (profile_id, active_creator_revision_id)
    REFERENCES public.creator_ip_revisions(ip_profile_id, revision_id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.operating_authorization_acceptances (
  id uuid PRIMARY KEY,
  draft_id uuid NOT NULL UNIQUE REFERENCES public.creator_drafts(id),
  revision_id uuid NOT NULL UNIQUE REFERENCES public.creator_revisions(id),
  creator_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  authorization_version text NOT NULL CHECK (char_length(authorization_version) BETWEEN 1 AND 100 AND authorization_version ~ '[^[:space:]]'),
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (draft_id, creator_profile_id) REFERENCES public.creator_drafts(id, creator_profile_id),
  FOREIGN KEY (revision_id, draft_id, creator_profile_id) REFERENCES public.creator_revisions(id, draft_id, creator_profile_id)
);

CREATE TABLE public.creator_submissions (
  id uuid PRIMARY KEY,
  draft_id uuid NOT NULL UNIQUE REFERENCES public.creator_drafts(id),
  revision_id uuid NOT NULL UNIQUE REFERENCES public.creator_revisions(id),
  creator_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  state public.creator_submission_state NOT NULL,
  ip_profile_id uuid UNIQUE REFERENCES public.ip_profiles(profile_id),
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_at timestamptz,
  decision_reason text CHECK (decision_reason IS NULL OR char_length(decision_reason) <= 2000),
  CHECK (
    (state = 'pending_review' AND decided_at IS NULL AND decision_reason IS NULL AND ip_profile_id IS NULL)
    OR (state = 'approved' AND decided_at IS NOT NULL AND ip_profile_id IS NOT NULL)
    OR (state = 'rejected' AND decided_at IS NOT NULL AND decision_reason IS NOT NULL AND ip_profile_id IS NULL)
  ),
  FOREIGN KEY (draft_id, creator_profile_id) REFERENCES public.creator_drafts(id, creator_profile_id),
  FOREIGN KEY (revision_id, draft_id, creator_profile_id) REFERENCES public.creator_revisions(id, draft_id, creator_profile_id)
);

CREATE TABLE public.creator_submission_decisions (
  id uuid PRIMARY KEY,
  submission_id uuid NOT NULL UNIQUE REFERENCES public.creator_submissions(id),
  decision public.creator_decision_value NOT NULL,
  decided_by_profile_id uuid REFERENCES public.profiles(id),
  reason text CHECK (reason IS NULL OR char_length(reason) <= 2000),
  request_id uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((decision = 'approve') OR (decision = 'reject' AND reason IS NOT NULL AND reason ~ '[^[:space:]]'))
);

CREATE TABLE public.creator_ip_requests (
  id uuid PRIMARY KEY,
  ip_profile_id uuid NOT NULL REFERENCES public.ip_profiles(profile_id),
  creator_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  kind public.creator_request_kind NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 2000 AND reason ~ '[^[:space:]]'),
  proposed_revision_id uuid REFERENCES public.creator_revisions(id),
  state public.creator_request_state NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_at timestamptz,
  decision_reason text CHECK (decision_reason IS NULL OR char_length(decision_reason) <= 2000),
  CHECK ((kind = 'change') = (proposed_revision_id IS NOT NULL)),
  CHECK (
    (state = 'pending' AND decided_at IS NULL AND decision_reason IS NULL)
    OR (state = 'approved' AND decided_at IS NOT NULL)
    OR (state = 'rejected' AND decided_at IS NOT NULL AND decision_reason IS NOT NULL)
  )
);

CREATE TABLE public.creator_request_decisions (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE REFERENCES public.creator_ip_requests(id),
  decision public.creator_decision_value NOT NULL,
  decided_by_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  reason text CHECK (reason IS NULL OR char_length(reason) <= 2000),
  correlation_id uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((decision = 'approve') OR (decision = 'reject' AND reason IS NOT NULL AND reason ~ '[^[:space:]]'))
);

CREATE INDEX creator_drafts_owner_cursor_idx ON public.creator_drafts (creator_profile_id, created_at DESC, id DESC);
CREATE INDEX creator_submissions_owner_cursor_idx ON public.creator_submissions (creator_profile_id, submitted_at DESC, id DESC);
CREATE INDEX creator_submissions_pending_cursor_idx ON public.creator_submissions (submitted_at DESC, id DESC) WHERE state = 'pending_review';
CREATE INDEX creator_ip_requests_owner_cursor_idx ON public.creator_ip_requests (creator_profile_id, created_at DESC, id DESC);
CREATE INDEX creator_ip_requests_pending_cursor_idx ON public.creator_ip_requests (created_at DESC, id DESC) WHERE state = 'pending';
CREATE UNIQUE INDEX creator_ip_requests_one_pending_idx ON public.creator_ip_requests (ip_profile_id) WHERE state = 'pending';
CREATE INDEX creator_ips_owner_cursor_idx ON public.ip_profiles (creator_profile_id, created_at DESC, profile_id DESC) WHERE source = 'creator';
CREATE INDEX creator_revision_references_asset_idx ON public.creator_revision_references (asset_id);

CREATE FUNCTION app.creator_iso(value timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT to_char(value AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

CREATE FUNCTION app.creator_cursor_iso(value timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT to_char(value AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;

CREATE FUNCTION app.creator_current_human_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id FROM public.profiles p
  WHERE p.auth_subject = app.current_auth_subject() AND p.account_kind = 'human'
$$;

CREATE FUNCTION app.creator_draft_json(target_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', d.id,
    'status', d.state,
    'username', d.username,
    'displayName', d.display_name,
    'shortDescription', d.short_description,
    'languageCodes', d.language_codes,
    'contentThemes', d.content_themes,
    'persona', jsonb_build_object(
      'personality', d.personality, 'background', d.background, 'world', d.world,
      'values', d.values_text, 'tone', d.tone, 'interests', d.interests,
      'boundaries', d.boundaries, 'relationshipStyle', d.relationship_style
    ),
    'visualType', d.visual_type,
    'appearance', d.appearance,
    'references', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', a.id, 'role', a.draft_role) ORDER BY a.draft_role)
      FROM public.creator_reference_assets a WHERE a.draft_id = d.id
    ), '[]'::jsonb),
    'createdAt', app.creator_iso(d.created_at),
    'updatedAt', app.creator_iso(d.updated_at)
  ) || CASE WHEN d.target_ip_profile_id IS NULL THEN '{}'::jsonb
       ELSE jsonb_build_object('targetIpProfileId', d.target_ip_profile_id) END
  FROM public.creator_drafts d WHERE d.id = target_id
$$;

CREATE FUNCTION app.creator_revision_json(target_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', r.id,
    'version', r.version,
    'username', r.username,
    'displayName', r.display_name,
    'shortDescription', r.short_description,
    'languageCodes', r.language_codes,
    'contentThemes', r.content_themes,
    'persona', jsonb_build_object(
      'personality', r.personality, 'background', r.background, 'world', r.world,
      'values', r.values_text, 'tone', r.tone, 'interests', r.interests,
      'boundaries', r.boundaries, 'relationshipStyle', r.relationship_style
    ),
    'visualType', r.visual_type,
    'appearance', r.appearance,
    'references', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', rr.asset_id, 'role', rr.role) ORDER BY rr.role)
      FROM public.creator_revision_references rr WHERE rr.revision_id = r.id
    ), '[]'::jsonb),
    'createdAt', app.creator_iso(r.created_at)
  )
  FROM public.creator_revisions r WHERE r.id = target_id
$$;

CREATE FUNCTION app.creator_submission_json(target_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', s.id,
    'draftId', s.draft_id,
    'revision', app.creator_revision_json(s.revision_id),
    'state', s.state,
    'ipProfileId', s.ip_profile_id,
    'submittedAt', app.creator_iso(s.submitted_at),
    'decidedAt', CASE WHEN s.decided_at IS NULL THEN NULL ELSE app.creator_iso(s.decided_at) END,
    'decisionReason', s.decision_reason
  ) FROM public.creator_submissions s WHERE s.id = target_id
$$;

CREATE FUNCTION app.creator_request_json(target_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', r.id,
    'ipProfileId', r.ip_profile_id,
    'kind', r.kind,
    'reason', r.reason,
    'state', r.state,
    'proposedRevision', CASE WHEN r.proposed_revision_id IS NULL THEN NULL ELSE app.creator_revision_json(r.proposed_revision_id) END,
    'createdAt', app.creator_iso(r.created_at),
    'decidedAt', CASE WHEN r.decided_at IS NULL THEN NULL ELSE app.creator_iso(r.decided_at) END,
    'decisionReason', r.decision_reason
  ) FROM public.creator_ip_requests r WHERE r.id = target_id
$$;

CREATE FUNCTION app.creator_ip_json(target_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', ip.profile_id,
    'username', r.username,
    'displayName', r.display_name,
    'shortDescription', r.short_description,
    'languageCodes', r.language_codes,
    'contentThemes', r.content_themes,
    'visualType', r.visual_type,
    'status', CASE
      WHEN ip.creator_deleted_at IS NOT NULL THEN 'deleted'
      WHEN ip.public_state = 'published' THEN 'public'
      ELSE ip.public_state::text
    END,
    'operationEnabled', ip.operation_enabled,
    'creator', jsonb_build_object('id', creator.id, 'username', creator.username, 'displayName', creator.display_name),
    'references', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', rr.asset_id, 'role', rr.role) ORDER BY rr.role)
      FROM public.creator_revision_references rr WHERE rr.revision_id = r.id
    ), '[]'::jsonb),
    'createdAt', app.creator_iso(ip.created_at)
  )
  FROM public.ip_profiles ip
  JOIN public.creator_revisions r ON r.id = ip.active_creator_revision_id
  JOIN public.profiles creator ON creator.id = ip.creator_profile_id
  WHERE ip.profile_id = target_id AND ip.source = 'creator'
$$;

CREATE FUNCTION app.creator_validate_identity(
  requested_username text, requested_display_name text, requested_short_description text,
  requested_language_codes text[], requested_content_themes text[],
  requested_personality text, requested_background text, requested_world text,
  requested_values text, requested_tone text, requested_interests text[],
  requested_boundaries text, requested_relationship_style text,
  requested_visual_type public.creator_visual_type, requested_appearance text
)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF requested_username IS NULL OR requested_username !~ '^[a-z0-9_]{3,30}$'
    OR requested_display_name IS NULL OR char_length(requested_display_name) NOT BETWEEN 1 AND 80 OR requested_display_name !~ '[^[:space:]]'
    OR requested_short_description IS NULL OR char_length(requested_short_description) > 500
    OR requested_language_codes IS NULL OR cardinality(requested_language_codes) NOT BETWEEN 1 AND 20
    OR EXISTS (SELECT 1 FROM unnest(requested_language_codes) value WHERE value IS NULL OR value NOT IN ('en', 'zh-CN'))
    OR (SELECT count(*) FROM unnest(requested_language_codes) value) <> (SELECT count(DISTINCT value) FROM unnest(requested_language_codes) value)
    OR requested_content_themes IS NULL OR cardinality(requested_content_themes) NOT BETWEEN 1 AND 12
    OR EXISTS (SELECT 1 FROM unnest(requested_content_themes) value WHERE value IS NULL OR char_length(btrim(value)) NOT BETWEEN 1 AND 80)
    OR (SELECT count(*) FROM unnest(requested_content_themes) value) <> (SELECT count(DISTINCT value) FROM unnest(requested_content_themes) value)
    OR requested_interests IS NULL OR cardinality(requested_interests) NOT BETWEEN 0 AND 20
    OR EXISTS (SELECT 1 FROM unnest(requested_interests) value WHERE value IS NULL OR char_length(btrim(value)) NOT BETWEEN 1 AND 80)
    OR (SELECT count(*) FROM unnest(requested_interests) value) <> (SELECT count(DISTINCT value) FROM unnest(requested_interests) value)
    OR requested_personality IS NULL OR char_length(requested_personality) NOT BETWEEN 1 AND 1000 OR requested_personality !~ '[^[:space:]]'
    OR requested_background IS NULL OR char_length(requested_background) NOT BETWEEN 1 AND 2000 OR requested_background !~ '[^[:space:]]'
    OR requested_world IS NULL OR char_length(requested_world) NOT BETWEEN 1 AND 2000 OR requested_world !~ '[^[:space:]]'
    OR requested_values IS NULL OR char_length(requested_values) NOT BETWEEN 1 AND 1000 OR requested_values !~ '[^[:space:]]'
    OR requested_tone IS NULL OR char_length(requested_tone) NOT BETWEEN 1 AND 500 OR requested_tone !~ '[^[:space:]]'
    OR requested_boundaries IS NULL OR char_length(requested_boundaries) NOT BETWEEN 1 AND 1000 OR requested_boundaries !~ '[^[:space:]]'
    OR requested_relationship_style IS NULL OR char_length(requested_relationship_style) NOT BETWEEN 1 AND 1000 OR requested_relationship_style !~ '[^[:space:]]'
    OR requested_visual_type IS NULL
    OR requested_appearance IS NULL OR char_length(requested_appearance) NOT BETWEEN 1 AND 2000 OR requested_appearance !~ '[^[:space:]]'
  THEN RAISE EXCEPTION 'invalid creator identity' USING ERRCODE = '23514'; END IF;
END
$$;

CREATE FUNCTION app.creator_record_event(
  event_actor_type public.audit_actor_type,
  event_actor_profile_id uuid,
  event_action text,
  event_entity_type text,
  event_entity_id uuid,
  event_previous_state text,
  event_next_state text,
  event_reason text,
  event_request_id uuid,
  event_source public.audit_source,
  event_name text,
  event_properties jsonb DEFAULT '{}'::jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE business_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.audit_events(id,actor_type,actor_profile_id,action,entity_type,entity_id,request_id,source_app,result,change_summary)
  VALUES(gen_random_uuid(),event_actor_type,event_actor_profile_id,event_action,event_entity_type,event_entity_id,event_request_id,event_source,'succeeded',event_properties);
  INSERT INTO public.workflow_transitions(id,entity_type,entity_id,previous_state,next_state,actor_profile_id,reason_code,request_id)
  VALUES(gen_random_uuid(),event_entity_type,event_entity_id,event_previous_state,event_next_state,event_actor_profile_id,event_reason,event_request_id);
  INSERT INTO public.business_events(id,event_name,schema_version,actor_profile_id,subject_entity_type,subject_entity_id,request_id,environment,properties)
  VALUES(business_id,event_name,1,event_actor_profile_id,event_entity_type,event_entity_id,event_request_id,CASE WHEN event_source='admin' THEN 'admin' ELSE 'api' END,event_properties || jsonb_build_object('event_id',business_id,'request_id',event_request_id));
  INSERT INTO public.analytics_outbox(id,business_event_id,destination,payload_version,payload)
  VALUES(gen_random_uuid(),business_id,'posthog',1,jsonb_build_object('event_id',business_id,'event_name',event_name,'event_version',1,'request_id',event_request_id) || event_properties);
END
$$;

CREATE FUNCTION app.creator_snapshot_draft(target_draft_id uuid, target_creator_id uuid, selected_asset_ids uuid[], selected_roles public.creator_reference_role[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE revision_id uuid := gen_random_uuid(); revision_version integer;
BEGIN
  IF selected_asset_ids IS NULL OR selected_roles IS NULL
    OR cardinality(selected_asset_ids) NOT BETWEEN 5 AND 8 OR cardinality(selected_roles) <> cardinality(selected_asset_ids)
    OR (SELECT count(DISTINCT value) FROM unnest(selected_asset_ids) value) <> cardinality(selected_asset_ids)
    OR (SELECT count(DISTINCT value) FROM unnest(selected_roles) value) <> cardinality(selected_roles)
    OR NOT ARRAY['avatar','cover','portrait','full_body']::public.creator_reference_role[] <@ selected_roles
    OR NOT EXISTS (SELECT 1 FROM unnest(selected_roles) value WHERE value::text LIKE 'supporting_%')
  THEN RAISE EXCEPTION 'invalid selected reference set' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM public.creator_reference_assets a WHERE a.draft_id=target_draft_id AND a.id=ANY(selected_asset_ids)) <> cardinality(selected_asset_ids)
  THEN RAISE EXCEPTION 'selected reference not found' USING ERRCODE='P0002'; END IF;
  SELECT COALESCE(max(r.version),0)+1 INTO revision_version FROM public.creator_revisions r WHERE r.draft_id=target_draft_id;
  INSERT INTO public.creator_revisions(
    id,draft_id,creator_profile_id,version,username,display_name,short_description,language_codes,content_themes,
    personality,background,world,values_text,tone,interests,boundaries,relationship_style,visual_type,appearance
  )
  SELECT revision_id,d.id,target_creator_id,revision_version,d.username,d.display_name,d.short_description,d.language_codes,d.content_themes,
    d.personality,d.background,d.world,d.values_text,d.tone,d.interests,d.boundaries,d.relationship_style,d.visual_type,d.appearance
  FROM public.creator_drafts d WHERE d.id=target_draft_id AND d.creator_profile_id=target_creator_id AND d.state='draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'editable creator draft not found' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.creator_revision_references(revision_id,asset_id,draft_id,role)
  SELECT revision_id, pair.asset_id, target_draft_id, pair.role
  FROM unnest(selected_asset_ids, selected_roles) pair(asset_id,role);
  RETURN revision_id;
END
$$;

CREATE FUNCTION app.creator_create_live_ip(target_submission_id uuid, target_revision_id uuid, target_creator_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE live_ip_id uuid := gen_random_uuid(); live_revision_id uuid := gen_random_uuid(); revision_row public.creator_revisions%ROWTYPE;
BEGIN
  SELECT * INTO revision_row FROM public.creator_revisions r WHERE r.id=target_revision_id AND r.creator_profile_id=target_creator_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'creator revision not found' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.profiles(id,account_kind,username,display_name,bio)
  VALUES(live_ip_id,'ip',revision_row.username,revision_row.display_name,revision_row.short_description);
  INSERT INTO public.ip_profiles(profile_id,source,creator_profile_id,public_state,operation_enabled)
  VALUES(live_ip_id,'creator',target_creator_id,'draft',false);
  INSERT INTO public.ip_identity_revisions(id,ip_profile_id,version,display_name,bio,languages,created_by_profile_id)
  VALUES(live_revision_id,live_ip_id,1,revision_row.display_name,revision_row.short_description,revision_row.language_codes,target_creator_id);
  INSERT INTO public.creator_ip_revisions(ip_profile_id,revision_id,creator_profile_id)
  VALUES(live_ip_id,target_revision_id,target_creator_id);
  UPDATE public.ip_profiles SET current_identity_revision_id=live_revision_id,active_creator_revision_id=target_revision_id,public_state='published',operation_enabled=false,updated_at=clock_timestamp() WHERE profile_id=live_ip_id;
  UPDATE public.creator_submissions SET state='approved',ip_profile_id=live_ip_id,decided_at=clock_timestamp(),decision_reason=NULL WHERE id=target_submission_id;
  RETURN live_ip_id;
END
$$;

CREATE FUNCTION public.creator_create_draft(
  requested_target_ip_profile_id uuid,
  requested_username text, requested_display_name text, requested_short_description text,
  requested_language_codes text[], requested_content_themes text[],
  requested_personality text, requested_background text, requested_world text,
  requested_values text, requested_tone text, requested_interests text[],
  requested_boundaries text, requested_relationship_style text,
  requested_visual_type public.creator_visual_type, requested_appearance text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; draft_id uuid := gen_random_uuid(); quota integer;
BEGIN
  actor_id := app.creator_current_human_id();
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.profiles p WHERE p.id=actor_id AND p.creator_mode_enabled FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'creator mode required' USING ERRCODE='42501'; END IF;
  IF requested_target_ip_profile_id IS NOT NULL THEN
    PERFORM 1 FROM public.ip_profiles ip
    WHERE ip.profile_id=requested_target_ip_profile_id AND ip.source='creator'
      AND ip.creator_profile_id=actor_id AND ip.creator_deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'owned creator IP not found' USING ERRCODE='P0002'; END IF;
  END IF;
  PERFORM app.creator_validate_identity(requested_username,requested_display_name,requested_short_description,requested_language_codes,requested_content_themes,requested_personality,requested_background,requested_world,requested_values,requested_tone,requested_interests,requested_boundaries,requested_relationship_style,requested_visual_type,requested_appearance);
  SELECT COALESCE(q.ip_quota,s.default_ip_quota) INTO quota FROM public.platform_settings s LEFT JOIN public.creator_quotas q ON q.profile_id=actor_id WHERE s.setting_key='global' FOR UPDATE OF s;
  IF requested_target_ip_profile_id IS NULL AND (SELECT count(*) FROM public.creator_drafts d
    LEFT JOIN public.creator_submissions s ON s.draft_id=d.id
    LEFT JOIN public.ip_profiles ip ON ip.profile_id=s.ip_profile_id
    WHERE d.creator_profile_id=actor_id AND d.target_ip_profile_id IS NULL
      AND (d.state='draft' OR s.state='pending_review' OR (s.state='approved' AND ip.creator_deleted_at IS NULL))) >= quota
  THEN RAISE EXCEPTION 'creator IP quota exceeded' USING ERRCODE='P0001'; END IF;
  INSERT INTO public.creator_drafts(id,creator_profile_id,target_ip_profile_id,username,display_name,short_description,language_codes,content_themes,personality,background,world,values_text,tone,interests,boundaries,relationship_style,visual_type,appearance)
  VALUES(draft_id,actor_id,requested_target_ip_profile_id,requested_username,requested_display_name,requested_short_description,requested_language_codes,requested_content_themes,requested_personality,requested_background,requested_world,requested_values,requested_tone,requested_interests,requested_boundaries,requested_relationship_style,requested_visual_type,requested_appearance);
  RETURN app.creator_draft_json(draft_id);
END
$$;

CREATE FUNCTION public.creator_update_draft(
  target_draft_id uuid,
  requested_target_ip_profile_id uuid,
  requested_username text, requested_display_name text, requested_short_description text,
  requested_language_codes text[], requested_content_themes text[],
  requested_personality text, requested_background text, requested_world text,
  requested_values text, requested_tone text, requested_interests text[],
  requested_boundaries text, requested_relationship_style text,
  requested_visual_type public.creator_visual_type, requested_appearance text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid;
BEGIN
  actor_id:=app.creator_current_human_id(); IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
  IF requested_target_ip_profile_id IS NOT NULL THEN
    PERFORM 1 FROM public.ip_profiles ip
    WHERE ip.profile_id=requested_target_ip_profile_id AND ip.source='creator'
      AND ip.creator_profile_id=actor_id AND ip.creator_deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'owned creator IP not found' USING ERRCODE='P0002'; END IF;
  END IF;
  PERFORM app.creator_validate_identity(requested_username,requested_display_name,requested_short_description,requested_language_codes,requested_content_themes,requested_personality,requested_background,requested_world,requested_values,requested_tone,requested_interests,requested_boundaries,requested_relationship_style,requested_visual_type,requested_appearance);
  UPDATE public.creator_drafts SET username=requested_username,display_name=requested_display_name,short_description=requested_short_description,language_codes=requested_language_codes,content_themes=requested_content_themes,personality=requested_personality,background=requested_background,world=requested_world,values_text=requested_values,tone=requested_tone,interests=requested_interests,boundaries=requested_boundaries,relationship_style=requested_relationship_style,visual_type=requested_visual_type,appearance=requested_appearance,updated_at=clock_timestamp()
  WHERE id=target_draft_id AND creator_profile_id=actor_id AND state='draft'
    AND target_ip_profile_id IS NOT DISTINCT FROM requested_target_ip_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'editable creator draft not found' USING ERRCODE='P0002'; END IF;
  RETURN app.creator_draft_json(target_draft_id);
END
$$;

CREATE FUNCTION public.creator_delete_draft(target_draft_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; removed boolean := false;
BEGIN
  actor_id:=app.creator_current_human_id(); IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
  DELETE FROM public.creator_drafts WHERE id=target_draft_id AND creator_profile_id=actor_id AND state='draft' RETURNING true INTO removed;
  IF removed THEN PERFORM app.creator_record_event('human',actor_id,'creator_draft_deleted','creator_draft',target_draft_id,'draft','deleted','creator_delete',NULL,'api','creator_draft_deleted'); END IF;
  RETURN COALESCE(removed,false);
END
$$;

CREATE FUNCTION public.creator_get_draft(target_draft_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app.creator_draft_json(d.id) FROM public.creator_drafts d WHERE d.id=target_draft_id AND d.creator_profile_id=app.creator_current_human_id()
$$;

CREATE FUNCTION public.creator_list_drafts(after_created_at timestamptz, after_id uuid, page_limit integer)
RETURNS TABLE(value jsonb,cursor_created_at text,cursor_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app.creator_draft_json(d.id),app.creator_cursor_iso(d.created_at),d.id FROM public.creator_drafts d
  WHERE d.creator_profile_id=app.creator_current_human_id()
    AND (after_created_at IS NULL OR (d.created_at,d.id)<(after_created_at,after_id))
  ORDER BY d.created_at DESC,d.id DESC LIMIT LEAST(GREATEST(COALESCE(page_limit,51),1),51)
$$;

CREATE FUNCTION public.creator_register_reference(target_draft_id uuid, asset_id uuid, asset_content_type text, asset_width integer, asset_height integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; created boolean := false; next_role public.creator_reference_role; asset_count integer; asset_object_key text; asset_extension text;
BEGIN
  actor_id:=app.creator_current_human_id(); IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.creator_drafts d WHERE d.id=target_draft_id AND d.creator_profile_id=actor_id AND d.state='draft' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'editable creator draft not found' USING ERRCODE='P0002'; END IF;
  SELECT count(*) INTO asset_count FROM public.creator_reference_assets a WHERE a.draft_id=target_draft_id;
  IF asset_count >= 8 THEN RAISE EXCEPTION 'reference asset limit exceeded' USING ERRCODE='P0001'; END IF;
  asset_extension:=CASE asset_content_type WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' ELSE NULL END;
  IF asset_id IS NULL OR asset_extension IS NULL OR asset_width NOT BETWEEN 1 AND 16384 OR asset_height NOT BETWEEN 1 AND 16384
  THEN RAISE EXCEPTION 'invalid reference asset' USING ERRCODE='23514'; END IF;
  asset_object_key:=format('private/creator/%s/%s/%s.%s',actor_id,target_draft_id,asset_id,asset_extension);
  next_role := (ARRAY['avatar','cover','portrait','full_body','supporting_1','supporting_2','supporting_3','supporting_4']::public.creator_reference_role[])[asset_count+1];
  INSERT INTO public.creator_reference_assets(id,draft_id,creator_profile_id,object_key,content_type,width,height,draft_role)
  VALUES(asset_id,target_draft_id,actor_id,asset_object_key,asset_content_type,asset_width,asset_height,next_role)
  ON CONFLICT (id) DO NOTHING RETURNING true INTO created;
  RETURN COALESCE(created,false);
END
$$;

CREATE FUNCTION public.creator_submit_draft(target_draft_id uuid, authorization_version text, selected_asset_ids uuid[], selected_roles public.creator_reference_role[], command_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; revision_id uuid; submission_id uuid:=gen_random_uuid(); requires_review boolean; live_ip_id uuid;
BEGIN
  IF command_request_id IS NULL OR authorization_version IS NULL OR char_length(btrim(authorization_version)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'authorization version and request id required' USING ERRCODE='23514'; END IF;
  actor_id:=app.creator_current_human_id(); IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.creator_drafts d WHERE d.id=target_draft_id AND d.creator_profile_id=actor_id
    AND d.target_ip_profile_id IS NULL AND d.state='draft' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'editable creator draft not found' USING ERRCODE='P0002'; END IF;
  revision_id:=app.creator_snapshot_draft(target_draft_id,actor_id,selected_asset_ids,selected_roles);
  SELECT s.creator_ip_requires_approval INTO requires_review FROM public.platform_settings s WHERE s.setting_key='global' FOR SHARE;
  INSERT INTO public.operating_authorization_acceptances(id,draft_id,revision_id,creator_profile_id,authorization_version)
  VALUES(gen_random_uuid(),target_draft_id,revision_id,actor_id,btrim(authorization_version));
  INSERT INTO public.creator_submissions(id,draft_id,revision_id,creator_profile_id,state,decided_at,ip_profile_id)
  VALUES(submission_id,target_draft_id,revision_id,actor_id,'pending_review',NULL,NULL);
  UPDATE public.creator_drafts SET state='submitted',updated_at=clock_timestamp() WHERE id=target_draft_id;
  PERFORM app.creator_record_event('human',actor_id,'creator_submission_created','creator_submission',submission_id,NULL,'pending_review','creator_submit',command_request_id,'api','creator_submission_created',jsonb_build_object('draft_id',target_draft_id));
  IF NOT requires_review THEN
    live_ip_id:=app.creator_create_live_ip(submission_id,revision_id,actor_id);
    INSERT INTO public.creator_submission_decisions(id,submission_id,decision,decided_by_profile_id,reason,request_id)
    VALUES(gen_random_uuid(),submission_id,'approve',NULL,NULL,command_request_id);
    PERFORM app.creator_record_event('system',NULL,'creator_submission_approved','creator_submission',submission_id,'pending_review','approved','auto_approval',command_request_id,'api','creator_submission_approved',jsonb_build_object('ip_profile_id',live_ip_id));
  END IF;
  RETURN app.creator_submission_json(submission_id);
END
$$;

CREATE FUNCTION public.creator_get_submission(target_submission_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app.creator_submission_json(s.id) FROM public.creator_submissions s WHERE s.id=target_submission_id AND s.creator_profile_id=app.creator_current_human_id()
$$;

CREATE FUNCTION public.creator_list_submissions(after_created_at timestamptz, after_id uuid, page_limit integer)
RETURNS TABLE(value jsonb,cursor_created_at text,cursor_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app.creator_submission_json(s.id),app.creator_cursor_iso(s.submitted_at),s.id FROM public.creator_submissions s
  WHERE s.creator_profile_id=app.creator_current_human_id()
    AND (after_created_at IS NULL OR (s.submitted_at,s.id)<(after_created_at,after_id))
  ORDER BY s.submitted_at DESC,s.id DESC LIMIT LEAST(GREATEST(COALESCE(page_limit,51),1),51)
$$;

CREATE FUNCTION public.creator_create_request(requested_ip_profile_id uuid, request_kind public.creator_request_kind, request_reason text, proposed_draft_id uuid, command_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; created_request_id uuid:=gen_random_uuid(); proposed_revision_id uuid; asset_ids uuid[]; asset_roles public.creator_reference_role[];
BEGIN
  IF command_request_id IS NULL OR request_reason IS NULL OR char_length(btrim(request_reason)) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'invalid creator request' USING ERRCODE='23514'; END IF;
  actor_id:=app.creator_current_human_id(); IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.ip_profiles ip WHERE ip.profile_id=requested_ip_profile_id AND ip.source='creator' AND ip.creator_profile_id=actor_id AND ip.creator_deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'owned creator IP not found' USING ERRCODE='P0002'; END IF;
  IF request_kind='change' THEN
    IF proposed_draft_id IS NULL THEN RAISE EXCEPTION 'change request requires proposed draft' USING ERRCODE='23514'; END IF;
    PERFORM 1 FROM public.creator_drafts d WHERE d.id=proposed_draft_id AND d.creator_profile_id=actor_id
      AND d.target_ip_profile_id=requested_ip_profile_id AND d.state='draft' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'editable proposed draft not found' USING ERRCODE='P0002'; END IF;
    SELECT array_agg(a.id ORDER BY a.draft_role),array_agg(a.draft_role ORDER BY a.draft_role) INTO asset_ids,asset_roles FROM public.creator_reference_assets a WHERE a.draft_id=proposed_draft_id;
    proposed_revision_id:=app.creator_snapshot_draft(proposed_draft_id,actor_id,asset_ids,asset_roles);
    UPDATE public.creator_drafts SET state='submitted',updated_at=clock_timestamp() WHERE id=proposed_draft_id;
  ELSIF proposed_draft_id IS NOT NULL THEN RAISE EXCEPTION 'only change requests accept proposed draft' USING ERRCODE='23514'; END IF;
  INSERT INTO public.creator_ip_requests(id,ip_profile_id,creator_profile_id,kind,reason,proposed_revision_id)
  VALUES(created_request_id,requested_ip_profile_id,actor_id,request_kind,btrim(request_reason),proposed_revision_id);
  PERFORM app.creator_record_event('human',actor_id,'creator_request_created','creator_request',created_request_id,NULL,'pending',request_kind::text,command_request_id,'api','creator_request_created',jsonb_build_object('ip_profile_id',requested_ip_profile_id,'request_kind',request_kind));
  RETURN app.creator_request_json(created_request_id);
END
$$;

CREATE FUNCTION public.creator_list_requests(after_created_at timestamptz, after_id uuid, page_limit integer)
RETURNS TABLE(value jsonb,cursor_created_at text,cursor_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app.creator_request_json(r.id),app.creator_cursor_iso(r.created_at),r.id FROM public.creator_ip_requests r
  WHERE r.creator_profile_id=app.creator_current_human_id()
    AND (after_created_at IS NULL OR (r.created_at,r.id)<(after_created_at,after_id))
  ORDER BY r.created_at DESC,r.id DESC LIMIT LEAST(GREATEST(COALESCE(page_limit,51),1),51)
$$;

CREATE FUNCTION public.creator_get_ip(target_ip_profile_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app.creator_ip_json(ip.profile_id) FROM public.ip_profiles ip
  WHERE ip.profile_id=target_ip_profile_id AND ip.source='creator'
    AND ip.creator_profile_id=app.creator_current_human_id()
$$;

CREATE FUNCTION public.creator_list_ips(after_created_at timestamptz, after_id uuid, page_limit integer)
RETURNS TABLE(value jsonb,cursor_created_at text,cursor_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app.creator_ip_json(ip.profile_id),app.creator_cursor_iso(ip.created_at),ip.profile_id
  FROM public.ip_profiles ip
  WHERE ip.source='creator' AND ip.creator_profile_id=app.creator_current_human_id()
    AND (after_created_at IS NULL OR (ip.created_at,ip.profile_id)<(after_created_at,after_id))
  ORDER BY ip.created_at DESC,ip.profile_id DESC LIMIT LEAST(GREATEST(COALESCE(page_limit,51),1),51)
$$;

CREATE FUNCTION public.creator_ip_analytics(target_ip_profile_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'ipProfileId', ip.profile_id,
    'followerCount', (SELECT count(*) FROM public.follows f WHERE f.followed_profile_id=ip.profile_id),
    'followerDelta', 0,
    'publishedPostCount', (SELECT count(*) FROM public.posts p WHERE p.author_profile_id=ip.profile_id AND p.state='published'),
    'totalLikeCount', (SELECT count(*) FROM public.post_likes l JOIN public.posts p ON p.id=l.post_id WHERE p.author_profile_id=ip.profile_id AND p.state='published'),
    'totalCommentCount', (SELECT count(*) FROM public.comments c JOIN public.posts p ON p.id=c.post_id WHERE p.author_profile_id=ip.profile_id AND p.state='published' AND c.state='published'),
    'popularPosts', COALESCE((SELECT jsonb_agg(row_value ORDER BY like_count DESC,comment_count DESC,published_at DESC) FROM (
      SELECT jsonb_build_object('postId',p.id,'likeCount',count(DISTINCT l.profile_id),'commentCount',count(DISTINCT c.id),'publishedAt',app.creator_iso(p.published_at)) row_value,
        count(DISTINCT l.profile_id) like_count,count(DISTINCT c.id) comment_count,p.published_at
      FROM public.posts p LEFT JOIN public.post_likes l ON l.post_id=p.id LEFT JOIN public.comments c ON c.post_id=p.id AND c.state='published'
      WHERE p.author_profile_id=ip.profile_id AND p.state='published' GROUP BY p.id,p.published_at ORDER BY like_count DESC,comment_count DESC,p.published_at DESC LIMIT 20
    ) ranked), '[]'::jsonb),
    'asOf', app.creator_iso(clock_timestamp())
  ) FROM public.ip_profiles ip WHERE ip.profile_id=target_ip_profile_id AND ip.source='creator' AND ip.creator_profile_id=app.creator_current_human_id()
$$;

CREATE FUNCTION app.creator_lock_operator()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operator_id uuid;
BEGIN
  SELECT p.id INTO operator_id FROM public.profiles p JOIN public.profile_roles pr ON pr.profile_id=p.id
  WHERE p.account_kind='human' AND p.auth_subject=app.current_auth_subject() AND pr.role='operator' AND pr.revoked_at IS NULL
  FOR UPDATE OF p,pr;
  IF operator_id IS NULL THEN RAISE EXCEPTION 'active human operator required' USING ERRCODE='42501'; END IF;
  RETURN operator_id;
END
$$;

CREATE FUNCTION public.platform_set_creator_quota(target_profile_id uuid, requested_quota integer)
RETURNS TABLE(profile_id uuid,ip_quota integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operator_id uuid;
BEGIN
  operator_id:=app.creator_lock_operator();
  PERFORM 1 FROM public.profiles p WHERE p.id=target_profile_id AND p.account_kind='human' FOR UPDATE;
  IF requested_quota NOT BETWEEN 0 AND 100 OR NOT FOUND THEN RAISE EXCEPTION 'invalid creator quota' USING ERRCODE='23514'; END IF;
  INSERT INTO public.creator_quotas(profile_id,ip_quota,updated_by_profile_id) VALUES(target_profile_id,requested_quota,operator_id)
  ON CONFLICT ON CONSTRAINT creator_quotas_pkey DO UPDATE SET ip_quota=EXCLUDED.ip_quota,updated_by_profile_id=operator_id,updated_at=clock_timestamp();
  PERFORM app.creator_record_event('operator',operator_id,'creator_quota_set','creator_quota',target_profile_id,NULL,requested_quota::text,'admin_set',NULL,'admin','creator_quota_set',jsonb_build_object('quota',requested_quota));
  RETURN QUERY SELECT target_profile_id,requested_quota;
END
$$;

CREATE FUNCTION public.platform_get_creator_submission(target_submission_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.creator_lock_operator();
  RETURN app.creator_submission_json(target_submission_id);
END
$$;

CREATE FUNCTION public.platform_get_creator_request(target_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.creator_lock_operator();
  RETURN app.creator_request_json(target_request_id);
END
$$;

CREATE FUNCTION public.platform_list_creator_submissions(after_created_at timestamptz, after_id uuid, page_limit integer)
RETURNS TABLE(value jsonb,cursor_created_at text,cursor_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.creator_lock_operator();
  RETURN QUERY SELECT app.creator_submission_json(s.id),app.creator_cursor_iso(s.submitted_at),s.id FROM public.creator_submissions s
  WHERE s.state='pending_review' AND (after_created_at IS NULL OR (s.submitted_at,s.id)<(after_created_at,after_id))
  ORDER BY s.submitted_at DESC,s.id DESC LIMIT LEAST(GREATEST(COALESCE(page_limit,51),1),51);
END
$$;

CREATE FUNCTION public.platform_decide_creator_submission(target_submission_id uuid, requested_decision public.creator_decision_value, requested_reason text, command_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operator_id uuid; submission_row public.creator_submissions%ROWTYPE; prior_decision public.creator_decision_value; live_ip_id uuid;
BEGIN
  IF command_request_id IS NULL OR (requested_decision='reject' AND (requested_reason IS NULL OR requested_reason !~ '[^[:space:]]' OR char_length(requested_reason)>2000)) THEN RAISE EXCEPTION 'invalid creator submission decision' USING ERRCODE='23514'; END IF;
  operator_id:=app.creator_lock_operator();
  SELECT * INTO submission_row FROM public.creator_submissions s WHERE s.id=target_submission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'creator submission not found' USING ERRCODE='P0002'; END IF;
  IF submission_row.state<>'pending_review' THEN
    SELECT d.decision INTO prior_decision FROM public.creator_submission_decisions d WHERE d.submission_id=target_submission_id;
    IF prior_decision=requested_decision THEN RETURN app.creator_submission_json(target_submission_id); END IF;
    RAISE EXCEPTION 'conflicting creator submission decision' USING ERRCODE='P0001';
  END IF;
  IF requested_decision='approve' THEN
    live_ip_id:=app.creator_create_live_ip(target_submission_id,submission_row.revision_id,submission_row.creator_profile_id);
  ELSE
    UPDATE public.creator_submissions SET state='rejected',decided_at=clock_timestamp(),decision_reason=btrim(requested_reason) WHERE id=target_submission_id;
  END IF;
  INSERT INTO public.creator_submission_decisions(id,submission_id,decision,decided_by_profile_id,reason,request_id)
  VALUES(gen_random_uuid(),target_submission_id,requested_decision,operator_id,CASE WHEN requested_decision='reject' THEN btrim(requested_reason) ELSE NULL END,command_request_id);
  PERFORM app.creator_record_event('operator',operator_id,CASE WHEN requested_decision='approve' THEN 'creator_submission_approved' ELSE 'creator_submission_rejected' END,'creator_submission',target_submission_id,'pending_review',CASE WHEN requested_decision='approve' THEN 'approved' ELSE 'rejected' END,'operator_decision',command_request_id,'admin',CASE WHEN requested_decision='approve' THEN 'creator_submission_approved' ELSE 'creator_submission_rejected' END,jsonb_build_object('ip_profile_id',live_ip_id));
  RETURN app.creator_submission_json(target_submission_id);
END
$$;

CREATE FUNCTION public.platform_list_creator_requests(after_created_at timestamptz, after_id uuid, page_limit integer)
RETURNS TABLE(value jsonb,cursor_created_at text,cursor_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.creator_lock_operator();
  RETURN QUERY SELECT app.creator_request_json(r.id),app.creator_cursor_iso(r.created_at),r.id FROM public.creator_ip_requests r
  WHERE r.state='pending' AND (after_created_at IS NULL OR (r.created_at,r.id)<(after_created_at,after_id))
  ORDER BY r.created_at DESC,r.id DESC LIMIT LEAST(GREATEST(COALESCE(page_limit,51),1),51);
END
$$;

CREATE FUNCTION public.platform_decide_creator_request(target_request_id uuid, requested_decision public.creator_decision_value, requested_reason text, command_correlation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operator_id uuid; request_row public.creator_ip_requests%ROWTYPE; request_ip_id uuid; request_creator_id uuid; prior_decision public.creator_decision_value; source_revision public.creator_revisions%ROWTYPE; new_identity_id uuid; next_version integer;
BEGIN
  IF command_correlation_id IS NULL OR (requested_decision='reject' AND (requested_reason IS NULL OR requested_reason !~ '[^[:space:]]' OR char_length(requested_reason)>2000)) THEN RAISE EXCEPTION 'invalid creator request decision' USING ERRCODE='23514'; END IF;
  operator_id:=app.creator_lock_operator();
  SELECT r.ip_profile_id,r.creator_profile_id INTO request_ip_id,request_creator_id
  FROM public.creator_ip_requests r WHERE r.id=target_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'creator request not found' USING ERRCODE='P0002'; END IF;
  PERFORM 1 FROM public.ip_profiles ip
  WHERE ip.profile_id=request_ip_id AND ip.source='creator' AND ip.creator_profile_id=request_creator_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'creator IP is in a terminal state' USING ERRCODE='P0001'; END IF;
  SELECT * INTO request_row FROM public.creator_ip_requests r
  WHERE r.id=target_request_id AND r.ip_profile_id=request_ip_id AND r.creator_profile_id=request_creator_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'creator request changed concurrently' USING ERRCODE='P0001'; END IF;
  IF request_row.state<>'pending' THEN
    SELECT d.decision INTO prior_decision FROM public.creator_request_decisions d WHERE d.request_id=target_request_id;
    IF prior_decision=requested_decision THEN RETURN app.creator_request_json(target_request_id); END IF;
    RAISE EXCEPTION 'conflicting creator request decision' USING ERRCODE='P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ip_profiles ip WHERE ip.profile_id=request_ip_id AND ip.creator_deleted_at IS NOT NULL)
  THEN RAISE EXCEPTION 'creator IP is in a terminal state' USING ERRCODE='P0001'; END IF;
  IF requested_decision='approve' THEN
    IF request_row.kind='change' THEN
      SELECT * INTO source_revision FROM public.creator_revisions r
      WHERE r.id=request_row.proposed_revision_id AND r.creator_profile_id=request_row.creator_profile_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'proposed creator revision not found' USING ERRCODE='P0002'; END IF;
      SELECT COALESCE(max(r.version),0)+1 INTO next_version FROM public.ip_identity_revisions r WHERE r.ip_profile_id=request_row.ip_profile_id;
      new_identity_id:=gen_random_uuid();
      INSERT INTO public.ip_identity_revisions(id,ip_profile_id,version,display_name,bio,languages,created_by_profile_id,previous_revision_id)
      SELECT new_identity_id,ip.profile_id,next_version,source_revision.display_name,source_revision.short_description,source_revision.language_codes,request_row.creator_profile_id,ip.current_identity_revision_id FROM public.ip_profiles ip WHERE ip.profile_id=request_row.ip_profile_id;
      INSERT INTO public.creator_ip_revisions(ip_profile_id,revision_id,creator_profile_id)
      VALUES(request_row.ip_profile_id,request_row.proposed_revision_id,request_row.creator_profile_id);
      UPDATE public.profiles SET username=source_revision.username,display_name=source_revision.display_name,bio=source_revision.short_description WHERE id=request_row.ip_profile_id;
      UPDATE public.ip_profiles SET current_identity_revision_id=new_identity_id,active_creator_revision_id=request_row.proposed_revision_id,updated_at=clock_timestamp() WHERE profile_id=request_row.ip_profile_id;
    ELSIF request_row.kind='unpublish' THEN
      UPDATE public.ip_profiles SET public_state='unpublished',operation_enabled=false,updated_at=clock_timestamp() WHERE profile_id=request_row.ip_profile_id;
    ELSE
      UPDATE public.ip_profiles SET public_state='unpublished',operation_enabled=false,creator_deleted_at=clock_timestamp(),updated_at=clock_timestamp() WHERE profile_id=request_row.ip_profile_id;
      UPDATE public.creator_ip_requests SET state='rejected',decided_at=clock_timestamp(),decision_reason='superseded by approved deletion'
      WHERE ip_profile_id=request_row.ip_profile_id AND id<>target_request_id AND state='pending';
    END IF;
    UPDATE public.creator_ip_requests SET state='approved',decided_at=clock_timestamp(),decision_reason=NULL WHERE id=target_request_id;
  ELSE
    UPDATE public.creator_ip_requests SET state='rejected',decided_at=clock_timestamp(),decision_reason=btrim(requested_reason) WHERE id=target_request_id;
  END IF;
  INSERT INTO public.creator_request_decisions(id,request_id,decision,decided_by_profile_id,reason,correlation_id)
  VALUES(gen_random_uuid(),target_request_id,requested_decision,operator_id,CASE WHEN requested_decision='reject' THEN btrim(requested_reason) ELSE NULL END,command_correlation_id);
  PERFORM app.creator_record_event('operator',operator_id,CASE WHEN requested_decision='approve' THEN 'creator_request_approved' ELSE 'creator_request_rejected' END,'creator_request',target_request_id,'pending',CASE WHEN requested_decision='approve' THEN 'approved' ELSE 'rejected' END,request_row.kind::text,command_correlation_id,'admin',CASE WHEN requested_decision='approve' THEN 'creator_request_approved' ELSE 'creator_request_rejected' END,jsonb_build_object('ip_profile_id',request_row.ip_profile_id,'request_kind',request_row.kind));
  RETURN app.creator_request_json(target_request_id);
END
$$;

CREATE FUNCTION public.guard_creator_draft_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP='DELETE' THEN IF OLD.state<>'draft' THEN RAISE EXCEPTION 'submitted creator drafts are immutable'; END IF; RETURN OLD; END IF;
  IF OLD.id IS DISTINCT FROM NEW.id OR OLD.creator_profile_id IS DISTINCT FROM NEW.creator_profile_id OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN RAISE EXCEPTION 'creator draft attribution is immutable'; END IF;
  IF OLD.state='submitted' THEN RAISE EXCEPTION 'submitted creator drafts are immutable'; END IF;
  IF NEW.state NOT IN ('draft','submitted') THEN RAISE EXCEPTION 'invalid creator draft transition'; END IF;
  RETURN NEW;
END
$$;

CREATE FUNCTION public.guard_creator_reference_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.creator_drafts d WHERE d.id=COALESCE(NEW.draft_id,OLD.draft_id) AND d.state='submitted') THEN RAISE EXCEPTION 'submitted creator references are immutable'; END IF;
  RETURN COALESCE(NEW,OLD);
END
$$;

CREATE TRIGGER creator_drafts_guard BEFORE UPDATE OR DELETE ON public.creator_drafts FOR EACH ROW EXECUTE FUNCTION public.guard_creator_draft_mutation();
CREATE TRIGGER creator_reference_assets_guard BEFORE UPDATE OR DELETE ON public.creator_reference_assets FOR EACH ROW EXECUTE FUNCTION public.guard_creator_reference_mutation();
CREATE TRIGGER creator_revisions_immutable BEFORE UPDATE OR DELETE ON public.creator_revisions FOR EACH ROW EXECUTE FUNCTION public.reject_history_mutation();
CREATE TRIGGER creator_revision_references_immutable BEFORE UPDATE OR DELETE ON public.creator_revision_references FOR EACH ROW EXECUTE FUNCTION public.reject_history_mutation();
CREATE TRIGGER creator_ip_revisions_immutable BEFORE UPDATE OR DELETE ON public.creator_ip_revisions FOR EACH ROW EXECUTE FUNCTION public.reject_history_mutation();
CREATE TRIGGER operating_authorization_acceptances_immutable BEFORE UPDATE OR DELETE ON public.operating_authorization_acceptances FOR EACH ROW EXECUTE FUNCTION public.reject_history_mutation();
CREATE TRIGGER creator_submission_decisions_immutable BEFORE UPDATE OR DELETE ON public.creator_submission_decisions FOR EACH ROW EXECUTE FUNCTION public.reject_history_mutation();
CREATE TRIGGER creator_request_decisions_immutable BEFORE UPDATE OR DELETE ON public.creator_request_decisions FOR EACH ROW EXECUTE FUNCTION public.reject_history_mutation();

ALTER TABLE public.creator_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_reference_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_revision_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_ip_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operating_authorization_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_submission_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_ip_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_request_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY creator_quotas_owner_read ON public.creator_quotas FOR SELECT TO aifans_authenticated USING (profile_id=public.current_profile_id());
CREATE POLICY creator_drafts_owner_read ON public.creator_drafts FOR SELECT TO aifans_authenticated USING (creator_profile_id=public.current_profile_id());
CREATE POLICY creator_reference_assets_owner_read ON public.creator_reference_assets FOR SELECT TO aifans_authenticated USING (creator_profile_id=public.current_profile_id());
CREATE POLICY creator_revisions_owner_read ON public.creator_revisions FOR SELECT TO aifans_authenticated USING (creator_profile_id=public.current_profile_id());
CREATE POLICY creator_revision_references_owner_read ON public.creator_revision_references FOR SELECT TO aifans_authenticated USING (EXISTS (SELECT 1 FROM public.creator_revisions r WHERE r.id=revision_id AND r.creator_profile_id=public.current_profile_id()));
CREATE POLICY creator_ip_revisions_owner_read ON public.creator_ip_revisions FOR SELECT TO aifans_authenticated USING (creator_profile_id=public.current_profile_id());
CREATE POLICY operating_acceptances_owner_read ON public.operating_authorization_acceptances FOR SELECT TO aifans_authenticated USING (creator_profile_id=public.current_profile_id());
CREATE POLICY creator_submissions_owner_read ON public.creator_submissions FOR SELECT TO aifans_authenticated USING (creator_profile_id=public.current_profile_id());
CREATE POLICY creator_requests_owner_read ON public.creator_ip_requests FOR SELECT TO aifans_authenticated USING (creator_profile_id=public.current_profile_id());

REVOKE ALL ON TABLE public.creator_quotas,public.creator_drafts,public.creator_reference_assets,public.creator_revisions,public.creator_revision_references,public.creator_ip_revisions,public.operating_authorization_acceptances,public.creator_submissions,public.creator_submission_decisions,public.creator_ip_requests,public.creator_request_decisions FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;
REVOKE ALL ON TYPE public.creator_visual_type,public.creator_draft_state,public.creator_submission_state,public.creator_reference_role,public.creator_request_kind,public.creator_request_state,public.creator_decision_value FROM PUBLIC;
REVOKE ALL ON FUNCTION app.creator_iso(timestamptz),app.creator_cursor_iso(timestamptz),app.creator_current_human_id(),app.creator_draft_json(uuid),app.creator_revision_json(uuid),app.creator_submission_json(uuid),app.creator_request_json(uuid),app.creator_ip_json(uuid),app.creator_validate_identity(text,text,text,text[],text[],text,text,text,text,text,text[],text,text,public.creator_visual_type,text),app.creator_record_event(public.audit_actor_type,uuid,text,text,uuid,text,text,text,uuid,public.audit_source,text,jsonb),app.creator_snapshot_draft(uuid,uuid,uuid[],public.creator_reference_role[]),app.creator_create_live_ip(uuid,uuid,uuid),app.creator_lock_operator() FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;
REVOKE ALL ON FUNCTION public.creator_create_draft(uuid,text,text,text,text[],text[],text,text,text,text,text,text[],text,text,public.creator_visual_type,text),public.creator_update_draft(uuid,uuid,text,text,text,text[],text[],text,text,text,text,text,text[],text,text,public.creator_visual_type,text),public.creator_delete_draft(uuid),public.creator_get_draft(uuid),public.creator_list_drafts(timestamptz,uuid,integer),public.creator_register_reference(uuid,uuid,text,integer,integer),public.creator_submit_draft(uuid,text,uuid[],public.creator_reference_role[],uuid),public.creator_get_submission(uuid),public.creator_list_submissions(timestamptz,uuid,integer),public.creator_create_request(uuid,public.creator_request_kind,text,uuid,uuid),public.creator_list_requests(timestamptz,uuid,integer),public.creator_get_ip(uuid),public.creator_list_ips(timestamptz,uuid,integer),public.creator_ip_analytics(uuid),public.platform_set_creator_quota(uuid,integer),public.platform_get_creator_submission(uuid),public.platform_get_creator_request(uuid),public.platform_list_creator_submissions(timestamptz,uuid,integer),public.platform_decide_creator_submission(uuid,public.creator_decision_value,text,uuid),public.platform_list_creator_requests(timestamptz,uuid,integer),public.platform_decide_creator_request(uuid,public.creator_decision_value,text,uuid),public.guard_creator_draft_mutation(),public.guard_creator_reference_mutation() FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;
GRANT EXECUTE ON FUNCTION public.creator_create_draft(uuid,text,text,text,text[],text[],text,text,text,text,text,text[],text,text,public.creator_visual_type,text),public.creator_update_draft(uuid,uuid,text,text,text,text[],text[],text,text,text,text,text,text[],text,text,public.creator_visual_type,text),public.creator_delete_draft(uuid),public.creator_get_draft(uuid),public.creator_list_drafts(timestamptz,uuid,integer),public.creator_register_reference(uuid,uuid,text,integer,integer),public.creator_submit_draft(uuid,text,uuid[],public.creator_reference_role[],uuid),public.creator_get_submission(uuid),public.creator_list_submissions(timestamptz,uuid,integer),public.creator_create_request(uuid,public.creator_request_kind,text,uuid,uuid),public.creator_list_requests(timestamptz,uuid,integer),public.creator_get_ip(uuid),public.creator_list_ips(timestamptz,uuid,integer),public.creator_ip_analytics(uuid) TO aifans_authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_creator_quota(uuid,integer),public.platform_get_creator_submission(uuid),public.platform_get_creator_request(uuid),public.platform_list_creator_submissions(timestamptz,uuid,integer),public.platform_decide_creator_submission(uuid,public.creator_decision_value,text,uuid),public.platform_list_creator_requests(timestamptz,uuid,integer),public.platform_decide_creator_request(uuid,public.creator_decision_value,text,uuid) TO aifans_platform;
