DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aifans_provisioner') THEN
    CREATE ROLE aifans_provisioner NOLOGIN;
  END IF;
END
$$;

GRANT aifans_provisioner TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO aifans_provisioner;
GRANT USAGE ON TYPE public.account_kind, public.app_locale TO aifans_provisioner;

REVOKE ALL ON TABLE public.profiles FROM aifans_provisioner;
GRANT SELECT (
  id, auth_subject, account_kind, username, display_name, preferred_locale,
  creator_mode_enabled
) ON public.profiles TO aifans_provisioner;
GRANT INSERT (
  id, auth_subject, account_kind, username, display_name
) ON public.profiles TO aifans_provisioner;

DROP POLICY IF EXISTS profiles_provisioner_read_humans ON public.profiles;
CREATE POLICY profiles_provisioner_read_humans
ON public.profiles
FOR SELECT
TO aifans_provisioner
USING (account_kind = 'human');

DROP POLICY IF EXISTS profiles_provisioner_insert_humans ON public.profiles;
CREATE POLICY profiles_provisioner_insert_humans
ON public.profiles
FOR INSERT
TO aifans_provisioner
WITH CHECK (
  account_kind = 'human'
  AND auth_subject IS NOT NULL
  AND auth_subject ~ '[^[:space:]]'
  AND creator_mode_enabled = false
);
