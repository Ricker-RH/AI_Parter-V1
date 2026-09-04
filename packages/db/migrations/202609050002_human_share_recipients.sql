-- Server-authorized recent mutual human recipients for internal IP shares.
-- Blocks are enforced here and never exposed to the client.
CREATE FUNCTION public.human_dm_share_recipients(page_limit integer)
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_id uuid;
BEGIN
 actor_id:=public.social_current_human_profile_id();
 IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
 IF page_limit IS NULL OR page_limit NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'invalid recipient page limit' USING ERRCODE='22023'; END IF;
 RETURN QUERY
 SELECT jsonb_build_object('id',p.id,'displayName',p.display_name,'avatarKey',p.avatar_object_key)
 FROM public.profiles p
 JOIN public.follows outgoing ON outgoing.follower_profile_id=actor_id AND outgoing.followed_profile_id=p.id
 JOIN public.follows incoming ON incoming.follower_profile_id=p.id AND incoming.followed_profile_id=actor_id
 WHERE p.account_kind='human'
  AND NOT EXISTS(SELECT 1 FROM public.human_blocks b WHERE
   (b.blocker_profile_id=actor_id AND b.blocked_profile_id=p.id) OR
   (b.blocker_profile_id=p.id AND b.blocked_profile_id=actor_id))
 ORDER BY greatest(outgoing.created_at,incoming.created_at) DESC,p.id DESC
 LIMIT page_limit;
END $$;
REVOKE ALL ON FUNCTION public.human_dm_share_recipients(integer) FROM PUBLIC,aifans_anon,aifans_authenticated;
GRANT EXECUTE ON FUNCTION public.human_dm_share_recipients(integer) TO aifans_authenticated;
