CREATE TYPE public.profile_background_type AS ENUM ('color', 'image');
CREATE TYPE public.profile_asset_role AS ENUM ('avatar', 'background');

ALTER TABLE public.profiles
  ADD COLUMN background_type public.profile_background_type NOT NULL DEFAULT 'color',
  ADD COLUMN background_color_key text NOT NULL DEFAULT 'paper',
  ADD COLUMN background_object_key text,
  ADD COLUMN background_focal_x numeric(6,5) NOT NULL DEFAULT 0.5,
  ADD COLUMN background_focal_y numeric(6,5) NOT NULL DEFAULT 0.5,
  ADD COLUMN profile_version bigint NOT NULL DEFAULT 1,
  ADD CONSTRAINT profiles_background_color_key_check CHECK (
    background_color_key IN ('paper','sand','mist','sage','sky','lilac','graphite')
  ),
  ADD CONSTRAINT profiles_background_object_key_length_check CHECK (
    background_object_key IS NULL OR char_length(background_object_key) <= 512
  ),
  ADD CONSTRAINT profiles_background_focal_x_check CHECK (
    background_focal_x BETWEEN 0 AND 1
  ),
  ADD CONSTRAINT profiles_background_focal_y_check CHECK (
    background_focal_y BETWEEN 0 AND 1
  ),
  ADD CONSTRAINT profiles_background_consistency_check CHECK (
    (background_type = 'color' AND background_object_key IS NULL)
    OR (background_type = 'image' AND background_object_key IS NOT NULL)
  ),
  ADD CONSTRAINT profiles_profile_version_check CHECK (profile_version > 0);

CREATE TABLE public.profile_asset_upload_reservations (
  id uuid PRIMARY KEY,
  owner_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  role public.profile_asset_role NOT NULL,
  staging_object_key text NOT NULL UNIQUE,
  final_object_key text NOT NULL UNIQUE,
  upload_content_type text NOT NULL,
  final_content_type text NOT NULL DEFAULT 'image/webp',
  declared_size_bytes integer NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT profile_asset_reservations_staging_key_length_check CHECK (
    char_length(staging_object_key) BETWEEN 1 AND 512
  ),
  CONSTRAINT profile_asset_reservations_final_key_length_check CHECK (
    char_length(final_object_key) BETWEEN 1 AND 512
  ),
  CONSTRAINT profile_asset_reservations_upload_content_type_check CHECK (
    upload_content_type IN ('image/jpeg','image/png','image/webp')
  ),
  CONSTRAINT profile_asset_reservations_final_content_type_check CHECK (
    final_content_type = 'image/webp'
  ),
  CONSTRAINT profile_asset_reservations_size_check CHECK (
    declared_size_bytes BETWEEN 1 AND 10485760
  ),
  CONSTRAINT profile_asset_reservations_width_check CHECK (width BETWEEN 64 AND 12000),
  CONSTRAINT profile_asset_reservations_height_check CHECK (height BETWEEN 64 AND 12000),
  CONSTRAINT profile_asset_reservations_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT profile_asset_reservations_consumed_check CHECK (
    consumed_at IS NULL OR verified_at IS NOT NULL
  ),
  CONSTRAINT profile_asset_reservations_staging_key_check CHECK (
    staging_object_key = format(
      'staging/profiles/%s/%s/%s.%s',
      owner_profile_id,
      role,
      id,
      CASE upload_content_type
        WHEN 'image/jpeg' THEN 'jpg'
        WHEN 'image/png' THEN 'png'
        WHEN 'image/webp' THEN 'webp'
      END
    )
  ),
  CONSTRAINT profile_asset_reservations_final_key_check CHECK (
    final_object_key = format('public/profiles/%s/%s/%s.webp', owner_profile_id, role, id)
  )
);

