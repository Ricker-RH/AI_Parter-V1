CREATE FUNCTION public.is_public_chat_ip(target_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles profile
    JOIN public.ip_profiles ip ON ip.profile_id = profile.id
    JOIN public.ip_identity_revisions revision
      ON revision.id = ip.current_identity_revision_id
      AND revision.ip_profile_id = ip.profile_id
    WHERE profile.id = target_profile_id
      AND profile.account_kind = 'ip'
      AND ip.public_state = 'published'
      AND ip.operation_enabled
  )
$$;

REVOKE ALL ON FUNCTION public.is_public_chat_ip(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_public_chat_ip(uuid) TO aifans_authenticated;
