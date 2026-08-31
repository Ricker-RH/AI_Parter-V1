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
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const accountKindEnum = pgEnum('account_kind', ['human', 'ip'])
export const appLocaleEnum = pgEnum('app_locale', ['en', 'zh-CN'])
export const appRoleEnum = pgEnum('app_role', ['operator'])
export const auditActorTypeEnum = pgEnum('audit_actor_type', ['human', 'operator', 'system'])
export const auditSourceEnum = pgEnum('audit_source', ['api', 'admin', 'worker'])
export const auditResultEnum = pgEnum('audit_result', ['succeeded', 'rejected', 'failed'])
export const outboxStateEnum = pgEnum('outbox_state', ['pending', 'delivered', 'failed'])

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
