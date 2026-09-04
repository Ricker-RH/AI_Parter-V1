-- AI conversations belong to one human. Human follow/presence rules do not
-- authorize or describe AI conversations; an unexpired durable session is mandatory.
CREATE FUNCTION public.authorize_ai_realtime_session(session_id uuid,actor_subject text,actor_profile_id uuid,target_conversation_id uuid)
RETURNS TABLE(allowed boolean) LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.realtime_sessions s JOIN public.profiles p ON p.id=s.profile_id
 JOIN public.chat_conversations c ON c.human_profile_id=p.id
 WHERE s.jti=session_id AND s.subject=actor_subject AND s.profile_id=actor_profile_id
 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND p.auth_subject=actor_subject
 AND p.account_kind='human' AND c.id=target_conversation_id)
$$;

CREATE TABLE public.ai_chat_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
 conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
 generation_state text NOT NULL CHECK(generation_state IN ('generating','partial','failed','completed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 delivered_at timestamptz,
 lease_token uuid,
 lease_expires_at timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 10),
 failed_at timestamptz,
 last_error_code text CHECK(last_error_code ~ '^[a-z][a-z0-9_]{0,63}$'),
 UNIQUE(message_id,generation_state),
 CHECK((lease_token IS NULL)=(lease_expires_at IS NULL))
);
CREATE INDEX ai_realtime_claim_idx ON public.ai_chat_outbox(next_attempt_at,created_at,id) WHERE delivered_at IS NULL AND failed_at IS NULL;
ALTER TABLE public.ai_chat_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_chat_outbox FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;

CREATE FUNCTION public.enqueue_ai_generation_realtime() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.role='human' AND NEW.generation_state IS NOT NULL AND
 (TG_OP='INSERT' OR NEW.generation_state IS DISTINCT FROM OLD.generation_state) THEN
  INSERT INTO public.ai_chat_outbox(message_id,conversation_id,generation_state)
  VALUES(NEW.id,NEW.conversation_id,NEW.generation_state) ON CONFLICT(message_id,generation_state) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ai_generation_realtime AFTER INSERT OR UPDATE OF generation_state ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.enqueue_ai_generation_realtime();

