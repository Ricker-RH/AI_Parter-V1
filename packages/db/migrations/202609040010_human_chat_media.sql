-- Private, owner/pair-bound reservations. Clients can never confirm their own bytes.
CREATE TABLE public.human_dm_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 peer_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 conversation_id uuid NOT NULL REFERENCES public.human_dm_conversations(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('image','voice')),
 content_type text NOT NULL,
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 finalized_at timestamptz,
 final_content_type text,
 final_size_bytes integer CHECK(final_size_bytes BETWEEN 1 AND 10485760),
 width integer CHECK(width BETWEEN 1 AND 12000),
 height integer CHECK(height BETWEEN 1 AND 12000),
 duration_ms integer CHECK(duration_ms BETWEEN 1 AND 60000),
 message_id uuid UNIQUE REFERENCES public.human_dm_messages(id) ON DELETE CASCADE,
 CHECK(owner_profile_id<>peer_profile_id),
 CHECK((kind='image' AND content_type IN ('image/jpeg','image/png','image/webp')) OR
       (kind='voice' AND content_type IN ('audio/webm','audio/mp4'))),
 CHECK(finalized_at IS NULL OR (final_size_bytes IS NOT NULL AND
   ((kind='image' AND final_content_type='image/webp' AND width IS NOT NULL AND height IS NOT NULL AND duration_ms IS NULL) OR
    (kind='voice' AND final_content_type=content_type AND width IS NULL AND height IS NULL))))
);
CREATE INDEX human_dm_attachment_owner_pending ON public.human_dm_attachments(owner_profile_id,expires_at) WHERE message_id IS NULL;
ALTER TABLE public.human_dm_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.human_dm_attachments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.human_dm_attachments FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;

CREATE FUNCTION public.human_dm_reserve_attachment(target_profile_id uuid, requested_kind text, requested_type text, requested_bytes integer)
RETURNS public.human_dm_attachments LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_id uuid; conversation public.human_dm_conversations; result public.human_dm_attachments; mutual boolean;
BEGIN
 actor_id:=public.social_current_human_profile_id();
 IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
 -- The quota is owner-wide, not pair-wide. Always acquire this lock before
 -- the pair lock so concurrent uploads to different peers cannot both pass.
 PERFORM pg_advisory_xact_lock(hashtextextended(actor_id::text,412054));
 actor_id:=public.human_lock_pair(target_profile_id);
 SELECT * INTO conversation FROM public.human_dm_open(target_profile_id);
 SELECT EXISTS(SELECT 1 FROM public.follows WHERE follower_profile_id=actor_id AND followed_profile_id=target_profile_id)
 AND EXISTS(SELECT 1 FROM public.follows WHERE follower_profile_id=target_profile_id AND followed_profile_id=actor_id) INTO mutual;
 IF conversation.first_contact_consumed AND NOT mutual THEN RAISE EXCEPTION 'mutual follow required' USING ERRCODE='PDM02'; END IF;
 -- Bound outstanding reservations without consuming the introduction quota.
 IF (SELECT count(*) FROM public.human_dm_attachments WHERE owner_profile_id=actor_id AND message_id IS NULL AND expires_at>now())>=10 THEN
  RAISE EXCEPTION 'too many pending attachments' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.human_dm_attachments(owner_profile_id,peer_profile_id,conversation_id,kind,content_type,size_bytes)
 VALUES(actor_id,target_profile_id,conversation.id,requested_kind,requested_type,requested_bytes) RETURNING * INTO result;
 RETURN result;
END $$;

