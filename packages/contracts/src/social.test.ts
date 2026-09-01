import { describe, expect, it } from "vitest";
import {
  CursorSchema,
  decodeCursor,
  encodeCursor,
  FeedQuerySchema,
  PublicCommentSchema,
  PublicIpSchema,
  FeedPostSchema,
  NotificationSchema,
  NotificationCursorSchema,
  decodeNotificationCursor,
  encodeNotificationCursor,
  CreateIpSchema,
  CreatePostSchema,
  CreateIpCommentSchema,
  PublicIpProfileSchema,
  PublicPostMediaSchema,
  PostMediaUploadIntentRequestSchema,
  SearchQuerySchema,
  SearchCursorSchema,
  decodeSearchCursor,
  encodeSearchCursor,
  SearchPageSchema,
  LikedCursorSchema,
  decodeLikedCursor,
  encodeLikedCursor,
} from "./social.js";


const id = "5b8ba43c-0a9e-43ec-87be-448a9e1ebf30";
const timestamp = "2026-09-01T12:00:00.000Z";

describe("social contracts", () => {
  it("normalizes bounded public search inputs and rejects unsafe cursors", () => {
    expect(SearchQuerySchema.parse({q: "  luna   moon  "})).toEqual({
      q: "luna moon",
      category: "all",
      limit: 25,
    });
    expect(SearchQuerySchema.parse({q: "luna", category: "ips", limit: "10"})).toEqual({
      q: "luna",
      category: "ips",
      limit: 10,
    });
    expect(() => SearchQuerySchema.parse({q: "   "})).toThrow();
    expect(() => SearchQuerySchema.parse({q: "x".repeat(81)})).toThrow();
    expect(() => SearchQuerySchema.parse({q: "luna", category: "users"})).toThrow();
    expect(() => SearchQuerySchema.parse({q: "luna", cursor: "not-a-cursor"})).not.toThrow();
  });

  it("round trips search cursors with query/category binding", () => {
    const cursor = {
      v: 1 as const,
      kind: "search" as const,
      category: "all" as const,
      query: "luna moon",
      resultType: "post" as const,
      publishedAt: timestamp,
      id,
    };
    const encoded = encodeSearchCursor(cursor);
    expect(encoded).toBe("eyJ2IjoxLCJraW5kIjoic2VhcmNoIiwiY2F0ZWdvcnkiOiJhbGwiLCJxdWVyeSI6Imx1bmEgbW9vbiIsInJlc3VsdFR5cGUiOiJwb3N0IiwicHVibGlzaGVkQXQiOiIyMDI2LTA5LTAxVDEyOjAwOjAwLjAwMFoiLCJpZCI6IjViOGJhNDNjLTBhOWUtNDNlYy04N2JlLTQ0OGE5ZTFlYmYzMCJ9");
    expect(decodeSearchCursor(encoded)).toEqual(cursor);
    expect(SearchCursorSchema.parse(cursor)).toEqual(cursor);
    expect(() => decodeSearchCursor("%%%bad")).toThrow("INVALID_CURSOR");
    expect(() => decodeSearchCursor(encodeSearchCursor({...cursor, query: "other"}), {
      category: "all",
      query: "luna moon",
    })).toThrow("INVALID_CURSOR");
  });

  it("round trips UTF-8 search cursors with bounded CJK and Unicode text", () => {
    const query = "月".repeat(80);
    const cursor = {
      v: 1 as const,
      kind: "search" as const,
      category: "ips" as const,
      query,
      resultType: "profile" as const,
      displayName: "月下✨",
      id,
    };
    const encoded = encodeSearchCursor(cursor);
    expect(decodeSearchCursor(encoded, {category: "ips", query})).toEqual(cursor);
  });

  it("keeps search results restricted to public IP and post projections", () => {
    expect(
      SearchPageSchema.parse({
        items: [{type: "profile", profile: {
          kind: "ip", id, username: "luna_ip", displayName: "Luna",
          languages: ["en"], visualType: "anime",
        }}],
        nextCursor: null,
      }).items[0]?.type,
    ).toBe("profile");
    expect(() => SearchPageSchema.parse({
      items: [{type: "profile", profile: {
        kind: "ip", id, username: "luna_ip", displayName: "Luna",
        languages: ["en"], visualType: "anime", authSubject: "private",
      }}],
      nextCursor: null,
    })).toThrow();
  });

  it("strictly parses only safe public records", () => {
    const ip = {
      kind: "ip" as const,
      id,
      username: "aifans_ip",
      displayName: "AIFANS IP",
      languages: ["en"],
      visualType: "hybrid" as const,
      creator: { id, username: "human_creator", displayName: "Human Creator" },
    };
    expect(PublicIpSchema.parse(ip)).toEqual(ip);
    expect(() =>
      PublicIpSchema.parse({ ...ip, authSubject: "never-public" }),
    ).toThrow();
    expect(() =>
      PublicIpSchema.parse({ ...ip, creator: { ...ip.creator, draftId: id } }),
    ).toThrow();
    expect(
      FeedPostSchema.parse({
        id,
        body: "Hello",
        languageCode: "en",
        publishedAt: timestamp,
        author: ip,
        likeCount: 0,
        commentCount: 0,
      }),
    ).toMatchObject({ id });
    const media = {
      id,
      type: "image" as const,
      url: "https://media.example/public/posts/image.webp",
      altText: "Luna 月下",
      width: 1200,
      height: 800,
      aspectRatio: 1.5,
    };
    expect(PublicPostMediaSchema.parse(media)).toEqual(media);
    expect(() =>
      PublicPostMediaSchema.parse({
        ...media,
        url: "http://media.example/image.webp",
      }),
    ).toThrow();
    expect(() =>
      PublicPostMediaSchema.parse({
        ...media,
        objectKey: "private/creator/secret.webp",
      }),
    ).toThrow();
    expect(
      PublicCommentSchema.parse({
        id,
        postId: id,
        parentCommentId: null,
        author: ip,
        state: "deleted",
        createdAt: timestamp,
      }),
    ).toMatchObject({ state: "deleted" });
    expect(
      NotificationSchema.parse({
        id,
        kind: "follow",
        actor: ip,
        postId: null,
        commentId: null,
        createdAt: timestamp,
        readAt: null,
      }),
    ).toMatchObject({ id });
    expect(
      NotificationSchema.parse({
        id,
        kind: "follow",
        actor: {
          kind: "human",
          id,
          username: "human_user",
          displayName: "Human",
        },
        postId: null,
        commentId: null,
        createdAt: timestamp,
        readAt: null,
      }),
    ).toMatchObject({ actor: { kind: "human" } });
    const profile = {
      profile: ip,
      followerCount: 3,
      viewerFollows: false,
      posts: { items: [], nextCursor: null },
    };
    expect(PublicIpProfileSchema.parse(profile)).toEqual(profile);
    expect(() =>
      PublicIpProfileSchema.parse({ ...profile, operationEnabled: true }),
    ).toThrow();
    expect(() =>
      PublicIpProfileSchema.parse({ ...profile, creatorDraftId: id }),
    ).toThrow();
  });

  it("round trips cursors and rejects invalid query inputs", () => {
    const cursor = {
      v: 1 as const,
      kind: "for_you" as const,
      score: 12.5,
      publishedAt: timestamp,
      id,
    };
    expect(decodeCursor(encodeCursor(cursor), "for_you")).toEqual(cursor);
    expect(() => decodeCursor("%%%bad", "for_you")).toThrow();
    expect(() =>
      decodeCursor(
        Buffer.from('{"v":2}', "utf8").toString("base64url"),
        "for_you",
      ),
    ).toThrow();
    expect(() =>
      decodeCursor(
        encodeCursor({
          v: 1,
          kind: "chronological",
          publishedAt: timestamp,
          id,
        }),
        "for_you",
      ),
    ).toThrow();
    expect(() =>
      FeedQuerySchema.parse({ kind: "for_you", limit: "51" }),
    ).toThrow();
    expect(() =>
      FeedQuerySchema.parse({ kind: "for_you", unexpected: "value" }),
    ).toThrow();
    expect(
      FeedQuerySchema.parse({ kind: "for_you", visualType: "anime" }),
    ).toEqual({ kind: "for_you", limit: 25 });
    expect(
      FeedQuerySchema.parse({ kind: "for_you", visualType: "portrait" }),
    ).toEqual({ kind: "for_you", limit: 25 });
    expect(CursorSchema.parse(cursor)).toEqual(cursor);
  });

  it("strictly round trips notification cursors and normalizes every failure", () => {
    const cursor = {
      v: 1 as const,
      kind: "notifications" as const,
      createdAt: timestamp,
      id,
    };
    expect(NotificationCursorSchema.parse(cursor)).toEqual(cursor);
    expect(decodeNotificationCursor(encodeNotificationCursor(cursor))).toEqual(
      cursor,
    );

    for (const invalid of [
      "not+base64url=",
      Buffer.from(JSON.stringify({ ...cursor, extra: true }), "utf8").toString(
        "base64url",
      ),
      Buffer.from(
        JSON.stringify({ ...cursor, createdAt: "yesterday" }),
        "utf8",
      ).toString("base64url"),
      Buffer.from(
        JSON.stringify({ ...cursor, id: "not-a-uuid" }),
        "utf8",
      ).toString("base64url"),
      Buffer.from(
        JSON.stringify({ ...cursor, kind: "comments" }),
        "utf8",
      ).toString("base64url"),
    ])
      expect(() => decodeNotificationCursor(invalid)).toThrow("INVALID_CURSOR");
  });

  it("round trips liked cursors and rejects cursors from other private lists", () => {
    const cursor = {v: 1 as const, kind: "liked" as const, likedAt: timestamp, id};
    expect(LikedCursorSchema.parse(cursor)).toEqual(cursor);
    expect(decodeLikedCursor(encodeLikedCursor(cursor))).toEqual(cursor);
    expect(() => decodeLikedCursor("not-a-cursor")).toThrow("INVALID_CURSOR");
    expect(() => decodeLikedCursor(Buffer.from(JSON.stringify({...cursor, kind: "bookmarks"}), "utf8").toString("base64url"))).toThrow("INVALID_CURSOR");
  });

  it("accepts only clean platform business inputs and returns existing safe projections", () => {
    expect(
      CreateIpSchema.parse({
        username: "  platform_ip  ",
        displayName: "  Platform IP  ",
        bio: "  Public bio  ",
        languageCodes: ["en", "zh-CN"],
      }),
    ).toEqual({
      username: "platform_ip",
      displayName: "Platform IP",
      bio: "Public bio",
      languageCodes: ["en", "zh-CN"],
    });
    expect(
      CreatePostSchema.parse({
        ipProfileId: id,
        body: "  Hello  ",
        languageCode: "en",
      }),
    ).toEqual({ ipProfileId: id, body: "Hello", languageCode: "en" });
    expect(
      CreatePostSchema.parse({
        ipProfileId: id,
        body: "",
        media: [{ reservationId: id, altText: "月下 portrait" }],
      }),
    ).toMatchObject({ body: "", media: [{ reservationId: id }] });
    expect(() =>
      CreatePostSchema.parse({ ipProfileId: id, body: "", media: [] }),
    ).toThrow();
    expect(() =>
      PostMediaUploadIntentRequestSchema.parse({
        contentType: "image/gif",
        sizeBytes: 100,
      }),
    ).toThrow();
    expect(() =>
      PostMediaUploadIntentRequestSchema.parse({
        contentType: "image/png",
        sizeBytes: 10_485_761,
      }),
    ).toThrow();
    expect(
      CreateIpCommentSchema.parse({
        ipProfileId: id,
        body: "  Reply  ",
        parentCommentId: id,
      }),
    ).toEqual({ ipProfileId: id, body: "Reply", parentCommentId: id });

    for (const unsafe of [
      {
        ...CreateIpSchema.parse({ username: "platform_ip", displayName: "IP" }),
        actingOperatorProfileId: id,
      },
      {
        ipProfileId: id,
        body: "post",
        mediaUrls: ["https://example.com/image.png"],
      },
      { ipProfileId: id, body: "comment", source: "worker" },
      { ipProfileId: id, body: "comment", state: "published" },
    ]) {
      const schema =
        "username" in unsafe
          ? CreateIpSchema
          : "mediaUrls" in unsafe
            ? CreatePostSchema
            : CreateIpCommentSchema;
      expect(() => schema.parse(unsafe)).toThrow();
    }

    const ip = CreateIpSchema.parse({
      username: "platform_ip",
      displayName: "IP",
    });
    expect(ip).not.toHaveProperty("operatorProfileId");
    expect(() =>
      CreatePostSchema.parse({ ipProfileId: id, body: "   " }),
    ).toThrow();
    expect(() =>
      CreateIpCommentSchema.parse({ ipProfileId: id, body: "   " }),
    ).toThrow();
  });
});