CREATE INDEX profile_asset_upload_reservations_active_idx
  ON public.profile_asset_upload_reservations (owner_profile_id, role, created_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.profile_asset_upload_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY profile_asset_reservations_owner_select
ON public.profile_asset_upload_reservations
FOR SELECT
TO aifans_authenticated
USING (owner_profile_id = public.current_profile_id());

CREATE POLICY profile_asset_reservations_owner_update
ON public.profile_asset_upload_reservations
FOR UPDATE
TO aifans_authenticated
USING (owner_profile_id = public.current_profile_id())
WITH CHECK (owner_profile_id = public.current_profile_id());

CREATE OR REPLACE FUNCTION public.current_account()
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
    'creator_mode_enabled', p.creator_mode_enabled,
    'avatar_object_key', p.avatar_object_key,
    'background_type', p.background_type,
    'background_color_key', p.background_color_key,
    'background_object_key', p.background_object_key,
    'background_focal_x', p.background_focal_x,
    'background_focal_y', p.background_focal_y,
    'profile_version', p.profile_version
  )
  FROM public.profiles AS p
  WHERE p.auth_subject = app.current_auth_subject()
$$;

CREATE OR REPLACE FUNCTION public.profiles_set_updated_at()
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
  IF OLD.profile_version IS DISTINCT FROM NEW.profile_version THEN
    RAISE EXCEPTION 'profile_version is managed by the database';
  END IF;
  NEW.profile_version := OLD.profile_version + 1;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.profile_reserve_asset(
  requested_asset_id uuid,
  requested_role public.profile_asset_role,
  requested_staging_object_key text,
  requested_final_object_key text,
  requested_upload_content_type text,
  requested_size_bytes integer,
  requested_width integer,
  requested_height integer
)
RETURNS TABLE(
  asset_id uuid,
  owner_profile_id uuid,
  role public.profile_asset_role,
  staging_object_key text,
  final_object_key text,
  upload_content_type text,
  final_content_type text,
  size_bytes integer,
  width integer,
  height integer,
  expires_at timestamptz,
  verified_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_profile_id uuid;
  expected_extension text;
  expected_staging_object_key text;
  expected_final_object_key text;
BEGIN
  SELECT p.id INTO actor_profile_id
  FROM public.profiles p
  WHERE p.auth_subject = app.current_auth_subject() AND p.account_kind = 'human'
  FOR UPDATE;
  IF actor_profile_id IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  expected_extension := CASE requested_upload_content_type
    WHEN 'image/jpeg' THEN 'jpg'
    WHEN 'image/png' THEN 'png'
    WHEN 'image/webp' THEN 'webp'
  END;
  expected_staging_object_key := format(
    'staging/profiles/%s/%s/%s.%s',
    actor_profile_id,
    requested_role,
    requested_asset_id,
    expected_extension
  );
  expected_final_object_key := format(
    'public/profiles/%s/%s/%s.webp',
    actor_profile_id,
    requested_role,
    requested_asset_id
  );
  IF requested_asset_id IS NULL
    OR requested_role IS NULL
    OR expected_extension IS NULL
    OR requested_staging_object_key IS DISTINCT FROM expected_staging_object_key
    OR requested_final_object_key IS DISTINCT FROM expected_final_object_key THEN
    RAISE EXCEPTION 'INVALID_PROFILE_ASSET_RESERVATION' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.profile_asset_upload_reservations (
    id, owner_profile_id, role, staging_object_key, final_object_key,
    upload_content_type, final_content_type, declared_size_bytes,
    width, height, expires_at
  ) VALUES (
    requested_asset_id, actor_profile_id, requested_role, requested_staging_object_key,
    requested_final_object_key, requested_upload_content_type, 'image/webp',
    requested_size_bytes, requested_width, requested_height,
    clock_timestamp() + interval '10 minutes'
  );

  RETURN QUERY
  SELECT r.id, r.owner_profile_id, r.role, r.staging_object_key, r.final_object_key,
         r.upload_content_type, r.final_content_type,
         r.declared_size_bytes, r.width, r.height, r.expires_at, r.verified_at
  FROM public.profile_asset_upload_reservations r
  WHERE r.id = requested_asset_id;
END;
$$;

CREATE FUNCTION public.profile_get_asset_reservation(requested_asset_id uuid)
RETURNS TABLE(
  asset_id uuid,
  owner_profile_id uuid,
  role public.profile_asset_role,
  staging_object_key text,
  final_object_key text,
  upload_content_type text,
  final_content_type text,
  size_bytes integer,
  width integer,
  height integer,
  expires_at timestamptz,
  verified_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.id, r.owner_profile_id, r.role, r.staging_object_key, r.final_object_key,
         r.upload_content_type, r.final_content_type,
         r.declared_size_bytes, r.width, r.height, r.expires_at, r.verified_at
  FROM public.profile_asset_upload_reservations r
  JOIN public.profiles p ON p.id = r.owner_profile_id
  WHERE r.id = requested_asset_id
    AND p.account_kind = 'human'
    AND p.auth_subject = app.current_auth_subject()
    AND r.consumed_at IS NULL
    AND r.expires_at > clock_timestamp()
$$;

CREATE FUNCTION public.profile_confirm_asset(requested_asset_id uuid, requested_final_object_key text)
RETURNS TABLE(
  asset_id uuid,
  owner_profile_id uuid,
  role public.profile_asset_role,
  staging_object_key text,
  final_object_key text,
  upload_content_type text,
  final_content_type text,
  size_bytes integer,
  width integer,
  height integer,
  expires_at timestamptz,
  verified_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.profile_asset_upload_reservations r
  SET verified_at = COALESCE(r.verified_at, clock_timestamp())
  FROM public.profiles p
  WHERE r.id = requested_asset_id
    AND p.id = r.owner_profile_id
    AND p.account_kind = 'human'
    AND p.auth_subject = app.current_auth_subject()
    AND r.final_object_key = requested_final_object_key
    AND r.final_content_type = 'image/webp'
    AND r.consumed_at IS NULL
    AND r.expires_at > clock_timestamp()
  RETURNING r.id, r.owner_profile_id, r.role, r.staging_object_key, r.final_object_key,
            r.upload_content_type, r.final_content_type,
            r.declared_size_bytes, r.width, r.height, r.expires_at, r.verified_at;
END;
$$;

CREATE FUNCTION public.profile_update_current_account(
  expected_profile_version bigint,
  requested_username text,
  change_username boolean,
  requested_display_name text,
  change_display_name boolean,
  requested_bio text,
  change_bio boolean,
  requested_locale public.app_locale,
  change_locale boolean,
  requested_avatar_asset_id uuid,
  change_avatar boolean,
  requested_background_type public.profile_background_type,
  requested_background_color_key text,
  requested_background_asset_id uuid,
  requested_background_focal_x numeric,
  requested_background_focal_y numeric,
  change_background boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_profile_id uuid;
  current_version bigint;
  selected_avatar_key text;
  selected_background_key text;
  result jsonb;
BEGIN
  SELECT p.id, p.profile_version INTO actor_profile_id, current_version
  FROM public.profiles p
  WHERE p.auth_subject = app.current_auth_subject() AND p.account_kind = 'human'
  FOR UPDATE;
  IF actor_profile_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF current_version IS DISTINCT FROM expected_profile_version THEN
    RAISE EXCEPTION 'PROFILE_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  IF change_avatar AND requested_avatar_asset_id IS NOT NULL THEN
    SELECT r.final_object_key INTO selected_avatar_key
    FROM public.profile_asset_upload_reservations r
    WHERE r.id = requested_avatar_asset_id
      AND r.owner_profile_id = actor_profile_id
      AND r.role = 'avatar'
      AND r.verified_at IS NOT NULL
      AND r.consumed_at IS NULL
      AND r.expires_at > clock_timestamp()
    FOR UPDATE;
    IF selected_avatar_key IS NULL THEN
      RAISE EXCEPTION 'PROFILE_ASSET_UNAVAILABLE' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF change_background THEN
    IF requested_background_type IS NULL THEN
      RAISE EXCEPTION 'INVALID_PROFILE_BACKGROUND' USING ERRCODE = '23514';
    ELSIF requested_background_type = 'image' THEN
      SELECT r.final_object_key INTO selected_background_key
      FROM public.profile_asset_upload_reservations r
      WHERE r.id = requested_background_asset_id
        AND r.owner_profile_id = actor_profile_id
        AND r.role = 'background'
        AND r.verified_at IS NOT NULL
        AND r.consumed_at IS NULL
        AND r.expires_at > clock_timestamp()
      FOR UPDATE;
      IF selected_background_key IS NULL THEN
        RAISE EXCEPTION 'PROFILE_ASSET_UNAVAILABLE' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  UPDATE public.profiles p
  SET username = CASE WHEN change_username THEN requested_username ELSE p.username END,
      display_name = CASE WHEN change_display_name THEN requested_display_name ELSE p.display_name END,
      bio = CASE WHEN change_bio THEN requested_bio ELSE p.bio END,
      preferred_locale = CASE WHEN change_locale THEN requested_locale ELSE p.preferred_locale END,
      avatar_object_key = CASE WHEN change_avatar THEN selected_avatar_key ELSE p.avatar_object_key END,
      background_type = CASE WHEN change_background THEN requested_background_type ELSE p.background_type END,
      background_color_key = CASE
        WHEN change_background AND requested_background_type = 'color' THEN requested_background_color_key
        ELSE p.background_color_key
      END,
      background_object_key = CASE
        WHEN change_background AND requested_background_type = 'image' THEN selected_background_key
        WHEN change_background THEN NULL
        ELSE p.background_object_key
      END,
      background_focal_x = CASE
        WHEN change_background AND requested_background_type = 'image' THEN requested_background_focal_x
        WHEN change_background THEN 0.5
        ELSE p.background_focal_x
      END,
      background_focal_y = CASE
        WHEN change_background AND requested_background_type = 'image' THEN requested_background_focal_y
        WHEN change_background THEN 0.5
        ELSE p.background_focal_y
      END
  WHERE p.id = actor_profile_id;

  IF change_avatar AND requested_avatar_asset_id IS NOT NULL THEN
    UPDATE public.profile_asset_upload_reservations
    SET consumed_at = clock_timestamp()
    WHERE id = requested_avatar_asset_id;
  END IF;
  IF change_background AND requested_background_type = 'image' THEN
    UPDATE public.profile_asset_upload_reservations
    SET consumed_at = clock_timestamp()
    WHERE id = requested_background_asset_id;
  END IF;

  SELECT public.current_account() INTO result;
  RETURN result;
END;
$$;

REVOKE UPDATE (
  username, display_name, bio, avatar_object_key, preferred_locale,
  creator_mode_enabled, background_type, background_color_key,
  background_object_key, background_focal_x, background_focal_y,
  profile_version
) ON public.profiles FROM aifans_authenticated;
REVOKE ALL ON TABLE public.profile_asset_upload_reservations FROM PUBLIC, aifans_anon, aifans_authenticated;
REVOKE ALL ON TYPE public.profile_background_type, public.profile_asset_role FROM PUBLIC;
REVOKE ALL ON FUNCTION public.profile_reserve_asset(uuid,public.profile_asset_role,text,text,text,integer,integer,integer) FROM PUBLIC, aifans_anon;
REVOKE ALL ON FUNCTION public.profile_get_asset_reservation(uuid) FROM PUBLIC, aifans_anon;
REVOKE ALL ON FUNCTION public.profile_confirm_asset(uuid,text) FROM PUBLIC, aifans_anon;
REVOKE ALL ON FUNCTION public.profile_update_current_account(bigint,text,boolean,text,boolean,text,boolean,public.app_locale,boolean,uuid,boolean,public.profile_background_type,text,uuid,numeric,numeric,boolean) FROM PUBLIC, aifans_anon;

GRANT SELECT (
  avatar_object_key, background_type, background_color_key, background_object_key,
  background_focal_x, background_focal_y, profile_version
) ON public.profiles TO aifans_anon, aifans_authenticated;
GRANT SELECT (
  avatar_object_key, background_type, background_color_key, background_object_key,
  background_focal_x, background_focal_y, profile_version
) ON public.profiles TO aifans_provisioner;
GRANT USAGE ON TYPE public.profile_background_type, public.profile_asset_role TO aifans_authenticated;
GRANT EXECUTE ON FUNCTION public.profile_reserve_asset(uuid,public.profile_asset_role,text,text,text,integer,integer,integer) TO aifans_authenticated;
GRANT EXECUTE ON FUNCTION public.profile_get_asset_reservation(uuid) TO aifans_authenticated;
GRANT EXECUTE ON FUNCTION public.profile_confirm_asset(uuid,text) TO aifans_authenticated;
GRANT EXECUTE ON FUNCTION public.profile_update_current_account(bigint,text,boolean,text,boolean,text,boolean,public.app_locale,boolean,uuid,boolean,public.profile_background_type,text,uuid,numeric,numeric,boolean) TO aifans_authenticated;
