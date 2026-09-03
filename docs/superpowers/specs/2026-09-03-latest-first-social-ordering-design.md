# Latest-first Social Ordering Design

## Goal

Make recency-based social lists predictable without weakening recommendation or conversation reading semantics.

## Rules

- Chronological post feeds, search post results, and IP profile posts remain ordered by `published_at DESC, id DESC`.
- For You remains ranked by score, with publish time and id as deterministic descending tie-breakers.
- Liked and Saved collections order by the viewer action timestamp descending, with post id as the tie-breaker.
- Top-level comment groups order by root comment creation time descending.
- A root remains first inside its group; replies remain creation-time ascending for natural reading order.
- A newly created root appears at the top immediately. A newly created reply appears at the end of its existing group.

## Pagination and migration

Use typed, versioned keyset cursors for Saved and comment-root pages. Replace the deployed comment SQL through a forward-only migration; do not edit an applied migration. The comment context projection must use the inverse predecessor lookup so deep links still return the target group under descending root order.

## Verification

Contract tests reject old or wrong cursor kinds. Database tests cover exact ordering, multi-page traversal without duplicates, reply order, deleted-root groups, and context lookup. Web tests cover optimistic placement before and after reconciliation.
