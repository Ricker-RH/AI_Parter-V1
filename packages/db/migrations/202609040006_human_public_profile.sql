-- Basic human identity is public; activity access is explicitly separate.
CREATE FUNCTION public.human_public_profile(target_profile_id uuid)
RETURNS TABLE(id uuid,username text,display_name text,bio text,avatar_object_key text,
 background_type text,background_color_key text,background_object_key text,background_focal_x numeric,background_focal_y numeric,
 profile_visibility text,is_owner boolean,following boolean,followed_by boolean,blocked_by_viewer boolean,message_disabled_reason text,tabs_available boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH me AS (SELECT CASE WHEN current_setting('role',true)='aifans_authenticated' THEN public.social_current_human_profile_id() END AS id), basic AS (
 SELECT p.*,me.id AS viewer_id,coalesce(pref.profile_visibility,'private') AS visibility,
 coalesce(me.id=p.id,false) AS owner,
 EXISTS(SELECT 1 FROM public.follows f WHERE f.follower_profile_id=me.id AND f.followed_profile_id=p.id) AS following,
 EXISTS(SELECT 1 FROM public.follows f WHERE f.follower_profile_id=p.id AND f.followed_profile_id=me.id) AS followed_by,
 EXISTS(SELECT 1 FROM public.human_blocks b WHERE b.blocker_profile_id=me.id AND b.blocked_profile_id=p.id) AS viewer_block,
 EXISTS(SELECT 1 FROM public.human_blocks b WHERE (b.blocker_profile_id=me.id AND b.blocked_profile_id=p.id) OR (b.blocker_profile_id=p.id AND b.blocked_profile_id=me.id)) AS blocked,
 EXISTS(SELECT 1 FROM public.human_dm_conversations c WHERE c.low_profile_id=least(me.id,p.id) AND c.high_profile_id=greatest(me.id,p.id) AND c.first_contact_consumed) AS spent
 FROM public.profiles p CROSS JOIN me LEFT JOIN public.human_social_preferences pref ON pref.profile_id=p.id
 WHERE p.id=target_profile_id AND p.account_kind='human'
 ) SELECT b.id,b.username,b.display_name,b.bio,b.avatar_object_key,b.background_type::text,b.background_color_key,b.background_object_key,b.background_focal_x,b.background_focal_y,
 b.visibility,b.owner,b.following,b.followed_by,b.viewer_block,
 CASE WHEN b.viewer_id IS NULL THEN 'authentication_required' WHEN b.owner THEN 'self' WHEN b.blocked THEN 'blocked'
 WHEN b.spent AND NOT(b.following AND b.followed_by) THEN 'mutual_follow_required' ELSE NULL END,
 b.owner OR (b.visibility='public' AND NOT b.blocked)
 FROM basic b
$$;
REVOKE ALL ON FUNCTION public.human_public_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.human_public_profile(uuid) TO aifans_anon,aifans_authenticated;

-- NULL means omitted, allowing each preference to be patched without lost updates.
CREATE OR REPLACE FUNCTION public.human_set_preferences(profile_visibility text,show_presence boolean)
RETURNS public.human_social_preferences LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_id uuid; result public.human_social_preferences;
BEGIN
 actor_id:=public.social_current_human_profile_id();
 IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
 IF (profile_visibility IS NULL AND show_presence IS NULL) OR (profile_visibility IS NOT NULL AND profile_visibility NOT IN ('private','public')) THEN
  RAISE EXCEPTION 'invalid preference update' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.human_social_preferences(profile_id,profile_visibility,show_presence)
 VALUES(actor_id,coalesce(profile_visibility,'private'),coalesce(show_presence,false))
 ON CONFLICT(profile_id) DO UPDATE SET
 profile_visibility=coalesce(human_set_preferences.profile_visibility,public.human_social_preferences.profile_visibility),
 show_presence=coalesce(human_set_preferences.show_presence,public.human_social_preferences.show_presence)
 RETURNING * INTO result;
 RETURN result;
END $$;

-- The existing follow command emits notifications itself (there is no follow trigger).
CREATE OR REPLACE FUNCTION public.human_follow_profile(target_profile_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_id uuid; changed boolean;
BEGIN
 actor_id:=public.human_lock_pair(target_profile_id);
 IF EXISTS(SELECT 1 FROM public.human_blocks WHERE
 (blocker_profile_id=actor_id AND blocked_profile_id=target_profile_id) OR
 (blocker_profile_id=target_profile_id AND blocked_profile_id=actor_id)) THEN
  RAISE EXCEPTION 'human relationship unavailable' USING ERRCODE='PDM01';
 END IF;
 INSERT INTO public.follows(follower_profile_id,followed_profile_id) VALUES(actor_id,target_profile_id)
 ON CONFLICT DO NOTHING RETURNING true INTO changed;
 IF coalesce(changed,false) THEN
  INSERT INTO public.notifications(id,recipient_profile_id,actor_profile_id,kind)
  VALUES(gen_random_uuid(),target_profile_id,actor_id,'follow');
 END IF;
 RETURN coalesce(changed,false);
END $$;
REVOKE ALL ON FUNCTION public.human_set_preferences(text,boolean),public.human_follow_profile(uuid) FROM PUBLIC,aifans_anon;
GRANT EXECUTE ON FUNCTION public.human_set_preferences(text,boolean),public.human_follow_profile(uuid) TO aifans_authenticated;
