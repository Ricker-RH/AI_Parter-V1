-- The only anonymous feed/detail projection; it exposes no private profile, IP, or operator columns.
CREATE FUNCTION public.social_public_posts()
RETURNS TABLE(post_id uuid, author_profile_id uuid, body text, language_code text, published_at timestamptz, id uuid, username text, display_name text, bio text, languages text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT p.id,p.author_profile_id,p.body,p.language_code,p.published_at,pr.id,pr.username,r.display_name,r.bio,r.languages
 FROM public.posts p JOIN public.profiles pr ON pr.id=p.author_profile_id JOIN public.ip_profiles ip ON ip.profile_id=p.author_profile_id JOIN public.ip_identity_revisions r ON r.id=ip.current_identity_revision_id AND r.ip_profile_id=ip.profile_id
 WHERE p.state='published' AND ip.public_state='published'
$$;
REVOKE ALL ON FUNCTION public.social_public_posts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_public_posts() TO aifans_anon,aifans_authenticated;
