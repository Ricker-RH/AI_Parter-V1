DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aifans_rate_limiter') THEN
    CREATE ROLE aifans_rate_limiter NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

GRANT aifans_rate_limiter TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO aifans_rate_limiter;

CREATE TABLE public.rate_limit_buckets (
  route_policy text NOT NULL CHECK (route_policy IN ('chat_send','comment_create','social_mutation','creator_mutation','admin_mutation','auth_attempt')),
  identifier_hash text NOT NULL CHECK (identifier_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL,
  hit_count integer NOT NULL CHECK (hit_count BETWEEN 1 AND 121),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(route_policy,identifier_hash,window_started_at),
  CHECK (expires_at>window_started_at)
);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_buckets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_buckets FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform,aifans_rate_limiter;

CREATE FUNCTION public.consume_rate_limit(requested_policy text,requested_identifier_hash text)
RETURNS TABLE(allowed boolean,remaining integer,retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  policy_limit integer;
  current_window timestamptz:=date_trunc('minute',statement_timestamp());
  window_end timestamptz;
  consumed_hits integer;
BEGIN
  policy_limit:=CASE requested_policy
    WHEN 'auth_attempt' THEN 10
    WHEN 'chat_send' THEN 20
    WHEN 'comment_create' THEN 30
    WHEN 'creator_mutation' THEN 30
    WHEN 'admin_mutation' THEN 60
    WHEN 'social_mutation' THEN 120
    ELSE NULL
  END;
  IF policy_limit IS NULL OR requested_identifier_hash IS NULL OR requested_identifier_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid rate limit request';
  END IF;
  window_end:=current_window+interval '1 minute';

  DELETE FROM public.rate_limit_buckets WHERE ctid IN (
    SELECT ctid FROM public.rate_limit_buckets WHERE expires_at<=statement_timestamp() LIMIT 100
  );

  INSERT INTO public.rate_limit_buckets(route_policy,identifier_hash,window_started_at,hit_count,expires_at)
  VALUES(requested_policy,requested_identifier_hash,current_window,1,window_end+interval '5 minutes')
  ON CONFLICT(route_policy,identifier_hash,window_started_at) DO UPDATE
    SET hit_count=LEAST(public.rate_limit_buckets.hit_count+1,policy_limit+1)
  RETURNING hit_count INTO consumed_hits;

  RETURN QUERY SELECT consumed_hits<=policy_limit,GREATEST(policy_limit-consumed_hits,0),GREATEST(1,CEIL(EXTRACT(epoch FROM window_end-statement_timestamp()))::integer);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text,text) FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text,text) TO aifans_rate_limiter;
