-- Per-viewer tombstones preserve the other participant's history.
CREATE TABLE public.inbox_preferences (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('HUMAN','IP')),
  conversation_id uuid NOT NULL,
  pinned_at timestamptz,
  deleted_at timestamptz,
  deleted_sequence bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_id,kind,conversation_id)
);
ALTER TABLE public.inbox_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY inbox_preferences_owner_read ON public.inbox_preferences FOR SELECT TO aifans_authenticated
  USING (profile_id=public.current_profile_id());
GRANT SELECT ON public.inbox_preferences TO aifans_authenticated;

CREATE FUNCTION public.mutate_inbox_preference(target_kind text,target_id uuid,operation text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_id uuid; cutoff bigint := 0;
BEGIN
  actor_id := public.social_current_human_profile_id();
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
  IF operation NOT IN ('pin','unpin','delete') OR target_kind NOT IN ('HUMAN','IP') THEN
    RAISE EXCEPTION 'invalid inbox operation' USING ERRCODE='22023';
  END IF;
  IF target_kind='HUMAN' THEN
    SELECT last_sequence INTO cutoff FROM public.human_dm_conversations
      WHERE id=target_id AND actor_id IN (low_profile_id,high_profile_id) FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.chat_conversations WHERE id=target_id AND human_profile_id=actor_id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'conversation unavailable' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.inbox_preferences(profile_id,kind,conversation_id) VALUES(actor_id,target_kind,target_id)
    ON CONFLICT DO NOTHING;
  IF operation='delete' THEN
    UPDATE public.inbox_preferences SET pinned_at=NULL,deleted_at=clock_timestamp(),deleted_sequence=coalesce(cutoff,0)
      WHERE profile_id=actor_id AND kind=target_kind AND conversation_id=target_id;
    IF target_kind='HUMAN' THEN
      UPDATE public.human_dm_members SET read_sequence=greatest(read_sequence,cutoff) WHERE profile_id=actor_id AND conversation_id=target_id;
    ELSE
      UPDATE public.chat_conversations SET last_read_at=clock_timestamp() WHERE id=target_id;
    END IF;
  ELSE
    UPDATE public.inbox_preferences SET pinned_at=CASE WHEN operation='pin' THEN clock_timestamp() ELSE NULL END
      WHERE profile_id=actor_id AND kind=target_kind AND conversation_id=target_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.mutate_inbox_preference(text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mutate_inbox_preference(text,uuid,text) TO aifans_authenticated;
