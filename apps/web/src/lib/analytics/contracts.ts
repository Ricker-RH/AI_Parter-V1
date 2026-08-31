import type {Locale} from '../../i18n/config'

export const ANALYTICS_EVENT_NAMES = [
  'landing_viewed',
  'sign_up_started',
  'sign_in_started',
  'feed_tab_selected',
  'search_performed',
  'ip_profile_viewed',
  'post_viewed',
  'creator_center_viewed',
  'ip_creation_step_viewed',
  'generation_requested',
  'master_image_selected',
  'submission_clicked',
  'chat_opened',
] as const

export type AnalyticsEventName = typeof ANALYTICS_EVENT_NAMES[number]

type EventProperties = {
  landing_viewed: {locale: Locale; route_name: string}
  sign_up_started: {locale: Locale; action_source?: string}
  sign_in_started: {locale: Locale; action_source?: string}
  feed_tab_selected: {locale: Locale; feed: 'for_you' | 'following'}
  search_performed: {locale: Locale; category: 'all' | 'ips' | 'posts'; query_length: number}
  ip_profile_viewed: {locale: Locale; ip_profile_id: string}
  post_viewed: {locale: Locale; post_id: string}
  creator_center_viewed: {locale: Locale; route_name: string}
  ip_creation_step_viewed: {locale: Locale; creation_step: string}
  generation_requested: {locale: Locale; visual_type: string}
  master_image_selected: {locale: Locale; visual_type: string}
  submission_clicked: {locale: Locale; creation_step: string}
  chat_opened: {locale: Locale; ip_profile_id: string}
}

export type AnalyticsEventProperties = EventProperties
export type AnalyticsEvent<K extends AnalyticsEventName = AnalyticsEventName> = {
  name: K
  properties: EventProperties[K] & {event_version: 1}
}
export type AnalyticsPage = {locale: Locale; route_name: string}

export interface AnalyticsClient {
  page(page: AnalyticsPage): void | Promise<void>
  identify(profileId: string): void | Promise<void>
  reset(): void | Promise<void>
  capture(event: AnalyticsEvent): void | Promise<void>
}

const propertyNames: {[K in AnalyticsEventName]: readonly (keyof EventProperties[K])[]} = {
  landing_viewed: ['locale', 'route_name'],
  sign_up_started: ['locale', 'action_source'],
  sign_in_started: ['locale', 'action_source'],
  feed_tab_selected: ['locale', 'feed'],
  search_performed: ['locale', 'category', 'query_length'],
  ip_profile_viewed: ['locale', 'ip_profile_id'],
  post_viewed: ['locale', 'post_id'],
  creator_center_viewed: ['locale', 'route_name'],
  ip_creation_step_viewed: ['locale', 'creation_step'],
  generation_requested: ['locale', 'visual_type'],
  master_image_selected: ['locale', 'visual_type'],
  submission_clicked: ['locale', 'creation_step'],
  chat_opened: ['locale', 'ip_profile_id'],
}

const requiredPropertyNames: {[K in AnalyticsEventName]: readonly (keyof EventProperties[K])[]} = {
  landing_viewed: ['locale', 'route_name'],
  sign_up_started: ['locale'],
  sign_in_started: ['locale'],
  feed_tab_selected: ['locale', 'feed'],
  search_performed: ['locale', 'category', 'query_length'],
  ip_profile_viewed: ['locale', 'ip_profile_id'],
  post_viewed: ['locale', 'post_id'],
  creator_center_viewed: ['locale', 'route_name'],
  ip_creation_step_viewed: ['locale', 'creation_step'],
  generation_requested: ['locale', 'visual_type'],
  master_image_selected: ['locale', 'visual_type'],
  submission_clicked: ['locale', 'creation_step'],
  chat_opened: ['locale', 'ip_profile_id'],
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEventName(value: string): value is AnalyticsEventName {
  return (ANALYTICS_EVENT_NAMES as readonly string[]).includes(value)
}

function validProperties(name: AnalyticsEventName, properties: Record<string, unknown>) {
  for (const key of Object.keys(properties)) {
    if (!(propertyNames[name] as readonly string[]).includes(key)) throw new Error(`Analytics property "${key}" is not allowed for ${name}`)
  }
  for (const key of requiredPropertyNames[name] as readonly string[]) {
    if (!(key in properties)) throw new Error(`Analytics property "${key}" is invalid for ${name}`)
  }
  if (properties.locale !== 'en' && properties.locale !== 'zh-CN') throw new Error(`Analytics property "locale" is invalid for ${name}`)
  if ('route_name' in properties && (typeof properties.route_name !== 'string' || !properties.route_name.startsWith('/') || uuid.test(properties.route_name))) throw new Error(`Analytics property "route_name" is invalid for ${name}`)
  if ('action_source' in properties && typeof properties.action_source !== 'string') throw new Error(`Analytics property "action_source" is invalid for ${name}`)
  if ('feed' in properties && properties.feed !== 'for_you' && properties.feed !== 'following') throw new Error(`Analytics property "feed" is invalid for ${name}`)
  if ('category' in properties && properties.category !== 'all' && properties.category !== 'ips' && properties.category !== 'posts') throw new Error(`Analytics property "category" is invalid for ${name}`)
  if ('query_length' in properties && (!Number.isInteger(properties.query_length) || (properties.query_length as number) < 0)) throw new Error(`Analytics property "query_length" is invalid for ${name}`)
  for (const key of ['ip_profile_id', 'post_id'] as const) {
    if (key in properties && (typeof properties[key] !== 'string' || !uuid.test(properties[key]))) throw new Error(`Analytics property "${key}" is invalid for ${name}`)
  }
  for (const key of ['creation_step', 'visual_type'] as const) {
    if (key in properties && (typeof properties[key] !== 'string' || properties[key].length === 0)) throw new Error(`Analytics property "${key}" is invalid for ${name}`)
  }
}

export function createAnalyticsEvent<K extends AnalyticsEventName>(name: K, properties: EventProperties[K]): AnalyticsEvent<K> {
  if (!isEventName(name)) throw new Error(`Unknown analytics event: ${name}`)
  if (!isRecord(properties)) throw new Error(`Analytics properties are invalid for ${name}`)
  validProperties(name, properties)
  return {name, properties: {...properties, event_version: 1} as EventProperties[K] & {event_version: 1}}
}

export function isProfileUuid(value: string) {
  return uuid.test(value)
}

export const noOpAnalytics: AnalyticsClient = {
  page: () => undefined,
  identify: () => undefined,
  reset: () => undefined,
  capture: () => undefined,
}
