ALTER TABLE public.chat_conversations ADD COLUMN last_read_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX chat_messages_conversation_assistant_unread_idx
  ON public.chat_messages (conversation_id, created_at)
  WHERE role='assistant' AND delivery_state='sent';

CREATE OR REPLACE FUNCTION public.guard_chat_conversation_update()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.human_profile_id IS DISTINCT FROM NEW.human_profile_id
    OR OLD.ip_profile_id IS DISTINCT FROM NEW.ip_profile_id
    OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'chat conversation identity is immutable';
  END IF;
  IF OLD.provider_conversation_id IS NOT NULL
    AND NEW.provider_conversation_id IS DISTINCT FROM OLD.provider_conversation_id THEN
    RAISE EXCEPTION 'provider_conversation_id is write-once' USING ERRCODE='23514';
  END IF;
  IF NEW.last_read_at < OLD.last_read_at THEN
    RAISE EXCEPTION 'chat read cursor cannot move backwards' USING ERRCODE='23514';
  END IF;
  IF NEW.provider_conversation_id IS NOT DISTINCT FROM OLD.provider_conversation_id
    AND NEW.last_read_at IS DISTINCT FROM OLD.last_read_at THEN
    NEW.updated_at:=OLD.updated_at;
  ELSE
    NEW.updated_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END $$;

GRANT UPDATE (last_read_at) ON public.chat_conversations TO aifans_authenticated;
