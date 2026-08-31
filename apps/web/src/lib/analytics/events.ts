import type {Locale} from '../../i18n/config'
import {createAnalyticsEvent, type AnalyticsClient} from './contracts'

function safelyCapture(analytics: AnalyticsClient, event: Parameters<AnalyticsClient['capture']>[0]) {
  try {
    void Promise.resolve(analytics.capture(event)).catch(() => undefined)
  } catch {
    // Analytics must never change the result of a product interaction.
  }
}

export function trackLandingViewed(analytics: AnalyticsClient, properties: {locale: Locale; routeName: string}) {
  safelyCapture(analytics, createAnalyticsEvent('landing_viewed', {locale: properties.locale, route_name: properties.routeName}))
}

export function trackSignUpStarted(analytics: AnalyticsClient, properties: {locale: Locale; actionSource?: string}) {
  safelyCapture(analytics, createAnalyticsEvent('sign_up_started', {locale: properties.locale, ...(properties.actionSource ? {action_source: properties.actionSource} : {})}))
}

export function trackSignInStarted(analytics: AnalyticsClient, properties: {locale: Locale; actionSource?: string}) {
  safelyCapture(analytics, createAnalyticsEvent('sign_in_started', {locale: properties.locale, ...(properties.actionSource ? {action_source: properties.actionSource} : {})}))
}

export function trackFeedTabSelected(analytics: AnalyticsClient, properties: {locale: Locale; feed: 'for_you' | 'following'}) {
  safelyCapture(analytics, createAnalyticsEvent('feed_tab_selected', {locale: properties.locale, feed: properties.feed}))
}

export function trackSearchPerformed(analytics: AnalyticsClient, properties: {locale: Locale; category: 'all' | 'ips' | 'posts'; queryLength: number}) {
  safelyCapture(analytics, createAnalyticsEvent('search_performed', {locale: properties.locale, category: properties.category, query_length: properties.queryLength}))
}

export function trackIpProfileViewed(analytics: AnalyticsClient, properties: {locale: Locale; ipProfileId: string}) {
  safelyCapture(analytics, createAnalyticsEvent('ip_profile_viewed', {locale: properties.locale, ip_profile_id: properties.ipProfileId}))
}

export function trackPostViewed(analytics: AnalyticsClient, properties: {locale: Locale; postId: string}) {
  safelyCapture(analytics, createAnalyticsEvent('post_viewed', {locale: properties.locale, post_id: properties.postId}))
}

export function trackCreatorCenterViewed(analytics: AnalyticsClient, properties: {locale: Locale; routeName: string}) {
  safelyCapture(analytics, createAnalyticsEvent('creator_center_viewed', {locale: properties.locale, route_name: properties.routeName}))
}

export function trackIpCreationStepViewed(analytics: AnalyticsClient, properties: {locale: Locale; creationStep: string}) {
  safelyCapture(analytics, createAnalyticsEvent('ip_creation_step_viewed', {locale: properties.locale, creation_step: properties.creationStep}))
}

export function trackGenerationRequested(analytics: AnalyticsClient, properties: {locale: Locale; visualType: string}) {
  safelyCapture(analytics, createAnalyticsEvent('generation_requested', {locale: properties.locale, visual_type: properties.visualType}))
}

export function trackMasterImageSelected(analytics: AnalyticsClient, properties: {locale: Locale; visualType: string}) {
  safelyCapture(analytics, createAnalyticsEvent('master_image_selected', {locale: properties.locale, visual_type: properties.visualType}))
}

export function trackSubmissionClicked(analytics: AnalyticsClient, properties: {locale: Locale; creationStep: string}) {
  safelyCapture(analytics, createAnalyticsEvent('submission_clicked', {locale: properties.locale, creation_step: properties.creationStep}))
}

export function trackChatOpened(analytics: AnalyticsClient, properties: {locale: Locale; ipProfileId: string}) {
  safelyCapture(analytics, createAnalyticsEvent('chat_opened', {locale: properties.locale, ip_profile_id: properties.ipProfileId}))
}
