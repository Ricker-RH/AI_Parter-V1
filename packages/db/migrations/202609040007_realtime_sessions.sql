-- The primary key is also the single-use signed ticket jti. Never delete a row
-- merely because its session expired: its ticket may still be replayable.
-- Any separate retention job must wait until BOTH expirations have passed.
CREATE TABLE public.realtime_sessions (
  jti uuid PRIMARY KEY,
  subject text NOT NULL CHECK (length(btrim(subject)) > 0),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ticket_expires_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX realtime_sessions_profile_idx ON public.realtime_sessions(profile_id) WHERE revoked_at IS NULL;
ALTER TABLE public.realtime_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realtime_sessions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.realtime_sessions FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;

CREATE FUNCTION public.redeem_realtime_session(
  session_id uuid, actor_subject text, actor_profile_id uuid,
  ticket_expiry timestamptz, session_expiry timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE checked_at timestamptz := clock_timestamp(); inserted boolean;
BEGIN
  IF session_id IS NULL OR actor_subject IS NULL OR length(btrim(actor_subject)) = 0
    OR actor_profile_id IS NULL OR ticket_expiry IS NULL OR session_expiry IS NULL
    OR NOT isfinite(ticket_expiry) OR NOT isfinite(session_expiry)
    OR ticket_expiry <= checked_at OR ticket_expiry > checked_at + interval '65 seconds'
    OR session_expiry <= checked_at OR session_expiry > checked_at + interval '305 seconds'
    OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=actor_profile_id
      AND p.auth_subject=actor_subject AND p.account_kind='human') THEN
    RETURN false;
  END IF;
  INSERT INTO public.realtime_sessions(jti,subject,profile_id,ticket_expires_at,expires_at)
    VALUES(session_id,actor_subject,actor_profile_id,ticket_expiry,session_expiry)
    ON CONFLICT (jti) DO NOTHING RETURNING true INTO inserted;
  RETURN coalesce(inserted,false);
END $$;

CREATE FUNCTION public.authorize_realtime_session(
  session_id uuid, actor_subject text, actor_profile_id uuid, target_conversation_id uuid
) RETURNS TABLE(allowed boolean,presence_allowed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE peer_id uuid;
BEGIN
  allowed := false; presence_allowed := false;
  IF session_id IS NULL OR actor_subject IS NULL OR actor_profile_id IS NULL OR target_conversation_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.realtime_sessions s JOIN public.profiles p ON p.id=s.profile_id
      WHERE s.jti=session_id AND s.subject=actor_subject AND s.profile_id=actor_profile_id
      AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
      AND p.auth_subject=actor_subject AND p.account_kind='human') THEN
    RETURN NEXT; RETURN;
  END IF;
  SELECT CASE WHEN c.low_profile_id=actor_profile_id THEN c.high_profile_id ELSE c.low_profile_id END
    INTO peer_id FROM public.human_dm_conversations c
    WHERE c.id=target_conversation_id AND actor_profile_id IN (c.low_profile_id,c.high_profile_id)
      AND EXISTS(SELECT 1 FROM public.human_dm_members m WHERE m.conversation_id=c.id AND m.profile_id=actor_profile_id);
  IF peer_id IS NULL OR EXISTS (SELECT 1 FROM public.human_blocks b WHERE
    (b.blocker_profile_id=actor_profile_id AND b.blocked_profile_id=peer_id) OR
    (b.blocker_profile_id=peer_id AND b.blocked_profile_id=actor_profile_id)) THEN
    RETURN NEXT; RETURN;
  END IF;
  allowed := true;
  presence_allowed :=
    EXISTS(SELECT 1 FROM public.follows f WHERE f.follower_profile_id=actor_profile_id AND f.followed_profile_id=peer_id)
    AND EXISTS(SELECT 1 FROM public.follows f WHERE f.follower_profile_id=peer_id AND f.followed_profile_id=actor_profile_id)
    AND EXISTS(SELECT 1 FROM public.human_social_preferences p WHERE p.profile_id=actor_profile_id AND p.show_presence)
    AND EXISTS(SELECT 1 FROM public.human_social_preferences p WHERE p.profile_id=peer_id AND p.show_presence);
  RETURN NEXT;
END $$;

-- User-controlled profile identifiers are intentionally not accepted here.
CREATE FUNCTION public.revoke_own_realtime_sessions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; affected integer;
BEGIN
  actor_id := public.social_current_human_profile_id();
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
  UPDATE public.realtime_sessions SET revoked_at=clock_timestamp() WHERE profile_id=actor_id AND revoked_at IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END $$;

REVOKE ALL ON FUNCTION public.redeem_realtime_session(uuid,text,uuid,timestamptz,timestamptz),public.authorize_realtime_session(uuid,text,uuid,uuid),public.revoke_own_realtime_sessions() FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;
GRANT EXECUTE ON FUNCTION public.redeem_realtime_session(uuid,text,uuid,timestamptz,timestamptz),public.authorize_realtime_session(uuid,text,uuid,uuid) TO aifans_platform;
GRANT EXECUTE ON FUNCTION public.revoke_own_realtime_sessions() TO aifans_authenticated;
