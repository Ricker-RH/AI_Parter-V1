-- A logout also invalidates unused tickets. The shared owner lock orders ticket
-- redemption and revocation; checking only existing session rows is insufficient.
CREATE TABLE public.realtime_revocation_epochs (
 profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 revoked_before timestamptz NOT NULL
);
ALTER TABLE public.realtime_revocation_epochs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realtime_revocation_epochs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.realtime_revocation_epochs FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;

CREATE FUNCTION public.redeem_realtime_session(
 session_id uuid, actor_subject text, actor_profile_id uuid,
 ticket_expiry timestamptz, session_expiry timestamptz, ticket_issued_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE checked_at timestamptz; inserted boolean;
BEGIN
 IF session_id IS NULL OR actor_profile_id IS NULL OR actor_subject IS NULL
  OR length(btrim(actor_subject))=0 OR ticket_expiry IS NULL OR session_expiry IS NULL
  OR ticket_issued_at IS NULL OR NOT isfinite(ticket_expiry) OR NOT isfinite(session_expiry)
  OR NOT isfinite(ticket_issued_at) THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor_profile_id::text,413007));
 checked_at:=clock_timestamp();
 IF ticket_issued_at>checked_at OR ticket_issued_at<checked_at-interval '65 seconds'
  OR ticket_expiry<=checked_at OR ticket_expiry>ticket_issued_at+interval '60 seconds'
  OR session_expiry<=checked_at OR session_expiry>checked_at+interval '305 seconds'
  OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=actor_profile_id
   AND p.auth_subject=actor_subject AND p.account_kind='human')
  OR EXISTS(SELECT 1 FROM public.realtime_revocation_epochs e WHERE e.profile_id=actor_profile_id
   AND ticket_issued_at<=e.revoked_before) THEN RETURN false; END IF;
 INSERT INTO public.realtime_sessions(jti,subject,profile_id,ticket_expires_at,expires_at)
 VALUES(session_id,actor_subject,actor_profile_id,ticket_expiry,session_expiry)
 ON CONFLICT(jti) DO NOTHING RETURNING true INTO inserted;
 RETURN coalesce(inserted,false);
END $$;

-- Compatibility is conservative for the original fixed-60-second ticket API.
-- New callers pass the signed JWT iat explicitly. Same-second tickets following
-- logout can be rejected until the next second because JWT iat has second precision.
CREATE OR REPLACE FUNCTION public.redeem_realtime_session(
 session_id uuid, actor_subject text, actor_profile_id uuid,
 ticket_expiry timestamptz, session_expiry timestamptz
) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT public.redeem_realtime_session(session_id,actor_subject,actor_profile_id,
  ticket_expiry,session_expiry,ticket_expiry-interval '60 seconds')
$$;

CREATE OR REPLACE FUNCTION public.revoke_own_realtime_sessions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_id uuid; affected integer; cutoff timestamptz;
BEGIN
 actor_id:=public.social_current_human_profile_id();
 IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor_id::text,413007));
 cutoff:=clock_timestamp();
 INSERT INTO public.realtime_revocation_epochs(profile_id,revoked_before) VALUES(actor_id,cutoff)
 ON CONFLICT(profile_id) DO UPDATE SET revoked_before=greatest(public.realtime_revocation_epochs.revoked_before,excluded.revoked_before);
 UPDATE public.realtime_sessions SET revoked_at=cutoff WHERE profile_id=actor_id AND revoked_at IS NULL;
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN affected;
END $$;
REVOKE ALL ON FUNCTION public.redeem_realtime_session(uuid,text,uuid,timestamptz,timestamptz,timestamptz) FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;
GRANT EXECUTE ON FUNCTION public.redeem_realtime_session(uuid,text,uuid,timestamptz,timestamptz,timestamptz) TO aifans_platform;
