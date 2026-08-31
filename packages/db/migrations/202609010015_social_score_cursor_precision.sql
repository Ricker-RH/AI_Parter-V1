-- Keep the documented score exactly representable by the JSON numeric cursor.
-- PostgreSQL still resolves the published_at microseconds through the post anchor.
CREATE OR REPLACE FUNCTION public.social_post_metrics(
  target_post_id uuid,
  target_author_id uuid,
  requested_locale text
)
RETURNS TABLE(score numeric, like_count integer, comment_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    (
      round(extract(epoch FROM post.published_at) / 3600, 6)
      + ip.feed_weight
      + CASE WHEN EXISTS (
          SELECT 1 FROM public.follows follow
          WHERE follow.follower_profile_id = public.social_current_human_profile_id()
            AND follow.followed_profile_id = post.author_profile_id
        ) THEN 100 ELSE 0 END
      + CASE WHEN requested_locale IS NOT NULL AND post.language_code = requested_locale THEN 10 ELSE 0 END
      + 2 * (SELECT count(*) FROM public.post_likes post_like WHERE post_like.post_id = post.id)
      + 3 * (SELECT count(*) FROM public.comments comment WHERE comment.post_id = post.id AND comment.state = 'published')
    )::numeric,
    (SELECT count(*) FROM public.post_likes post_like WHERE post_like.post_id = post.id)::integer,
    (SELECT count(*) FROM public.comments comment WHERE comment.post_id = post.id AND comment.state = 'published')::integer
  FROM public.posts post
  JOIN public.ip_profiles ip ON ip.profile_id = post.author_profile_id
  JOIN public.ip_identity_revisions revision
    ON revision.id = ip.current_identity_revision_id
    AND revision.ip_profile_id = ip.profile_id
  WHERE post.id = target_post_id
    AND post.author_profile_id = target_author_id
    AND post.state = 'published'
    AND ip.public_state = 'published'
$$;
