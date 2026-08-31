CREATE TYPE public.ip_source AS ENUM ('platform', 'creator');
CREATE TYPE public.ip_public_state AS ENUM ('draft', 'approved', 'published', 'paused', 'unpublished');
CREATE TYPE public.post_state AS ENUM ('draft', 'published', 'withdrawn');
CREATE TYPE public.post_source AS ENUM ('admin', 'worker');
CREATE TYPE public.media_kind AS ENUM ('image');
CREATE TYPE public.comment_source AS ENUM ('human', 'admin', 'worker');
CREATE TYPE public.comment_state AS ENUM ('published', 'deleted');
CREATE TYPE public.notification_kind AS ENUM ('follow', 'post_like', 'comment', 'reply', 'comment_like');

CREATE TABLE public.ip_profiles (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id),
  source public.ip_source NOT NULL,
  creator_profile_id uuid REFERENCES public.profiles(id),
  public_state public.ip_public_state NOT NULL DEFAULT 'draft',
  operation_enabled boolean NOT NULL DEFAULT false,
  identity_label text NOT NULL DEFAULT 'AI' CHECK (char_length(identity_label) BETWEEN 1 AND 80 AND identity_label ~ '[^[:space:]]'),
  current_identity_revision_id uuid,
  feed_weight integer NOT NULL DEFAULT 0 CHECK (feed_weight BETWEEN -1000 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (creator_profile_id IS NULL OR source = 'creator')
);

CREATE TABLE public.ip_identity_revisions (
  id uuid PRIMARY KEY,
  ip_profile_id uuid NOT NULL REFERENCES public.ip_profiles(profile_id),
  version integer NOT NULL CHECK (version > 0),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80 AND display_name ~ '[^[:space:]]'),
  bio text CHECK (bio IS NULL OR char_length(bio) <= 500),
  avatar_object_key text CHECK (avatar_object_key IS NULL OR char_length(avatar_object_key) <= 512),
  cover_object_key text CHECK (cover_object_key IS NULL OR char_length(cover_object_key) <= 512),
  languages text[] NOT NULL DEFAULT '{}',
  created_by_profile_id uuid REFERENCES public.profiles(id),
  previous_revision_id uuid REFERENCES public.ip_identity_revisions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ip_profile_id, version)
);
ALTER TABLE public.ip_profiles ADD CONSTRAINT ip_profiles_current_identity_revision_fk
  FOREIGN KEY (current_identity_revision_id) REFERENCES public.ip_identity_revisions(id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.posts (
  id uuid PRIMARY KEY,
  author_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  acting_operator_profile_id uuid REFERENCES public.profiles(id),
  state public.post_state NOT NULL DEFAULT 'draft',
  source public.post_source NOT NULL,
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 5000),
  language_code text CHECK (language_code IS NULL OR language_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  published_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state = 'draft' AND published_at IS NULL AND withdrawn_at IS NULL)
    OR (state = 'published' AND published_at IS NOT NULL AND withdrawn_at IS NULL)
    OR (state = 'withdrawn' AND published_at IS NOT NULL AND withdrawn_at IS NOT NULL))
);

CREATE TABLE public.post_media (
  id uuid PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE RESTRICT,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 4),
  object_key text NOT NULL CHECK (char_length(object_key) <= 512),
  alt_text text CHECK (alt_text IS NULL OR char_length(alt_text) <= 1000),
  content_type text NOT NULL CHECK (content_type LIKE 'image/%'),
  width integer CHECK (width > 0),
  height integer CHECK (height > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, position)
);

