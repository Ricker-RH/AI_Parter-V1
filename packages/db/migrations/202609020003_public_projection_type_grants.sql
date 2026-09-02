-- Public projection functions return creator_visual_type. Callers need type
-- usage to decode those bounded rows, without gaining access to creator tables.
GRANT USAGE ON TYPE public.creator_visual_type TO aifans_anon, aifans_authenticated;
