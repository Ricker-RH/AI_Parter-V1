-- Actor-aware, bounded public activity projection. No new table grants or RLS bypass
-- for callers: private/blocked access is decided before relationship rows are read.
CREATE FUNCTION public.human_public_tab(target_profile_id uuid,tab_key text,after_at timestamptz,after_id uuid,page_limit integer)
RETURNS TABLE(state text,item jsonb,sort_at text,item_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE available boolean;
BEGIN
 IF tab_key NOT IN ('ips','liked','saved','following') OR page_limit IS NULL OR page_limit<1 OR page_limit>51 OR ((after_at IS NULL)<>(after_id IS NULL)) THEN
  RAISE EXCEPTION 'invalid tab pagination' USING ERRCODE='22023';
 END IF;
 SELECT p.tabs_available INTO available FROM public.human_public_profile(target_profile_id) p;
 IF NOT FOUND THEN RETURN; END IF;
 IF NOT available THEN RETURN QUERY SELECT 'locked'::text,NULL::jsonb,NULL::text,NULL::uuid; RETURN; END IF;
 RETURN QUERY
 WITH candidates AS (
  SELECT ip.profile_id AS id,ip.created_at AS at,'ip'::text AS kind
  FROM public.ip_profiles ip WHERE tab_key='ips' AND ip.creator_profile_id=target_profile_id
  UNION ALL
  SELECT f.followed_profile_id,f.created_at,p.account_kind::text FROM public.follows f JOIN public.profiles p ON p.id=f.followed_profile_id
   WHERE tab_key='following' AND f.follower_profile_id=target_profile_id
  UNION ALL
  SELECT l.post_id,l.created_at,'post' FROM public.post_likes l WHERE tab_key='liked' AND l.profile_id=target_profile_id
  UNION ALL
  SELECT b.post_id,b.created_at,'post' FROM public.bookmarks b WHERE tab_key='saved' AND b.profile_id=target_profile_id
 ), visible_candidates AS MATERIALIZED (
  SELECT c.* FROM candidates c
  WHERE (after_at IS NULL OR (c.at,c.id)<(after_at,after_id)) AND (
   c.kind='human' OR EXISTS (
    SELECT 1 FROM public.ip_profiles ip
    JOIN public.ip_identity_revisions identity ON identity.id=ip.current_identity_revision_id AND identity.ip_profile_id=ip.profile_id
    LEFT JOIN public.creator_revisions revision ON revision.id=ip.active_creator_revision_id
    WHERE ip.public_state='published' AND (ip.source<>'creator' OR revision.id IS NOT NULL)
     AND ((c.kind='ip' AND ip.profile_id=c.id) OR (c.kind='post' AND EXISTS (
      SELECT 1 FROM public.posts p WHERE p.id=c.id AND p.author_profile_id=ip.profile_id AND p.state='published'
     )))
   )
  ) ORDER BY c.at DESC,c.id DESC LIMIT page_limit
 ), projected AS (
  SELECT c.id,c.at,to_jsonb(ip)||jsonb_build_object('kind','ip') AS value
   FROM visible_candidates c CROSS JOIN LATERAL public.social_public_ip_profile(c.id) ip WHERE c.kind='ip'
  UNION ALL
  SELECT c.id,c.at,jsonb_build_object('kind','human','id',h.id,'username',h.username,'display_name',h.display_name,'avatar_object_key',h.avatar_object_key)
   FROM visible_candidates c CROSS JOIN LATERAL public.human_public_profile(c.id) h WHERE c.kind='human'
  UNION ALL
  SELECT c.id,c.at,to_jsonb(p)||to_jsonb(m)||to_jsonb(f)||jsonb_build_object('kind','post','media',coalesce((SELECT jsonb_agg(to_jsonb(media)) FROM public.social_public_post_media(p.post_id) media),'[]'::jsonb))
   FROM visible_candidates c JOIN public.social_public_posts() p ON p.post_id=c.id
   CROSS JOIN LATERAL public.social_post_metrics(p.post_id,p.author_profile_id,NULL::text) m
   CROSS JOIN LATERAL public.social_viewer_flags(p.post_id,p.author_profile_id) f WHERE c.kind='post'
 ), page AS (
  SELECT p.* FROM projected p WHERE after_at IS NULL OR (p.at,p.id)<(after_at,after_id) ORDER BY p.at DESC,p.id DESC LIMIT page_limit
 ) SELECT 'ready'::text,p.value,to_char(p.at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),p.id FROM page p
 UNION ALL SELECT 'ready'::text,NULL::jsonb,NULL::text,NULL::uuid WHERE NOT EXISTS(SELECT 1 FROM page);
END $$;
REVOKE ALL ON FUNCTION public.human_public_tab(uuid,text,timestamptz,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.human_public_tab(uuid,text,timestamptz,uuid,integer) TO aifans_anon,aifans_authenticated;