CREATE TABLE public.follows (
  follower_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  followed_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_profile_id, followed_profile_id),
  CHECK (follower_profile_id <> followed_profile_id)
);
CREATE TABLE public.post_likes (
  post_id uuid NOT NULL REFERENCES public.posts(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, profile_id)
);
CREATE TABLE public.bookmarks (
  post_id uuid NOT NULL REFERENCES public.posts(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, profile_id)
);
CREATE TABLE public.comments (
  id uuid PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.posts(id),
  parent_comment_id uuid REFERENCES public.comments(id),
  author_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  acting_operator_profile_id uuid REFERENCES public.profiles(id),
  source public.comment_source NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000 AND body ~ '[^[:space:]]'),
  state public.comment_state NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK ((source = 'human' AND acting_operator_profile_id IS NULL) OR (source IN ('admin', 'worker') AND acting_operator_profile_id IS NOT NULL)),
  CHECK ((state = 'published' AND deleted_at IS NULL) OR (state = 'deleted' AND deleted_at IS NOT NULL))
);
CREATE TABLE public.comment_likes (
  comment_id uuid NOT NULL REFERENCES public.comments(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, profile_id)
);
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY,
  recipient_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  actor_profile_id uuid REFERENCES public.profiles(id),
  kind public.notification_kind NOT NULL,
  post_id uuid REFERENCES public.posts(id),
  comment_id uuid REFERENCES public.comments(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX ip_profiles_public_state_enabled_idx ON public.ip_profiles (public_state, operation_enabled);
CREATE INDEX ip_profiles_creator_profile_idx ON public.ip_profiles (creator_profile_id);
CREATE INDEX posts_published_cursor_idx ON public.posts (published_at DESC, id DESC) WHERE state = 'published';
CREATE INDEX posts_author_published_cursor_idx ON public.posts (author_profile_id, published_at DESC, id DESC) WHERE state = 'published';
CREATE INDEX follows_followed_created_idx ON public.follows (followed_profile_id, created_at DESC);
CREATE INDEX follows_follower_created_idx ON public.follows (follower_profile_id, created_at DESC);
CREATE INDEX post_likes_profile_created_idx ON public.post_likes (profile_id, created_at DESC);
CREATE INDEX bookmarks_profile_created_idx ON public.bookmarks (profile_id, created_at DESC);
CREATE INDEX comments_post_published_idx ON public.comments (post_id, created_at, id) WHERE state = 'published';
CREATE INDEX comments_parent_published_idx ON public.comments (parent_comment_id, created_at, id) WHERE state = 'published';
CREATE INDEX comments_author_created_idx ON public.comments (author_profile_id, created_at DESC);
CREATE INDEX notifications_recipient_created_idx ON public.notifications (recipient_profile_id, created_at DESC, id DESC);
CREATE INDEX notifications_recipient_unread_idx ON public.notifications (recipient_profile_id, created_at DESC) WHERE read_at IS NULL;
CREATE UNIQUE INDEX notifications_post_like_once_idx ON public.notifications (recipient_profile_id, actor_profile_id, kind, post_id) WHERE kind = 'post_like';

CREATE FUNCTION public.current_profile_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id FROM public.profiles p WHERE p.auth_subject = app.current_auth_subject() AND p.account_kind = 'human'
$$;
CREATE FUNCTION public.is_published_post(target_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.posts p WHERE p.id = target_id AND p.state = 'published')
$$;
CREATE FUNCTION public.is_public_profile(target_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.ip_profiles ip WHERE ip.profile_id = target_id AND ip.public_state = 'published')
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = target_id AND p.account_kind = 'human')
$$;
CREATE FUNCTION public.ip_profiles_require_valid_profiles()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.profile_id AND account_kind = 'ip') THEN RAISE EXCEPTION 'IP profile requires an IP account'; END IF;
  IF NEW.creator_profile_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.creator_profile_id AND account_kind = 'human') THEN RAISE EXCEPTION 'IP creator requires a human account'; END IF;
  NEW.updated_at := clock_timestamp(); RETURN NEW;
END;
$$;
CREATE FUNCTION public.reject_ip_identity_revision_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN RAISE EXCEPTION 'ip identity revisions are immutable'; END; $$;
CREATE FUNCTION public.guard_post()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.author_profile_id AND account_kind = 'ip') THEN RAISE EXCEPTION 'posts require an IP author'; END IF;
  IF NEW.source = 'admin' AND NEW.acting_operator_profile_id IS NULL THEN RAISE EXCEPTION 'admin posts require an operator'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.id IS DISTINCT FROM NEW.id OR OLD.author_profile_id IS DISTINCT FROM NEW.author_profile_id OR OLD.source IS DISTINCT FROM NEW.source OR OLD.acting_operator_profile_id IS DISTINCT FROM NEW.acting_operator_profile_id OR OLD.body IS DISTINCT FROM NEW.body OR OLD.language_code IS DISTINCT FROM NEW.language_code OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN RAISE EXCEPTION 'published post content is immutable'; END IF;
    IF NOT (OLD.state = 'published' AND NEW.state = 'withdrawn') THEN RAISE EXCEPTION 'posts may only transition from published to withdrawn'; END IF;
  END IF;
  NEW.updated_at := clock_timestamp(); RETURN NEW;
END;
$$;
CREATE FUNCTION public.require_publishable_post()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE target_id uuid; target_state public.post_state; target_body text;
BEGIN
  IF TG_TABLE_NAME = 'post_media' THEN
    target_id := COALESCE(NEW.post_id, OLD.post_id);
    SELECT state, body INTO target_state, target_body FROM public.posts WHERE id = target_id;
  ELSE
    target_id := NEW.id;
    target_state := NEW.state;
    target_body := NEW.body;
  END IF;
  IF target_state IN ('published', 'withdrawn') AND btrim(target_body) = '' AND NOT EXISTS (SELECT 1 FROM public.post_media WHERE post_id = target_id) THEN RAISE EXCEPTION 'published posts require nonblank text or verified media'; END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION public.guard_comment()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE parent_post uuid; grandparent uuid;
