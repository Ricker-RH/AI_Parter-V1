-- Existing send transactions already append one message row; fan out that same
-- durable identity to both participants (including sender's other devices).
ALTER TABLE public.human_dm_outbox
 ALTER COLUMN message_id DROP NOT NULL,
 ADD COLUMN event_type text NOT NULL DEFAULT 'message' CHECK(event_type IN ('message','read','access_revoked')),
 ADD COLUMN read_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
 ADD COLUMN read_sequence bigint CHECK(read_sequence BETWEEN 0 AND 9007199254740991),
 ADD COLUMN lease_token uuid,
 ADD COLUMN lease_expires_at timestamptz,
 ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 10),
 ADD COLUMN failed_at timestamptz,
 ADD COLUMN last_error_code text CHECK(last_error_code ~ '^[a-z][a-z0-9_]{0,63}$'),
 ADD CONSTRAINT human_realtime_event_shape CHECK(
   (event_type='message' AND message_id IS NOT NULL AND read_profile_id IS NULL AND read_sequence IS NULL) OR
   (event_type='read' AND message_id IS NULL AND read_profile_id IS NOT NULL AND read_sequence IS NOT NULL) OR
   (event_type='access_revoked' AND message_id IS NULL AND read_profile_id IS NULL AND read_sequence IS NULL)),
 ADD CONSTRAINT human_realtime_lease_pair CHECK((lease_token IS NULL)=(lease_expires_at IS NULL));
CREATE INDEX human_realtime_claim_idx ON public.human_dm_outbox(next_attempt_at,created_at,id)
 WHERE delivered_at IS NULL AND failed_at IS NULL;

CREATE FUNCTION public.enqueue_human_read_realtime() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF (TG_OP='INSERT' AND NEW.read_sequence>0) OR (TG_OP='UPDATE' AND NEW.read_sequence>OLD.read_sequence) THEN
  INSERT INTO public.human_dm_outbox(conversation_id,recipient_profile_id,event_type,read_profile_id,read_sequence)
  SELECT c.id,CASE WHEN c.low_profile_id=NEW.profile_id THEN c.high_profile_id ELSE c.low_profile_id END,'read',NEW.profile_id,NEW.read_sequence
  FROM public.human_dm_conversations c WHERE c.id=NEW.conversation_id AND NEW.profile_id IN(c.low_profile_id,c.high_profile_id);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER human_read_realtime AFTER INSERT OR UPDATE OF read_sequence ON public.human_dm_members
 FOR EACH ROW EXECUTE FUNCTION public.enqueue_human_read_realtime();

CREATE FUNCTION public.enqueue_human_block_realtime() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.human_dm_outbox(conversation_id,recipient_profile_id,event_type)
 SELECT c.id,NEW.blocked_profile_id,'access_revoked' FROM public.human_dm_conversations c
 WHERE c.low_profile_id=least(NEW.blocker_profile_id,NEW.blocked_profile_id)
 AND c.high_profile_id=greatest(NEW.blocker_profile_id,NEW.blocked_profile_id);
 RETURN NEW;
END $$;
CREATE TRIGGER human_block_realtime AFTER INSERT ON public.human_blocks
 FOR EACH ROW EXECUTE FUNCTION public.enqueue_human_block_realtime();

