-- HUMAN chat is deliberately separate from the existing AI chat/provider history.
CREATE TABLE public.human_social_preferences (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  profile_visibility text NOT NULL DEFAULT 'private' CHECK (profile_visibility IN ('private','public')),
  show_presence boolean NOT NULL DEFAULT false
);
CREATE TABLE public.human_dm_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  low_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  high_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_sequence bigint NOT NULL DEFAULT 0 CHECK (last_sequence BETWEEN 0 AND 9007199254740991),
  first_contact_consumed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (low_profile_id < high_profile_id),
  UNIQUE (low_profile_id,high_profile_id)
);
CREATE TABLE public.human_dm_members (
  conversation_id uuid NOT NULL REFERENCES public.human_dm_conversations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_sequence bigint NOT NULL DEFAULT 0 CHECK (read_sequence BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY (conversation_id,profile_id)
);
CREATE TABLE public.human_dm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.human_dm_conversations(id) ON DELETE CASCADE,
  sender_profile_id uuid NOT NULL,
  sequence bigint NOT NULL CHECK (sequence BETWEEN 1 AND 9007199254740991),
  content jsonb NOT NULL,
  client_request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (conversation_id,sender_profile_id) REFERENCES public.human_dm_members(conversation_id,profile_id),
  UNIQUE (conversation_id,sequence),
  UNIQUE (sender_profile_id,client_request_id),
  -- Non-text is gated until finalized attachment ownership / catalog / share checks exist.
  CHECK (coalesce(jsonb_typeof(content)='object' AND content->>'kind'='text'
    AND jsonb_typeof(content->'text')='string'
    AND char_length(content->>'text') BETWEEN 1 AND 4000
    AND content->>'text' ~ '[^[:space:]]'
    AND content - 'kind' - 'text' = '{}'::jsonb,false))
);
CREATE TABLE public.human_blocks (
  blocker_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_profile_id,blocked_profile_id),
  CHECK (blocker_profile_id <> blocked_profile_id)
);
CREATE TABLE public.human_dm_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL UNIQUE REFERENCES public.human_dm_messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.human_dm_conversations(id) ON DELETE CASCADE,
  recipient_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
CREATE INDEX human_dm_low_updated_idx ON public.human_dm_conversations(low_profile_id,updated_at DESC,id);
CREATE INDEX human_dm_high_updated_idx ON public.human_dm_conversations(high_profile_id,updated_at DESC,id);
CREATE INDEX human_dm_outbox_pending_idx ON public.human_dm_outbox(created_at,id) WHERE delivered_at IS NULL;

-- Private helper: every pair-changing command takes the same transaction lock.
-- Hash collisions serialize unrelated pairs, but never weaken correctness.
CREATE FUNCTION public.human_lock_pair(target_profile_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid;
BEGIN
  actor_id := public.social_current_human_profile_id();
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
  IF actor_id = target_profile_id OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id=target_profile_id AND account_kind='human'
  ) THEN RAISE EXCEPTION 'human target unavailable' USING ERRCODE='P0002'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(least(actor_id,target_profile_id)::text || ':' || greatest(actor_id,target_profile_id)::text, 412053));
  RETURN actor_id;
END $$;

