-- Anonymous search projection. Only published IP identity and published post
-- fields are searchable; private human/operator columns never cross this API.
-- pg_trgm keeps the intentional substring search bounded by indexed candidate
-- lookups (including CJK text); the projection functions still enforce state.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS profiles_public_search_username_trgm_idx
  ON public.profiles USING gin (username gin_trgm_ops) WHERE account_kind='ip';
CREATE INDEX IF NOT EXISTS ip_identity_public_search_display_name_trgm_idx
  ON public.ip_identity_revisions USING gin (display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS posts_public_search_body_trgm_idx
  ON public.posts USING gin (body gin_trgm_ops) WHERE state='published';

CREATE FUNCTION public.social_public_search_profiles(
  search_query text,
  after_display_name text,
  after_id uuid,
  page_limit integer
)
RETURNS TABLE(
  id uuid,username text,display_name text,bio text,languages text[],
  visual_type public.creator_visual_type,
  creator_id uuid,creator_username text,creator_display_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH escaped AS (
    SELECT replace(replace(replace(coalesce(search_query,''),chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_') AS q
  )
  SELECT profile.id,profile.username,identity.display_name,identity.bio,identity.languages,
    CASE WHEN ip.source='creator' THEN creator_revision.visual_type ELSE ip.visual_type END,
    creator.id,creator.username,creator.display_name
  FROM public.profiles profile
  JOIN public.ip_profiles ip ON ip.profile_id=profile.id
  JOIN public.ip_identity_revisions identity
    ON identity.id=ip.current_identity_revision_id AND identity.ip_profile_id=ip.profile_id
  LEFT JOIN public.creator_revisions creator_revision
    ON creator_revision.id=ip.active_creator_revision_id AND ip.source='creator'
  LEFT JOIN public.profiles creator
    ON creator.id=ip.creator_profile_id AND creator.account_kind='human'
  CROSS JOIN escaped
  WHERE profile.account_kind='ip' AND ip.public_state='published'
    AND (ip.source<>'creator' OR creator_revision.id IS NOT NULL)
    AND (profile.username ILIKE '%'||escaped.q||'%' ESCAPE chr(92)
      OR identity.display_name ILIKE '%'||escaped.q||'%' ESCAPE chr(92))
    AND (after_id IS NULL OR (identity.display_name,profile.id)>(coalesce(after_display_name,''),after_id))
  ORDER BY identity.display_name,profile.id
  LIMIT LEAST(GREATEST(page_limit,1),51)
$$;
REVOKE ALL ON FUNCTION public.social_public_search_profiles(text,text,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_public_search_profiles(text,text,uuid,integer) TO aifans_anon,aifans_authenticated;

CREATE FUNCTION public.social_public_search_posts(
  search_query text,
  after_published_at timestamptz,
  after_id uuid,
  page_limit integer
)
RETURNS TABLE(
  post_id uuid,author_profile_id uuid,body text,language_code text,published_at timestamptz,
  id uuid,username text,display_name text,bio text,languages text[],
  visual_type public.creator_visual_type,
  creator_id uuid,creator_username text,creator_display_name text,
  like_count integer,comment_count integer,
  viewer_has_liked boolean,viewer_has_bookmarked boolean,viewer_follows_author boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH escaped AS (
    SELECT replace(replace(replace(coalesce(search_query,''),chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_') AS q
  )
  SELECT p.post_id,p.author_profile_id,p.body,p.language_code,p.published_at,
    p.id,p.username,p.display_name,p.bio,p.languages,p.visual_type,
    p.creator_id,p.creator_username,p.creator_display_name,
    metrics.like_count,metrics.comment_count,
    flags.viewer_has_liked,flags.viewer_has_bookmarked,flags.viewer_follows_author
  FROM public.social_public_posts() p
  CROSS JOIN escaped
  CROSS JOIN LATERAL public.social_viewer_flags(p.post_id,p.id) flags
  CROSS JOIN LATERAL public.social_post_metrics(p.post_id,p.id,NULL::text) metrics
  WHERE (p.body ILIKE '%'||escaped.q||'%' ESCAPE chr(92)
    OR p.username ILIKE '%'||escaped.q||'%' ESCAPE chr(92)
    OR p.display_name ILIKE '%'||escaped.q||'%' ESCAPE chr(92))
    AND (after_id IS NULL OR (p.published_at,p.post_id)<(after_published_at,after_id))
  ORDER BY p.published_at DESC,p.post_id DESC
  LIMIT LEAST(GREATEST(page_limit,1),51)
$$;
REVOKE ALL ON FUNCTION public.social_public_search_posts(text,timestamptz,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_public_search_posts(text,timestamptz,uuid,integer) TO aifans_anon,aifans_authenticated;
