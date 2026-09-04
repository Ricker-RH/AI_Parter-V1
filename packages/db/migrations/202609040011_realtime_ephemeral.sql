-- Ephemeral recipient selection stays service-only and authoritative. An expired
-- stored identity has a 60-second grace ONLY for trusted offline lifecycle frames.
CREATE FUNCTION public.realtime_ephemeral_recipient(
  session_id uuid,actor_subject text,actor_profile_id uuid,target_conversation_id uuid,allow_expired boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE peer_id uuid;
BEGIN
  IF allow_expired IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.realtime_sessions s JOIN public.profiles p ON p.id=s.profile_id
    WHERE s.jti=session_id AND s.subject=actor_subject AND s.profile_id=actor_profile_id
      AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()-CASE WHEN allow_expired THEN interval '60 seconds' ELSE interval '0 seconds' END
      AND p.auth_subject=actor_subject AND p.account_kind='human'
  ) THEN RETURN NULL; END IF;
  SELECT CASE WHEN c.low_profile_id=actor_profile_id THEN c.high_profile_id ELSE c.low_profile_id END
    INTO peer_id FROM public.human_dm_conversations c
    WHERE c.id=target_conversation_id AND actor_profile_id IN(c.low_profile_id,c.high_profile_id)
      AND EXISTS(SELECT 1 FROM public.human_dm_members m WHERE m.conversation_id=c.id AND m.profile_id=actor_profile_id);
  IF peer_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.human_dm_members m WHERE m.conversation_id=target_conversation_id AND m.profile_id=peer_id)
    OR EXISTS(SELECT 1 FROM public.human_blocks b WHERE
      (b.blocker_profile_id=actor_profile_id AND b.blocked_profile_id=peer_id) OR
      (b.blocker_profile_id=peer_id AND b.blocked_profile_id=actor_profile_id))
    OR NOT EXISTS(SELECT 1 FROM public.follows f WHERE f.follower_profile_id=actor_profile_id AND f.followed_profile_id=peer_id)
    OR NOT EXISTS(SELECT 1 FROM public.follows f WHERE f.follower_profile_id=peer_id AND f.followed_profile_id=actor_profile_id)
    OR NOT EXISTS(SELECT 1 FROM public.human_social_preferences p WHERE p.profile_id=actor_profile_id AND p.show_presence)
    OR NOT EXISTS(SELECT 1 FROM public.human_social_preferences p WHERE p.profile_id=peer_id AND p.show_presence)
  THEN RETURN NULL; END IF;
  RETURN peer_id;
END $$;
REVOKE ALL ON FUNCTION public.realtime_ephemeral_recipient(uuid,text,uuid,uuid,boolean) FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;
GRANT EXECUTE ON FUNCTION public.realtime_ephemeral_recipient(uuid,text,uuid,uuid,boolean) TO aifans_platform;
