import {revalidateTag} from 'next/cache'
import {locales} from '../i18n/config'
import {publicFeedTag} from './social-cache'

type SocialMutation = {method: 'POST' | 'PUT' | 'DELETE'; path: string}

export function socialMutationTags({method, path}: SocialMutation): string[] {
  const postMutation = /^posts\/[0-9a-f-]+\/(comments|like|bookmark|share)$/i.test(path)
  if ((method === 'POST' && /\/(comments|share)$/i.test(path) && postMutation) || ((method === 'PUT' || method === 'DELETE') && /\/(like|bookmark)$/i.test(path) && postMutation)) {
    return locales.map((locale) => publicFeedTag(locale, 'for_you'))
  }
  return []
}

export function invalidateSocialMutation(mutation: SocialMutation): void {
  for (const tag of socialMutationTags(mutation)) revalidateTag(tag, 'max')
}
