import {
  check,
  pgEnum,
  pgTable,
  text,
  boolean,
  bigint,
  integer,
  jsonb,
  numeric,
  smallint,
  timestamp,
  uuid,
  unique,
  index,
  uniqueIndex,
  primaryKey,
  foreignKey,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

let creatorIpRevisionIpColumn: AnyPgColumn;
let creatorIpRevisionIdColumn: AnyPgColumn;

export const accountKindEnum = pgEnum("account_kind", ["human", "ip"]);
export const appLocaleEnum = pgEnum("app_locale", ["en", "zh-CN"]);
export const appRoleEnum = pgEnum("app_role", ["operator"]);
export const profileBackgroundTypeEnum = pgEnum("profile_background_type", [
  "color",
  "image",
]);
export const profileAssetRoleEnum = pgEnum("profile_asset_role", [
  "avatar",
  "background",
]);
export const auditActorTypeEnum = pgEnum("audit_actor_type", [
  "human",
  "operator",
  "system",
]);
export const auditSourceEnum = pgEnum("audit_source", [
  "api",
  "admin",
  "worker",
]);
export const auditResultEnum = pgEnum("audit_result", [
  "succeeded",
  "rejected",
  "failed",
]);
export const outboxStateEnum = pgEnum("outbox_state", [
  "pending",
  "delivered",
  "failed",
]);
export const ipSourceEnum = pgEnum("ip_source", ["platform", "creator"]);
export const ipPublicStateEnum = pgEnum("ip_public_state", [
  "draft",
  "approved",
  "published",
  "paused",
  "unpublished",
]);
export const postStateEnum = pgEnum("post_state", [
  "draft",
  "published",
  "withdrawn",
]);
export const channelStatusEnum = pgEnum("channel_status", ["draft", "published", "archived"]);
export const postSourceEnum = pgEnum("post_source", ["admin", "worker"]);
export const mediaKindEnum = pgEnum("media_kind", ["image"]);
export const commentSourceEnum = pgEnum("comment_source", [
  "human",
  "admin",
  "worker",
]);
export const commentStateEnum = pgEnum("comment_state", [
  "published",
  "deleted",
]);
export const notificationKindEnum = pgEnum("notification_kind", [
  "follow",
  "post_like",
  "comment",
  "reply",
  "comment_like",
]);
export const creatorVisualTypeEnum = pgEnum("creator_visual_type", [
  "realistic",
  "anime",
  "hybrid",
]);
export const creatorDraftStateEnum = pgEnum("creator_draft_state", [
  "draft",
  "submitted",
]);
export const creatorSubmissionStateEnum = pgEnum("creator_submission_state", [
  "pending_review",
  "approved",
  "rejected",
]);
export const creatorReferenceRoleEnum = pgEnum("creator_reference_role", [
  "avatar",
  "cover",
  "portrait",
  "full_body",
  "supporting_1",
  "supporting_2",
  "supporting_3",
  "supporting_4",
]);
export const creatorRequestKindEnum = pgEnum("creator_request_kind", [
  "change",
  "unpublish",
  "deletion",
]);
export const creatorRequestStateEnum = pgEnum("creator_request_state", [
  "pending",
  "approved",
  "rejected",
]);
export const creatorDecisionValueEnum = pgEnum("creator_decision_value", [
  "approve",
  "reject",
]);
export const chatMessageRoleEnum = pgEnum("chat_message_role", [
  "human",
  "assistant",
]);
export const chatDeliveryStateEnum = pgEnum("chat_delivery_state", [
  "pending",
  "sent",
  "failed",
]);

export const profiles = pgTable(
  "profiles",
  {
    id: uuid().primaryKey(),
    authSubject: text("auth_subject"),
    accountKind: accountKindEnum("account_kind").notNull(),
    username: text().notNull(),
    displayName: text("display_name").notNull(),
    bio: text(),
    avatarObjectKey: text("avatar_object_key"),
    backgroundType: profileBackgroundTypeEnum("background_type")
      .notNull()
      .default("color"),
    backgroundColorKey: text("background_color_key")
      .notNull()
      .default("paper"),
    backgroundObjectKey: text("background_object_key"),
    backgroundFocalX: numeric("background_focal_x", {
      precision: 6,
      scale: 5,
      mode: "number",
    })
      .notNull()
      .default(0.5),
    backgroundFocalY: numeric("background_focal_y", {
      precision: 6,
      scale: 5,
      mode: "number",
    })
      .notNull()
      .default(0.5),
    profileVersion: bigint("profile_version", {mode: "number"})
      .notNull()
      .default(1),
    preferredLocale: appLocaleEnum("preferred_locale").notNull().default("en"),
    creatorModeEnabled: boolean("creator_mode_enabled")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("profiles_auth_subject_unique").on(table.authSubject),
    unique("profiles_username_unique").on(table.username),
    check(
      "profiles_account_kind_auth_subject_check",
      sql`(${table.accountKind} = 'human' AND ${table.authSubject} IS NOT NULL AND ${table.authSubject} ~ '[^[:space:]]') OR (${table.accountKind} = 'ip' AND ${table.authSubject} IS NULL)`,
    ),
    check(
      "profiles_username_check",
      sql`${table.username} ~ '^[a-z0-9_]{3,30}$'`,
    ),
    check(
      "profiles_display_name_check",
      sql`char_length(${table.displayName}) BETWEEN 1 AND 80 AND ${table.displayName} ~ '[^[:space:]]'`,
    ),
    check(
      "profiles_bio_length_check",
      sql`${table.bio} IS NULL OR char_length(${table.bio}) <= 500`,
    ),
    check(
      "profiles_avatar_object_key_length_check",
      sql`${table.avatarObjectKey} IS NULL OR char_length(${table.avatarObjectKey}) <= 512`,
    ),
    check(
      "profiles_background_color_key_check",
      sql`${table.backgroundColorKey} IN ('paper','sand','mist','sage','sky','lilac','graphite')`,
    ),
    check(
      "profiles_background_object_key_length_check",
      sql`${table.backgroundObjectKey} IS NULL OR char_length(${table.backgroundObjectKey}) <= 512`,
    ),
    check(
      "profiles_background_focal_x_check",
      sql`${table.backgroundFocalX} BETWEEN 0 AND 1`,
    ),
    check(
      "profiles_background_focal_y_check",
      sql`${table.backgroundFocalY} BETWEEN 0 AND 1`,
    ),
    check(
      "profiles_background_consistency_check",
      sql`(${table.backgroundType} = 'color' AND ${table.backgroundObjectKey} IS NULL) OR (${table.backgroundType} = 'image' AND ${table.backgroundObjectKey} IS NOT NULL)`,
    ),
    check("profiles_profile_version_check", sql`${table.profileVersion} > 0`),
  ],
);

export const profileAssetUploadReservations = pgTable(
  "profile_asset_upload_reservations",
  {
    id: uuid().primaryKey(),
    ownerProfileId: uuid("owner_profile_id")
      .notNull()
      .references(() => profiles.id),
    role: profileAssetRoleEnum("role").notNull(),
    objectKey: text("object_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    declaredSizeBytes: integer("declared_size_bytes").notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    expiresAt: timestamp("expires_at", {withTimezone: true}).notNull(),
    verifiedAt: timestamp("verified_at", {withTimezone: true}),
    consumedAt: timestamp("consumed_at", {withTimezone: true}),
    createdAt: timestamp("created_at", {withTimezone: true})
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("profile_asset_upload_reservations_active_idx")
      .on(table.ownerProfileId, table.role, table.createdAt)
      .where(sql`${table.consumedAt} IS NULL`),
    check(
      "profile_asset_reservations_object_key_length_check",
      sql`char_length(${table.objectKey}) BETWEEN 1 AND 512`,
    ),
    check(
      "profile_asset_reservations_content_type_check",
      sql`${table.contentType} IN ('image/jpeg','image/png','image/webp')`,
    ),
    check(
      "profile_asset_reservations_size_check",
      sql`${table.declaredSizeBytes} BETWEEN 1 AND 10485760`,
    ),
    check(
      "profile_asset_reservations_width_check",
      sql`${table.width} BETWEEN 64 AND 12000`,
    ),
    check(
      "profile_asset_reservations_height_check",
      sql`${table.height} BETWEEN 64 AND 12000`,
    ),
    check(
      "profile_asset_reservations_expiry_check",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      "profile_asset_reservations_consumed_check",
      sql`${table.consumedAt} IS NULL OR ${table.verifiedAt} IS NOT NULL`,
    ),
    check(
      "profile_asset_reservations_object_key_check",
      sql`${table.objectKey} = format('public/profiles/%s/%s/%s.%s', ${table.ownerProfileId}, ${table.role}, ${table.id}, CASE ${table.contentType} WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' END)`,
    ),
  ],
);

export const platformSettings = pgTable(
  "platform_settings",
  {
    settingKey: text("setting_key").primaryKey(),
    creatorIpRequiresApproval: boolean("creator_ip_requires_approval")
      .notNull()
      .default(false),
    defaultIpQuota: integer("default_ip_quota").notNull().default(3),
  },
  (table) => [
    check(
      "platform_settings_global_key_check",
      sql`${table.settingKey} = 'global'`,
    ),
    check(
      "platform_settings_default_ip_quota_check",
      sql`${table.defaultIpQuota} BETWEEN 0 AND 100`,
    ),
  ],
);

export const profileRoles = pgTable(
  "profile_roles",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    role: appRoleEnum("role").notNull(),
    grantedByProfileId: uuid("granted_by_profile_id")
      .notNull()
      .references(() => profiles.id),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.profileId, table.role] })],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid().primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    actorType: auditActorTypeEnum("actor_type").notNull(),
    actorProfileId: uuid("actor_profile_id").references(() => profiles.id),
    action: text().notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    requestId: uuid("request_id"),
    sourceApp: auditSourceEnum("source_app").notNull(),
    result: auditResultEnum("result").notNull(),
    changeSummary: jsonb("change_summary").notNull().default({}),
  },
  (table) => [
    check("audit_events_action_check", sql`${table.action} ~ '[^[:space:]]'`),
    check(
      "audit_events_entity_type_check",
      sql`${table.entityType} ~ '[^[:space:]]'`,
    ),
  ],
);
export const businessEvents = pgTable(
  "business_events",
  {
    id: uuid().primaryKey(),
    eventName: text("event_name").notNull(),
    schemaVersion: smallint("schema_version").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    actorProfileId: uuid("actor_profile_id").references(() => profiles.id),
    subjectEntityType: text("subject_entity_type").notNull(),
    subjectEntityId: uuid("subject_entity_id").notNull(),
    requestId: uuid("request_id"),
    environment: text().notNull(),
    properties: jsonb().notNull().default({}),
  },
  (table) => [
    check(
      "business_events_event_name_check",
      sql`${table.eventName} ~ '^[a-z][a-z0-9_]*$'`,
    ),
    check(
      "business_events_schema_version_check",
      sql`${table.schemaVersion} > 0`,
    ),
    check(
      "business_events_subject_entity_type_check",
      sql`${table.subjectEntityType} ~ '[^[:space:]]'`,
    ),
    check(
      "business_events_environment_check",
      sql`${table.environment} ~ '[^[:space:]]'`,
    ),
  ],
);
export const workflowTransitions = pgTable(
  "workflow_transitions",
  {
    id: uuid().primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    previousState: text("previous_state"),
    nextState: text("next_state").notNull(),
    actorProfileId: uuid("actor_profile_id").references(() => profiles.id),
    reasonCode: text("reason_code"),
    operatorNote: text("operator_note"),
    requestId: uuid("request_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "workflow_transitions_entity_type_check",
      sql`${table.entityType} ~ '[^[:space:]]'`,
    ),
    check(
      "workflow_transitions_next_state_check",
      sql`${table.nextState} ~ '[^[:space:]]'`,
    ),
  ],
);
export const analyticsOutbox = pgTable(
  "analytics_outbox",
  {
    id: uuid().primaryKey(),
    businessEventId: uuid("business_event_id")
      .notNull()
      .unique()
      .references(() => businessEvents.id),
    destination: text().notNull(),
    payloadVersion: smallint("payload_version").notNull(),
    payload: jsonb().notNull().default({}),
    state: outboxStateEnum("state").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "analytics_outbox_payload_version_check",
      sql`${table.payloadVersion} > 0`,
    ),
    check(
      "analytics_outbox_destination_check",
      sql`${table.destination} ~ '[^[:space:]]'`,
    ),
    check(
      "analytics_outbox_attempt_count_check",
      sql`${table.attemptCount} >= 0`,
    ),
    check(
      "analytics_outbox_delivery_state_check",
      sql`(${table.state} = 'delivered') = (${table.deliveredAt} IS NOT NULL)`,
    ),
    check(
      "analytics_outbox_lease_pair_check",
      sql`(${table.leaseToken} IS NULL) = (${table.leaseExpiresAt} IS NULL)`,
    ),
    check(
      "analytics_outbox_terminal_lease_check",
      sql`${table.state} = 'pending' OR ${table.leaseToken} IS NULL`,
    ),
    check(
      "analytics_outbox_error_code_length_check",
      sql`${table.lastErrorCode} IS NULL OR char_length(${table.lastErrorCode}) BETWEEN 1 AND 64`,
    ),
  ],
);

