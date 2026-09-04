-- A fixed, license-safe sticker catalogue and ID-only internal share messages.
-- Shared titles are resolved on every read; withdrawn/private content is never
-- snapshotted into a conversation payload or fetched from a client URL.
CREATE FUNCTION public.human_dm_content_valid(content jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_typeof(content)='object' AND (
 (content->>'kind'='text' AND jsonb_typeof(content->'text')='string' AND char_length(content->>'text') BETWEEN 1 AND 4000
  AND content->>'text' ~ '[^[:space:]]' AND content-'kind'-'text'='{}'::jsonb) OR
 (content->>'kind' IN ('image','voice') AND jsonb_typeof(content->'attachmentId')='string'
  AND content->>'attachmentId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND content-'kind'-'attachmentId'='{}'::jsonb) OR
 (content->>'kind'='sticker' AND content->>'stickerId' IN ('wave','heart','party','thanks','wow','hug')
  AND jsonb_typeof(content->'stickerId')='string' AND content-'kind'-'stickerId'='{}'::jsonb) OR
 (content->>'kind'='share' AND content-'kind'-'target'='{}'::jsonb AND jsonb_typeof(content->'target')='object'
  AND content->'target'->>'kind' IN ('post','human','ip') AND jsonb_typeof(content->'target'->'id')='string'
  AND content->'target'->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND (content->'target')-'kind'-'id'='{}'::jsonb)),false)
$$;

CREATE FUNCTION public.human_dm_share_card(target_kind text,target_id uuid,viewer_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE title text; subtitle text; owner_id uuid;
BEGIN
 IF viewer_id IS NULL THEN RETURN NULL; END IF;
 IF target_kind='human' THEN
  -- Privacy locks activity tabs, not the already-public basic human identity.
  SELECT p.display_name,'@'||p.username,p.id INTO title,subtitle,owner_id FROM public.profiles p WHERE p.id=target_id AND p.account_kind='human';
 ELSIF target_kind='ip' THEN
  SELECT p.display_name,'@'||p.username,p.id INTO title,subtitle,owner_id FROM public.social_public_ip_profile(target_id) p;
 ELSIF target_kind='post' THEN
  SELECT coalesce(nullif(left(btrim(p.body),160),''),'Post'),'@'||author.username,p.author_profile_id INTO title,subtitle,owner_id
  FROM public.posts p CROSS JOIN LATERAL public.social_public_ip_profile(p.author_profile_id) author
  WHERE p.id=target_id AND p.state='published';
 ELSE RETURN NULL;
 END IF;
 IF owner_id IS NULL OR EXISTS(SELECT 1 FROM public.human_blocks b WHERE
 (b.blocker_profile_id=viewer_id AND b.blocked_profile_id=owner_id) OR
 (b.blocker_profile_id=owner_id AND b.blocked_profile_id=viewer_id)) THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('target',jsonb_build_object('kind',target_kind,'id',target_id),'title',left(title,160),'subtitle',left(subtitle,160));
END $$;

CREATE FUNCTION public.human_dm_resolve_share(target_kind text,target_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_id uuid; card jsonb;
BEGIN
 actor_id:=public.social_current_human_profile_id();
 IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
 IF target_kind IS NULL OR target_kind NOT IN ('post','human','ip') OR target_id IS NULL THEN RAISE EXCEPTION 'invalid target' USING ERRCODE='22023'; END IF;
 card:=public.human_dm_share_card(target_kind,target_id,actor_id);
 IF card IS NULL THEN RETURN jsonb_build_object('state','unavailable'); END IF;
 RETURN jsonb_build_object('state','available','card',card);
END $$;

CREATE FUNCTION public.human_dm_share_targets(target_kind text,search_query text,page_limit integer)
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_id uuid;
BEGIN
 actor_id:=public.social_current_human_profile_id();
 IF actor_id IS NULL THEN RAISE EXCEPTION 'authenticated human required' USING ERRCODE='42501'; END IF;
 IF target_kind IS NULL OR target_kind NOT IN ('post','human','ip') OR search_query IS NULL OR char_length(search_query)>80 OR page_limit IS NULL OR page_limit NOT BETWEEN 1 AND 20 THEN
  RAISE EXCEPTION 'invalid target selection' USING ERRCODE='22023';
 END IF;
 IF target_kind='post' THEN
  RETURN QUERY SELECT card.value FROM public.posts p
   CROSS JOIN LATERAL (SELECT public.human_dm_share_card('post',p.id,actor_id) AS value) card
   WHERE p.state='published' AND card.value IS NOT NULL AND position(lower(search_query) IN lower((card.value->>'title')||' '||(card.value->>'subtitle')))>0
   ORDER BY p.published_at DESC,p.id DESC LIMIT page_limit;
 ELSE
  RETURN QUERY SELECT card.value FROM public.profiles p
   CROSS JOIN LATERAL (SELECT public.human_dm_share_card(target_kind,p.id,actor_id) AS value) card
   WHERE p.account_kind::text=target_kind AND card.value IS NOT NULL AND position(lower(search_query) IN lower((card.value->>'title')||' '||(card.value->>'subtitle')))>0
   ORDER BY p.display_name,p.id LIMIT page_limit;
 END IF;
END $$;

REVOKE ALL ON FUNCTION public.human_dm_content_valid(jsonb),public.human_dm_share_card(text,uuid,uuid),public.human_dm_resolve_share(text,uuid),public.human_dm_share_targets(text,text,integer) FROM PUBLIC,aifans_anon,aifans_authenticated;
GRANT EXECUTE ON FUNCTION public.human_dm_resolve_share(text,uuid),public.human_dm_share_targets(text,text,integer) TO aifans_authenticated;
ALTER TABLE public.human_dm_messages DROP CONSTRAINT human_dm_messages_content_check;
ALTER TABLE public.human_dm_messages ADD CONSTRAINT human_dm_messages_content_check CHECK(public.human_dm_content_valid(content));
CREATE OR REPLACE FUNCTION public.human_dm_send(target_profile_id uuid, content jsonb, client_request_id uuid)
RETURNS public.human_dm_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_id uuid; conversation public.human_dm_conversations; message public.human_dm_messages; mutual boolean; attachment public.human_dm_attachments;
BEGIN
 actor_id:=public.human_lock_pair(target_profile_id);
 IF client_request_id IS NULL OR NOT public.human_dm_content_valid(content) THEN
  RAISE EXCEPTION 'invalid or unsupported message content' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM public.human_blocks WHERE
 (blocker_profile_id=actor_id AND blocked_profile_id=target_profile_id) OR
 (blocker_profile_id=target_profile_id AND blocked_profile_id=actor_id)) THEN
  RAISE EXCEPTION 'human relationship unavailable' USING ERRCODE='PDM01';
 END IF;
 INSERT INTO public.human_dm_conversations(low_profile_id,high_profile_id)
 VALUES(least(actor_id,target_profile_id),greatest(actor_id,target_profile_id)) ON CONFLICT DO NOTHING;
 SELECT * INTO conversation FROM public.human_dm_conversations
 WHERE low_profile_id=least(actor_id,target_profile_id) AND high_profile_id=greatest(actor_id,target_profile_id) FOR UPDATE;
 SELECT * INTO message FROM public.human_dm_messages m WHERE m.sender_profile_id=actor_id AND m.client_request_id=human_dm_send.client_request_id;
 IF FOUND THEN
  IF message.conversation_id<>conversation.id OR message.content<>content THEN RAISE EXCEPTION 'idempotency key conflict' USING ERRCODE='23505'; END IF;
  RETURN message;
 END IF;
 IF content->>'kind' IN ('image','voice') THEN
  SELECT * INTO attachment FROM public.human_dm_attachments WHERE id=(content->>'attachmentId')::uuid FOR UPDATE;
  IF attachment.id IS NULL OR attachment.owner_profile_id<>actor_id OR attachment.peer_profile_id<>target_profile_id
  OR attachment.conversation_id<>conversation.id OR attachment.kind<>content->>'kind' OR attachment.finalized_at IS NULL
  OR attachment.message_id IS NOT NULL THEN RAISE EXCEPTION 'attachment unavailable' USING ERRCODE='22023'; END IF;
 END IF;
 IF content->>'kind'='share' AND (
  public.human_dm_share_card(content->'target'->>'kind',(content->'target'->>'id')::uuid,actor_id) IS NULL OR
  public.human_dm_share_card(content->'target'->>'kind',(content->'target'->>'id')::uuid,target_profile_id) IS NULL) THEN
  RAISE EXCEPTION 'shared target unavailable' USING ERRCODE='22023';
 END IF;
 SELECT EXISTS(SELECT 1 FROM public.follows WHERE follower_profile_id=actor_id AND followed_profile_id=target_profile_id)
 AND EXISTS(SELECT 1 FROM public.follows WHERE follower_profile_id=target_profile_id AND followed_profile_id=actor_id) INTO mutual;
 IF conversation.first_contact_consumed AND NOT mutual THEN RAISE EXCEPTION 'mutual follow required' USING ERRCODE='PDM02'; END IF;
 INSERT INTO public.human_dm_members(conversation_id,profile_id) VALUES(conversation.id,actor_id),(conversation.id,target_profile_id) ON CONFLICT DO NOTHING;
 UPDATE public.human_dm_conversations SET last_sequence=last_sequence+1,first_contact_consumed=true,updated_at=clock_timestamp()
 WHERE id=conversation.id RETURNING * INTO conversation;
 INSERT INTO public.human_dm_messages(conversation_id,sender_profile_id,sequence,content,client_request_id)
 VALUES(conversation.id,actor_id,conversation.last_sequence,content,client_request_id) RETURNING * INTO message;
 IF attachment.id IS NOT NULL THEN UPDATE public.human_dm_attachments SET message_id=message.id WHERE id=attachment.id; END IF;
 INSERT INTO public.human_dm_outbox(message_id,conversation_id,recipient_profile_id) VALUES(message.id,conversation.id,target_profile_id);
 RETURN message;
END $$;
