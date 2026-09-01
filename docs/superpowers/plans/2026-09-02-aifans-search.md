# Public Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a bilingual, anonymous-readable search for published AI/IP profiles and posts with bounded query/cursor contracts, safe pagination, and privacy-safe analytics.

**Architecture:** Extend the existing contracts, SocialRepository, Hono social route, server API client, and server-rendered Web page. Use one bounded database projection over published data; no human/private profile fields or mock content are returned.

**Tech Stack:** Next.js/React, Hono, Neon/Postgres, Zod, Vitest, Testing Library.

### Scope

- Search categories: `all`, `ips`, `posts`.
- Query: trim, normalize whitespace, length limit; reject malformed/duplicate parameters and invalid cursors.
- Results: published AI/IP profiles and published posts only, with explicit loading, empty, unavailable, pagination, and end states.
- Analytics emits only locale/category/query length.
- No global CSS or Shell changes.
