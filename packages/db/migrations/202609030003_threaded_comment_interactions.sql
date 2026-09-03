ALTER TABLE public.comments ADD COLUMN root_comment_id uuid;

WITH RECURSIVE roots AS (
  SELECT c.id,c.id AS root_id FROM public.comments c WHERE c.parent_comment_id IS NULL
  UNION ALL
  SELECT child.id,roots.root_id FROM public.comments child JOIN roots ON child.parent_comment_id=roots.id
)
UPDATE public.comments c SET root_comment_id=roots.root_id FROM roots WHERE roots.id=c.id;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.comments GROUP BY root_comment_id HAVING count(*)>500) THEN
    RAISE EXCEPTION 'existing comment root exceeds hard fanout limit';
  END IF;
END $$;
ALTER TABLE public.comments ALTER COLUMN root_comment_id SET NOT NULL;
ALTER TABLE public.comments ADD CONSTRAINT comments_id_post_unique UNIQUE(id,post_id);
ALTER TABLE public.comments ADD CONSTRAINT comments_root_comment_fk FOREIGN KEY(root_comment_id,post_id) REFERENCES public.comments(id,post_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.comments ADD CONSTRAINT comments_parent_same_post_fk FOREIGN KEY(parent_comment_id,post_id) REFERENCES public.comments(id,post_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.comments ADD CONSTRAINT comments_root_shape_check CHECK((parent_comment_id IS NULL AND root_comment_id=id) OR (parent_comment_id IS NOT NULL AND root_comment_id<>id));
CREATE INDEX comments_post_root_created_idx ON public.comments(post_id,root_comment_id,created_at,id);
CREATE INDEX comments_post_root_cursor_idx ON public.comments(post_id,created_at,id) WHERE parent_comment_id IS NULL;

CREATE TABLE public.comment_bookmarks(
  comment_id uuid NOT NULL REFERENCES public.comments(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(comment_id,profile_id)
);
CREATE TABLE public.comment_share_events(
  id uuid PRIMARY KEY,
  comment_id uuid NOT NULL REFERENCES public.comments(id),
  actor_profile_id uuid REFERENCES public.profiles(id),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comment_share_events_comment_id_idempotency_key_unique UNIQUE(comment_id,idempotency_key)
);
CREATE INDEX comment_bookmarks_profile_created_idx ON public.comment_bookmarks(profile_id,created_at DESC);
CREATE INDEX comment_share_events_comment_created_idx ON public.comment_share_events(comment_id,created_at DESC);
CREATE UNIQUE INDEX notifications_comment_like_once_idx ON public.notifications(recipient_profile_id,actor_profile_id,kind,comment_id) WHERE kind='comment_like';

ALTER TABLE public.comment_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_share_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY comment_bookmarks_owner_select ON public.comment_bookmarks FOR SELECT TO aifans_authenticated USING(profile_id=public.current_profile_id());
REVOKE ALL ON TABLE public.comment_bookmarks,public.comment_share_events FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;

CREATE FUNCTION public.social_comment_author_is_public(target_author_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(
   SELECT 1 FROM public.profiles profile
   LEFT JOIN public.ip_profiles ip ON ip.profile_id=profile.id
   LEFT JOIN public.ip_identity_revisions identity ON identity.id=ip.current_identity_revision_id AND identity.ip_profile_id=ip.profile_id
   WHERE profile.id=target_author_id AND (
     profile.account_kind='human' OR (
       profile.account_kind='ip' AND ip.public_state='published' AND identity.id IS NOT NULL
       AND (ip.source<>'creator' OR (ip.active_creator_revision_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.creator_revisions creator WHERE creator.id=ip.active_creator_revision_id)))
     )
   )
 )
$$;
CREATE FUNCTION public.social_comment_is_public(target_comment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.comments comment WHERE comment.id=target_comment_id AND comment.state='published' AND public.social_comment_author_is_public(comment.author_profile_id))
$$;

CREATE FUNCTION public.social_lock_comment_authors(author_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1
 FROM public.ip_profiles ip
 JOIN public.ip_identity_revisions identity ON identity.id=ip.current_identity_revision_id AND identity.ip_profile_id=ip.profile_id
 WHERE ip.profile_id=ANY(author_ids)
 ORDER BY ip.profile_id
 FOR UPDATE OF ip,identity;
 PERFORM 1
 FROM public.ip_profiles ip
 JOIN public.creator_revisions creator ON creator.id=ip.active_creator_revision_id
 WHERE ip.profile_id=ANY(author_ids) AND ip.source='creator'
 ORDER BY ip.profile_id
 FOR UPDATE OF creator;
END $$;

CREATE OR REPLACE FUNCTION public.guard_comment()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE parent_post uuid; parent_root uuid; parent_state public.comment_state;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.parent_comment_id IS NULL THEN
      NEW.root_comment_id:=NEW.id;
    ELSE
      SELECT post_id,root_comment_id INTO parent_post,parent_root FROM public.comments WHERE id=NEW.parent_comment_id;
      IF parent_root IS NOT NULL THEN PERFORM 1 FROM public.comments root WHERE root.id=parent_root FOR UPDATE; END IF;
      SELECT post_id,root_comment_id,state INTO parent_post,parent_root,parent_state
      FROM public.comments WHERE id=NEW.parent_comment_id FOR UPDATE;
      IF parent_post IS NULL OR parent_post<>NEW.post_id OR parent_state<>'published' OR NOT public.social_comment_is_public(NEW.parent_comment_id) THEN
        RAISE EXCEPTION 'invalid reply parent' USING ERRCODE='P0001';
      END IF;
      NEW.root_comment_id:=parent_root;
      IF (SELECT count(*) FROM public.comments member WHERE member.root_comment_id=parent_root)>=500 THEN
        RAISE EXCEPTION 'comment root fanout limit reached' USING ERRCODE='54000';
      END IF;
    END IF;
  ELSIF OLD.root_comment_id IS DISTINCT FROM NEW.root_comment_id THEN
    RAISE EXCEPTION 'comment root is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.source='human' THEN
    IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.author_profile_id AND account_kind='human') THEN RAISE EXCEPTION 'human comments require a human author'; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.author_profile_id AND account_kind='ip') THEN RAISE EXCEPTION 'platform comments require an IP author'; END IF;
  IF NEW.source='admin' AND NOT EXISTS(SELECT 1 FROM public.profile_roles r JOIN public.profiles p ON p.id=r.profile_id WHERE r.profile_id=NEW.acting_operator_profile_id AND r.role='operator' AND r.revoked_at IS NULL AND p.account_kind='human') THEN RAISE EXCEPTION 'admin comments require an active human operator'; END IF;
  IF NEW.source='worker' AND NEW.acting_operator_profile_id IS NOT NULL THEN RAISE EXCEPTION 'worker comments require system attribution'; END IF;
  IF TG_OP='UPDATE' AND NOT(OLD.state='published' AND NEW.state='deleted' AND NEW.deleted_at IS NOT NULL AND OLD.id=NEW.id AND OLD.post_id=NEW.post_id AND OLD.root_comment_id=NEW.root_comment_id AND OLD.parent_comment_id IS NOT DISTINCT FROM NEW.parent_comment_id AND OLD.author_profile_id=NEW.author_profile_id AND OLD.acting_operator_profile_id IS NOT DISTINCT FROM NEW.acting_operator_profile_id AND OLD.source=NEW.source AND OLD.body=NEW.body AND OLD.created_at=NEW.created_at) THEN RAISE EXCEPTION 'comments can only be soft deleted'; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.require_public_comment(target_comment_id uuid)
RETURNS TABLE(comment_id uuid,post_id uuid,author_profile_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target_post uuid; target_root uuid; target_owner uuid; target_author uuid;
BEGIN
  SELECT c.post_id,c.root_comment_id,c.author_profile_id INTO target_post,target_root,target_author FROM public.comments c WHERE c.id=target_comment_id;
  IF target_post IS NULL THEN RAISE EXCEPTION 'published comment not found' USING ERRCODE='P0002'; END IF;
  SELECT p.author_profile_id INTO target_owner FROM public.posts p WHERE p.id=target_post AND p.state='published' FOR UPDATE;
  IF target_owner IS NULL THEN RAISE EXCEPTION 'published comment not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.social_lock_comment_authors(ARRAY[target_owner,target_author]);
  IF NOT public.social_comment_author_is_public(target_owner) OR NOT public.social_comment_author_is_public(target_author) THEN RAISE EXCEPTION 'published comment not found' USING ERRCODE='P0002'; END IF;
  PERFORM 1 FROM public.comments comment
   WHERE comment.id IN (target_root,target_comment_id) AND comment.post_id=target_post
   ORDER BY CASE WHEN comment.id=target_root THEN 0 ELSE 1 END
   FOR UPDATE;
  RETURN QUERY SELECT c.id,c.post_id,c.author_profile_id FROM public.comments c
    WHERE c.id=target_comment_id AND c.post_id=target_post AND c.root_comment_id=target_root AND c.state='published' AND public.social_comment_author_is_public(c.author_profile_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'published comment not found' USING ERRCODE='P0002'; END IF;
END $$;

CREATE FUNCTION public.like_comment(target_comment_id uuid,request_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_id uuid; owner_id uuid; target_post_id uuid; did_create boolean:=false; event_id uuid;
BEGIN
  actor_id:=public.social_current_human_profile_id(); IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
  SELECT post_id,author_profile_id INTO target_post_id,owner_id FROM public.require_public_comment(target_comment_id);
  INSERT INTO public.comment_likes(comment_id,profile_id) VALUES(target_comment_id,actor_id) ON CONFLICT DO NOTHING RETURNING true INTO did_create;
  IF did_create AND owner_id<>actor_id THEN
    INSERT INTO public.notifications(id,recipient_profile_id,actor_profile_id,kind,post_id,comment_id)
    VALUES(gen_random_uuid(),owner_id,actor_id,'comment_like',target_post_id,target_comment_id) ON CONFLICT DO NOTHING;
  END IF;
  IF did_create THEN
    event_id:=gen_random_uuid();
    INSERT INTO public.business_events(id,event_name,schema_version,actor_profile_id,subject_entity_type,subject_entity_id,request_id,environment,properties)
    VALUES(event_id,'comment_liked',1,actor_id,'comment',target_comment_id,request_id,'api',jsonb_build_object('event_id',event_id,'request_id',request_id));
    INSERT INTO public.analytics_outbox(id,business_event_id,destination,payload_version,payload)
    VALUES(gen_random_uuid(),event_id,'posthog',1,jsonb_build_object('event_id',event_id,'event_name','comment_liked','event_version',1,'request_id',request_id));
  END IF;
  RETURN COALESCE(did_create,false);
END $$;
CREATE FUNCTION public.unlike_comment(target_comment_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_id uuid; did_delete boolean:=false;
BEGIN
 actor_id:=public.social_current_human_profile_id(); IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.require_public_comment(target_comment_id);
 DELETE FROM public.comment_likes WHERE comment_id=target_comment_id AND profile_id=actor_id RETURNING true INTO did_delete;
 RETURN COALESCE(did_delete,false);
END $$;
CREATE FUNCTION public.bookmark_comment(target_comment_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_id uuid; did_create boolean:=false;
BEGIN
 actor_id:=public.social_current_human_profile_id(); IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.require_public_comment(target_comment_id);
 INSERT INTO public.comment_bookmarks(comment_id,profile_id) VALUES(target_comment_id,actor_id) ON CONFLICT DO NOTHING RETURNING true INTO did_create;
 RETURN COALESCE(did_create,false);
END $$;
CREATE FUNCTION public.unbookmark_comment(target_comment_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_id uuid; did_delete boolean:=false;
BEGIN
 actor_id:=public.social_current_human_profile_id(); IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.require_public_comment(target_comment_id);
 DELETE FROM public.comment_bookmarks WHERE comment_id=target_comment_id AND profile_id=actor_id RETURNING true INTO did_delete;
 RETURN COALESCE(did_delete,false);
END $$;
CREATE FUNCTION public.record_comment_share(target_comment_id uuid,command_idempotency_key uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_id uuid; did_create boolean:=false;
BEGIN
 actor_id:=public.social_current_human_profile_id();
 PERFORM 1 FROM public.require_public_comment(target_comment_id);
 INSERT INTO public.comment_share_events(id,comment_id,actor_profile_id,idempotency_key)
 VALUES(gen_random_uuid(),target_comment_id,actor_id,command_idempotency_key)
 ON CONFLICT ON CONSTRAINT comment_share_events_comment_id_idempotency_key_unique DO NOTHING RETURNING true INTO did_create;
 RETURN COALESCE(did_create,false);
END $$;

DROP FUNCTION public.create_human_comment(uuid,uuid,text,uuid);
CREATE FUNCTION public.create_human_comment(target_post_id uuid,parent_id uuid,comment_body text,request_id uuid)
RETURNS TABLE(id uuid,created_at timestamptz,root_comment_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_id uuid; owner_id uuid; recipient_id uuid; event_id uuid; parent_post uuid; parent_root uuid; parent_author uuid;
BEGIN
 actor_id:=public.social_current_human_profile_id(); IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
 IF parent_id IS NOT NULL THEN
   SELECT parent.post_id,parent.root_comment_id,parent.author_profile_id INTO parent_post,parent_root,parent_author FROM public.comments parent WHERE parent.id=parent_id;
 END IF;
 SELECT post.author_profile_id INTO owner_id FROM public.posts post WHERE post.id=target_post_id AND post.state='published' FOR UPDATE;
 IF owner_id IS NULL THEN RAISE EXCEPTION 'published post not found' USING ERRCODE='P0002'; END IF;
 PERFORM public.social_lock_comment_authors(ARRAY[owner_id,parent_author]);
 IF NOT public.social_comment_author_is_public(owner_id) THEN RAISE EXCEPTION 'published post not found' USING ERRCODE='P0002'; END IF;
 recipient_id:=owner_id;
 IF parent_id IS NOT NULL THEN
   PERFORM 1 FROM public.comments comment
   WHERE comment.id IN (parent_root,parent_id) AND comment.post_id=target_post_id
   ORDER BY CASE WHEN comment.id=parent_root THEN 0 ELSE 1 END
   FOR UPDATE;
   SELECT parent.author_profile_id INTO recipient_id FROM public.comments parent
   WHERE parent.id=parent_id AND parent.post_id=target_post_id AND parent.post_id=parent_post AND parent.root_comment_id=parent_root AND parent.state='published' AND public.social_comment_author_is_public(parent.author_profile_id);
   IF recipient_id IS NULL THEN RAISE EXCEPTION 'invalid reply parent' USING ERRCODE='P0001'; END IF;
 END IF;
 id:=gen_random_uuid();
 INSERT INTO public.comments(id,post_id,parent_comment_id,author_profile_id,source,body) VALUES(id,target_post_id,parent_id,actor_id,'human',comment_body)
 RETURNING comments.created_at,comments.root_comment_id INTO created_at,root_comment_id;
 event_id:=gen_random_uuid();
 INSERT INTO public.business_events(id,event_name,schema_version,actor_profile_id,subject_entity_type,subject_entity_id,request_id,environment,properties)
 VALUES(event_id,'comment_created',1,actor_id,'comment',id,request_id,'api',jsonb_build_object('event_id',event_id,'request_id',request_id));
 INSERT INTO public.analytics_outbox(id,business_event_id,destination,payload_version,payload)
 VALUES(gen_random_uuid(),event_id,'posthog',1,jsonb_build_object('event_id',event_id,'event_name','comment_created','event_version',1,'request_id',request_id));
 IF recipient_id<>actor_id THEN INSERT INTO public.notifications(id,recipient_profile_id,actor_profile_id,kind,post_id,comment_id)
 VALUES(gen_random_uuid(),recipient_id,actor_id,CASE WHEN parent_id IS NULL THEN 'comment'::public.notification_kind ELSE 'reply'::public.notification_kind END,target_post_id,id); END IF;
 RETURN NEXT;
END $$;

DROP FUNCTION public.platform_publish_ip_comment(uuid,uuid,text,uuid,uuid);
CREATE FUNCTION public.platform_publish_ip_comment(target_post_id uuid,represented_ip_profile_id uuid,requested_body text,requested_parent_comment_id uuid,request_id uuid)
RETURNS TABLE(comment_id uuid,post_id uuid,parent_comment_id uuid,root_comment_id uuid,body text,created_at timestamptz,id uuid,username text,display_name text,bio text,languages text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE operator_id uuid; target_author_profile_id uuid; target_post_state public.post_state; parent_post uuid; parent_root uuid; parent_author uuid; created_comment_id uuid:=gen_random_uuid(); event_id uuid:=gen_random_uuid(); created_time timestamptz:=clock_timestamp();
BEGIN
 IF request_id IS NULL THEN RAISE EXCEPTION 'request id required' USING ERRCODE='23502'; END IF;
 SELECT p.id INTO operator_id FROM public.profiles p JOIN public.profile_roles pr ON pr.profile_id=p.id
 WHERE p.account_kind='human' AND p.auth_subject=app.current_auth_subject() AND pr.role='operator' AND pr.revoked_at IS NULL FOR UPDATE OF p,pr;
 IF operator_id IS NULL THEN RAISE EXCEPTION 'active human operator required' USING ERRCODE='42501'; END IF;
 IF requested_parent_comment_id IS NOT NULL THEN
   SELECT parent.post_id,parent.root_comment_id,parent.author_profile_id INTO parent_post,parent_root,parent_author FROM public.comments parent WHERE parent.id=requested_parent_comment_id;
 END IF;
 SELECT target.author_profile_id,target.state INTO target_author_profile_id,target_post_state FROM public.posts target WHERE target.id=target_post_id FOR UPDATE OF target;
 IF target_author_profile_id IS NULL THEN RAISE EXCEPTION 'published post not found' USING ERRCODE='P0002'; END IF;
 PERFORM public.social_lock_comment_authors(ARRAY[target_author_profile_id,represented_ip_profile_id,parent_author]);
 IF NOT public.social_comment_author_is_public(target_author_profile_id) THEN RAISE EXCEPTION 'published post not found' USING ERRCODE='P0002'; END IF;
 IF NOT public.social_comment_author_is_public(represented_ip_profile_id) OR NOT EXISTS(SELECT 1 FROM public.ip_profiles ip WHERE ip.profile_id=represented_ip_profile_id AND ip.operation_enabled) THEN RAISE EXCEPTION 'IP not publishable' USING ERRCODE='P0001'; END IF;
 IF target_post_state<>'published' THEN RAISE EXCEPTION 'published post not found' USING ERRCODE='P0002'; END IF;
 IF requested_parent_comment_id IS NOT NULL THEN
   PERFORM 1 FROM public.comments comment
   WHERE comment.id IN (parent_root,requested_parent_comment_id) AND comment.post_id=target_post_id
   ORDER BY CASE WHEN comment.id=parent_root THEN 0 ELSE 1 END
   FOR UPDATE;
   PERFORM 1 FROM public.comments parent WHERE parent.id=requested_parent_comment_id AND parent.post_id=target_post_id AND parent.post_id=parent_post AND parent.root_comment_id=parent_root AND parent.state='published' AND public.social_comment_author_is_public(parent.author_profile_id);
   IF NOT FOUND THEN RAISE EXCEPTION 'invalid comment thread' USING ERRCODE='23514'; END IF;
 END IF;
 INSERT INTO public.comments(id,post_id,parent_comment_id,author_profile_id,acting_operator_profile_id,source,body,state,created_at)
 VALUES(created_comment_id,target_post_id,requested_parent_comment_id,represented_ip_profile_id,operator_id,'admin',requested_body,'published',created_time);
 INSERT INTO public.audit_events(id,actor_type,actor_profile_id,action,entity_type,entity_id,request_id,source_app,result,change_summary)
 VALUES(gen_random_uuid(),'operator',operator_id,'ip_comment_published','comment',created_comment_id,request_id,'admin','succeeded',jsonb_build_object('source','admin','represented_ip_profile_id',represented_ip_profile_id));
 INSERT INTO public.workflow_transitions(id,entity_type,entity_id,previous_state,next_state,actor_profile_id,reason_code,request_id)
 VALUES(gen_random_uuid(),'comment',created_comment_id,NULL,'published',operator_id,'admin_publish',request_id);
 INSERT INTO public.business_events(id,event_name,schema_version,actor_profile_id,subject_entity_type,subject_entity_id,request_id,environment,properties)
 VALUES(event_id,'ip_comment_published',1,operator_id,'comment',created_comment_id,request_id,'admin',jsonb_build_object('event_id',event_id,'request_id',request_id,'ip_profile_id',represented_ip_profile_id,'post_id',target_post_id,'action_source','admin'));
 INSERT INTO public.analytics_outbox(id,business_event_id,destination,payload_version,payload)
 VALUES(gen_random_uuid(),event_id,'posthog',1,jsonb_build_object('event_id',event_id,'event_name','ip_comment_published','event_version',1,'request_id',request_id,'ip_profile_id',represented_ip_profile_id,'post_id',target_post_id,'action_source','admin'));
 RETURN QUERY SELECT c.id,c.post_id,c.parent_comment_id,c.root_comment_id,c.body,c.created_at,profile.id,profile.username,r.display_name,r.bio,r.languages
 FROM public.comments c JOIN public.profiles profile ON profile.id=c.author_profile_id JOIN public.ip_profiles ip ON ip.profile_id=profile.id JOIN public.ip_identity_revisions r ON r.id=ip.current_identity_revision_id WHERE c.id=created_comment_id;
END $$;

CREATE FUNCTION public.social_public_comment_threads(target_post_id uuid,after_root_created_at timestamptz,after_root_id uuid,root_limit integer)
RETURNS TABLE(
 id uuid,post_id uuid,root_comment_id uuid,parent_comment_id uuid,author_id uuid,author_kind public.account_kind,
 username text,display_name text,body text,state public.comment_state,created_at timestamptz,
 like_count integer,reply_count integer,bookmark_count integer,share_count integer,
 viewer_has_liked boolean,viewer_has_bookmarked boolean,root_created_at text,root_ordinal integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH selected_roots AS MATERIALIZED (
   SELECT root.id,root.created_at,row_number() OVER(ORDER BY root.created_at,root.id)::integer AS ordinal
   FROM public.comments root
   JOIN public.posts post ON post.id=root.post_id AND post.state='published'
   JOIN public.ip_profiles post_ip ON post_ip.profile_id=post.author_profile_id AND post_ip.public_state='published'
   JOIN public.ip_identity_revisions post_revision ON post_revision.id=post_ip.current_identity_revision_id AND post_revision.ip_profile_id=post_ip.profile_id
   WHERE root.post_id=target_post_id AND root.parent_comment_id IS NULL AND public.social_comment_author_is_public(post.author_profile_id)
     AND (public.social_comment_is_public(root.id) OR EXISTS(SELECT 1 FROM public.comments child WHERE child.root_comment_id=root.id AND child.id<>root.id AND public.social_comment_is_public(child.id)))
     AND (after_root_id IS NULL OR (root.created_at,root.id)>(after_root_created_at,after_root_id))
   ORDER BY root.created_at,root.id LIMIT LEAST(GREATEST(COALESCE(root_limit,1),1),51)
 )
 SELECT c.id,c.post_id,c.root_comment_id,c.parent_comment_id,
   CASE WHEN NOT public.social_comment_is_public(c.id) THEN NULL ELSE p.id END,
   CASE WHEN NOT public.social_comment_is_public(c.id) THEN NULL ELSE p.account_kind END,
   CASE WHEN NOT public.social_comment_is_public(c.id) THEN NULL ELSE p.username END,
   CASE WHEN NOT public.social_comment_is_public(c.id) THEN NULL ELSE COALESCE(ir.display_name,p.display_name) END,
   CASE WHEN public.social_comment_is_public(c.id) THEN c.body ELSE NULL END,
   CASE WHEN public.social_comment_is_public(c.id) THEN c.state ELSE 'deleted'::public.comment_state END,c.created_at,
   CASE WHEN public.social_comment_is_public(c.id) THEN (SELECT count(*) FROM public.comment_likes l WHERE l.comment_id=c.id)::integer ELSE 0 END,
   CASE WHEN public.social_comment_is_public(c.id) THEN (SELECT count(*) FROM public.comments r WHERE r.parent_comment_id=c.id AND public.social_comment_is_public(r.id))::integer ELSE 0 END,
   CASE WHEN public.social_comment_is_public(c.id) THEN (SELECT count(*) FROM public.comment_bookmarks b WHERE b.comment_id=c.id)::integer ELSE 0 END,
   CASE WHEN public.social_comment_is_public(c.id) THEN (SELECT count(*) FROM public.comment_share_events s WHERE s.comment_id=c.id)::integer ELSE 0 END,
   CASE WHEN public.social_comment_is_public(c.id) AND public.social_current_human_profile_id() IS NOT NULL THEN EXISTS(SELECT 1 FROM public.comment_likes l WHERE l.comment_id=c.id AND l.profile_id=public.social_current_human_profile_id()) ELSE false END,
   CASE WHEN public.social_comment_is_public(c.id) AND public.social_current_human_profile_id() IS NOT NULL THEN EXISTS(SELECT 1 FROM public.comment_bookmarks b WHERE b.comment_id=c.id AND b.profile_id=public.social_current_human_profile_id()) ELSE false END,
   to_char(roots.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),roots.ordinal
 FROM selected_roots roots JOIN public.comments c ON c.root_comment_id=roots.id
 JOIN public.profiles p ON p.id=c.author_profile_id
 LEFT JOIN public.ip_profiles ip ON ip.profile_id=p.id AND ip.public_state='published'
 LEFT JOIN public.ip_identity_revisions ir ON ir.id=ip.current_identity_revision_id
 WHERE public.social_comment_is_public(c.id) OR (c.id=roots.id AND EXISTS(SELECT 1 FROM public.comments child WHERE child.root_comment_id=roots.id AND child.id<>roots.id AND public.social_comment_is_public(child.id)))
 ORDER BY roots.created_at,roots.id,CASE WHEN c.id=roots.id THEN 0 ELSE 1 END,c.created_at,c.id
$$;

CREATE FUNCTION public.social_public_comment_context(target_post_id uuid,target_comment_id uuid)
RETURNS TABLE(
 id uuid,post_id uuid,root_comment_id uuid,parent_comment_id uuid,author_id uuid,author_kind public.account_kind,
 username text,display_name text,body text,state public.comment_state,created_at timestamptz,
 like_count integer,reply_count integer,bookmark_count integer,share_count integer,
 viewer_has_liked boolean,viewer_has_bookmarked boolean,root_created_at text,root_ordinal integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH target AS MATERIALIZED (
   SELECT comment.root_comment_id
   FROM public.comments comment
   WHERE comment.id=target_comment_id AND comment.post_id=target_post_id AND public.social_comment_is_public(comment.id)
 ), predecessor AS MATERIALIZED (
   SELECT root.created_at,root.id
   FROM public.comments root
   WHERE root.post_id=target_post_id AND root.parent_comment_id IS NULL
     AND (public.social_comment_is_public(root.id) OR EXISTS(SELECT 1 FROM public.comments child WHERE child.root_comment_id=root.id AND child.id<>root.id AND public.social_comment_is_public(child.id)))
     AND (root.created_at,root.id)<(SELECT selected.created_at,selected.id FROM public.comments selected JOIN target ON target.root_comment_id=selected.id)
   ORDER BY root.created_at DESC,root.id DESC LIMIT 1
 )
 SELECT thread.* FROM target
 CROSS JOIN LATERAL public.social_public_comment_threads(target_post_id,(SELECT created_at FROM predecessor),(SELECT id FROM predecessor),1) thread
 WHERE thread.root_comment_id=target.root_comment_id
$$;

CREATE OR REPLACE FUNCTION public.social_public_comments(target_post_id uuid,after_created_at timestamptz,after_id uuid,page_limit integer)
RETURNS TABLE(
 id uuid,post_id uuid,parent_comment_id uuid,author_id uuid,author_kind public.account_kind,
 username text,display_name text,body text,state public.comment_state,created_at timestamptz,
 visual_type public.creator_visual_type,creator_id uuid,creator_username text,creator_display_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT c.id,c.post_id,c.parent_comment_id,profile.id,profile.account_kind,profile.username,
   CASE WHEN profile.account_kind='ip' THEN identity.display_name ELSE profile.display_name END,
   c.body,c.state,c.created_at,
   CASE WHEN profile.account_kind='ip' THEN CASE WHEN ip.source='creator' THEN creator_revision.visual_type ELSE ip.visual_type END END,
   creator.id,creator.username,creator.display_name
 FROM public.comments c
 JOIN public.posts post ON post.id=c.post_id
 JOIN public.profiles profile ON profile.id=c.author_profile_id
 LEFT JOIN public.ip_profiles ip ON ip.profile_id=profile.id
 LEFT JOIN public.ip_identity_revisions identity ON identity.id=ip.current_identity_revision_id AND identity.ip_profile_id=ip.profile_id
 LEFT JOIN public.creator_revisions creator_revision ON creator_revision.id=ip.active_creator_revision_id AND ip.source='creator'
 LEFT JOIN public.profiles creator ON creator.id=ip.creator_profile_id AND creator.account_kind='human'
 WHERE c.post_id=target_post_id
   AND post.state='published'
   AND public.social_comment_author_is_public(post.author_profile_id)
   AND public.social_comment_is_public(c.id)
   AND (after_id IS NULL OR (c.created_at,c.id)>(
     SELECT anchor.created_at,anchor.id FROM public.comments anchor WHERE anchor.id=after_id AND anchor.post_id=target_post_id
   ))
 ORDER BY c.created_at,c.id LIMIT LEAST(GREATEST(page_limit,1),51)
$$;

REVOKE INSERT,DELETE ON public.comment_likes FROM aifans_authenticated;
REVOKE INSERT ON public.comments FROM aifans_authenticated;
REVOKE SELECT(id,post_id,parent_comment_id,author_profile_id,body,state,created_at) ON public.comments FROM aifans_anon,aifans_authenticated;
REVOKE ALL ON FUNCTION public.social_comment_author_is_public(uuid),public.social_comment_is_public(uuid),public.social_lock_comment_authors(uuid[]),public.require_public_comment(uuid),public.like_comment(uuid,uuid),public.unlike_comment(uuid),public.bookmark_comment(uuid),public.unbookmark_comment(uuid),public.record_comment_share(uuid,uuid),public.social_public_comment_threads(uuid,timestamptz,uuid,integer),public.social_public_comment_context(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.like_comment(uuid,uuid),public.unlike_comment(uuid),public.bookmark_comment(uuid),public.unbookmark_comment(uuid) TO aifans_authenticated;
GRANT EXECUTE ON FUNCTION public.record_comment_share(uuid,uuid),public.social_public_comment_threads(uuid,timestamptz,uuid,integer),public.social_public_comment_context(uuid,uuid) TO aifans_anon,aifans_authenticated;
REVOKE ALL ON FUNCTION public.create_human_comment(uuid,uuid,text,uuid),public.platform_publish_ip_comment(uuid,uuid,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_human_comment(uuid,uuid,text,uuid) TO aifans_authenticated;
GRANT EXECUTE ON FUNCTION public.platform_publish_ip_comment(uuid,uuid,text,uuid,uuid) TO aifans_platform;
