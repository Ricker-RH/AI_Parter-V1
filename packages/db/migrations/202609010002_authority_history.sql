CREATE TYPE public.app_role AS ENUM ('operator');
CREATE TYPE public.audit_actor_type AS ENUM ('human', 'operator', 'system');
CREATE TYPE public.audit_source AS ENUM ('api', 'admin', 'worker');
CREATE TYPE public.audit_result AS ENUM ('succeeded', 'rejected', 'failed');
CREATE TYPE public.outbox_state AS ENUM ('pending', 'delivered', 'failed');

CREATE TABLE public.profile_roles (
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  role public.app_role NOT NULL,
  granted_by_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  PRIMARY KEY (profile_id, role)
);

CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_type public.audit_actor_type NOT NULL,
  actor_profile_id uuid REFERENCES public.profiles(id),
  action text NOT NULL CHECK (action ~ '[^[:space:]]'),
  entity_type text NOT NULL CHECK (entity_type ~ '[^[:space:]]'),
  entity_id uuid NOT NULL,
  request_id uuid,
  source_app public.audit_source NOT NULL,
  result public.audit_result NOT NULL,
  change_summary jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.business_events (
  id uuid PRIMARY KEY,
  event_name text NOT NULL CHECK (event_name ~ '^[a-z][a-z0-9_]*$'),
  schema_version smallint NOT NULL CHECK (schema_version > 0),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_profile_id uuid REFERENCES public.profiles(id),
  subject_entity_type text NOT NULL CHECK (subject_entity_type ~ '[^[:space:]]'),
  subject_entity_id uuid NOT NULL,
  request_id uuid,
  environment text NOT NULL CHECK (environment ~ '[^[:space:]]'),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.workflow_transitions (
  id uuid PRIMARY KEY,
  entity_type text NOT NULL CHECK (entity_type ~ '[^[:space:]]'),
  entity_id uuid NOT NULL,
  previous_state text,
  next_state text NOT NULL CHECK (next_state ~ '[^[:space:]]'),
  actor_profile_id uuid REFERENCES public.profiles(id),
  reason_code text,
  operator_note text,
  request_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.analytics_outbox (
  id uuid PRIMARY KEY,
  business_event_id uuid NOT NULL UNIQUE REFERENCES public.business_events(id),
  destination text NOT NULL CHECK (destination ~ '[^[:space:]]'),
  payload_version smallint NOT NULL CHECK (payload_version > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  state public.outbox_state NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  delivered_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((state = 'delivered') = (delivered_at IS NOT NULL))
);

CREATE INDEX audit_events_entity_occurred_at_idx ON public.audit_events (entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_events_actor_occurred_at_idx ON public.audit_events (actor_profile_id, occurred_at DESC);
CREATE INDEX audit_events_request_id_idx ON public.audit_events (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX business_events_name_occurred_at_idx ON public.business_events (event_name, occurred_at DESC);
CREATE INDEX business_events_actor_occurred_at_idx ON public.business_events (actor_profile_id, occurred_at DESC);
CREATE INDEX workflow_transitions_entity_occurred_at_idx ON public.workflow_transitions (entity_type, entity_id, occurred_at DESC);
CREATE INDEX analytics_outbox_pending_idx ON public.analytics_outbox (next_attempt_at, created_at) WHERE state = 'pending';

CREATE FUNCTION public.profile_roles_require_humans()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.profile_id AND account_kind = 'human')
    OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.granted_by_profile_id AND account_kind = 'human') THEN
    RAISE EXCEPTION 'operator roles require human profiles';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.reject_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE FUNCTION public.guard_analytics_outbox_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'analytics_outbox is append-only';
  END IF;

  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.business_event_id IS DISTINCT FROM NEW.business_event_id
    OR OLD.destination IS DISTINCT FROM NEW.destination
    OR OLD.payload_version IS DISTINCT FROM NEW.payload_version
    OR OLD.payload IS DISTINCT FROM NEW.payload
    OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'analytics_outbox immutable fields cannot be changed';
  END IF;

  IF OLD.state <> 'pending' THEN
    RAISE EXCEPTION 'analytics_outbox terminal rows cannot be changed';
  END IF;

  IF NEW.state = 'pending' THEN
    IF NEW.attempt_count <> OLD.attempt_count + 1
      OR NEW.next_attempt_at = OLD.next_attempt_at
      OR NEW.last_error_code IS NULL
      OR NEW.last_error_code !~ '[^[:space:]]'
      OR NEW.delivered_at IS NOT NULL THEN
      RAISE EXCEPTION 'analytics_outbox retry must advance attempt scheduling with an error code';
    END IF;
  ELSIF NEW.state = 'delivered' THEN
    IF NEW.attempt_count NOT IN (OLD.attempt_count, OLD.attempt_count + 1)
      OR NEW.delivered_at IS NULL
      OR NEW.last_error_code IS NOT NULL THEN
      RAISE EXCEPTION 'analytics_outbox delivery must record one successful attempt';
    END IF;
  ELSIF NEW.state = 'failed' THEN
    IF NEW.attempt_count NOT IN (OLD.attempt_count, OLD.attempt_count + 1)
      OR NEW.delivered_at IS NOT NULL
      OR NEW.last_error_code IS NULL
      OR NEW.last_error_code !~ '[^[:space:]]' THEN
      RAISE EXCEPTION 'analytics_outbox failure must record one permanent error';
    END IF;
  ELSE
    RAISE EXCEPTION 'analytics_outbox invalid state transition';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profile_roles_require_humans
BEFORE INSERT OR UPDATE ON public.profile_roles
FOR EACH ROW EXECUTE FUNCTION public.profile_roles_require_humans();

CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON public.audit_events
FOR EACH ROW EXECUTE FUNCTION public.reject_history_mutation();
CREATE TRIGGER business_events_append_only BEFORE UPDATE OR DELETE ON public.business_events
FOR EACH ROW EXECUTE FUNCTION public.reject_history_mutation();
CREATE TRIGGER workflow_transitions_append_only BEFORE UPDATE OR DELETE ON public.workflow_transitions
FOR EACH ROW EXECUTE FUNCTION public.reject_history_mutation();
CREATE TRIGGER analytics_outbox_guard BEFORE UPDATE OR DELETE ON public.analytics_outbox
FOR EACH ROW EXECUTE FUNCTION public.guard_analytics_outbox_mutation();

CREATE FUNCTION public.current_operator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profile_roles AS pr
    JOIN public.profiles AS p ON p.id = pr.profile_id
    WHERE pr.role = 'operator'
      AND pr.revoked_at IS NULL
      AND p.account_kind = 'human'
      AND p.auth_subject = app.current_auth_subject()
  )
$$;

ALTER TABLE public.profile_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.profile_roles, public.audit_events, public.business_events, public.workflow_transitions, public.analytics_outbox FROM PUBLIC, aifans_anon, aifans_authenticated;
REVOKE ALL ON TYPE public.app_role, public.audit_actor_type, public.audit_source, public.audit_result, public.outbox_state FROM PUBLIC;
REVOKE ALL ON FUNCTION public.profile_roles_require_humans(), public.reject_history_mutation(), public.guard_analytics_outbox_mutation(), public.current_operator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_operator() TO aifans_authenticated;