BEGIN
  IF NEW.parent_comment_id IS NOT NULL THEN SELECT post_id, parent_comment_id INTO parent_post, grandparent FROM public.comments WHERE id = NEW.parent_comment_id; IF parent_post IS NULL OR parent_post <> NEW.post_id THEN RAISE EXCEPTION 'comment parent must belong to the same post'; END IF; IF grandparent IS NOT NULL THEN RAISE EXCEPTION 'comments permit one reply level'; END IF; END IF;
  IF NEW.source = 'human' THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.author_profile_id AND account_kind = 'human') THEN RAISE EXCEPTION 'human comments require a human author'; END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.author_profile_id AND account_kind = 'ip') THEN RAISE EXCEPTION 'platform comments require an IP author'; END IF;
  IF TG_OP = 'UPDATE' AND NOT (OLD.state = 'published' AND NEW.state = 'deleted' AND NEW.deleted_at IS NOT NULL AND OLD.id = NEW.id AND OLD.post_id = NEW.post_id AND OLD.parent_comment_id IS NOT DISTINCT FROM NEW.parent_comment_id AND OLD.author_profile_id = NEW.author_profile_id AND OLD.acting_operator_profile_id IS NOT DISTINCT FROM NEW.acting_operator_profile_id AND OLD.source = NEW.source AND OLD.body = NEW.body AND OLD.created_at = NEW.created_at) THEN RAISE EXCEPTION 'comments can only be soft deleted'; END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION public.guard_notification_read()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.read_at IS NOT NULL OR NEW.read_at IS NULL OR OLD.id IS DISTINCT FROM NEW.id OR OLD.recipient_profile_id IS DISTINCT FROM NEW.recipient_profile_id OR OLD.actor_profile_id IS DISTINCT FROM NEW.actor_profile_id OR OLD.kind IS DISTINCT FROM NEW.kind OR OLD.post_id IS DISTINCT FROM NEW.post_id OR OLD.comment_id IS DISTINCT FROM NEW.comment_id OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN RAISE EXCEPTION 'notifications may only be marked read once'; END IF; RETURN NEW;
END;
$$;

CREATE TRIGGER ip_profiles_require_valid_profiles BEFORE INSERT OR UPDATE ON public.ip_profiles FOR EACH ROW EXECUTE FUNCTION public.ip_profiles_require_valid_profiles();
CREATE TRIGGER ip_identity_revisions_immutable BEFORE UPDATE OR DELETE ON public.ip_identity_revisions FOR EACH ROW EXECUTE FUNCTION public.reject_ip_identity_revision_mutation();
CREATE TRIGGER posts_guard BEFORE INSERT OR UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.guard_post();
CREATE CONSTRAINT TRIGGER posts_require_content AFTER INSERT OR UPDATE ON public.posts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.require_publishable_post();
CREATE CONSTRAINT TRIGGER post_media_preserves_content AFTER INSERT OR DELETE OR UPDATE ON public.post_media DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.require_publishable_post();
CREATE TRIGGER comments_guard BEFORE INSERT OR UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.guard_comment();
CREATE TRIGGER notifications_guard_read BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.guard_notification_read();