CREATE FUNCTION public.human_follow_profile(target_profile_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; changed boolean;
BEGIN
  actor_id := public.human_lock_pair(target_profile_id);
  IF EXISTS (SELECT 1 FROM public.human_blocks WHERE
    (blocker_profile_id=actor_id AND blocked_profile_id=target_profile_id) OR
    (blocker_profile_id=target_profile_id AND blocked_profile_id=actor_id)) THEN
    RAISE EXCEPTION 'human relationship unavailable' USING ERRCODE='PDM01';
  END IF;
  INSERT INTO public.follows(follower_profile_id,followed_profile_id) VALUES(actor_id,target_profile_id)
    ON CONFLICT DO NOTHING RETURNING true INTO changed;
  RETURN coalesce(changed,false);
END $$;
CREATE FUNCTION public.human_unfollow_profile(target_profile_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; changed boolean;
BEGIN
  actor_id := public.human_lock_pair(target_profile_id);
  DELETE FROM public.follows WHERE follower_profile_id=actor_id AND followed_profile_id=target_profile_id RETURNING true INTO changed;
  RETURN coalesce(changed,false);
END $$;
CREATE FUNCTION public.human_block_profile(target_profile_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; changed boolean;
BEGIN
  actor_id := public.human_lock_pair(target_profile_id);
  INSERT INTO public.human_blocks(blocker_profile_id,blocked_profile_id) VALUES(actor_id,target_profile_id)
    ON CONFLICT DO NOTHING RETURNING true INTO changed;
  DELETE FROM public.follows WHERE
    (follower_profile_id=actor_id AND followed_profile_id=target_profile_id) OR
    (follower_profile_id=target_profile_id AND followed_profile_id=actor_id);
  -- Preserve the historical allowance exactly; neither block nor unblock resets it.
  RETURN coalesce(changed,false);
END $$;
CREATE FUNCTION public.human_unblock_profile(target_profile_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; changed boolean;
BEGIN
  actor_id := public.human_lock_pair(target_profile_id);
  DELETE FROM public.human_blocks WHERE blocker_profile_id=actor_id AND blocked_profile_id=target_profile_id RETURNING true INTO changed;
  RETURN coalesce(changed,false);
END $$;

CREATE FUNCTION public.human_dm_open(target_profile_id uuid)
RETURNS public.human_dm_conversations LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; conversation public.human_dm_conversations;
BEGIN
  actor_id := public.human_lock_pair(target_profile_id);
  IF EXISTS (SELECT 1 FROM public.human_blocks WHERE
    (blocker_profile_id=actor_id AND blocked_profile_id=target_profile_id) OR
    (blocker_profile_id=target_profile_id AND blocked_profile_id=actor_id)) THEN
    RAISE EXCEPTION 'human relationship unavailable' USING ERRCODE='PDM01';
  END IF;
  INSERT INTO public.human_dm_conversations(low_profile_id,high_profile_id)
    VALUES(least(actor_id,target_profile_id),greatest(actor_id,target_profile_id)) ON CONFLICT DO NOTHING;
  SELECT * INTO conversation FROM public.human_dm_conversations
    WHERE low_profile_id=least(actor_id,target_profile_id) AND high_profile_id=greatest(actor_id,target_profile_id);
  INSERT INTO public.human_dm_members(conversation_id,profile_id)
    VALUES(conversation.id,actor_id),(conversation.id,target_profile_id) ON CONFLICT DO NOTHING;
  RETURN conversation;
END $$;

CREATE FUNCTION public.human_dm_send(target_profile_id uuid, content jsonb, client_request_id uuid)
RETURNS public.human_dm_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; conversation public.human_dm_conversations; message public.human_dm_messages; mutual boolean;
BEGIN
  actor_id := public.human_lock_pair(target_profile_id);
  IF client_request_id IS NULL OR content IS NULL OR NOT coalesce(
    jsonb_typeof(content)='object' AND content->>'kind'='text' AND jsonb_typeof(content->'text')='string'
    AND char_length(content->>'text') BETWEEN 1 AND 4000 AND content->>'text' ~ '[^[:space:]]'
    AND content-'kind'-'text'='{}'::jsonb,false) THEN
    RAISE EXCEPTION 'invalid or unsupported message content' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.human_blocks WHERE
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
    IF message.conversation_id<>conversation.id OR message.content<>content THEN
      RAISE EXCEPTION 'idempotency key conflict' USING ERRCODE='23505';
    END IF;
    RETURN message;
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.follows WHERE follower_profile_id=actor_id AND followed_profile_id=target_profile_id)
    AND EXISTS(SELECT 1 FROM public.follows WHERE follower_profile_id=target_profile_id AND followed_profile_id=actor_id) INTO mutual;
  IF conversation.first_contact_consumed AND NOT mutual THEN
    RAISE EXCEPTION 'mutual follow required' USING ERRCODE='PDM02';
  END IF;
  INSERT INTO public.human_dm_members(conversation_id,profile_id) VALUES(conversation.id,actor_id),(conversation.id,target_profile_id) ON CONFLICT DO NOTHING;
  UPDATE public.human_dm_conversations SET last_sequence=last_sequence+1,first_contact_consumed=true,updated_at=clock_timestamp()
    WHERE id=conversation.id RETURNING * INTO conversation;
  INSERT INTO public.human_dm_messages(conversation_id,sender_profile_id,sequence,content,client_request_id)
    VALUES(conversation.id,actor_id,conversation.last_sequence,content,client_request_id) RETURNING * INTO message;
  INSERT INTO public.human_dm_outbox(message_id,conversation_id,recipient_profile_id) VALUES(message.id,conversation.id,target_profile_id);
  RETURN message;
END $$;

CREATE FUNCTION public.human_dm_mark_read(target_conversation_id uuid, through_sequence bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; conversation public.human_dm_conversations; result bigint;
BEGIN
  actor_id := public.social_current_human_profile_id();
  SELECT * INTO conversation FROM public.human_dm_conversations WHERE id=target_conversation_id AND actor_id IN (low_profile_id,high_profile_id);
  IF NOT FOUND OR actor_id IS NULL THEN RAISE EXCEPTION 'conversation unavailable' USING ERRCODE='42501'; END IF;
  IF through_sequence IS NULL OR through_sequence<0 OR through_sequence>conversation.last_sequence THEN
    RAISE EXCEPTION 'invalid read sequence' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.human_dm_members(conversation_id,profile_id,read_sequence) VALUES(conversation.id,actor_id,through_sequence)
    ON CONFLICT (conversation_id,profile_id) DO UPDATE SET read_sequence=greatest(public.human_dm_members.read_sequence,excluded.read_sequence)
    RETURNING read_sequence INTO result;
  RETURN result;
END $$;
CREATE FUNCTION public.human_set_preferences(profile_visibility text, show_presence boolean)
RETURNS public.human_social_preferences LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor_id uuid; result public.human_social_preferences;
BEGIN
  actor_id := public.social_current_human_profile_id();
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.human_social_preferences(profile_id,profile_visibility,show_presence) VALUES(actor_id,profile_visibility,show_presence)
    ON CONFLICT (profile_id) DO UPDATE SET profile_visibility=excluded.profile_visibility,show_presence=excluded.show_presence RETURNING * INTO result;
  RETURN result;
END $$;

ALTER TABLE public.human_social_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.human_social_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.human_dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.human_dm_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.human_dm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.human_dm_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.human_dm_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.human_dm_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.human_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.human_blocks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.human_dm_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.human_dm_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY human_preferences_owner_read ON public.human_social_preferences FOR SELECT TO aifans_authenticated USING (profile_id=public.current_profile_id());
CREATE POLICY human_conversations_participant_read ON public.human_dm_conversations FOR SELECT TO aifans_authenticated USING (public.current_profile_id() IN (low_profile_id,high_profile_id));
CREATE POLICY human_messages_participant_read ON public.human_dm_messages FOR SELECT TO aifans_authenticated USING (EXISTS(SELECT 1 FROM public.human_dm_conversations c WHERE c.id=conversation_id));
CREATE POLICY human_members_participant_read ON public.human_dm_members FOR SELECT TO aifans_authenticated USING (EXISTS(SELECT 1 FROM public.human_dm_conversations c WHERE c.id=conversation_id));
CREATE POLICY human_blocks_owner_read ON public.human_blocks FOR SELECT TO aifans_authenticated USING (blocker_profile_id=public.current_profile_id());
-- Outbox has no client policy or grants; only a trusted delivery worker may consume it.
REVOKE ALL ON TABLE public.human_social_preferences,public.human_dm_conversations,public.human_dm_messages,public.human_dm_members,public.human_blocks,public.human_dm_outbox FROM PUBLIC,aifans_anon,aifans_authenticated;
GRANT SELECT ON public.human_social_preferences,public.human_dm_conversations,public.human_dm_messages,public.human_dm_members,public.human_blocks TO aifans_authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.follows FROM PUBLIC,aifans_anon,aifans_authenticated;
REVOKE ALL ON FUNCTION public.human_lock_pair(uuid),public.human_follow_profile(uuid),public.human_unfollow_profile(uuid),public.human_block_profile(uuid),public.human_unblock_profile(uuid),public.human_dm_send(uuid,jsonb,uuid),public.human_dm_mark_read(uuid,bigint),public.human_set_preferences(text,boolean) FROM PUBLIC,aifans_anon,aifans_authenticated;
GRANT EXECUTE ON FUNCTION public.human_follow_profile(uuid),public.human_unfollow_profile(uuid),public.human_block_profile(uuid),public.human_unblock_profile(uuid),public.human_dm_send(uuid,jsonb,uuid),public.human_dm_mark_read(uuid,bigint),public.human_set_preferences(text,boolean) TO aifans_authenticated;
REVOKE ALL ON FUNCTION public.human_dm_open(uuid) FROM PUBLIC,aifans_anon,aifans_authenticated;
GRANT EXECUTE ON FUNCTION public.human_dm_open(uuid) TO aifans_authenticated;