CREATE FUNCTION public.human_dm_get_attachment(target_id uuid, for_download boolean DEFAULT false)
RETURNS public.human_dm_attachments LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_id uuid; result public.human_dm_attachments;
BEGIN
 actor_id:=public.social_current_human_profile_id();
 SELECT * INTO result FROM public.human_dm_attachments WHERE id=target_id;
 IF actor_id IS NULL OR result.id IS NULL THEN RAISE EXCEPTION 'attachment unavailable' USING ERRCODE='P0002'; END IF;
 IF for_download THEN
  IF result.finalized_at IS NULL OR NOT (actor_id=result.owner_profile_id OR (actor_id=result.peer_profile_id AND result.message_id IS NOT NULL)) THEN
   RAISE EXCEPTION 'attachment unavailable' USING ERRCODE='P0002';
  END IF;
 ELSE
  IF actor_id<>result.owner_profile_id THEN RAISE EXCEPTION 'attachment unavailable' USING ERRCODE='P0002'; END IF;
  PERFORM public.human_lock_pair(result.peer_profile_id);
  IF EXISTS(SELECT 1 FROM public.human_blocks WHERE
   (blocker_profile_id=actor_id AND blocked_profile_id=result.peer_profile_id) OR
   (blocker_profile_id=result.peer_profile_id AND blocked_profile_id=actor_id)) THEN
   RAISE EXCEPTION 'human relationship unavailable' USING ERRCODE='PDM01';
  END IF;
  IF result.finalized_at IS NULL AND result.expires_at<=now() THEN RAISE EXCEPTION 'attachment expired' USING ERRCODE='22023'; END IF;
 END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.human_dm_confirm_attachment(target_id uuid, verified_type text, verified_bytes integer, verified_width integer, verified_height integer, verified_duration integer)
RETURNS public.human_dm_attachments LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.human_dm_attachments;
BEGIN
 -- Platform role still carries the verified user's subject; this command is not
 -- executable by authenticated SQL clients, unlike reservation and read.
 SELECT * INTO result FROM public.human_dm_get_attachment(target_id,false);
 SELECT * INTO result FROM public.human_dm_attachments WHERE id=target_id FOR UPDATE;
 IF result.finalized_at IS NOT NULL THEN RETURN result; END IF;
 UPDATE public.human_dm_attachments SET finalized_at=clock_timestamp(),final_content_type=verified_type,
 final_size_bytes=verified_bytes,width=verified_width,height=verified_height,duration_ms=verified_duration
 WHERE id=target_id RETURNING * INTO result;
 RETURN result;
END $$;