export const ipIdentityRevisions = pgTable(
  "ip_identity_revisions",
  {
    id: uuid().primaryKey(),
    ipProfileId: uuid("ip_profile_id").notNull(),
    version: integer().notNull(),
    displayName: text("display_name").notNull(),
    bio: text(),
    avatarObjectKey: text("avatar_object_key"),
    coverObjectKey: text("cover_object_key"),
    languages: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdByProfileId: uuid("created_by_profile_id").references(
      () => profiles.id,
    ),
    previousRevisionId: uuid("previous_revision_id").references(
      (): AnyPgColumn => ipIdentityRevisions.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("ip_identity_revisions_ip_profile_id_version_key").on(
      table.ipProfileId,
      table.version,
    ),
    unique("ip_identity_revisions_id_ip_profile_id_key").on(
      table.id,
      table.ipProfileId,
    ),
  ],
);

export const ipProfiles = pgTable(
  "ip_profiles",
  {
    profileId: uuid("profile_id")
      .primaryKey()
      .references(() => profiles.id),
    source: ipSourceEnum("source").notNull(),
    creatorProfileId: uuid("creator_profile_id").references(() => profiles.id),
    publicState: ipPublicStateEnum("public_state").notNull().default("draft"),
    operationEnabled: boolean("operation_enabled").notNull().default(false),
    visualType: creatorVisualTypeEnum("visual_type")
      .notNull()
      .default("hybrid"),
    identityLabel: text("identity_label").notNull().default("AI"),
    currentIdentityRevisionId: uuid("current_identity_revision_id"),
    feedWeight: integer("feed_weight").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    creatorDeletedAt: timestamp("creator_deleted_at", { withTimezone: true }),
    activeCreatorRevisionId: uuid("active_creator_revision_id"),
  },
  (table) => [
    check(
      "ip_profiles_creator_source_check",
      sql`${table.creatorProfileId} IS NULL OR ${table.source} = 'creator'`,
    ),
    check(
      "ip_profiles_feed_weight_check",
      sql`${table.feedWeight} BETWEEN -1000 AND 1000`,
    ),
    foreignKey({
      name: "ip_profiles_current_identity_revision_fk",
      columns: [table.currentIdentityRevisionId, table.profileId],
      foreignColumns: [ipIdentityRevisions.id, ipIdentityRevisions.ipProfileId],
    })
      .onUpdate("no action")
      .onDelete("no action"),
    foreignKey({
      name: "ip_profiles_active_creator_revision_fk",
      columns: [table.profileId, table.activeCreatorRevisionId],
      foreignColumns: [creatorIpRevisionIpColumn, creatorIpRevisionIdColumn],
    })
      .onUpdate("no action")
      .onDelete("no action"),
    unique("ip_profiles_profile_creator_key").on(
      table.profileId,
      table.creatorProfileId,
    ),
    index("creator_ips_owner_cursor_idx")
      .on(
        table.creatorProfileId,
        table.createdAt.desc(),
        table.profileId.desc(),
      )
      .where(sql`${table.source} = 'creator'`),
  ],
);

export const channels = pgTable("channels", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull(),
  name: text().notNull(),
  description: text().notNull().default(""),
  imageObjectKey: text("image_object_key"),
  searchDocument: text("search_document").notNull(),
  status: channelStatusEnum("status").notNull().default("draft"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", {withTimezone: true}).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", {withTimezone: true}).notNull().defaultNow(),
}, table => [
  unique("channels_slug_key").on(table.slug),
  check("channels_slug_check", sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(${table.slug}) <= 80`),
  check("channels_name_check", sql`char_length(${table.name}) BETWEEN 1 AND 80`),
  check("channels_description_check", sql`char_length(${table.description}) <= 280`),
  check("channels_image_object_key_check", sql`${table.imageObjectKey} IS NULL OR ${table.imageObjectKey} ~ '^public/channels/[0-9a-f-]+\.(jpg|png|webp)$'`),
  index("channels_public_order_idx").on(table.sortOrder, table.id).where(sql`${table.status} = 'published'`),
  index("channels_search_document_trgm_idx").using("gin", sql`${table.searchDocument} gin_trgm_ops`),
])

export const channelSearchAliases = pgTable("channel_search_aliases", {
  channelId: uuid("channel_id").notNull().references(() => channels.id, {onDelete: "cascade"}),
  alias: text().notNull(),
  normalizedAlias: text("normalized_alias").notNull(),
}, table => [
  primaryKey({columns: [table.channelId, table.normalizedAlias]}),
  check("channel_search_aliases_alias_check", sql`char_length(${table.alias}) BETWEEN 1 AND 80`),
  check("channel_search_aliases_normalized_check", sql`char_length(${table.normalizedAlias}) BETWEEN 1 AND 80`),
  index("channel_aliases_search_trgm_idx").using("gin", sql`${table.normalizedAlias} gin_trgm_ops`),
])

export const channelIpProfiles = pgTable("channel_ip_profiles", {
  channelId: uuid("channel_id").notNull().references(() => channels.id, {onDelete: "cascade"}),
  ipProfileId: uuid("ip_profile_id").notNull().references(() => ipProfiles.profileId, {onDelete: "cascade"}),
  isPrimary: boolean("is_primary").notNull().default(false),
  curationWeight: integer("curation_weight").notNull().default(0),
  createdAt: timestamp("created_at", {withTimezone: true}).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", {withTimezone: true}).notNull().defaultNow(),
}, table => [
  primaryKey({columns: [table.channelId, table.ipProfileId]}),
  uniqueIndex("channel_ip_profiles_one_primary_per_ip_idx").on(table.ipProfileId).where(sql`${table.isPrimary}`),
  index("channel_ip_profiles_recommendation_idx").on(table.channelId, table.curationWeight.desc(), table.ipProfileId.desc()),
])

export const chatConversations = pgTable(
  "chat_conversations",
  {
    id: uuid().defaultRandom().primaryKey(),
    humanProfileId: uuid("human_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    ipProfileId: uuid("ip_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    providerConversationId: text("provider_conversation_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("chat_conversations_human_ip_key").on(
      table.humanProfileId,
      table.ipProfileId,
    ),
    check(
      "chat_conversations_provider_conversation_id_length_check",
      sql`${table.providerConversationId} IS NULL OR char_length(${table.providerConversationId}) BETWEEN 1 AND 512`,
    ),
    index("chat_conversations_owner_updated_cursor_idx").on(
      table.humanProfileId,
      table.updatedAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid().defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    role: chatMessageRoleEnum("role").notNull(),
    body: text().notNull(),
    deliveryState: chatDeliveryStateEnum("delivery_state")
      .notNull()
      .default("pending"),
    clientRequestId: uuid("client_request_id"),
    inReplyToClientRequestId: uuid("in_reply_to_client_request_id"),
    providerMessageId: text("provider_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("chat_messages_conversation_id_client_request_id_key").on(
      table.conversationId,
      table.clientRequestId,
    ),
    unique("chat_messages_conversation_id_in_reply_to_client_request_id_key").on(
      table.conversationId,
      table.inReplyToClientRequestId,
    ),
    foreignKey({
      name: "chat_messages_reply_to_human_request_fkey",
      columns: [table.conversationId, table.inReplyToClientRequestId],
      foreignColumns: [table.conversationId, table.clientRequestId],
    }).onDelete("cascade"),
    check(
      "chat_messages_body_length_check",
      sql`char_length(${table.body}) BETWEEN 1 AND 4000`,
    ),
    check(
      "chat_messages_provider_message_id_length_check",
      sql`${table.providerMessageId} IS NULL OR char_length(${table.providerMessageId}) BETWEEN 1 AND 512`,
    ),
    check(
      "chat_messages_role_request_link_check",
      sql`(${table.role} = 'human' AND ${table.clientRequestId} IS NOT NULL AND ${table.inReplyToClientRequestId} IS NULL AND ${table.providerMessageId} IS NULL) OR (${table.role} = 'assistant' AND ${table.clientRequestId} IS NULL AND ${table.inReplyToClientRequestId} IS NOT NULL AND ${table.deliveryState} = 'sent')`,
    ),
    index("chat_messages_conversation_created_cursor_idx").on(
      table.conversationId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const creatorQuotas = pgTable(
  "creator_quotas",
  {
    profileId: uuid("profile_id")
      .primaryKey()
      .references(() => profiles.id),
    ipQuota: integer("ip_quota").notNull(),
    updatedByProfileId: uuid("updated_by_profile_id").references(
      () => profiles.id,
    ),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "creator_quotas_ip_quota_check",
      sql`${table.ipQuota} BETWEEN 0 AND 100`,
    ),
  ],
);

export const creatorDrafts = pgTable(
  "creator_drafts",
  {
    id: uuid().primaryKey(),
    creatorProfileId: uuid("creator_profile_id")
      .notNull()
      .references(() => profiles.id),
    targetIpProfileId: uuid("target_ip_profile_id").references(
      () => ipProfiles.profileId,
    ),
    state: creatorDraftStateEnum("state").notNull().default("draft"),
    username: text().notNull(),
    displayName: text("display_name").notNull(),
    shortDescription: text("short_description").notNull(),
    languageCodes: text("language_codes").array().notNull(),
    contentThemes: text("content_themes").array().notNull(),
    personality: text().notNull(),
    background: text().notNull(),
    world: text().notNull(),
    valuesText: text("values_text").notNull(),
    tone: text().notNull(),
    interests: text().array().notNull(),
    boundaries: text().notNull(),
    relationshipStyle: text("relationship_style").notNull(),
    visualType: creatorVisualTypeEnum("visual_type").notNull(),
    appearance: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "creator_drafts_username_check",
      sql`${table.username} ~ '^[a-z0-9_]{3,30}$'`,
    ),
    check(
      "creator_drafts_display_name_check",
      sql`char_length(${table.displayName}) BETWEEN 1 AND 80 AND ${table.displayName} ~ '[^[:space:]]'`,
    ),
    check(
      "creator_drafts_short_description_check",
      sql`char_length(${table.shortDescription}) <= 500`,
    ),
    check(
      "creator_drafts_language_codes_check",
      sql`cardinality(${table.languageCodes}) BETWEEN 1 AND 20`,
    ),
    check(
      "creator_drafts_content_themes_check",
      sql`cardinality(${table.contentThemes}) BETWEEN 1 AND 12`,
    ),
    check(
      "creator_drafts_personality_check",
      sql`char_length(${table.personality}) BETWEEN 1 AND 1000 AND ${table.personality} ~ '[^[:space:]]'`,
    ),
    check(
      "creator_drafts_background_check",
      sql`char_length(${table.background}) BETWEEN 1 AND 2000 AND ${table.background} ~ '[^[:space:]]'`,
    ),
    check(
      "creator_drafts_world_check",
      sql`char_length(${table.world}) BETWEEN 1 AND 2000 AND ${table.world} ~ '[^[:space:]]'`,
    ),
    check(
      "creator_drafts_values_text_check",
      sql`char_length(${table.valuesText}) BETWEEN 1 AND 1000 AND ${table.valuesText} ~ '[^[:space:]]'`,
    ),
    check(
      "creator_drafts_tone_check",
      sql`char_length(${table.tone}) BETWEEN 1 AND 500 AND ${table.tone} ~ '[^[:space:]]'`,
    ),
    check(
      "creator_drafts_interests_check",
      sql`cardinality(${table.interests}) BETWEEN 0 AND 20`,
    ),
    check(
      "creator_drafts_boundaries_check",
      sql`char_length(${table.boundaries}) BETWEEN 1 AND 1000 AND ${table.boundaries} ~ '[^[:space:]]'`,
    ),
    check(
      "creator_drafts_relationship_style_check",
      sql`char_length(${table.relationshipStyle}) BETWEEN 1 AND 1000 AND ${table.relationshipStyle} ~ '[^[:space:]]'`,
    ),
    check(
      "creator_drafts_appearance_check",
      sql`char_length(${table.appearance}) BETWEEN 1 AND 2000 AND ${table.appearance} ~ '[^[:space:]]'`,
    ),
    unique("creator_drafts_id_creator_profile_id_key").on(
      table.id,
      table.creatorProfileId,
    ),
    index("creator_drafts_owner_cursor_idx").on(
      table.creatorProfileId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const creatorReferenceAssets = pgTable(
  "creator_reference_assets",
  {
    id: uuid().primaryKey(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => creatorDrafts.id, { onDelete: "cascade" }),
    creatorProfileId: uuid("creator_profile_id")
      .notNull()
      .references(() => profiles.id),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    draftRole: creatorReferenceRoleEnum("draft_role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("creator_reference_assets_draft_id_draft_role_key").on(
      table.draftId,
      table.draftRole,
    ),
    unique("creator_reference_assets_id_draft_id_key").on(
      table.id,
      table.draftId,
    ),
    check(
      "creator_reference_assets_object_key_check",
      sql`char_length(${table.objectKey}) BETWEEN 1 AND 512`,
    ),
    check(
      "creator_reference_assets_content_type_check",
      sql`${table.contentType} IN ('image/jpeg','image/png','image/webp')`,
    ),
    check(
      "creator_reference_assets_width_check",
      sql`${table.width} BETWEEN 1 AND 16384`,
    ),
    check(
      "creator_reference_assets_height_check",
      sql`${table.height} BETWEEN 1 AND 16384`,
    ),
  ],
);

export const creatorAssetUploadIntents = pgTable(
  "creator_asset_upload_intents",
  {
    id: uuid().primaryKey(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => creatorDrafts.id, { onDelete: "cascade" }),
    creatorProfileId: uuid("creator_profile_id")
      .notNull()
      .references(() => profiles.id),
    contentType: text("content_type").notNull(),
    declaredSizeBytes: integer("declared_size_bytes").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    registeredAt: timestamp("registered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("creator_asset_upload_intents_id_draft_id_key").on(
      table.id,
      table.draftId,
    ),
    foreignKey({
      name: "creator_asset_upload_intents_draft_id_creator_profile_id_fkey",
      columns: [table.draftId, table.creatorProfileId],
      foreignColumns: [creatorDrafts.id, creatorDrafts.creatorProfileId],
    }),
    check(
      "creator_asset_upload_intents_content_type_check",
      sql`${table.contentType} IN ('image/jpeg','image/png','image/webp')`,
    ),
    check(
      "creator_asset_upload_intents_declared_size_bytes_check",
      sql`${table.declaredSizeBytes} BETWEEN 1 AND 10485760`,
    ),
    index("creator_asset_upload_intents_active_draft_idx")
      .on(table.draftId, table.expiresAt)
      .where(sql`${table.registeredAt} IS NULL`),
  ],
);

export const creatorRevisions = pgTable(
  "creator_revisions",
  {
    id: uuid().primaryKey(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => creatorDrafts.id),
    creatorProfileId: uuid("creator_profile_id")
      .notNull()
      .references(() => profiles.id),
    version: integer().notNull(),
    username: text().notNull(),
    displayName: text("display_name").notNull(),
    shortDescription: text("short_description").notNull(),
    languageCodes: text("language_codes").array().notNull(),
    contentThemes: text("content_themes").array().notNull(),
    personality: text().notNull(),
    background: text().notNull(),
    world: text().notNull(),
    valuesText: text("values_text").notNull(),
    tone: text().notNull(),
    interests: text().array().notNull(),
    boundaries: text().notNull(),
    relationshipStyle: text("relationship_style").notNull(),
    visualType: creatorVisualTypeEnum("visual_type").notNull(),
    appearance: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("creator_revisions_draft_id_version_key").on(
      table.draftId,
      table.version,
    ),
    unique("creator_revisions_id_creator_profile_id_key").on(
      table.id,
      table.creatorProfileId,
    ),
    unique("creator_revisions_id_draft_id_key").on(table.id, table.draftId),
    unique("creator_revisions_id_draft_id_creator_profile_id_key").on(
      table.id,
      table.draftId,
      table.creatorProfileId,
    ),
    foreignKey({
      name: "creator_revisions_draft_owner_fkey",
      columns: [table.draftId, table.creatorProfileId],
      foreignColumns: [creatorDrafts.id, creatorDrafts.creatorProfileId],
    }),
    check("creator_revisions_version_check", sql`${table.version} > 0`),
    check(
      "creator_revisions_username_check",
      sql`${table.username} ~ '^[a-z0-9_]{3,30}$'`,
    ),
    check(
      "creator_revisions_display_name_check",
      sql`char_length(${table.displayName}) BETWEEN 1 AND 80 AND ${table.displayName} ~ '[^[:space:]]'`,
    ),
    check(
      "creator_revisions_short_description_check",
      sql`char_length(${table.shortDescription}) <= 500`,
    ),
    check(
      "creator_revisions_language_codes_check",
      sql`cardinality(${table.languageCodes}) BETWEEN 1 AND 20`,
    ),
    check(
      "creator_revisions_content_themes_check",
      sql`cardinality(${table.contentThemes}) BETWEEN 1 AND 12`,
    ),
  ],
);

export const creatorRevisionReferences = pgTable(
  "creator_revision_references",
  {
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => creatorRevisions.id),
    assetId: uuid("asset_id").notNull(),
    draftId: uuid("draft_id").notNull(),
    role: creatorReferenceRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.revisionId, table.role] }),
    unique("creator_revision_references_revision_id_asset_id_key").on(
      table.revisionId,
      table.assetId,
    ),
    foreignKey({
      name: "creator_revision_references_revision_id_draft_id_fkey",
      columns: [table.revisionId, table.draftId],
      foreignColumns: [creatorRevisions.id, creatorRevisions.draftId],
    }),
    foreignKey({
      name: "creator_revision_references_asset_id_draft_id_fkey",
      columns: [table.assetId, table.draftId],
      foreignColumns: [
        creatorReferenceAssets.id,
        creatorReferenceAssets.draftId,
      ],
    }),
  ],
);

export const creatorIpRevisions = pgTable(
  "creator_ip_revisions",
  {
    ipProfileId: uuid("ip_profile_id")
      .notNull()
      .references((): AnyPgColumn => ipProfiles.profileId),
    revisionId: uuid("revision_id")
      .notNull()
      .unique()
      .references(() => creatorRevisions.id),
    creatorProfileId: uuid("creator_profile_id")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.ipProfileId, table.revisionId] }),
    foreignKey({
      name: "creator_ip_revisions_ip_owner_fkey",
      columns: [table.ipProfileId, table.creatorProfileId],
      foreignColumns: [ipProfiles.profileId, ipProfiles.creatorProfileId],
    }),
    foreignKey({
      name: "creator_ip_revisions_revision_owner_fkey",
      columns: [table.revisionId, table.creatorProfileId],
      foreignColumns: [creatorRevisions.id, creatorRevisions.creatorProfileId],
    }),
  ],
);

creatorIpRevisionIpColumn = creatorIpRevisions.ipProfileId;
creatorIpRevisionIdColumn = creatorIpRevisions.revisionId;

export const operatingAuthorizationAcceptances = pgTable(
  "operating_authorization_acceptances",
  {
    id: uuid().primaryKey(),
    draftId: uuid("draft_id")
      .notNull()
      .unique()
      .references(() => creatorDrafts.id),
    revisionId: uuid("revision_id")
      .notNull()
      .unique()
      .references(() => creatorRevisions.id),
    creatorProfileId: uuid("creator_profile_id")
      .notNull()
      .references(() => profiles.id),
    authorizationVersion: text("authorization_version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "operating_acceptances_draft_owner_fkey",
      columns: [table.draftId, table.creatorProfileId],
      foreignColumns: [creatorDrafts.id, creatorDrafts.creatorProfileId],
    }),
    foreignKey({
      name: "operating_acceptances_revision_provenance_fkey",
      columns: [table.revisionId, table.draftId, table.creatorProfileId],
      foreignColumns: [
        creatorRevisions.id,
        creatorRevisions.draftId,
        creatorRevisions.creatorProfileId,
      ],
    }),
    check(
      "operating_acceptances_authorization_version_check",
      sql`char_length(${table.authorizationVersion}) BETWEEN 1 AND 100 AND ${table.authorizationVersion} ~ '[^[:space:]]'`,
    ),
  ],
);

export const creatorSubmissions = pgTable(
  "creator_submissions",
  {
    id: uuid().primaryKey(),
    draftId: uuid("draft_id")
      .notNull()
      .unique()
      .references(() => creatorDrafts.id),
    revisionId: uuid("revision_id")
      .notNull()
      .unique()
      .references(() => creatorRevisions.id),
    creatorProfileId: uuid("creator_profile_id")
      .notNull()
      .references(() => profiles.id),
    state: creatorSubmissionStateEnum("state").notNull(),
    ipProfileId: uuid("ip_profile_id")
      .unique()
      .references(() => ipProfiles.profileId),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionReason: text("decision_reason"),
  },
  (table) => [
    foreignKey({
      name: "creator_submissions_draft_owner_fkey",
      columns: [table.draftId, table.creatorProfileId],
      foreignColumns: [creatorDrafts.id, creatorDrafts.creatorProfileId],
    }),
    foreignKey({
      name: "creator_submissions_revision_provenance_fkey",
      columns: [table.revisionId, table.draftId, table.creatorProfileId],
      foreignColumns: [
        creatorRevisions.id,
        creatorRevisions.draftId,
        creatorRevisions.creatorProfileId,
      ],
    }),
    check(
      "creator_submissions_decision_reason_check",
      sql`${table.decisionReason} IS NULL OR char_length(${table.decisionReason}) <= 2000`,
    ),
    check(
      "creator_submissions_state_check",
      sql`(${table.state} = 'pending_review' AND ${table.decidedAt} IS NULL AND ${table.decisionReason} IS NULL AND ${table.ipProfileId} IS NULL) OR (${table.state} = 'approved' AND ${table.decidedAt} IS NOT NULL AND ${table.ipProfileId} IS NOT NULL) OR (${table.state} = 'rejected' AND ${table.decidedAt} IS NOT NULL AND ${table.decisionReason} IS NOT NULL AND ${table.ipProfileId} IS NULL)`,
    ),
    index("creator_submissions_owner_cursor_idx").on(
      table.creatorProfileId,
      table.submittedAt.desc(),
      table.id.desc(),
    ),
    index("creator_submissions_pending_cursor_idx")
      .on(table.submittedAt.desc(), table.id.desc())
      .where(sql`${table.state} = 'pending_review'`),
  ],
);

export const creatorSubmissionDecisions = pgTable(
  "creator_submission_decisions",
  {
    id: uuid().primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .unique()
      .references(() => creatorSubmissions.id),
    decision: creatorDecisionValueEnum("decision").notNull(),
    decidedByProfileId: uuid("decided_by_profile_id").references(
      () => profiles.id,
    ),
    reason: text(),
    requestId: uuid("request_id").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "creator_submission_decisions_reason_check",
      sql`${table.reason} IS NULL OR char_length(${table.reason}) <= 2000`,
    ),
    check(
      "creator_submission_decisions_decision_check",
      sql`${table.decision} = 'approve' OR (${table.decision} = 'reject' AND ${table.reason} IS NOT NULL AND ${table.reason} ~ '[^[:space:]]')`,
    ),
  ],
);

export const creatorIpRequests = pgTable(
  "creator_ip_requests",
  {
    id: uuid().primaryKey(),
    ipProfileId: uuid("ip_profile_id")
      .notNull()
      .references(() => ipProfiles.profileId),
    creatorProfileId: uuid("creator_profile_id")
      .notNull()
      .references(() => profiles.id),
    kind: creatorRequestKindEnum("kind").notNull(),
    reason: text().notNull(),
    proposedRevisionId: uuid("proposed_revision_id").references(
      () => creatorRevisions.id,
    ),
    state: creatorRequestStateEnum("state").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionReason: text("decision_reason"),
  },
  (table) => [
    uniqueIndex("creator_ip_requests_one_pending_idx")
      .on(table.ipProfileId)
      .where(sql`${table.state} = 'pending'`),
    index("creator_ip_requests_owner_cursor_idx").on(
      table.creatorProfileId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("creator_ip_requests_pending_cursor_idx")
      .on(table.createdAt.desc(), table.id.desc())
      .where(sql`${table.state} = 'pending'`),
    check(
      "creator_ip_requests_reason_check",
      sql`char_length(${table.reason}) BETWEEN 10 AND 2000 AND ${table.reason} ~ '[^[:space:]]'`,
    ),
    check(
      "creator_ip_requests_kind_revision_check",
      sql`(${table.kind} = 'change') = (${table.proposedRevisionId} IS NOT NULL)`,
    ),
    check(
      "creator_ip_requests_state_check",
      sql`(${table.state} = 'pending' AND ${table.decidedAt} IS NULL AND ${table.decisionReason} IS NULL) OR (${table.state} = 'approved' AND ${table.decidedAt} IS NOT NULL) OR (${table.state} = 'rejected' AND ${table.decidedAt} IS NOT NULL AND ${table.decisionReason} IS NOT NULL)`,
    ),
  ],
);

export const creatorRequestDecisions = pgTable(
  "creator_request_decisions",
  {
    id: uuid().primaryKey(),
    requestId: uuid("request_id")
      .notNull()
      .unique()
      .references(() => creatorIpRequests.id),
    decision: creatorDecisionValueEnum("decision").notNull(),
    decidedByProfileId: uuid("decided_by_profile_id")
      .notNull()
      .references(() => profiles.id),
    reason: text(),
    correlationId: uuid("correlation_id").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "creator_request_decisions_reason_check",
      sql`${table.reason} IS NULL OR char_length(${table.reason}) <= 2000`,
    ),
    check(
      "creator_request_decisions_decision_check",
      sql`${table.decision} = 'approve' OR (${table.decision} = 'reject' AND ${table.reason} IS NOT NULL AND ${table.reason} ~ '[^[:space:]]')`,
    ),
  ],
);

export const posts = pgTable(
  "posts",
  {
    id: uuid().primaryKey(),
    authorProfileId: uuid("author_profile_id")
      .notNull()
      .references(() => profiles.id),
    actingOperatorProfileId: uuid("acting_operator_profile_id").references(
      () => profiles.id,
    ),
    state: postStateEnum("state").notNull().default("draft"),
    source: postSourceEnum("source").notNull(),
    body: text().notNull().default(""),
    languageCode: text("language_code"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("posts_body_length_check", sql`char_length(${table.body}) <= 5000`),
    index("posts_channel_cursor_idx").on(table.authorProfileId, table.publishedAt.desc(), table.id.desc()).where(sql`${table.state} = 'published'`),
  ],
);

export const postMedia = pgTable(
  "post_media",
  {
    id: uuid().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id),
    position: smallint().notNull(),
    objectKey: text("object_key").notNull(),
    altText: text("alt_text"),
    contentType: text("content_type").notNull(),
    width: integer(),
    height: integer(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("post_media_post_id_position_key").on(table.postId, table.position),
    check("post_media_position_check", sql`${table.position} BETWEEN 1 AND 4`),
    check(
      "post_media_content_type_check",
      sql`${table.contentType} LIKE 'image/%'`,
    ),
  ],
);

export const postMediaUploadReservations = pgTable(
  "post_media_upload_reservations",
  {
    id: uuid().primaryKey(),
    operatorProfileId: uuid("operator_profile_id")
      .notNull()
      .references(() => profiles.id),
    objectKey: text("object_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    declaredSizeBytes: integer("declared_size_bytes").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    width: integer(),
    height: integer(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("post_media_upload_reservations_active_idx").on(
      table.operatorProfileId,
      table.createdAt,
    ),
  ],
);

export const follows = pgTable(
  "follows",
  {
    followerProfileId: uuid("follower_profile_id")
      .notNull()
      .references(() => profiles.id),
    followedProfileId: uuid("followed_profile_id")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.followerProfileId, table.followedProfileId] }),
    check(
      "follows_no_self_check",
      sql`${table.followerProfileId} <> ${table.followedProfileId}`,
    ),
  ],
);
export const postLikes = pgTable(
  "post_likes",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.profileId] })],
);
export const bookmarks = pgTable(
  "bookmarks",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.postId, table.profileId] })],
);
export const postShareEvents = pgTable(
  "post_share_events",
  {
    id: uuid().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id),
    actorProfileId: uuid("actor_profile_id").references(() => profiles.id),
    idempotencyKey: uuid("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("post_share_events_post_id_idempotency_key_unique").on(
      table.postId,
      table.idempotencyKey,
    ),
    index("post_share_events_post_created_idx").on(
      table.postId,
      table.createdAt.desc(),
    ),
  ],
);
export const comments = pgTable(
  "comments",
  {
    id: uuid().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id),
    parentCommentId: uuid("parent_comment_id").references(
      (): AnyPgColumn => comments.id,
    ),
    rootCommentId: uuid("root_comment_id").notNull(),
    authorProfileId: uuid("author_profile_id")
      .notNull()
      .references(() => profiles.id),
    actingOperatorProfileId: uuid("acting_operator_profile_id").references(
      () => profiles.id,
    ),
    source: commentSourceEnum("source").notNull(),
    body: text().notNull(),
    state: commentStateEnum("state").notNull().default("published"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    unique("comments_id_post_unique").on(table.id, table.postId),
    foreignKey({columns: [table.rootCommentId, table.postId], foreignColumns: [table.id, table.postId], name: "comments_root_comment_fk"}),
    foreignKey({columns: [table.parentCommentId, table.postId], foreignColumns: [table.id, table.postId], name: "comments_parent_same_post_fk"}),
    check("comments_root_shape_check", sql`(${table.parentCommentId} IS NULL AND ${table.rootCommentId}=${table.id}) OR (${table.parentCommentId} IS NOT NULL AND ${table.rootCommentId}<>${table.id})`),
    index("comments_post_root_created_idx").on(table.postId, table.rootCommentId, table.createdAt, table.id),
    index("comments_post_root_cursor_idx").on(table.postId, table.createdAt, table.id).where(sql`${table.parentCommentId} IS NULL`),
    check(
      "comments_body_length_check",
      sql`char_length(${table.body}) BETWEEN 1 AND 2000 AND ${table.body} ~ '[^[:space:]]'`,
    ),
  ],
);
export const commentLikes = pgTable(
  "comment_likes",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.commentId, table.profileId] })],
);
export const commentBookmarks = pgTable(
  "comment_bookmarks",
  {
    commentId: uuid("comment_id").notNull().references(() => comments.id),
    profileId: uuid("profile_id").notNull().references(() => profiles.id),
    createdAt: timestamp("created_at", {withTimezone: true}).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({columns: [table.commentId, table.profileId]}),
    index("comment_bookmarks_profile_created_idx").on(table.profileId, table.createdAt.desc()),
  ],
);
export const commentShareEvents = pgTable(
  "comment_share_events",
  {
    id: uuid().primaryKey(),
    commentId: uuid("comment_id").notNull().references(() => comments.id),
    actorProfileId: uuid("actor_profile_id").references(() => profiles.id),
    idempotencyKey: uuid("idempotency_key").notNull(),
    createdAt: timestamp("created_at", {withTimezone: true}).notNull().defaultNow(),
  },
  (table) => [
    unique("comment_share_events_comment_id_idempotency_key_unique").on(table.commentId, table.idempotencyKey),
    index("comment_share_events_comment_created_idx").on(table.commentId, table.createdAt.desc()),
  ],
);
export const notifications = pgTable(
  "notifications",
  {
    id: uuid().primaryKey(),
    recipientProfileId: uuid("recipient_profile_id")
      .notNull()
      .references(() => profiles.id),
    actorProfileId: uuid("actor_profile_id").references(() => profiles.id),
    kind: notificationKindEnum("kind").notNull(),
    postId: uuid("post_id").references(() => posts.id),
    commentId: uuid("comment_id").references(() => comments.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("notifications_comment_like_once_idx")
      .on(table.recipientProfileId, table.actorProfileId, table.kind, table.commentId)
      .where(sql`${table.kind} = 'comment_like'`),
  ],
);
