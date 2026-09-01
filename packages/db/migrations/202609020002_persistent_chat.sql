CREATE TYPE public.chat_message_role AS ENUM ('human', 'assistant');
CREATE TYPE public.chat_delivery_state AS ENUM ('pending', 'sent', 'failed');

CREATE TABLE public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  human_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ip_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  provider_conversation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_conversations_provider_conversation_id_length_check CHECK (
    provider_conversation_id IS NULL
    OR char_length(provider_conversation_id) BETWEEN 1 AND 512
  ),
  CONSTRAINT chat_conversations_human_ip_key UNIQUE (human_profile_id, ip_profile_id)
);

CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role public.chat_message_role NOT NULL,
  body text NOT NULL,
  delivery_state public.chat_delivery_state NOT NULL DEFAULT 'pending',
  client_request_id uuid,
  in_reply_to_client_request_id uuid,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_body_length_check CHECK (char_length(body) BETWEEN 1 AND 4000),
  CONSTRAINT chat_messages_provider_message_id_length_check CHECK (
    provider_message_id IS NULL
    OR char_length(provider_message_id) BETWEEN 1 AND 512
  ),
  CONSTRAINT chat_messages_role_request_link_check CHECK (
    (role = 'human' AND client_request_id IS NOT NULL AND in_reply_to_client_request_id IS NULL AND provider_message_id IS NULL)
    OR (role = 'assistant' AND client_request_id IS NULL AND in_reply_to_client_request_id IS NOT NULL AND delivery_state = 'sent')
  ),
  CONSTRAINT chat_messages_conversation_id_client_request_id_key UNIQUE (conversation_id, client_request_id),
  -- This same-conversation self-reference and unique constraint make completion idempotent:
  -- at most one assistant row may reply to each human client request.
  CONSTRAINT chat_messages_conversation_id_in_reply_to_client_request_id_key UNIQUE (conversation_id, in_reply_to_client_request_id),
  CONSTRAINT chat_messages_reply_to_human_request_fkey
    FOREIGN KEY (conversation_id, in_reply_to_client_request_id)
    REFERENCES public.chat_messages (conversation_id, client_request_id)
    ON DELETE CASCADE
);

CREATE INDEX chat_conversations_owner_updated_cursor_idx
  ON public.chat_conversations (human_profile_id, updated_at DESC, id DESC);
CREATE INDEX chat_messages_conversation_created_cursor_idx
  ON public.chat_messages (conversation_id, created_at DESC, id DESC);

CREATE FUNCTION public.guard_chat_conversation_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.human_profile_id IS DISTINCT FROM NEW.human_profile_id
    OR OLD.ip_profile_id IS DISTINCT FROM NEW.ip_profile_id
    OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'chat conversation identity is immutable';
  END IF;
  IF OLD.provider_conversation_id IS NOT NULL
    AND NEW.provider_conversation_id IS DISTINCT FROM OLD.provider_conversation_id THEN
    RAISE EXCEPTION 'provider_conversation_id is write-once' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.guard_chat_message_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.conversation_id IS DISTINCT FROM NEW.conversation_id
    OR OLD.role IS DISTINCT FROM NEW.role
    OR OLD.body IS DISTINCT FROM NEW.body
    OR OLD.client_request_id IS DISTINCT FROM NEW.client_request_id
    OR OLD.in_reply_to_client_request_id IS DISTINCT FROM NEW.in_reply_to_client_request_id
    OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'chat message identity and request linkage are immutable';
  END IF;
  IF (OLD.role = 'assistant' AND (OLD.delivery_state <> 'sent' OR NEW.delivery_state <> 'sent'))
    OR (
      OLD.role = 'human'
      AND OLD.delivery_state IS DISTINCT FROM NEW.delivery_state
      AND NOT (
        (OLD.delivery_state = 'pending' AND NEW.delivery_state IN ('sent', 'failed'))
        OR (OLD.delivery_state = 'failed' AND NEW.delivery_state = 'pending')
      )
    ) THEN
    RAISE EXCEPTION 'invalid chat message delivery transition' USING ERRCODE = '23514';
  END IF;
  IF OLD.provider_message_id IS NOT NULL
    AND NEW.provider_message_id IS DISTINCT FROM OLD.provider_message_id THEN
    RAISE EXCEPTION 'provider_message_id is write-once' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER chat_conversations_guard_update
BEFORE UPDATE ON public.chat_conversations
FOR EACH ROW EXECUTE FUNCTION public.guard_chat_conversation_update();
CREATE TRIGGER chat_messages_guard_update
BEFORE UPDATE ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.guard_chat_message_update();

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages FORCE ROW LEVEL SECURITY;

CREATE POLICY chat_conversations_owner_select
ON public.chat_conversations
FOR SELECT
TO aifans_authenticated
USING (human_profile_id = public.current_profile_id());

CREATE POLICY chat_conversations_owner_insert
ON public.chat_conversations
FOR INSERT
TO aifans_authenticated
WITH CHECK (
  human_profile_id = public.current_profile_id()
  AND public.is_public_chat_ip(ip_profile_id)
);

CREATE POLICY chat_conversations_owner_update
ON public.chat_conversations
FOR UPDATE
TO aifans_authenticated
USING (human_profile_id = public.current_profile_id())
WITH CHECK (human_profile_id = public.current_profile_id());

CREATE POLICY chat_messages_owner_select
ON public.chat_messages
FOR SELECT
TO aifans_authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.chat_conversations conversation
    WHERE conversation.id = conversation_id
      AND conversation.human_profile_id = public.current_profile_id()
  )
);

CREATE POLICY chat_messages_owner_insert
ON public.chat_messages
FOR INSERT
TO aifans_authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chat_conversations conversation
    WHERE conversation.id = conversation_id
      AND conversation.human_profile_id = public.current_profile_id()
  )
);

CREATE POLICY chat_messages_owner_update
ON public.chat_messages
FOR UPDATE
TO aifans_authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.chat_conversations conversation
    WHERE conversation.id = conversation_id
      AND conversation.human_profile_id = public.current_profile_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chat_conversations conversation
    WHERE conversation.id = conversation_id
      AND conversation.human_profile_id = public.current_profile_id()
  )
);

REVOKE ALL ON TABLE public.chat_conversations, public.chat_messages FROM PUBLIC, aifans_anon, aifans_authenticated;
REVOKE ALL ON TYPE public.chat_message_role, public.chat_delivery_state FROM PUBLIC, aifans_anon, aifans_authenticated;
REVOKE ALL ON FUNCTION public.guard_chat_conversation_update(), public.guard_chat_message_update() FROM PUBLIC, aifans_anon, aifans_authenticated;

GRANT SELECT, INSERT ON public.chat_conversations, public.chat_messages TO aifans_authenticated;
GRANT UPDATE (provider_conversation_id, updated_at) ON public.chat_conversations TO aifans_authenticated;
GRANT UPDATE (delivery_state, provider_message_id) ON public.chat_messages TO aifans_authenticated;
GRANT USAGE ON TYPE public.chat_message_role, public.chat_delivery_state TO aifans_authenticated;
