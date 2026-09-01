import type {Locale} from '../../i18n/config'

export const ANALYTICS_EVENT_NAMES = [
  'landing_viewed', 'sign_up_started', 'sign_in_started', 'feed_tab_selected', 'search_performed', 'ip_profile_viewed', 'post_viewed', 'creator_center_viewed', 'ip_creation_step_viewed', 'generation_requested', 'master_image_selected', 'submission_clicked', 'chat_opened', 'performance_measured',
] as const

export const ANALYTICS_ROUTE_NAMES = [
  '/[locale]', '/[locale]/admin', '/[locale]/bookmarks', '/[locale]/messages', '/[locale]/notifications', '/[locale]/profile', '/[locale]/search', '/[locale]/settings', '/[locale]/posts/[postId]', '/[locale]/profiles/[profileId]', '/[locale]/creator',
] as const
export const MAX_SEARCH_QUERY_LENGTH = 256

export type AnalyticsEventName = typeof ANALYTICS_EVENT_NAMES[number]
export type AnalyticsRouteName = typeof ANALYTICS_ROUTE_NAMES[number]
export type AnalyticsActionSource = 'landing' | 'navigation' | 'social_link'
export type AnalyticsCreationStep = 'identity' | 'persona' | 'appearance' | 'review'
export type AnalyticsVisualType = 'realistic' | 'anime' | 'hybrid'
export type AnalyticsPerformanceMetric = 'INP' | 'LCP' | 'CLS' | 'navigation' | 'interaction' | 'skeleton'
export type AnalyticsPerformanceRating = 'good' | 'needs-improvement' | 'poor'
export type AnalyticsDeviceType = 'desktop' | 'tablet' | 'mobile'

type EventProperties = {
  landing_viewed: {locale: Locale; route_name: AnalyticsRouteName}
  sign_up_started: {locale: Locale; action_source?: AnalyticsActionSource}
  sign_in_started: {locale: Locale; action_source?: AnalyticsActionSource}
  feed_tab_selected: {locale: Locale; feed: 'for_you' | 'following'}
  search_performed: {locale: Locale; category: 'all' | 'ips' | 'posts'; query_length: number}
  ip_profile_viewed: {locale: Locale; ip_profile_id: string}
  post_viewed: {locale: Locale; post_id: string}
  creator_center_viewed: {locale: Locale; route_name: AnalyticsRouteName}
  ip_creation_step_viewed: {locale: Locale; creation_step: AnalyticsCreationStep}
  generation_requested: {locale: Locale; visual_type: AnalyticsVisualType}
  master_image_selected: {locale: Locale; visual_type: AnalyticsVisualType}
  submission_clicked: {locale: Locale; creation_step: AnalyticsCreationStep}
  chat_opened: {locale: Locale; ip_profile_id: string}
  performance_measured: {locale: Locale; route_name: AnalyticsRouteName; metric: AnalyticsPerformanceMetric; metric_id: string; value: number; rating: AnalyticsPerformanceRating; device_type: AnalyticsDeviceType; release: string}
}

export type AnalyticsEventProperties = EventProperties
export type AnalyticsEvent<K extends AnalyticsEventName = AnalyticsEventName> = {name: K; properties: EventProperties[K] & {event_version: 1}}
export type AnalyticsPage = {event_version: 1; locale: Locale; route_name: AnalyticsRouteName}

export interface AnalyticsClient {
  page(page: AnalyticsPage): void | Promise<void>
  identify(profileId: string): void | Promise<void>
  reset(): void | Promise<void>
  capture(event: AnalyticsEvent): void | Promise<void>
}