ALTER TABLE public.human_dm_messages DROP CONSTRAINT human_dm_messages_content_check;
ALTER TABLE public.human_dm_messages ADD CONSTRAINT human_dm_messages_content_check CHECK(coalesce(
 jsonb_typeof(content)='object' AND (
 (content->>'kind'='text' AND jsonb_typeof(content->'text')='string' AND char_length(content->>'text') BETWEEN 1 AND 4000
 AND content->>'text' ~ '[^[:space:]]' AND content-'kind'-'text'='{}'::jsonb) OR
 (content->>'kind' IN ('image','voice') AND jsonb_typeof(content->'attachmentId')='string'
 AND content->>'attachmentId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 AND content-'kind'-'attachmentId'='{}'::jsonb)),false));

CREATE OR REPLACE FUNCTION public.human_dm_send(target_profile_id uuid, content jsonb, client_request_id uuid)
RETURNS public.human_dm_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_id uuid; conversation public.human_dm_conversations; message public.human_dm_messages; mutual boolean; attachment public.human_dm_attachments;
BEGIN
 actor_id:=public.human_lock_pair(target_profile_id);
 IF client_request_id IS NULL OR content IS NULL OR NOT coalesce(jsonb_typeof(content)='object' AND (
 (content->>'kind'='text' AND jsonb_typeof(content->'text')='string' AND char_length(content->>'text') BETWEEN 1 AND 4000
 AND content->>'text' ~ '[^[:space:]]' AND content-'kind'-'text'='{}'::jsonb) OR
 (content->>'kind' IN ('image','voice') AND jsonb_typeof(content->'attachmentId')='string'
 AND content->>'attachmentId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 AND content-'kind'-'attachmentId'='{}'::jsonb)),false) THEN
  RAISE EXCEPTION 'invalid or unsupported message content' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM public.human_blocks WHERE
 (blocker_profile_id=actor_id AND blocked_profile_id=target_profile_id) OR
 (blocker_profile_id=target_profile_id AND blocked_profile_id=actor_id)) THEN
  RAISE EXCEPTION 'human relationship unavailable' USING ERRCODE='PDM01';
 END IF;
 INSERT INTO public.human_dm_conversations(low_profile_id,high_profile_id)
 VALUES(least(actor_id,target_profile_id),greatest(actor_id,target_profile_id)) ON CONFLICT DO NOTHING;
 SELECT * INTO conversation FROM public.human_dm_conversations
 WHERE low_profile_id=least(actor_id,target_profile_id) AND high_profile_id=greatest(actor_id,target_profile_id) FOR UPDATE;
 SELECT * INTO message FROM public.human_dm_messages m WHERE m.sender_profile_id=actor_id AND m.client_request_id=human_dm_send.client_request_id;
 IF FOUND THEN
  IF message.conversation_id<>conversation.id OR message.content<>content THEN RAISE EXCEPTION 'idempotency key conflict' USING ERRCODE='23505'; END IF;
  RETURN message;
 END IF;
 IF content->>'kind' IN ('image','voice') THEN
  SELECT * INTO attachment FROM public.human_dm_attachments WHERE id=(content->>'attachmentId')::uuid FOR UPDATE;
  IF attachment.id IS NULL OR attachment.owner_profile_id<>actor_id OR attachment.peer_profile_id<>target_profile_id
  OR attachment.conversation_id<>conversation.id OR attachment.kind<>content->>'kind' OR attachment.finalized_at IS NULL
  OR attachment.message_id IS NOT NULL THEN RAISE EXCEPTION 'attachment unavailable' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT EXISTS(SELECT 1 FROM public.follows WHERE follower_profile_id=actor_id AND followed_profile_id=target_profile_id)
 AND EXISTS(SELECT 1 FROM public.follows WHERE follower_profile_id=target_profile_id AND followed_profile_id=actor_id) INTO mutual;
 IF conversation.first_contact_consumed AND NOT mutual THEN RAISE EXCEPTION 'mutual follow required' USING ERRCODE='PDM02'; END IF;
 INSERT INTO public.human_dm_members(conversation_id,profile_id) VALUES(conversation.id,actor_id),(conversation.id,target_profile_id) ON CONFLICT DO NOTHING;
 UPDATE public.human_dm_conversations SET last_sequence=last_sequence+1,first_contact_consumed=true,updated_at=clock_timestamp()
 WHERE id=conversation.id RETURNING * INTO conversation;
 INSERT INTO public.human_dm_messages(conversation_id,sender_profile_id,sequence,content,client_request_id)
 VALUES(conversation.id,actor_id,conversation.last_sequence,content,client_request_id) RETURNING * INTO message;
 IF attachment.id IS NOT NULL THEN UPDATE public.human_dm_attachments SET message_id=message.id WHERE id=attachment.id; END IF;
 INSERT INTO public.human_dm_outbox(message_id,conversation_id,recipient_profile_id) VALUES(message.id,conversation.id,target_profile_id);
 RETURN message;
END $$;

REVOKE ALL ON FUNCTION public.human_dm_reserve_attachment(uuid,text,text,integer),public.human_dm_get_attachment(uuid,boolean),public.human_dm_confirm_attachment(uuid,text,integer,integer,integer,integer) FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;
GRANT EXECUTE ON FUNCTION public.human_dm_reserve_attachment(uuid,text,text,integer),public.human_dm_get_attachment(uuid,boolean) TO aifans_authenticated;
GRANT EXECUTE ON FUNCTION public.human_dm_confirm_attachment(uuid,text,integer,integer,integer,integer) TO aifans_platform;
