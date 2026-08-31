CREATE FUNCTION public.social_public_comments(target_post_id uuid, after_created_at timestamptz, after_id uuid, page_limit integer)
RETURNS TABLE(id uuid,post_id uuid,parent_comment_id uuid,author_id uuid,author_kind public.account_kind,username text,display_name text,body text,state public.comment_state,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT c.id,c.post_id,c.parent_comment_id,p.id,p.account_kind,p.username,COALESCE(r.display_name,p.display_name),c.body,c.state,c.created_at
 FROM public.comments c JOIN public.profiles p ON p.id=c.author_profile_id LEFT JOIN public.ip_profiles ip ON ip.profile_id=p.id LEFT JOIN public.ip_identity_revisions r ON r.id=ip.current_identity_revision_id AND ip.public_state='published'
 WHERE c.post_id=target_post_id AND (after_created_at IS NULL OR (c.created_at,c.id)>(after_created_at,after_id))
 ORDER BY c.created_at,c.id LIMIT page_limit
$$;
REVOKE ALL ON FUNCTION public.social_public_comments(uuid,timestamptz,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_public_comments(uuid,timestamptz,uuid,integer) TO aifans_anon,aifans_authenticated;
