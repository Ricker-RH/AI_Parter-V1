DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aifans_anon') THEN
    CREATE ROLE aifans_anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aifans_authenticated') THEN
    CREATE ROLE aifans_authenticated NOLOGIN;
  END IF;
END
$$;

GRANT aifans_anon, aifans_authenticated TO CURRENT_USER;

CREATE TYPE public.account_kind AS ENUM ('human', 'ip');
CREATE TYPE public.app_locale AS ENUM ('en', 'zh-CN');

CREATE SCHEMA app;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA public, app TO aifans_anon, aifans_authenticated;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  auth_subject text,
  account_kind public.account_kind NOT NULL,
  username text NOT NULL,
  display_name text NOT NULL,
  bio text,
  avatar_object_key text,
  preferred_locale public.app_locale NOT NULL DEFAULT 'en',
  creator_mode_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_account_kind_auth_subject_check CHECK (
    (account_kind = 'human' AND auth_subject IS NOT NULL AND btrim(auth_subject) <> '')
    OR (account_kind = 'ip' AND auth_subject IS NULL)
  ),
  CONSTRAINT profiles_auth_subject_unique UNIQUE (auth_subject),
  CONSTRAINT profiles_username_unique UNIQUE (username),
  CONSTRAINT profiles_username_check CHECK (username ~ '^[a-z0-9_]{3,30}$'),
  CONSTRAINT profiles_display_name_check CHECK (
    char_length(display_name) BETWEEN 1 AND 80 AND display_name ~ '[^[:space:]]'
  ),
  CONSTRAINT profiles_bio_length_check CHECK (bio IS NULL OR char_length(bio) <= 500),
  CONSTRAINT profiles_avatar_object_key_length_check CHECK (
    avatar_object_key IS NULL OR char_length(avatar_object_key) <= 512
  )
);

CREATE TABLE public.platform_settings (
  setting_key text PRIMARY KEY,
  creator_ip_requires_approval boolean NOT NULL DEFAULT false,
  default_ip_quota integer NOT NULL DEFAULT 3,
  CONSTRAINT platform_settings_global_key_check CHECK (setting_key = 'global'),
  CONSTRAINT platform_settings_default_ip_quota_check CHECK (default_ip_quota BETWEEN 0 AND 100)
);

INSERT INTO public.platform_settings (setting_key) VALUES ('global');

CREATE FUNCTION app.current_auth_subject()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  claims_text text;
  claims jsonb;
  subject jsonb;
BEGIN
  claims_text := current_setting('request.jwt.claims', true);
  IF claims_text IS NULL OR btrim(claims_text) = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    claims := claims_text::jsonb;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;

  IF jsonb_typeof(claims) <> 'object' THEN
    RETURN NULL;
  END IF;

  subject := claims -> 'sub';
  IF jsonb_typeof(subject) <> 'string' OR btrim(subject #>> '{}') = '' THEN
    RETURN NULL;
  END IF;

  RETURN subject #>> '{}';
END;
$$;

CREATE FUNCTION public.current_account()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'account_kind', p.account_kind,
    'username', p.username,
    'display_name', p.display_name,
    'preferred_locale', p.preferred_locale,
    'creator_mode_enabled', p.creator_mode_enabled
  )
  FROM public.profiles AS p
  WHERE p.auth_subject = app.current_auth_subject()
$$;

CREATE FUNCTION public.profiles_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.auth_subject IS DISTINCT FROM NEW.auth_subject
    OR OLD.account_kind IS DISTINCT FROM NEW.account_kind
    OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'profile immutable fields cannot be changed';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_set_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_public_read
ON public.profiles
FOR SELECT
TO aifans_anon, aifans_authenticated
USING (true);

CREATE POLICY profiles_owner_update
ON public.profiles
FOR UPDATE
TO aifans_authenticated
USING (auth_subject = app.current_auth_subject())
WITH CHECK (auth_subject = app.current_auth_subject());

CREATE POLICY settings_authenticated_read
ON public.platform_settings
FOR SELECT
TO aifans_authenticated
USING (true);

REVOKE ALL ON TABLE public.profiles, public.platform_settings FROM PUBLIC;
REVOKE ALL ON TYPE public.account_kind, public.app_locale FROM PUBLIC;
REVOKE ALL ON FUNCTION app.current_auth_subject() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.profiles_set_updated_at() FROM PUBLIC;

GRANT SELECT (
  id, account_kind, username, display_name, bio, avatar_object_key, preferred_locale,
  creator_mode_enabled, created_at, updated_at
) ON public.profiles TO aifans_anon, aifans_authenticated;
GRANT UPDATE (
  username, display_name, bio, avatar_object_key, preferred_locale, creator_mode_enabled
) ON public.profiles TO aifans_authenticated;
GRANT SELECT ON public.platform_settings TO aifans_authenticated;
GRANT USAGE ON TYPE public.account_kind, public.app_locale TO aifans_anon, aifans_authenticated;
GRANT EXECUTE ON FUNCTION app.current_auth_subject() TO aifans_authenticated;
GRANT EXECUTE ON FUNCTION public.current_account() TO aifans_authenticated;
