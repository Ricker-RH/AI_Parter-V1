-- Public aggregate/score projection. Raw relationship rows and feed_weight stay ungranted.
CREATE FUNCTION public.social_post_metrics(target_post_id uuid, target_author_id uuid, requested_locale text)
RETURNS TABLE(score numeric, like_count integer, comment_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (ip.feed_weight + CASE WHEN requested_locale IS NOT NULL AND p.language_code=requested_locale THEN 10 ELSE 0 END + count(DISTINCT l.profile_id) + count(DISTINCT c.id))::numeric,
    count(DISTINCT l.profile_id)::integer, count(DISTINCT c.id)::integer
  FROM public.posts p JOIN public.ip_profiles ip ON ip.profile_id=p.author_profile_id
  LEFT JOIN public.post_likes l ON l.post_id=p.id
  LEFT JOIN public.comments c ON c.post_id=p.id AND c.state='published'
  WHERE p.id=target_post_id AND p.author_profile_id=target_author_id AND p.state='published' AND ip.public_state='published'
  GROUP BY ip.feed_weight,p.language_code
$$;
REVOKE ALL ON FUNCTION public.social_post_metrics(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_post_metrics(uuid,uuid,text) TO aifans_anon,aifans_authenticated;
