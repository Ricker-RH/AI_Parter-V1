import {
  check,
  pgEnum,
  pgTable,
  text,
  boolean,
  integer,
  jsonb,
  smallint,
  timestamp,
  uuid,
  unique,
  primaryKey,
  foreignKey,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const accountKindEnum = pgEnum('account_kind', ['human', 'ip'])
export const appLocaleEnum = pgEnum('app_locale', ['en', 'zh-CN'])
export const appRoleEnum = pgEnum('app_role', ['operator'])
export const auditActorTypeEnum = pgEnum('audit_actor_type', ['human', 'operator', 'system'])
export const auditSourceEnum = pgEnum('audit_source', ['api', 'admin', 'worker'])
export const auditResultEnum = pgEnum('audit_result', ['succeeded', 'rejected', 'failed'])
export const outboxStateEnum = pgEnum('outbox_state', ['pending', 'delivered', 'failed'])
export const ipSourceEnum = pgEnum('ip_source', ['platform', 'creator'])
export const ipPublicStateEnum = pgEnum('ip_public_state', ['draft', 'approved', 'published', 'paused', 'unpublished'])
export const postStateEnum = pgEnum('post_state', ['draft', 'published', 'withdrawn'])
export const postSourceEnum = pgEnum('post_source', ['admin', 'worker'])
export const mediaKindEnum = pgEnum('media_kind', ['image'])
export const commentSourceEnum = pgEnum('comment_source', ['human', 'admin', 'worker'])
export const commentStateEnum = pgEnum('comment_state', ['published', 'deleted'])
export const notificationKindEnum = pgEnum('notification_kind', ['follow', 'post_like', 'comment', 'reply', 'comment_like'])

export const profiles = pgTable(
  'profiles',
  {
    id: uuid().primaryKey(),
    authSubject: text('auth_subject'),
    accountKind: accountKindEnum('account_kind').notNull(),
    username: text().notNull(),
    displayName: text('display_name').notNull(),
    bio: text(),
    avatarObjectKey: text('avatar_object_key'),
    preferredLocale: appLocaleEnum('preferred_locale').notNull().default('en'),
    creatorModeEnabled: boolean('creator_mode_enabled')
      .notNull()
      .default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('profiles_auth_subject_unique').on(table.authSubject),
    unique('profiles_username_unique').on(table.username),
    check(
      'profiles_account_kind_auth_subject_check',
      sql`(${table.accountKind} = 'human' AND ${table.authSubject} IS NOT NULL AND ${table.authSubject} ~ '[^[:space:]]') OR (${table.accountKind} = 'ip' AND ${table.authSubject} IS NULL)`,
    ),
    check(
      'profiles_username_check',
      sql`${table.username} ~ '^[a-z0-9_]{3,30}$'`,
    ),
    check(
      'profiles_display_name_check',
      sql`char_length(${table.displayName}) BETWEEN 1 AND 80 AND ${table.displayName} ~ '[^[:space:]]'`,
    ),
    check(
      'profiles_bio_length_check',
      sql`${table.bio} IS NULL OR char_length(${table.bio}) <= 500`,
    ),
    check(
      'profiles_avatar_object_key_length_check',
      sql`${table.avatarObjectKey} IS NULL OR char_length(${table.avatarObjectKey}) <= 512`,
    ),
  ],
)

export const platformSettings = pgTable(
  'platform_settings',
  {
    settingKey: text('setting_key').primaryKey(),
    creatorIpRequiresApproval: boolean('creator_ip_requires_approval')
      .notNull()
      .default(false),
    defaultIpQuota: integer('default_ip_quota').notNull().default(3),
  },
  (table) => [
    check(
      'platform_settings_global_key_check',
      sql`${table.settingKey} = 'global'`,
    ),
    check(
      'platform_settings_default_ip_quota_check',
      sql`${table.defaultIpQuota} BETWEEN 0 AND 100`,
    ),
  ],
)

export const profileRoles = pgTable('profile_roles', {
  profileId: uuid('profile_id').notNull().references(() => profiles.id), role: appRoleEnum('role').notNull(), grantedByProfileId: uuid('granted_by_profile_id').notNull().references(() => profiles.id), grantedAt: timestamp('granted_at', {withTimezone: true}).notNull().defaultNow(), revokedAt: timestamp('revoked_at', {withTimezone: true}),
}, (table) => [primaryKey({columns: [table.profileId, table.role]})])

export const auditEvents = pgTable('audit_events', {
  id: uuid().primaryKey(), occurredAt: timestamp('occurred_at', {withTimezone: true}).notNull().defaultNow(), actorType: auditActorTypeEnum('actor_type').notNull(), actorProfileId: uuid('actor_profile_id').references(() => profiles.id), action: text().notNull(), entityType: text('entity_type').notNull(), entityId: uuid('entity_id').notNull(), requestId: uuid('request_id'), sourceApp: auditSourceEnum('source_app').notNull(), result: auditResultEnum('result').notNull(), changeSummary: jsonb('change_summary').notNull().default({}),
}, (table) => [check('audit_events_action_check', sql`${table.action} ~ '[^[:space:]]'`), check('audit_events_entity_type_check', sql`${table.entityType} ~ '[^[:space:]]'`)])
export const businessEvents = pgTable('business_events', {
  id: uuid().primaryKey(), eventName: text('event_name').notNull(), schemaVersion: smallint('schema_version').notNull(), occurredAt: timestamp('occurred_at', {withTimezone: true}).notNull().defaultNow(), actorProfileId: uuid('actor_profile_id').references(() => profiles.id), subjectEntityType: text('subject_entity_type').notNull(), subjectEntityId: uuid('subject_entity_id').notNull(), requestId: uuid('request_id'), environment: text().notNull(), properties: jsonb().notNull().default({}),
}, (table) => [check('business_events_event_name_check', sql`${table.eventName} ~ '^[a-z][a-z0-9_]*$'`), check('business_events_schema_version_check', sql`${table.schemaVersion} > 0`), check('business_events_subject_entity_type_check', sql`${table.subjectEntityType} ~ '[^[:space:]]'`), check('business_events_environment_check', sql`${table.environment} ~ '[^[:space:]]'`)])
export const workflowTransitions = pgTable('workflow_transitions', {
  id: uuid().primaryKey(), entityType: text('entity_type').notNull(), entityId: uuid('entity_id').notNull(), previousState: text('previous_state'), nextState: text('next_state').notNull(), actorProfileId: uuid('actor_profile_id').references(() => profiles.id), reasonCode: text('reason_code'), operatorNote: text('operator_note'), requestId: uuid('request_id'), occurredAt: timestamp('occurred_at', {withTimezone: true}).notNull().defaultNow(),
}, (table) => [check('workflow_transitions_entity_type_check', sql`${table.entityType} ~ '[^[:space:]]'`), check('workflow_transitions_next_state_check', sql`${table.nextState} ~ '[^[:space:]]'`)])
export const analyticsOutbox = pgTable('analytics_outbox', {
  id: uuid().primaryKey(), businessEventId: uuid('business_event_id').notNull().unique().references(() => businessEvents.id), destination: text().notNull(), payloadVersion: smallint('payload_version').notNull(), payload: jsonb().notNull().default({}), state: outboxStateEnum('state').notNull().default('pending'), attemptCount: integer('attempt_count').notNull().default(0), nextAttemptAt: timestamp('next_attempt_at', {withTimezone: true}).notNull().defaultNow(), deliveredAt: timestamp('delivered_at', {withTimezone: true}), lastErrorCode: text('last_error_code'), createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
}, (table) => [check('analytics_outbox_payload_version_check', sql`${table.payloadVersion} > 0`), check('analytics_outbox_destination_check', sql`${table.destination} ~ '[^[:space:]]'`), check('analytics_outbox_attempt_count_check', sql`${table.attemptCount} >= 0`), check('analytics_outbox_delivery_state_check', sql`(${table.state} = 'delivered') = (${table.deliveredAt} IS NOT NULL)` )])

export const ipIdentityRevisions = pgTable('ip_identity_revisions', {
  id: uuid().primaryKey(),
  ipProfileId: uuid('ip_profile_id').notNull(),
  version: integer().notNull(),
  displayName: text('display_name').notNull(),
  bio: text(),
  avatarObjectKey: text('avatar_object_key'),
  coverObjectKey: text('cover_object_key'),
  languages: text().array().notNull().default(sql`'{}'::text[]`),
  createdByProfileId: uuid('created_by_profile_id').references(() => profiles.id),
  previousRevisionId: uuid('previous_revision_id').references((): AnyPgColumn => ipIdentityRevisions.id),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
}, (table) => [
  unique('ip_identity_revisions_ip_profile_id_version_key').on(table.ipProfileId, table.version),
  unique('ip_identity_revisions_id_ip_profile_id_key').on(table.id, table.ipProfileId),
])

export const ipProfiles = pgTable('ip_profiles', {
  profileId: uuid('profile_id').primaryKey().references(() => profiles.id),
  source: ipSourceEnum('source').notNull(),
  creatorProfileId: uuid('creator_profile_id').references(() => profiles.id),
  publicState: ipPublicStateEnum('public_state').notNull().default('draft'),
  operationEnabled: boolean('operation_enabled').notNull().default(false),
  identityLabel: text('identity_label').notNull().default('AI'),
  currentIdentityRevisionId: uuid('current_identity_revision_id'),
  feedWeight: integer('feed_weight').notNull().default(0),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
}, (table) => [
  check('ip_profiles_creator_source_check', sql`${table.creatorProfileId} IS NULL OR ${table.source} = 'creator'`),
  check('ip_profiles_feed_weight_check', sql`${table.feedWeight} BETWEEN -1000 AND 1000`),
  foreignKey({
    name: 'ip_profiles_current_identity_revision_fk',
    columns: [table.currentIdentityRevisionId, table.profileId],
    foreignColumns: [ipIdentityRevisions.id, ipIdentityRevisions.ipProfileId],
  }).onUpdate('no action').onDelete('no action'),
])

export const posts = pgTable('posts', {
  id: uuid().primaryKey(),
  authorProfileId: uuid('author_profile_id').notNull().references(() => profiles.id),
  actingOperatorProfileId: uuid('acting_operator_profile_id').references(() => profiles.id),
  state: postStateEnum('state').notNull().default('draft'),
  source: postSourceEnum('source').notNull(),
  body: text().notNull().default(''),
  languageCode: text('language_code'),
  publishedAt: timestamp('published_at', {withTimezone: true}),
  withdrawnAt: timestamp('withdrawn_at', {withTimezone: true}),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
}, (table) => [check('posts_body_length_check', sql`char_length(${table.body}) <= 5000`)])

export const postMedia = pgTable('post_media', {
  id: uuid().primaryKey(), postId: uuid('post_id').notNull().references(() => posts.id), position: smallint().notNull(), objectKey: text('object_key').notNull(), altText: text('alt_text'), contentType: text('content_type').notNull(), width: integer(), height: integer(), createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
}, (table) => [unique('post_media_post_id_position_key').on(table.postId, table.position), check('post_media_position_check', sql`${table.position} BETWEEN 1 AND 4`), check('post_media_content_type_check', sql`${table.contentType} LIKE 'image/%'`)])

export const follows = pgTable('follows', {
  followerProfileId: uuid('follower_profile_id').notNull().references(() => profiles.id), followedProfileId: uuid('followed_profile_id').notNull().references(() => profiles.id), createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
}, (table) => [primaryKey({columns: [table.followerProfileId, table.followedProfileId]}), check('follows_no_self_check', sql`${table.followerProfileId} <> ${table.followedProfileId}`)])
export const postLikes = pgTable('post_likes', {
  postId: uuid('post_id').notNull().references(() => posts.id), profileId: uuid('profile_id').notNull().references(() => profiles.id), createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
}, (table) => [primaryKey({columns: [table.postId, table.profileId]})])
export const bookmarks = pgTable('bookmarks', {
  postId: uuid('post_id').notNull().references(() => posts.id), profileId: uuid('profile_id').notNull().references(() => profiles.id), createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
}, (table) => [primaryKey({columns: [table.postId, table.profileId]})])
export const comments = pgTable('comments', {
  id: uuid().primaryKey(), postId: uuid('post_id').notNull().references(() => posts.id), parentCommentId: uuid('parent_comment_id').references((): AnyPgColumn => comments.id), authorProfileId: uuid('author_profile_id').notNull().references(() => profiles.id), actingOperatorProfileId: uuid('acting_operator_profile_id').references(() => profiles.id), source: commentSourceEnum('source').notNull(), body: text().notNull(), state: commentStateEnum('state').notNull().default('published'), createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(), deletedAt: timestamp('deleted_at', {withTimezone: true}),
}, (table) => [check('comments_body_length_check', sql`char_length(${table.body}) BETWEEN 1 AND 2000 AND ${table.body} ~ '[^[:space:]]'`)])
export const commentLikes = pgTable('comment_likes', {
  commentId: uuid('comment_id').notNull().references(() => comments.id), profileId: uuid('profile_id').notNull().references(() => profiles.id), createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
}, (table) => [primaryKey({columns: [table.commentId, table.profileId]})])
export const notifications = pgTable('notifications', {
  id: uuid().primaryKey(), recipientProfileId: uuid('recipient_profile_id').notNull().references(() => profiles.id), actorProfileId: uuid('actor_profile_id').references(() => profiles.id), kind: notificationKindEnum('kind').notNull(), postId: uuid('post_id').references(() => posts.id), commentId: uuid('comment_id').references(() => comments.id), createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(), readAt: timestamp('read_at', {withTimezone: true}),
})