const propertyNames: {[K in AnalyticsEventName]: readonly (keyof EventProperties[K])[]} = {
  landing_viewed: ['locale', 'route_name'], sign_up_started: ['locale', 'action_source'], sign_in_started: ['locale', 'action_source'], feed_tab_selected: ['locale', 'feed'], search_performed: ['locale', 'category', 'query_length'], ip_profile_viewed: ['locale', 'ip_profile_id'], post_viewed: ['locale', 'post_id'], creator_center_viewed: ['locale', 'route_name'], ip_creation_step_viewed: ['locale', 'creation_step'], generation_requested: ['locale', 'visual_type'], master_image_selected: ['locale', 'visual_type'], submission_clicked: ['locale', 'creation_step'], chat_opened: ['locale', 'ip_profile_id'], performance_measured: ['locale', 'route_name', 'metric', 'metric_id', 'value', 'rating', 'device_type', 'release'],
}
const requiredPropertyNames: {[K in AnalyticsEventName]: readonly (keyof EventProperties[K])[]} = {
  landing_viewed: ['locale', 'route_name'], sign_up_started: ['locale'], sign_in_started: ['locale'], feed_tab_selected: ['locale', 'feed'], search_performed: ['locale', 'category', 'query_length'], ip_profile_viewed: ['locale', 'ip_profile_id'], post_viewed: ['locale', 'post_id'], creator_center_viewed: ['locale', 'route_name'], ip_creation_step_viewed: ['locale', 'creation_step'], generation_requested: ['locale', 'visual_type'], master_image_selected: ['locale', 'visual_type'], submission_clicked: ['locale', 'creation_step'], chat_opened: ['locale', 'ip_profile_id'], performance_measured: ['locale', 'route_name', 'metric', 'metric_id', 'value', 'rating', 'device_type', 'release'],
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const actionSources: readonly AnalyticsActionSource[] = ['landing', 'navigation', 'social_link']
const creationSteps: readonly AnalyticsCreationStep[] = ['identity', 'persona', 'appearance', 'review']
const visualTypes: readonly AnalyticsVisualType[] = ['realistic', 'anime', 'hybrid']
const performanceMetrics: readonly AnalyticsPerformanceMetric[] = ['INP', 'LCP', 'CLS', 'navigation', 'interaction', 'skeleton']
const performanceRatings: readonly AnalyticsPerformanceRating[] = ['good', 'needs-improvement', 'poor']
const deviceTypes: readonly AnalyticsDeviceType[] = ['desktop', 'tablet', 'mobile']
const safePerformanceId = /^[A-Za-z0-9._-]{1,128}$/
const safeRelease = /^[A-Za-z0-9._-]{1,64}$/

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function includes<T extends string>(values: readonly T[], value: unknown): value is T { return typeof value === 'string' && values.includes(value as T) }
function invalid(name: string, property: string): never { throw new Error(`Analytics property "${property}" is invalid for ${name}`) }

export function isAnalyticsRouteName(value: unknown): value is AnalyticsRouteName { return includes(ANALYTICS_ROUTE_NAMES, value) }
export function isProfileUuid(value: string) { return uuid.test(value) }

function validProperties(name: AnalyticsEventName, properties: Record<string, unknown>) {
  for (const key of Object.keys(properties)) if (!(propertyNames[name] as readonly string[]).includes(key)) throw new Error(`Analytics property "${key}" is not allowed for ${name}`)
  for (const key of requiredPropertyNames[name] as readonly string[]) if (!(key in properties)) invalid(name, key)
  if (properties.locale !== 'en' && properties.locale !== 'zh-CN') invalid(name, 'locale')
  if ('route_name' in properties && !isAnalyticsRouteName(properties.route_name)) invalid(name, 'route_name')
  if ('action_source' in properties && !includes(actionSources, properties.action_source)) invalid(name, 'action_source')
  if ('feed' in properties && properties.feed !== 'for_you' && properties.feed !== 'following') invalid(name, 'feed')
  if ('category' in properties && properties.category !== 'all' && properties.category !== 'ips' && properties.category !== 'posts') invalid(name, 'category')
  if ('query_length' in properties && (!Number.isInteger(properties.query_length) || (properties.query_length as number) < 0 || (properties.query_length as number) > MAX_SEARCH_QUERY_LENGTH)) invalid(name, 'query_length')
  for (const key of ['ip_profile_id', 'post_id'] as const) if (key in properties && (typeof properties[key] !== 'string' || !uuid.test(properties[key]))) invalid(name, key)
  if ('creation_step' in properties && !includes(creationSteps, properties.creation_step)) invalid(name, 'creation_step')
  if ('visual_type' in properties && !includes(visualTypes, properties.visual_type)) invalid(name, 'visual_type')
  if ('metric' in properties && !includes(performanceMetrics, properties.metric)) invalid(name, 'metric')
  if ('metric_id' in properties && (typeof properties.metric_id !== 'string' || !safePerformanceId.test(properties.metric_id))) invalid(name, 'metric_id')
  if ('value' in properties && (typeof properties.value !== 'number' || !Number.isFinite(properties.value) || properties.value < 0)) invalid(name, 'value')
  if ('rating' in properties && !includes(performanceRatings, properties.rating)) invalid(name, 'rating')
  if ('device_type' in properties && !includes(deviceTypes, properties.device_type)) invalid(name, 'device_type')
  if ('release' in properties && (typeof properties.release !== 'string' || !safeRelease.test(properties.release))) invalid(name, 'release')
}

export function createAnalyticsEvent<K extends AnalyticsEventName>(name: K, properties: EventProperties[K]): AnalyticsEvent<K> {
  if (!(ANALYTICS_EVENT_NAMES as readonly string[]).includes(name)) throw new Error(`Unknown analytics event: ${name}`)
  if (!isRecord(properties)) throw new Error(`Analytics properties are invalid for ${name}`)
  validProperties(name, properties)
  return {name, properties: {...properties, event_version: 1} as EventProperties[K] & {event_version: 1}}
}

export function createAnalyticsPage(page: Omit<AnalyticsPage, 'event_version'>): AnalyticsPage {
  if (!isRecord(page) || page.locale !== 'en' && page.locale !== 'zh-CN') invalid('$pageview', 'locale')
  if (!isAnalyticsRouteName(page.route_name)) invalid('$pageview', 'route_name')
  return {event_version: 1, locale: page.locale, route_name: page.route_name}
}

export const noOpAnalytics: AnalyticsClient = {page: () => undefined, identify: () => undefined, reset: () => undefined, capture: () => undefined}
