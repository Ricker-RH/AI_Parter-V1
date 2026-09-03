CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE public.channel_status AS ENUM ('draft','published','archived');

CREATE TABLE public.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug)<=80),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '' CHECK (char_length(description)<=280),
  image_object_key text CHECK (image_object_key IS NULL OR image_object_key ~ '^public/channels/[0-9a-f-]+\.(jpg|png|webp)$'),
  search_document text NOT NULL,
  status public.channel_status NOT NULL DEFAULT 'draft',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.channel_search_aliases (
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  alias text NOT NULL CHECK (char_length(alias) BETWEEN 1 AND 80),
  normalized_alias text NOT NULL CHECK (char_length(normalized_alias) BETWEEN 1 AND 80),
  PRIMARY KEY(channel_id,normalized_alias)
);
CREATE TABLE public.channel_ip_profiles (
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  ip_profile_id uuid NOT NULL REFERENCES public.ip_profiles(profile_id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  curation_weight integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(channel_id,ip_profile_id)
);
CREATE UNIQUE INDEX channel_ip_profiles_one_primary_per_ip_idx ON public.channel_ip_profiles(ip_profile_id) WHERE is_primary;
CREATE INDEX channels_public_order_idx ON public.channels(sort_order,id) WHERE status='published';
CREATE INDEX channels_search_document_trgm_idx ON public.channels USING gin(search_document gin_trgm_ops);
CREATE INDEX channel_aliases_search_trgm_idx ON public.channel_search_aliases USING gin(normalized_alias gin_trgm_ops);
CREATE INDEX channel_ip_profiles_recommendation_idx ON public.channel_ip_profiles(channel_id,curation_weight DESC,ip_profile_id DESC);
CREATE INDEX posts_channel_cursor_idx ON public.posts(author_profile_id,published_at DESC,id DESC) WHERE state='published';

CREATE FUNCTION public.channel_membership_requires_ip() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p JOIN public.ip_profiles ip ON ip.profile_id=p.id WHERE p.id=NEW.ip_profile_id AND p.account_kind='ip' AND ip.public_state='published') THEN
    RAISE EXCEPTION 'channel membership requires a published IP profile' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER channel_ip_profiles_require_ip BEFORE INSERT OR UPDATE ON public.channel_ip_profiles FOR EACH ROW EXECUTE FUNCTION public.channel_membership_requires_ip();

