import {
  check,
  pgEnum,
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  uuid,
  unique,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const accountKindEnum = pgEnum('account_kind', ['human', 'ip'])
export const appLocaleEnum = pgEnum('app_locale', ['en', 'zh-CN'])

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