CREATE FUNCTION public.claim_human_realtime_outbox(requested_lease_token uuid,requested_limit integer,requested_lease_seconds integer)
 RETURNS TABLE(id uuid,attempt_count integer,recipient_profile_ids uuid[],event jsonb)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF requested_lease_token IS NULL OR requested_limit IS NULL OR requested_limit NOT BETWEEN 1 AND 100
 OR requested_lease_seconds IS NULL OR requested_lease_seconds NOT BETWEEN 1 AND 3600 THEN
  RAISE EXCEPTION 'invalid human realtime claim bounds' USING ERRCODE='22023';
 END IF;
 RETURN QUERY WITH candidates AS (
  SELECT o.id FROM public.human_dm_outbox o
  WHERE o.delivered_at IS NULL AND o.failed_at IS NULL AND o.next_attempt_at<=statement_timestamp()
  AND (o.lease_expires_at IS NULL OR o.lease_expires_at<=statement_timestamp())
  ORDER BY o.next_attempt_at,o.created_at,o.id LIMIT requested_limit FOR UPDATE SKIP LOCKED
 ), claimed AS (
  UPDATE public.human_dm_outbox o SET
   failed_at=CASE WHEN o.attempt_count>=10 THEN clock_timestamp() END,
   last_error_code=CASE WHEN o.attempt_count>=10 THEN 'attempts_exhausted' ELSE o.last_error_code END,
   lease_token=CASE WHEN o.attempt_count<10 THEN requested_lease_token END,
   lease_expires_at=CASE WHEN o.attempt_count<10 THEN statement_timestamp()+make_interval(secs=>requested_lease_seconds) END,
   attempt_count=least(o.attempt_count+1,10)
  FROM candidates WHERE o.id=candidates.id RETURNING o.*
 ) SELECT o.id,o.attempt_count,ARRAY[c.low_profile_id,c.high_profile_id],
 jsonb_build_object('v',1,'eventId',o.id,'conversationId',o.conversation_id,'occurredAt',
 to_char(o.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'type',o.event_type) ||
 CASE o.event_type
 WHEN 'message' THEN jsonb_build_object('message',jsonb_build_object('v',1,'id',m.id,'conversationId',m.conversation_id,
  'senderProfileId',m.sender_profile_id,'clientRequestId',m.client_request_id,'sequence',m.sequence,'content',m.content,
  'createdAt',to_char(m.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))
 WHEN 'read' THEN jsonb_build_object('profileId',o.read_profile_id,'lastReadSequence',o.read_sequence)
 ELSE jsonb_build_object('reason','blocked') END
 FROM claimed o JOIN public.human_dm_conversations c ON c.id=o.conversation_id
 LEFT JOIN public.human_dm_messages m ON m.id=o.message_id AND m.conversation_id=o.conversation_id
 WHERE o.failed_at IS NULL ORDER BY o.created_at,o.id;
END $$;

CREATE FUNCTION public.acknowledge_human_realtime_outbox(requested_id uuid,requested_lease_token uuid)
 RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 WITH changed AS (UPDATE public.human_dm_outbox SET delivered_at=clock_timestamp(),lease_token=NULL,lease_expires_at=NULL,last_error_code=NULL
 WHERE id=requested_id AND lease_token=requested_lease_token AND lease_expires_at>statement_timestamp()
 AND delivered_at IS NULL AND failed_at IS NULL RETURNING 1) SELECT EXISTS(SELECT 1 FROM changed)
$$;
CREATE FUNCTION public.retry_human_realtime_outbox(requested_id uuid,requested_lease_token uuid,requested_error_code text,requested_retry_seconds integer)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed boolean;
BEGIN
 IF requested_error_code IS NULL OR requested_error_code !~ '^[a-z][a-z0-9_]{0,63}$'
 OR requested_retry_seconds IS NULL OR requested_retry_seconds NOT BETWEEN 1 AND 86400 THEN
 RAISE EXCEPTION 'invalid human realtime retry bounds' USING ERRCODE='22023'; END IF;
 WITH updated AS (UPDATE public.human_dm_outbox SET lease_token=NULL,lease_expires_at=NULL,last_error_code=requested_error_code,
 next_attempt_at=clock_timestamp()+make_interval(secs=>requested_retry_seconds),failed_at=CASE WHEN attempt_count>=10 THEN clock_timestamp() END
 WHERE id=requested_id AND lease_token=requested_lease_token AND lease_expires_at>statement_timestamp()
 AND delivered_at IS NULL AND failed_at IS NULL RETURNING 1) SELECT EXISTS(SELECT 1 FROM updated) INTO changed;
 RETURN changed;
END $$;
CREATE FUNCTION public.fail_human_realtime_outbox(requested_id uuid,requested_lease_token uuid,requested_error_code text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed boolean;
BEGIN
 IF requested_error_code IS NULL OR requested_error_code !~ '^[a-z][a-z0-9_]{0,63}$' THEN
 RAISE EXCEPTION 'invalid human realtime failure code' USING ERRCODE='22023'; END IF;
 WITH updated AS (UPDATE public.human_dm_outbox SET failed_at=clock_timestamp(),lease_token=NULL,lease_expires_at=NULL,last_error_code=requested_error_code
 WHERE id=requested_id AND lease_token=requested_lease_token AND lease_expires_at>statement_timestamp()
 AND delivered_at IS NULL AND failed_at IS NULL RETURNING 1) SELECT EXISTS(SELECT 1 FROM updated) INTO changed;
 RETURN changed;
END $$;
-- Preserve FORCE RLS and never grant direct event insertion, including platform.
REVOKE ALL ON public.human_dm_outbox FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;
REVOKE ALL ON FUNCTION public.enqueue_human_read_realtime(),public.enqueue_human_block_realtime(),
 public.claim_human_realtime_outbox(uuid,integer,integer),public.acknowledge_human_realtime_outbox(uuid,uuid),
 public.retry_human_realtime_outbox(uuid,uuid,text,integer),public.fail_human_realtime_outbox(uuid,uuid,text)
 FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;
GRANT EXECUTE ON FUNCTION public.claim_human_realtime_outbox(uuid,integer,integer),public.acknowledge_human_realtime_outbox(uuid,uuid),
 public.retry_human_realtime_outbox(uuid,uuid,text,integer),public.fail_human_realtime_outbox(uuid,uuid,text) TO aifans_platform;