ALTER TABLE public.ip_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ip_identity_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY ip_profiles_public_read ON public.ip_profiles FOR SELECT TO aifans_anon, aifans_authenticated USING (public_state = 'published');
CREATE POLICY revisions_public_current_read ON public.ip_identity_revisions FOR SELECT TO aifans_anon, aifans_authenticated USING (EXISTS (SELECT 1 FROM public.ip_profiles ip WHERE ip.profile_id = ip_identity_revisions.ip_profile_id AND ip.public_state = 'published' AND ip.current_identity_revision_id = ip_identity_revisions.id));
CREATE POLICY posts_public_read ON public.posts FOR SELECT TO aifans_anon, aifans_authenticated USING (state = 'published');
CREATE POLICY post_media_public_read ON public.post_media FOR SELECT TO aifans_anon, aifans_authenticated USING (public.is_published_post(post_id));
CREATE POLICY follows_owner_insert ON public.follows FOR INSERT TO aifans_authenticated WITH CHECK (follower_profile_id = public.current_profile_id() AND public.is_public_profile(followed_profile_id));
CREATE POLICY follows_owner_delete ON public.follows FOR DELETE TO aifans_authenticated USING (follower_profile_id = public.current_profile_id());
CREATE POLICY likes_owner_insert ON public.post_likes FOR INSERT TO aifans_authenticated WITH CHECK (profile_id = public.current_profile_id() AND public.is_published_post(post_id));
CREATE POLICY likes_owner_select ON public.post_likes FOR SELECT TO aifans_authenticated USING (profile_id = public.current_profile_id());
CREATE POLICY likes_owner_delete ON public.post_likes FOR DELETE TO aifans_authenticated USING (profile_id = public.current_profile_id());
CREATE POLICY bookmarks_owner_select ON public.bookmarks FOR SELECT TO aifans_authenticated USING (profile_id = public.current_profile_id());
CREATE POLICY bookmarks_owner_insert ON public.bookmarks FOR INSERT TO aifans_authenticated WITH CHECK (profile_id = public.current_profile_id() AND public.is_published_post(post_id));
CREATE POLICY bookmarks_owner_delete ON public.bookmarks FOR DELETE TO aifans_authenticated USING (profile_id = public.current_profile_id());
CREATE POLICY comments_public_read ON public.comments FOR SELECT TO aifans_anon, aifans_authenticated USING (state = 'published');
CREATE POLICY comments_human_insert ON public.comments FOR INSERT TO aifans_authenticated WITH CHECK (author_profile_id = public.current_profile_id() AND source = 'human' AND acting_operator_profile_id IS NULL AND state = 'published' AND public.is_published_post(post_id));
CREATE POLICY comments_owner_soft_delete ON public.comments FOR UPDATE TO aifans_authenticated USING (author_profile_id = public.current_profile_id()) WITH CHECK (author_profile_id = public.current_profile_id() AND state = 'deleted');
CREATE POLICY comment_likes_owner_insert ON public.comment_likes FOR INSERT TO aifans_authenticated WITH CHECK (profile_id = public.current_profile_id() AND EXISTS (SELECT 1 FROM public.comments c WHERE c.id = comment_id AND c.state = 'published'));
CREATE POLICY comment_likes_owner_delete ON public.comment_likes FOR DELETE TO aifans_authenticated USING (profile_id = public.current_profile_id());
CREATE POLICY notifications_owner_select ON public.notifications FOR SELECT TO aifans_authenticated USING (recipient_profile_id = public.current_profile_id());
CREATE POLICY notifications_owner_read ON public.notifications FOR UPDATE TO aifans_authenticated USING (recipient_profile_id = public.current_profile_id() AND read_at IS NULL) WITH CHECK (recipient_profile_id = public.current_profile_id() AND read_at IS NOT NULL);

REVOKE ALL ON TABLE public.ip_profiles, public.ip_identity_revisions, public.posts, public.post_media, public.follows, public.post_likes, public.bookmarks, public.comments, public.comment_likes, public.notifications FROM PUBLIC, aifans_anon, aifans_authenticated;
REVOKE ALL ON TYPE public.ip_source, public.ip_public_state, public.post_state, public.post_source, public.media_kind, public.comment_source, public.comment_state, public.notification_kind FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_profile_id(), public.is_published_post(uuid), public.is_public_profile(uuid), public.ip_profiles_require_valid_profiles(), public.reject_ip_identity_revision_mutation(), public.guard_post(), public.require_publishable_post(), public.guard_comment(), public.guard_notification_read() FROM PUBLIC;
GRANT USAGE ON TYPE public.ip_source, public.ip_public_state, public.post_state, public.post_source, public.media_kind, public.comment_source, public.comment_state, public.notification_kind TO aifans_anon, aifans_authenticated;
GRANT EXECUTE ON FUNCTION public.current_profile_id(), public.is_published_post(uuid), public.is_public_profile(uuid) TO aifans_authenticated;
GRANT SELECT (profile_id, identity_label, created_at, updated_at) ON public.ip_profiles TO aifans_anon, aifans_authenticated;
GRANT SELECT (id, ip_profile_id, version, display_name, bio, languages, created_at) ON public.ip_identity_revisions TO aifans_anon, aifans_authenticated;
GRANT SELECT (id, author_profile_id, state, body, language_code, published_at, created_at, updated_at) ON public.posts TO aifans_anon, aifans_authenticated;
GRANT SELECT (id, post_id, position, alt_text, content_type, width, height, created_at) ON public.post_media TO aifans_anon, aifans_authenticated;
GRANT INSERT, DELETE ON public.follows, public.bookmarks, public.comment_likes TO aifans_authenticated;
GRANT SELECT, INSERT, DELETE ON public.post_likes TO aifans_authenticated;
GRANT SELECT, INSERT, UPDATE (state, deleted_at) ON public.comments TO aifans_authenticated;
GRANT SELECT ON public.comments TO aifans_anon;
GRANT SELECT, INSERT, DELETE ON public.bookmarks TO aifans_authenticated;
GRANT SELECT, UPDATE (read_at) ON public.notifications TO aifans_authenticated;