CREATE FUNCTION public.reconcile_stale_ai_generations(requested_limit integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed integer;
BEGIN
 IF requested_limit IS NULL OR requested_limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'invalid reconciliation bounds' USING ERRCODE='22023'; END IF;
 -- Provider requests time out after 30 seconds. Two minutes is conservative
 -- crash recovery, not a timer that starts a new or billable provider attempt.
 WITH candidates AS (
  SELECT m.id FROM public.chat_messages m WHERE m.role='human' AND m.delivery_state='pending'
  AND m.created_at<statement_timestamp()-interval '2 minutes'
  ORDER BY m.created_at,m.id LIMIT requested_limit FOR UPDATE SKIP LOCKED
 ) UPDATE public.chat_messages m SET delivery_state='failed',generation_state='failed',generation_answer=coalesce(m.generation_answer,'')
 FROM candidates WHERE m.id=candidates.id;
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed;
END $$;

CREATE FUNCTION public.claim_ai_realtime_outbox(requested_lease_token uuid,requested_limit integer,requested_lease_seconds integer)
RETURNS TABLE(id uuid,attempt_count integer,recipient_profile_ids uuid[],event jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF requested_lease_token IS NULL OR requested_limit IS NULL OR requested_limit NOT BETWEEN 1 AND 100
 OR requested_lease_seconds IS NULL OR requested_lease_seconds NOT BETWEEN 1 AND 3600 THEN RAISE EXCEPTION 'invalid AI claim bounds' USING ERRCODE='22023'; END IF;
 RETURN QUERY WITH candidates AS (
  SELECT o.id FROM public.ai_chat_outbox o WHERE o.delivered_at IS NULL AND o.failed_at IS NULL AND o.next_attempt_at<=statement_timestamp()
  AND (o.lease_expires_at IS NULL OR o.lease_expires_at<=statement_timestamp())
  ORDER BY o.next_attempt_at,o.created_at,o.id LIMIT requested_limit FOR UPDATE SKIP LOCKED
 ), claimed AS (
  UPDATE public.ai_chat_outbox o SET failed_at=CASE WHEN o.attempt_count>=10 THEN clock_timestamp() END,
  last_error_code=CASE WHEN o.attempt_count>=10 THEN 'attempts_exhausted' ELSE o.last_error_code END,
  lease_token=CASE WHEN o.attempt_count<10 THEN requested_lease_token END,
  lease_expires_at=CASE WHEN o.attempt_count<10 THEN statement_timestamp()+make_interval(secs=>requested_lease_seconds) END,
  attempt_count=least(o.attempt_count+1,10) FROM candidates WHERE o.id=candidates.id RETURNING o.*
 ) SELECT o.id,o.attempt_count,ARRAY[c.human_profile_id],jsonb_build_object(
 'v',1,'type','ai_generation','eventId',o.id,'conversationId',o.conversation_id,'messageId',o.message_id,'state',o.generation_state,
 'occurredAt',to_char(o.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
 FROM claimed o JOIN public.chat_conversations c ON c.id=o.conversation_id
 JOIN public.chat_messages m ON m.id=o.message_id AND m.conversation_id=c.id
 WHERE o.failed_at IS NULL ORDER BY o.created_at,o.id;
END $$;

CREATE FUNCTION public.acknowledge_ai_realtime_outbox(requested_id uuid,requested_lease_token uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 WITH changed AS(UPDATE public.ai_chat_outbox SET delivered_at=clock_timestamp(),lease_token=NULL,lease_expires_at=NULL,last_error_code=NULL
 WHERE id=requested_id AND lease_token=requested_lease_token AND lease_expires_at>statement_timestamp() AND delivered_at IS NULL AND failed_at IS NULL RETURNING 1)
 SELECT EXISTS(SELECT 1 FROM changed)
$$;
CREATE FUNCTION public.retry_ai_realtime_outbox(requested_id uuid,requested_lease_token uuid,error_code text,retry_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed boolean;
BEGIN
 IF error_code IS NULL OR error_code !~ '^[a-z][a-z0-9_]{0,63}$' OR retry_seconds IS NULL OR retry_seconds NOT BETWEEN 1 AND 86400 THEN RAISE EXCEPTION 'invalid retry bounds' USING ERRCODE='22023'; END IF;
 UPDATE public.ai_chat_outbox SET lease_token=NULL,lease_expires_at=NULL,last_error_code=error_code,
 next_attempt_at=statement_timestamp()+make_interval(secs=>retry_seconds),failed_at=CASE WHEN attempt_count>=10 THEN clock_timestamp() END
 WHERE id=requested_id AND lease_token=requested_lease_token AND lease_expires_at>statement_timestamp() AND delivered_at IS NULL AND failed_at IS NULL RETURNING true INTO changed;
 RETURN coalesce(changed,false);
END $$;
CREATE FUNCTION public.fail_ai_realtime_outbox(requested_id uuid,requested_lease_token uuid,error_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed boolean;
BEGIN
 IF error_code IS NULL OR error_code !~ '^[a-z][a-z0-9_]{0,63}$' THEN RAISE EXCEPTION 'invalid failure code' USING ERRCODE='22023'; END IF;
 UPDATE public.ai_chat_outbox SET lease_token=NULL,lease_expires_at=NULL,last_error_code=error_code,failed_at=clock_timestamp()
 WHERE id=requested_id AND lease_token=requested_lease_token AND lease_expires_at>statement_timestamp() AND delivered_at IS NULL AND failed_at IS NULL RETURNING true INTO changed;
 RETURN coalesce(changed,false);
END $$;
REVOKE ALL ON FUNCTION public.authorize_ai_realtime_session(uuid,text,uuid,uuid),public.enqueue_ai_generation_realtime(),public.reconcile_stale_ai_generations(integer),public.claim_ai_realtime_outbox(uuid,integer,integer),public.acknowledge_ai_realtime_outbox(uuid,uuid),public.retry_ai_realtime_outbox(uuid,uuid,text,integer),public.fail_ai_realtime_outbox(uuid,uuid,text) FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;
GRANT EXECUTE ON FUNCTION public.authorize_ai_realtime_session(uuid,text,uuid,uuid),public.reconcile_stale_ai_generations(integer),public.claim_ai_realtime_outbox(uuid,integer,integer),public.acknowledge_ai_realtime_outbox(uuid,uuid),public.retry_ai_realtime_outbox(uuid,uuid,text,integer),public.fail_ai_realtime_outbox(uuid,uuid,text) TO aifans_platform;