CREATE FUNCTION public.refresh_channel_search_document(target_channel_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  UPDATE public.channels c SET search_document=lower(concat_ws(' ',c.name,c.description,(SELECT string_agg(a.normalized_alias,' ') FROM public.channel_search_aliases a WHERE a.channel_id=c.id))),updated_at=clock_timestamp() WHERE c.id=target_channel_id
$$;

CREATE FUNCTION public.channel_public_list(search_query text,after_rank double precision,after_sort_order integer,after_id uuid,page_limit integer)
RETURNS TABLE(id uuid,slug text,name text,description text,image_object_key text,ip_count bigint,sort_order integer,search_rank double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH input AS (SELECT lower(trim(coalesce(search_query,''))) q), ranked AS (
    SELECT c.*,CASE WHEN input.q='' THEN 0::double precision ELSE public.similarity(c.search_document,input.q)::double precision END rank
    FROM public.channels c CROSS JOIN input
    WHERE c.status='published' AND (input.q='' OR c.search_document ILIKE '%'||replace(replace(replace(input.q,chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%' ESCAPE chr(92))
  )
  SELECT r.id,r.slug,r.name,r.description,r.image_object_key,count(ip.profile_id),r.sort_order,r.rank
  FROM ranked r LEFT JOIN public.channel_ip_profiles cip ON cip.channel_id=r.id
  LEFT JOIN public.ip_profiles ip ON ip.profile_id=cip.ip_profile_id AND ip.public_state='published'
  WHERE after_id IS NULL OR r.rank<after_rank OR (r.rank=after_rank AND r.sort_order>after_sort_order) OR (r.rank=after_rank AND r.sort_order=after_sort_order AND r.id>after_id)
  GROUP BY r.id,r.slug,r.name,r.description,r.image_object_key,r.sort_order,r.rank
  ORDER BY r.rank DESC,r.sort_order,r.id LIMIT LEAST(GREATEST(page_limit,1),51)
$$;

CREATE FUNCTION public.channel_public_get(requested_slug text)
RETURNS TABLE(id uuid,slug text,name text,description text,image_object_key text,ip_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT c.id,c.slug,c.name,c.description,c.image_object_key,count(ip.profile_id)
 FROM public.channels c LEFT JOIN public.channel_ip_profiles cip ON cip.channel_id=c.id
 LEFT JOIN public.ip_profiles ip ON ip.profile_id=cip.ip_profile_id AND ip.public_state='published'
 WHERE c.slug=requested_slug AND c.status='published' GROUP BY c.id
$$;

CREATE FUNCTION public.channel_public_profiles(requested_slug text,after_curation integer,after_feed integer,after_latest timestamptz,after_profile_id uuid,page_limit integer)
RETURNS TABLE(channel_id uuid,id uuid,username text,display_name text,bio text,languages text[],visual_type public.creator_visual_type,creator_id uuid,creator_username text,creator_display_name text,curation_weight integer,feed_weight integer,latest_published_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH rows AS (
  SELECT c.id channel_id,p.id,p.username,identity.display_name,identity.bio,identity.languages,
   CASE WHEN ip.source='creator' THEN revision.visual_type ELSE ip.visual_type END visual_type,
   creator.id creator_id,creator.username creator_username,creator.display_name creator_display_name,
   cip.curation_weight,ip.feed_weight,date_trunc('milliseconds',latest.published_at) latest_published_at
  FROM public.channels c JOIN public.channel_ip_profiles cip ON cip.channel_id=c.id
  JOIN public.ip_profiles ip ON ip.profile_id=cip.ip_profile_id AND ip.public_state='published'
  JOIN public.profiles p ON p.id=ip.profile_id AND p.account_kind='ip'
  JOIN public.ip_identity_revisions identity ON identity.id=ip.current_identity_revision_id AND identity.ip_profile_id=ip.profile_id
  LEFT JOIN public.creator_revisions revision ON revision.id=ip.active_creator_revision_id AND ip.source='creator'
  LEFT JOIN public.profiles creator ON creator.id=ip.creator_profile_id AND creator.account_kind='human'
  LEFT JOIN LATERAL (SELECT post.published_at FROM public.posts post WHERE post.author_profile_id=ip.profile_id AND post.state='published' ORDER BY post.published_at DESC,post.id DESC LIMIT 1) latest ON true
  WHERE c.slug=requested_slug AND c.status='published' AND (ip.source<>'creator' OR revision.id IS NOT NULL)
 ) SELECT * FROM rows r WHERE after_profile_id IS NULL
   OR r.curation_weight<after_curation
   OR (r.curation_weight=after_curation AND r.feed_weight<after_feed)
   OR (r.curation_weight=after_curation AND r.feed_weight=after_feed AND after_latest IS NOT NULL AND (r.latest_published_at<after_latest OR r.latest_published_at IS NULL))
   OR (r.curation_weight=after_curation AND r.feed_weight=after_feed AND r.latest_published_at IS NOT DISTINCT FROM after_latest AND r.id<after_profile_id)
 ORDER BY curation_weight DESC,feed_weight DESC,latest_published_at DESC NULLS LAST,id DESC LIMIT LEAST(GREATEST(page_limit,1),51)
$$;

CREATE FUNCTION public.channel_public_posts(requested_slug text,after_published_at timestamptz,after_id uuid,page_limit integer)
RETURNS TABLE(channel_id uuid,post_id uuid,body text,language_code text,published_at timestamptz,id uuid,username text,display_name text,bio text,languages text[],visual_type public.creator_visual_type,creator_id uuid,creator_username text,creator_display_name text,like_count integer,comment_count integer,bookmark_count integer,share_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT c.id,p.post_id,p.body,p.language_code,date_trunc('milliseconds',p.published_at),p.id,p.username,p.display_name,p.bio,p.languages,p.visual_type,p.creator_id,p.creator_username,p.creator_display_name,
  metrics.like_count,metrics.comment_count,metrics.bookmark_count,metrics.share_count
 FROM public.channels c JOIN public.channel_ip_profiles cip ON cip.channel_id=c.id
 JOIN public.social_public_posts() p ON p.author_profile_id=cip.ip_profile_id
 CROSS JOIN LATERAL public.social_post_metrics(p.post_id,p.author_profile_id,NULL::text) metrics
 WHERE c.slug=requested_slug AND c.status='published' AND (after_id IS NULL OR (date_trunc('milliseconds',p.published_at),p.post_id)<(date_trunc('milliseconds',after_published_at),after_id))
 ORDER BY date_trunc('milliseconds',p.published_at) DESC,p.post_id DESC LIMIT LEAST(GREATEST(page_limit,1),51)
$$;

CREATE FUNCTION public.channel_current_operator() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.id FROM public.profiles p JOIN public.profile_roles r ON r.profile_id=p.id WHERE p.account_kind='human' AND p.auth_subject=app.current_auth_subject() AND r.role='operator' AND r.revoked_at IS NULL LIMIT 1
$$;
CREATE FUNCTION public.platform_channel_record(requested_id uuid)
RETURNS TABLE(id uuid,slug text,name text,description text,image_object_key text,ip_count bigint,status public.channel_status,sort_order integer,aliases text[],created_at timestamptz,updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF public.channel_current_operator() IS NULL THEN RAISE EXCEPTION 'active operator required' USING ERRCODE='42501';END IF;
 RETURN QUERY SELECT c.id,c.slug,c.name,c.description,c.image_object_key,count(DISTINCT cip.ip_profile_id),c.status,c.sort_order,coalesce(array_agg(DISTINCT a.alias ORDER BY a.alias) FILTER(WHERE a.alias IS NOT NULL),ARRAY[]::text[]),c.created_at,c.updated_at
 FROM public.channels c LEFT JOIN public.channel_ip_profiles cip ON cip.channel_id=c.id LEFT JOIN public.channel_search_aliases a ON a.channel_id=c.id
 WHERE c.id=requested_id GROUP BY c.id;
END $$;
CREATE FUNCTION public.platform_list_channels(search_query text,requested_status public.channel_status,after_sort_order integer,after_updated_at timestamptz,after_id uuid,page_limit integer)
RETURNS TABLE(id uuid,slug text,name text,description text,image_object_key text,ip_count bigint,status public.channel_status,sort_order integer,aliases text[],created_at timestamptz,updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF public.channel_current_operator() IS NULL THEN RAISE EXCEPTION 'active operator required' USING ERRCODE='42501';END IF;
 RETURN QUERY SELECT c.id,c.slug,c.name,c.description,c.image_object_key,count(DISTINCT cip.ip_profile_id),c.status,c.sort_order,coalesce(array_agg(DISTINCT a.alias ORDER BY a.alias) FILTER(WHERE a.alias IS NOT NULL),ARRAY[]::text[]),c.created_at,date_trunc('milliseconds',c.updated_at)
 FROM public.channels c LEFT JOIN public.channel_ip_profiles cip ON cip.channel_id=c.id LEFT JOIN public.channel_search_aliases a ON a.channel_id=c.id
 WHERE (requested_status IS NULL OR c.status=requested_status) AND (coalesce(trim(search_query),'')='' OR c.search_document ILIKE '%'||replace(replace(replace(lower(trim(search_query)),chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%' ESCAPE chr(92))
 AND (after_id IS NULL OR c.sort_order>after_sort_order OR (c.sort_order=after_sort_order AND date_trunc('milliseconds',c.updated_at)<date_trunc('milliseconds',after_updated_at)) OR (c.sort_order=after_sort_order AND date_trunc('milliseconds',c.updated_at)=date_trunc('milliseconds',after_updated_at) AND c.id<after_id))
 GROUP BY c.id ORDER BY c.sort_order ASC,date_trunc('milliseconds',c.updated_at) DESC,c.id DESC LIMIT LEAST(GREATEST(page_limit,1),51);
END $$;
CREATE FUNCTION public.platform_create_channel(requested_slug text,requested_name text,requested_description text,requested_image_object_key text,requested_sort_order integer,request_id uuid)
RETURNS SETOF public.channels LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE operator_id uuid:=public.channel_current_operator();created public.channels;
BEGIN IF operator_id IS NULL THEN RAISE EXCEPTION 'active operator required' USING ERRCODE='42501';END IF;
 INSERT INTO public.channels(slug,name,description,image_object_key,search_document,sort_order) VALUES(requested_slug,requested_name,requested_description,requested_image_object_key,lower(concat_ws(' ',requested_name,requested_description)),requested_sort_order) RETURNING * INTO created;
 INSERT INTO public.audit_events(id,actor_type,actor_profile_id,action,entity_type,entity_id,request_id,source_app,result,change_summary) VALUES(gen_random_uuid(),'operator',operator_id,'channel_created','channel',created.id,request_id,'admin','succeeded','{}');RETURN NEXT created;END $$;
CREATE FUNCTION public.platform_update_channel(requested_id uuid,requested_name text,requested_description text,requested_image_object_key text,replace_image boolean,requested_sort_order integer,request_id uuid)
RETURNS SETOF public.channels LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE operator_id uuid:=public.channel_current_operator();updated public.channels;
BEGIN IF operator_id IS NULL THEN RAISE EXCEPTION 'active operator required' USING ERRCODE='42501';END IF;
 UPDATE public.channels SET name=coalesce(requested_name,name),description=coalesce(requested_description,description),image_object_key=CASE WHEN replace_image THEN requested_image_object_key ELSE image_object_key END,sort_order=coalesce(requested_sort_order,sort_order),updated_at=clock_timestamp() WHERE id=requested_id RETURNING * INTO updated;IF NOT FOUND THEN RAISE EXCEPTION 'channel not found' USING ERRCODE='P0002';END IF;PERFORM public.refresh_channel_search_document(requested_id);
 INSERT INTO public.audit_events(id,actor_type,actor_profile_id,action,entity_type,entity_id,request_id,source_app,result,change_summary) VALUES(gen_random_uuid(),'operator',operator_id,'channel_updated','channel',requested_id,request_id,'admin','succeeded','{}');RETURN NEXT updated;END $$;
CREATE FUNCTION public.platform_set_channel_status(requested_id uuid,requested_status public.channel_status,request_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE operator_id uuid:=public.channel_current_operator();BEGIN IF operator_id IS NULL THEN RAISE EXCEPTION 'active operator required' USING ERRCODE='42501';END IF;UPDATE public.channels SET status=requested_status,updated_at=clock_timestamp() WHERE id=requested_id;IF NOT FOUND THEN RAISE EXCEPTION 'channel not found' USING ERRCODE='P0002';END IF;INSERT INTO public.audit_events(id,actor_type,actor_profile_id,action,entity_type,entity_id,request_id,source_app,result,change_summary) VALUES(gen_random_uuid(),'operator',operator_id,'channel_status_changed','channel',requested_id,request_id,'admin','succeeded',jsonb_build_object('status',requested_status));END $$;
CREATE FUNCTION public.platform_replace_channel_aliases(requested_id uuid,requested_aliases text[],request_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE operator_id uuid:=public.channel_current_operator();BEGIN IF operator_id IS NULL THEN RAISE EXCEPTION 'active operator required' USING ERRCODE='42501';END IF;PERFORM 1 FROM public.channels WHERE id=requested_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'channel not found' USING ERRCODE='P0002';END IF;DELETE FROM public.channel_search_aliases WHERE channel_id=requested_id;INSERT INTO public.channel_search_aliases(channel_id,alias,normalized_alias) SELECT requested_id,trim(alias),lower(trim(regexp_replace(alias,'\s+',' ','g'))) FROM unnest(requested_aliases) alias;PERFORM public.refresh_channel_search_document(requested_id);INSERT INTO public.audit_events(id,actor_type,actor_profile_id,action,entity_type,entity_id,request_id,source_app,result,change_summary) VALUES(gen_random_uuid(),'operator',operator_id,'channel_aliases_replaced','channel',requested_id,request_id,'admin','succeeded',jsonb_build_object('alias_count',cardinality(requested_aliases)));END $$;
CREATE FUNCTION public.platform_set_channel_membership(requested_id uuid,requested_ip_id uuid,requested_primary boolean,requested_weight integer,request_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE operator_id uuid:=public.channel_current_operator();BEGIN IF operator_id IS NULL THEN RAISE EXCEPTION 'active operator required' USING ERRCODE='42501';END IF;PERFORM 1 FROM public.channels WHERE id=requested_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'channel not found' USING ERRCODE='P0002';END IF;IF requested_primary THEN UPDATE public.channel_ip_profiles SET is_primary=false,updated_at=clock_timestamp() WHERE ip_profile_id=requested_ip_id;END IF;INSERT INTO public.channel_ip_profiles(channel_id,ip_profile_id,is_primary,curation_weight) VALUES(requested_id,requested_ip_id,requested_primary,requested_weight) ON CONFLICT(channel_id,ip_profile_id) DO UPDATE SET is_primary=excluded.is_primary,curation_weight=excluded.curation_weight,updated_at=clock_timestamp();INSERT INTO public.audit_events(id,actor_type,actor_profile_id,action,entity_type,entity_id,request_id,source_app,result,change_summary) VALUES(gen_random_uuid(),'operator',operator_id,'channel_membership_set','channel',requested_id,request_id,'admin','succeeded',jsonb_build_object('ip_profile_id',requested_ip_id,'primary',requested_primary,'curation_weight',requested_weight));END $$;
CREATE FUNCTION public.platform_remove_channel_membership(requested_id uuid,requested_ip_id uuid,request_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE operator_id uuid:=public.channel_current_operator();BEGIN IF operator_id IS NULL THEN RAISE EXCEPTION 'active operator required' USING ERRCODE='42501';END IF;PERFORM 1 FROM public.channels WHERE id=requested_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'channel not found' USING ERRCODE='P0002';END IF;DELETE FROM public.channel_ip_profiles WHERE channel_id=requested_id AND ip_profile_id=requested_ip_id;IF NOT FOUND THEN RAISE EXCEPTION 'channel membership not found' USING ERRCODE='P0002';END IF;INSERT INTO public.audit_events(id,actor_type,actor_profile_id,action,entity_type,entity_id,request_id,source_app,result,change_summary) VALUES(gen_random_uuid(),'operator',operator_id,'channel_membership_removed','channel',requested_id,request_id,'admin','succeeded',jsonb_build_object('ip_profile_id',requested_ip_id));END $$;

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;ALTER TABLE public.channel_search_aliases ENABLE ROW LEVEL SECURITY;ALTER TABLE public.channel_ip_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.channels,public.channel_search_aliases,public.channel_ip_profiles FROM PUBLIC,aifans_anon,aifans_authenticated,aifans_platform;
REVOKE ALL ON FUNCTION public.channel_membership_requires_ip(),public.refresh_channel_search_document(uuid),public.channel_public_list(text,double precision,integer,uuid,integer),public.channel_public_get(text),public.channel_public_profiles(text,integer,integer,timestamptz,uuid,integer),public.channel_public_posts(text,timestamptz,uuid,integer),public.channel_current_operator(),public.platform_channel_record(uuid),public.platform_list_channels(text,public.channel_status,integer,timestamptz,uuid,integer),public.platform_create_channel(text,text,text,text,integer,uuid),public.platform_update_channel(uuid,text,text,text,boolean,integer,uuid),public.platform_set_channel_status(uuid,public.channel_status,uuid),public.platform_replace_channel_aliases(uuid,text[],uuid),public.platform_set_channel_membership(uuid,uuid,boolean,integer,uuid),public.platform_remove_channel_membership(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.channel_public_list(text,double precision,integer,uuid,integer),public.channel_public_get(text),public.channel_public_profiles(text,integer,integer,timestamptz,uuid,integer),public.channel_public_posts(text,timestamptz,uuid,integer) TO aifans_anon,aifans_authenticated;
GRANT EXECUTE ON FUNCTION public.platform_channel_record(uuid),public.platform_list_channels(text,public.channel_status,integer,timestamptz,uuid,integer),public.platform_create_channel(text,text,text,text,integer,uuid),public.platform_update_channel(uuid,text,text,text,boolean,integer,uuid),public.platform_set_channel_status(uuid,public.channel_status,uuid),public.platform_replace_channel_aliases(uuid,text[],uuid),public.platform_set_channel_membership(uuid,uuid,boolean,integer,uuid),public.platform_remove_channel_membership(uuid,uuid,uuid) TO aifans_platform;
