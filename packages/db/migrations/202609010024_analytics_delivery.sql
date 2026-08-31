ALTER TABLE public.analytics_outbox
  ADD COLUMN lease_token uuid,
  ADD COLUMN lease_expires_at timestamptz,
  ADD CONSTRAINT analytics_outbox_lease_pair_check
    CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
  ADD CONSTRAINT analytics_outbox_terminal_lease_check
    CHECK (state = 'pending' OR lease_token IS NULL),
  ADD CONSTRAINT analytics_outbox_error_code_length_check
    CHECK (last_error_code IS NULL OR char_length(last_error_code) BETWEEN 1 AND 64);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aifans_analytics_delivery') THEN
    CREATE ROLE aifans_analytics_delivery NOLOGIN;
  END IF;
END
$$;

GRANT aifans_analytics_delivery TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO aifans_analytics_delivery;

DROP TRIGGER analytics_outbox_guard ON public.analytics_outbox;
DROP FUNCTION public.guard_analytics_outbox_mutation();

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

  -- Claim or release only delivery lease metadata without mutating event state.
  IF NEW.state = OLD.state
    AND NEW.attempt_count = OLD.attempt_count
    AND NEW.next_attempt_at = OLD.next_attempt_at
    AND NEW.last_error_code IS NOT DISTINCT FROM OLD.last_error_code
    AND NEW.delivered_at IS NOT DISTINCT FROM OLD.delivered_at THEN
    RETURN NEW;
  END IF;

  IF OLD.lease_token IS NOT NULL AND (NEW.lease_token IS NOT NULL OR NEW.lease_expires_at IS NOT NULL) THEN
    RAISE EXCEPTION 'analytics_outbox delivery result must release its lease';
  END IF;

  IF NEW.state = 'pending' THEN
    IF NEW.attempt_count <> OLD.attempt_count + 1
      OR NEW.next_attempt_at <= OLD.next_attempt_at
      OR NEW.last_error_code IS NULL
      OR NEW.last_error_code !~ '[^[:space:]]'
      OR NEW.delivered_at IS NOT NULL THEN
      RAISE EXCEPTION 'analytics_outbox retry must advance attempt scheduling with an error code';
    END IF;
  ELSIF NEW.state = 'delivered' THEN
    IF NEW.attempt_count NOT IN (OLD.attempt_count, OLD.attempt_count + 1)
      OR (OLD.lease_token IS NOT NULL AND NEW.attempt_count <> OLD.attempt_count + 1)
      OR NEW.delivered_at IS NULL
      OR NEW.last_error_code IS NOT NULL THEN
      RAISE EXCEPTION 'analytics_outbox delivery must record one successful attempt';
    END IF;
  ELSIF NEW.state = 'failed' THEN
    IF NEW.attempt_count NOT IN (OLD.attempt_count, OLD.attempt_count + 1)
      OR (OLD.lease_token IS NOT NULL AND NEW.attempt_count <> OLD.attempt_count + 1)
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

CREATE TRIGGER analytics_outbox_guard BEFORE UPDATE OR DELETE ON public.analytics_outbox
FOR EACH ROW EXECUTE FUNCTION public.guard_analytics_outbox_mutation();

CREATE FUNCTION public.claim_analytics_outbox(
  requested_lease_token uuid,
  requested_limit integer,
  requested_lease_seconds integer
)
RETURNS TABLE(id uuid, event_id text, attempt_count integer, occurred_at timestamptz, payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF requested_lease_token IS NULL
    OR requested_limit NOT BETWEEN 1 AND 100
    OR requested_lease_seconds NOT BETWEEN 1 AND 3600 THEN
    RAISE EXCEPTION 'invalid analytics claim bounds';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT candidate.id
    FROM public.analytics_outbox AS candidate
    WHERE candidate.destination = 'posthog'
      AND candidate.state = 'pending'
      AND candidate.next_attempt_at <= statement_timestamp()
      AND (candidate.lease_expires_at IS NULL OR candidate.lease_expires_at <= statement_timestamp())
    ORDER BY candidate.next_attempt_at, candidate.created_at, candidate.id
    LIMIT requested_limit
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.analytics_outbox AS target
    SET lease_token = requested_lease_token,
        lease_expires_at = statement_timestamp() + make_interval(secs => requested_lease_seconds)
    FROM candidates
    WHERE target.id = candidates.id
    RETURNING target.id, target.business_event_id, target.attempt_count, target.payload
  )
  SELECT claimed.id, claimed.payload->>'event_id', claimed.attempt_count, event.occurred_at, claimed.payload
  FROM claimed
  JOIN public.business_events AS event ON event.id = claimed.business_event_id
  ORDER BY claimed.id;
