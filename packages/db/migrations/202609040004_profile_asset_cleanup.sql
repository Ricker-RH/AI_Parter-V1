-- Lifecycle metadata is private to narrowly scoped platform cleanup functions.
-- Never attach an expiry lifecycle rule to public/profiles: current assets live indefinitely.
ALTER TABLE public.profile_asset_upload_reservations
  ADD COLUMN retired_at timestamptz,
  ADD COLUMN staging_deleted_at timestamptz,
  ADD COLUMN final_deleted_at timestamptz,
  ADD COLUMN cleanup_attempted_at timestamptz;

CREATE INDEX profile_asset_cleanup_staging_idx
  ON public.profile_asset_upload_reservations (expires_at)
  WHERE staging_deleted_at IS NULL;
CREATE INDEX profile_asset_cleanup_final_idx
  ON public.profile_asset_upload_reservations (retired_at, expires_at)
  WHERE final_deleted_at IS NULL;

CREATE FUNCTION public.profile_asset_record_retirement()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Profile updates already hold the profile lock; maintain profile -> reservation order.
  UPDATE public.profile_asset_upload_reservations r
  SET retired_at = COALESCE(r.retired_at, clock_timestamp())
  WHERE r.owner_profile_id = NEW.id AND r.consumed_at IS NOT NULL
    AND ((OLD.avatar_object_key IS DISTINCT FROM NEW.avatar_object_key AND r.final_object_key = OLD.avatar_object_key)
      OR (OLD.background_object_key IS DISTINCT FROM NEW.background_object_key AND r.final_object_key = OLD.background_object_key));
  RETURN NEW;
END;
$$;
CREATE TRIGGER profiles_retire_visual_assets
AFTER UPDATE OF avatar_object_key, background_object_key ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profile_asset_record_retirement();

-- Existing replaced assets receive the full grace period starting at deployment.
UPDATE public.profile_asset_upload_reservations r
SET retired_at = clock_timestamp()
WHERE r.consumed_at IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.avatar_object_key = r.final_object_key OR p.background_object_key = r.final_object_key
);

CREATE FUNCTION public.profile_asset_cleanup_candidates()
RETURNS TABLE(asset_id uuid, staging_object_key text, final_object_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  candidate record;
  r public.profile_asset_upload_reservations%ROWTYPE;
  delete_final boolean;
BEGIN
  FOR candidate IN
    SELECT a.id, a.owner_profile_id
    FROM public.profile_asset_upload_reservations a
    WHERE (a.staging_deleted_at IS NULL AND a.expires_at < clock_timestamp() - interval '24 hours')
      OR (a.final_deleted_at IS NULL AND (
        (a.consumed_at IS NULL AND a.expires_at < clock_timestamp() - interval '24 hours')
        OR a.retired_at < clock_timestamp() - interval '24 hours'
      ))
    ORDER BY a.cleanup_attempted_at NULLS FIRST, a.created_at, a.id
    LIMIT 10
  LOOP
    -- Serialize with profile binding first, then re-read the reservation and current
    -- references. SKIP LOCKED makes concurrent jobs/edits safe and non-blocking.
    PERFORM 1 FROM public.profiles p WHERE p.id = candidate.owner_profile_id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    SELECT a.* INTO r FROM public.profile_asset_upload_reservations a
    WHERE a.id = candidate.id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN CONTINUE; END IF;
    delete_final := r.final_deleted_at IS NULL AND (
      (r.consumed_at IS NULL AND r.expires_at < clock_timestamp() - interval '24 hours')
      OR r.retired_at < clock_timestamp() - interval '24 hours'
    ) AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.avatar_object_key = r.final_object_key OR p.background_object_key = r.final_object_key
    );
    asset_id := r.id;
    staging_object_key := CASE WHEN r.staging_deleted_at IS NULL
      AND r.expires_at < clock_timestamp() - interval '24 hours' THEN r.staging_object_key END;
    final_object_key := CASE WHEN delete_final THEN r.final_object_key END;
    IF staging_object_key IS NOT NULL OR final_object_key IS NOT NULL THEN RETURN NEXT; END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION public.profile_asset_cleanup_complete(requested_asset_id uuid, staging_deleted boolean, final_deleted boolean)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  UPDATE public.profile_asset_upload_reservations r
  SET staging_deleted_at = CASE WHEN staging_deleted THEN COALESCE(r.staging_deleted_at, clock_timestamp()) ELSE r.staging_deleted_at END,
      final_deleted_at = CASE WHEN final_deleted THEN COALESCE(r.final_deleted_at, clock_timestamp()) ELSE r.final_deleted_at END,
      cleanup_attempted_at = clock_timestamp()
  WHERE r.id = requested_asset_id;
$$;

REVOKE ALL ON FUNCTION public.profile_asset_record_retirement() FROM PUBLIC, aifans_anon, aifans_authenticated, aifans_platform;
REVOKE ALL ON FUNCTION public.profile_asset_cleanup_candidates() FROM PUBLIC, aifans_anon, aifans_authenticated;
REVOKE ALL ON FUNCTION public.profile_asset_cleanup_complete(uuid,boolean,boolean) FROM PUBLIC, aifans_anon, aifans_authenticated;
GRANT EXECUTE ON FUNCTION public.profile_asset_cleanup_candidates() TO aifans_platform;
GRANT EXECUTE ON FUNCTION public.profile_asset_cleanup_complete(uuid,boolean,boolean) TO aifans_platform;
