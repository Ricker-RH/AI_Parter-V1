-- Reuse owner-scoped chat message RLS and existing immutable request identity.
-- NULL preserves historical rows; new requests explicitly start generating.
ALTER TABLE public.chat_messages
  ADD COLUMN generation_state text,
  ADD COLUMN generation_answer text,
  ADD CONSTRAINT chat_generation_progress_check CHECK (
    (generation_state IS NULL AND generation_answer IS NULL)
    OR (role='human' AND generation_state IS NOT NULL AND generation_answer IS NOT NULL
      AND char_length(generation_answer)<=4000
      AND ((generation_state IN ('generating','partial') AND delivery_state='pending')
        OR (generation_state='failed' AND delivery_state='failed')
        OR (generation_state='completed' AND delivery_state='sent')))
  );
GRANT UPDATE (generation_state,generation_answer) ON public.chat_messages TO aifans_authenticated;