END;
$$;

CREATE FUNCTION public.acknowledge_analytics_outbox(requested_id uuid, requested_lease_token uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH updated AS (
    UPDATE public.analytics_outbox
    SET state = 'delivered',
        attempt_count = attempt_count + 1,
        delivered_at = clock_timestamp(),
        last_error_code = NULL,
        lease_token = NULL,
        lease_expires_at = NULL
    WHERE id = requested_id AND state = 'pending' AND lease_token = requested_lease_token
      AND lease_expires_at > statement_timestamp()
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM updated)
$$;

CREATE FUNCTION public.retry_analytics_outbox(
  requested_id uuid,
  requested_lease_token uuid,
  requested_error_code text,
  requested_retry_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE changed boolean;
BEGIN
  IF requested_error_code IS NULL OR requested_error_code !~ '^[a-z][a-z0-9_]{0,63}$'
    OR requested_retry_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION 'invalid analytics retry metadata';
  END IF;
  WITH updated AS (
    UPDATE public.analytics_outbox
    SET attempt_count = attempt_count + 1,
        next_attempt_at = clock_timestamp() + make_interval(secs => requested_retry_seconds),
        last_error_code = requested_error_code,
        lease_token = NULL,
        lease_expires_at = NULL
    WHERE id = requested_id AND state = 'pending' AND lease_token = requested_lease_token
      AND lease_expires_at > statement_timestamp()
    RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM updated) INTO changed;
  RETURN changed;
END;
$$;

CREATE FUNCTION public.fail_analytics_outbox(
  requested_id uuid,
  requested_lease_token uuid,
  requested_error_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE changed boolean;
BEGIN
  IF requested_error_code IS NULL OR requested_error_code !~ '^[a-z][a-z0-9_]{0,63}$' THEN
    RAISE EXCEPTION 'invalid analytics failure metadata';
  END IF;
  WITH updated AS (
    UPDATE public.analytics_outbox
    SET state = 'failed',
        attempt_count = attempt_count + 1,
        last_error_code = requested_error_code,
        lease_token = NULL,
        lease_expires_at = NULL
    WHERE id = requested_id AND state = 'pending' AND lease_token = requested_lease_token
      AND lease_expires_at > statement_timestamp()
    RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM updated) INTO changed;
  RETURN changed;
END;
$$;

CREATE INDEX analytics_outbox_claim_idx
ON public.analytics_outbox (next_attempt_at, lease_expires_at, created_at, id)
WHERE destination = 'posthog' AND state = 'pending';

REVOKE ALL ON FUNCTION public.guard_analytics_outbox_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_analytics_outbox(uuid, integer, integer) FROM PUBLIC, aifans_anon, aifans_authenticated, aifans_platform;
REVOKE ALL ON FUNCTION public.acknowledge_analytics_outbox(uuid, uuid) FROM PUBLIC, aifans_anon, aifans_authenticated, aifans_platform;
REVOKE ALL ON FUNCTION public.retry_analytics_outbox(uuid, uuid, text, integer) FROM PUBLIC, aifans_anon, aifans_authenticated, aifans_platform;
REVOKE ALL ON FUNCTION public.fail_analytics_outbox(uuid, uuid, text) FROM PUBLIC, aifans_anon, aifans_authenticated, aifans_platform;
GRANT EXECUTE ON FUNCTION public.claim_analytics_outbox(uuid, integer, integer) TO aifans_analytics_delivery;
GRANT EXECUTE ON FUNCTION public.acknowledge_analytics_outbox(uuid, uuid) TO aifans_analytics_delivery;
GRANT EXECUTE ON FUNCTION public.retry_analytics_outbox(uuid, uuid, text, integer) TO aifans_analytics_delivery;
GRANT EXECUTE ON FUNCTION public.fail_analytics_outbox(uuid, uuid, text) TO aifans_analytics_delivery;
